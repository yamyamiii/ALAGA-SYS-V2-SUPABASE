// @vitest-environment node
import fs from "node:fs";
import { transformSync } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as domain from "../../../supabase/functions/alaga-ai/domain.ts";
import * as conversation from "../../../supabase/functions/alaga-ai/conversation.ts";

// Execute the real Edge entrypoint with external IO replaced, rather than
// testing a parallel imitation of its auth/CORS/provider/error pipeline.
const compiled = transformSync(
  fs.readFileSync("supabase/functions/alaga-ai/index.ts", "utf8"),
  { loader: "ts", format: "cjs" },
).code;
function setup({
  role = "resident",
  status = "active",
  validUser = true,
  allowed = true,
} = {}) {
  let handler;
  const generate = vi.fn().mockResolvedValue({
    output_text: JSON.stringify({
      message: "Generated reply",
      actionIds: [],
      sourceIndexes: [],
      lookup: "none",
    }),
  });
  const rpc = vi.fn(async (name) => ({
    data:
      name === "consume_ai_request_rate_limit"
        ? [
            {
              allowed,
              remaining: allowed ? 19 : 0,
              retry_after_seconds: allowed ? 0 : 120,
            },
          ]
        : [],
    error: null,
  }));
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: "authenticated-profile", role, account_status: status },
    error: null,
  });
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
  }));
  const getUser = vi.fn().mockResolvedValue({
    data: { user: validUser ? { id: "authenticated-profile" } : null },
    error: null,
  });
  const createClient = vi.fn((_url, key) =>
    key === "test-publishable" ? { auth: { getUser } } : { from, rpc },
  );
  const env = {
    ALLOWED_ORIGINS: "https://alaga-sys.vercel.app,http://localhost:5173",
    SUPABASE_URL: "https://test.invalid",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable",
    SUPABASE_SECRET_KEY: "test-server-only",
    GEMINI_API_KEY: "test-provider-only",
    GEMINI_MODEL: "test-model",
  };
  const deno = {
    env: { get: (name) => env[name] },
    serve: (value) => {
      handler = value;
    },
  };
  class GoogleGenAI {
    interactions = { create: generate };
  }
  const modules = {
    "npm:@google/genai@2": { GoogleGenAI },
    "npm:@supabase/supabase-js@2": { createClient },
    "./domain.ts": domain,
    "./conversation.ts": conversation,
  };
  // Only the test harness executes compiled local code; the production function
  // never evals transcript, grounding, or model output.
  new Function("require", "Deno", compiled)((name) => modules[name], deno);
  return { handler, generate, rpc, createClient, from };
}
function request(
  content = "Kumusta",
  {
    origin = "https://alaga-sys.vercel.app",
    method = "POST",
    authorization = "Bearer test-session",
    body,
  } = {},
) {
  return new Request("https://test.invalid/functions/v1/alaga-ai", {
    method,
    headers: { origin, authorization, "content-type": "application/json" },
    ...(method === "POST"
      ? {
          body: JSON.stringify(
            body ?? { messages: [{ role: "user", content }] },
          ),
        }
      : {}),
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("actual alaga-ai Edge request boundary", () => {
  it("generates an ordinary answer after Auth, profile and rate checks without browser credentials or raw sources", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { handler, generate, rpc, from } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://alaga-sys.vercel.app",
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toMatchObject({
      model: "test-model",
      store: false,
    });
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(
      /authenticated-profile|test-server-only|test-provider-only/,
    );
    expect(rpc.mock.calls[0]).toEqual([
      "consume_ai_request_rate_limit",
      { p_profile_id: "authenticated-profile", p_max_requests: 20 },
    ]);
    expect(rpc.mock.calls[1][1].p_profile_id).toBe("authenticated-profile");
    expect(from).toHaveBeenCalledExactlyOnceWith("profiles");
    expect(await response.json()).toMatchObject({
      data: { message: "Generated reply", sources: [], actions: [] },
    });
    expect(JSON.stringify(console.log.mock.calls)).not.toMatch(
      /Kumusta|Generated reply|test-session|test-provider-only/,
    );
  });
  it("handles OPTIONS before authentication or provider construction", async () => {
    const { handler, createClient, generate } = setup();
    expect((await handler(request("", { method: "OPTIONS" }))).status).toBe(
      204,
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects unknown origins before authentication or Gemini", async () => {
    const { handler, createClient, generate } = setup();
    const response = await handler(
      request("Hi", { origin: "https://evil.invalid" }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(["inactive", "suspended", "invited"])(
    "rejects %s accounts before tools/provider",
    async (status) => {
      const { handler, generate, rpc } = setup({ status });
      expect((await handler(request())).status).toBe(403);
      expect(generate).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it.each([false, "unknown-role"])(
    "rejects invalid Auth users or roles (%s)",
    async (value) => {
      const { handler, generate } = setup(
        value === false ? { validUser: false } : { role: value },
      );
      expect((await handler(request())).status).toBe(
        value === false ? 401 : 403,
      );
      expect(generate).not.toHaveBeenCalled();
    },
  );
  it("does not accept browser-supplied profile/resident authority", async () => {
    const { handler, generate, rpc } = setup();
    const response = await handler(
      request("", {
        body: {
          messages: [{ role: "user", content: "Hi" }],
          profile_id: "someone-else",
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects missing authentication before creating any database/provider client", async () => {
    const { handler, generate, createClient } = setup();
    expect(
      (await handler(request("Hello", { authorization: "" }))).status,
    ).toBe(401);
    expect(generate).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("enforces the database rate limiter before any provider invocation", async () => {
    const { handler, generate } = setup({ allowed: false });
    const response = await handler(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(generate).not.toHaveBeenCalled();
  });
  it("uses only authenticated profile scope for semantic own-status lookup", async () => {
    const { handler, generate, rpc } = setup();
    generate.mockResolvedValue({
      output_text: JSON.stringify({
        message: "Ignored model guess",
        actionIds: [],
        sourceIndexes: [],
        lookup: "own_appointment_status",
      }),
    });
    const response = await handler(request("Is my visit still going ahead?"));
    expect(rpc).toHaveBeenLastCalledWith("ai_resident_appointment_status", {
      p_profile_id: "authenticated-profile",
    });
    const result = await response.json();
    expect(result.data.message).not.toContain("Ignored model guess");
    expect(result.data.contextMessage).toContain(
      "Private appointment summary omitted",
    );
    expect(generate).toHaveBeenCalledOnce();
  });
  it.each([429, 500, 503, 401, 403, 404, 400])(
    "maps provider %s without leaking error details, retaining CORS",
    async (status) => {
      const { handler, generate } = setup();
      generate.mockRejectedValue({ status, message: "RAW PROVIDER SECRET" });
      const response = await handler(request());
      expect(response.status).toBe(status === 400 ? 502 : 503);
      expect(generate).toHaveBeenCalledTimes(status === 503 ? 2 : 1);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://alaga-sys.vercel.app",
      );
      expect(JSON.stringify(await response.json())).not.toContain(
        "RAW PROVIDER SECRET",
      );
    },
  );
  it("recovers one 503 without duplicate responses or trusted operations", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { handler, generate, rpc } = setup();
    const success = await generate();
    generate
      .mockClear()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce(success);
    const pending = handler(request("Hi"));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(400);
    expect(generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).data.message).toBe("Generated reply");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][1].signal).toBe(
      generate.mock.calls[1][1].signal,
    );
    expect(generate.mock.calls[1][1].retries.maxRetries).toBe(0);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "consume_ai_request_rate_limit",
      "ai_grounding_context",
    ]);
    expect(console.log).toHaveBeenLastCalledWith(
      "alaga-ai request",
      expect.objectContaining({
        retry_count: 1,
        upstream_status: "success",
        last_transient_status: 503,
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels pending backoff without starting another attempt", async () => {
    vi.useFakeTimers();
    const { handler, generate } = setup();
    generate.mockRejectedValue({ status: 503 });
    const controller = new AbortController();
    const pending = handler(
      new Request(request(), { signal: controller.signal }),
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    controller.abort();
    expect((await (await pending).json()).error.code).toBe("request_timeout");
    await vi.advanceTimersByTimeAsync(1000);
    expect(generate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not retry a late 503 with insufficient shared budget", async () => {
    vi.useFakeTimers();
    const { handler, generate } = setup();
    generate.mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject({ status: 503 }), 49_500),
        ),
    );
    const pending = handler(request());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(49_501);
    expect((await pending).status).toBe(503);
    expect(generate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not reset the 50-second deadline for a retry", async () => {
    vi.useFakeTimers();
    const { handler, generate } = setup();
    generate
      .mockRejectedValueOnce({ status: 503 })
      .mockReturnValueOnce(new Promise(() => {}));
    const pending = handler(request());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(50_001);
    expect((await (await pending).json()).error.code).toBe("provider_timeout");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("enforces the provider timeout with a safe error and cleared timer", async () => {
    vi.useFakeTimers();
    const { handler, generate } = setup();
    generate.mockReturnValue(new Promise(() => {}));
    const pending = handler(request());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(50_001);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("provider_timeout");
    expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
    expect(generate.mock.calls[0][1].retries.maxRetries).toBe(0);
    expect(generate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("allows a slow successful generation beyond the former 20-second cutoff", async () => {
    vi.useFakeTimers();
    const { handler, generate } = setup();
    generate.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                output_text: JSON.stringify({
                  message: "Real mocked generation completed",
                  actionIds: [],
                  sourceIndexes: [],
                  lookup: "none",
                }),
              }),
            30_000,
          ),
        ),
    );
    const pending = handler(request("Kumusta po"));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(30_001);
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).data.message).toBe(
      "Real mocked generation completed",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("caps the overall request even when generation starts late", async () => {
    vi.useFakeTimers();
    const { handler, generate, rpc } = setup();
    const original = rpc.getMockImplementation();
    rpc.mockImplementation((name, args) =>
      name === "ai_grounding_context"
        ? new Promise((resolve) =>
            setTimeout(() => resolve({ data: [], error: null }), 30_000),
          )
        : original(name, args),
    );
    generate.mockReturnValue(new Promise(() => {}));
    const pending = handler(request("Hello"));
    await vi.advanceTimersByTimeAsync(30_100);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(40_000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("request_timeout");
    expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
  });
});
