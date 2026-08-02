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
      message: "The assistant is temporarily unavailable.",
      retryable: true,
    });
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
