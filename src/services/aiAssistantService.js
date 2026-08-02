import { ZodError } from "zod";

import {
  buildAiPayload,
  parseAiResponse,
} from "@/features/ai-assistant/schemas";
import { getSupabaseClient } from "@/lib/supabase/client";

const REQUEST_TIMEOUT_MS = 25_000;
const FALLBACK_MESSAGE =
  "The AI assistant could not complete that request. Please try again.";

export class AiAssistantServiceError extends Error {
  constructor(code, message = FALLBACK_MESSAGE, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AiAssistantServiceError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AiAssistantServiceError(
      "offline",
      "You are offline. Reconnect, then try again.",
      { retryable: true },
    );
  }
}

async function mapFunctionError(error) {
  try {
    const body = await error?.context?.json?.();
    const code = body?.error?.code;
    const message = body?.error?.message;
    if (typeof code === "string" && typeof message === "string") {
      return new AiAssistantServiceError(code, message, {
        cause: error,
        retryable: [
          "provider_timeout",
          "provider_unavailable",
          "provider_failure",
          "authorization_unavailable",
          "rate_limit_unavailable",
        ].includes(code),
      });
    }
  } catch {
    // The privacy-safe fallback below covers unavailable and non-JSON errors.
  }
  const timeout = /timeout|abort/i.test(error?.message ?? "");
  return new AiAssistantServiceError(
    timeout ? "timeout" : "function_unavailable",
    timeout
      ? "The assistant took too long to respond. Please try again."
      : FALLBACK_MESSAGE,
    { cause: error, retryable: true },
  );
}

export function createAiAssistantService(clientProvider = getSupabaseClient) {
  return {
    async send(messages) {
      ensureOnline();
      let payload;
      try {
        payload = buildAiPayload(messages);
      } catch (error) {
        if (error instanceof ZodError) {
          throw new AiAssistantServiceError(
            "invalid_payload",
            error.issues[0]?.message ?? "The conversation is invalid.",
          );
        }
        throw error;
      }

      let timeoutId;
      try {
        const timeout = new Promise((_, reject) => {
          timeoutId = window.setTimeout(
            () =>
              reject(
                new AiAssistantServiceError(
                  "timeout",
                  "The assistant took too long to respond. Please try again.",
                  { retryable: true },
                ),
              ),
            REQUEST_TIMEOUT_MS,
          );
        });
        const result = await Promise.race([
          clientProvider().functions.invoke("alaga-ai", { body: payload }),
          timeout,
        ]);
        if (result.error) throw await mapFunctionError(result.error);
        try {
          return parseAiResponse(result.data?.data);
        } catch (error) {
          throw new AiAssistantServiceError(
            "invalid_response",
            "The assistant returned an invalid response. Please try again.",
            { retryable: true, cause: error },
          );
        }
      } catch (error) {
        if (error instanceof AiAssistantServiceError) throw error;
        throw await mapFunctionError(error);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
  };
}

export const aiAssistantService = createAiAssistantService();
