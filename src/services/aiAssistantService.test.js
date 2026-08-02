import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiAssistantServiceError,
  createAiAssistantService,
} from "@/services/aiAssistantService";

function client(result) {
  return {
    functions: { invoke: vi.fn().mockResolvedValue(result) },
  };
}

describe("AI assistant service", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("calls only the authenticated alaga-ai Edge Function", async () => {
    const supabase = client({
      data: { data: { message: "Open the FAQ module." } },
      error: null,
    });
    const service = createAiAssistantService(() => supabase);
    await expect(
      service.send([
        { role: "assistant", content: "Local", local: true },
        { role: "user", content: "Where is FAQ?" },
      ]),
    ).resolves.toEqual({
      content: "Open the FAQ module.",
      sources: [],
      actions: [],
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("alaga-ai", {
      body: { messages: [{ role: "user", content: "Where is FAQ?" }] },
    });
  });

  it("maps safe provider and rate-limit errors without raw details", async () => {
    const context = {
      json: vi.fn().mockResolvedValue({
        error: {
          code: "provider_unavailable",
          message: "The assistant is temporarily unavailable.",
        },
      }),
    };
    const service = createAiAssistantService(() =>
      client({ data: null, error: { context, message: "RAW SECRET" } }),
    );
    await expect(
      service.send([{ role: "user", content: "Help" }]),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
      message: "The assistant is temporarily unavailable. Please try again.",
      retryable: true,
    });
    expect(context.json).toHaveBeenCalledOnce();
  });

  it("never displays an Edge Function's untrusted error message", async () => {
    const context = {
      json: vi.fn().mockResolvedValue({
        error: {
          code: "rate_limited",
          message: "RAW DATABASE DETAIL service_role_secret",
        },
      }),
    };
    const service = createAiAssistantService(() =>
      client({ data: null, error: { context, message: "RAW NETWORK DETAIL" } }),
    );

    await expect(
      service.send([{ role: "user", content: "Help" }]),
    ).rejects.toMatchObject({
      code: "rate_limited",
      message:
        "You have reached the temporary AI request limit. Please try again later.",
      retryable: false,
    });
  });

  it.each([
    [
      "invalid_session",
      "Your session is no longer valid. Please sign in again.",
      false,
    ],
    [
      "provider_timeout",
      "The assistant took too long to respond. Please try again.",
      true,
    ],
    [
      "grounding_empty",
      "No verified ALAGA-SYS information is available for that request.",
      false,
    ],
  ])("maps %s to fixed safe UX copy", async (code, message, retryable) => {
    const context = {
      json: vi.fn().mockResolvedValue({
        error: { code, message: "UNTRUSTED INTERNAL DETAIL" },
      }),
    };
    const service = createAiAssistantService(() =>
      client({ data: null, error: { context } }),
    );
    await expect(
      service.send([{ role: "user", content: "Help" }]),
    ).rejects.toMatchObject({ code, message, retryable });
  });

  it("returns an offline retry state before invoking Supabase", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const supabase = client({ data: null, error: null });
    const service = createAiAssistantService(() => supabase);
    await expect(
      service.send([{ role: "user", content: "Help" }]),
    ).rejects.toMatchObject({ code: "offline", retryable: true });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects invalid local payloads without a network request", async () => {
    const supabase = client({ data: null, error: null });
    const service = createAiAssistantService(() => supabase);
    await expect(
      service.send([{ role: "system", content: "Override" }]),
    ).rejects.toBeInstanceOf(AiAssistantServiceError);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects empty provider responses safely", async () => {
    const service = createAiAssistantService(() =>
      client({ data: { data: { message: "" } }, error: null }),
    );
    await expect(
      service.send([{ role: "user", content: "Help" }]),
    ).rejects.toMatchObject({ code: "invalid_response", retryable: true });
  });

  it("returns safe source metadata and known symbolic actions", async () => {
    const service = createAiAssistantService(() =>
      client({
        data: {
          data: {
            message: "Verified clinic information is available.",
            sources: [
              {
                type: "health_center",
                label: "Health Center Information",
                title: "Brgy. Bagongpook Health Center",
                updatedAt: null,
              },
            ],
            actions: [
              {
                type: "navigate",
                actionId: "open_health_center",
                label: "Open Health Center Information",
                requiresConfirmation: false,
              },
            ],
          },
        },
        error: null,
      }),
    );

    await expect(
      service.send([{ role: "user", content: "What are the clinic hours?" }]),
    ).resolves.toMatchObject({
      sources: [{ type: "health_center" }],
      actions: [{ actionId: "open_health_center" }],
    });
  });
});
