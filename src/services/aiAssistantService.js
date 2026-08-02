import { ZodError } from "zod";

import {
  buildAiPayload,
  parseAiResponse,
} from "@/features/ai-assistant/schemas";
import { getSupabaseClient } from "@/lib/supabase/client";

const REQUEST_TIMEOUT_MS = 25_000;
const FALLBACK_MESSAGE =
  "The AI assistant could not complete that request. Please try again.";
const SAFE_FUNCTION_ERRORS = Object.freeze({
  invalid_session: {
    message: "Your session is no longer valid. Please sign in again.",
    retryable: false,
  },
  profile_missing: {
    message: "Your ALAGA-SYS profile is unavailable. Contact an administrator.",
    retryable: false,
  },
  profile_inactive: {
    message: "Your account is inactive. Contact an administrator.",
    retryable: false,
  },
  profile_suspended: {
    message: "Your account is suspended. Contact an administrator.",
    retryable: false,
  },
  rate_limited: {
    message:
      "You have reached the temporary AI request limit. Please try again later.",
    retryable: false,
  },
  provider_timeout: {
    message: "The assistant took too long to respond. Please try again.",
    retryable: true,
  },
  provider_unavailable: {
    message: "The assistant is temporarily unavailable. Please try again.",
    retryable: true,
  },
  provider_failure: {
    message: "The assistant could not complete that request. Please try again.",
    retryable: true,
  },
  provider_configuration_error: {
    message: "The assistant is temporarily unavailable.",
    retryable: false,
  },
  authorization_unavailable: {
    message: "Your access could not be verified. Please try again.",
    retryable: true,
  },
  rate_limit_unavailable: {
    message: "The assistant is temporarily unavailable. Please try again.",
    retryable: true,
  },
  grounding_unavailable: {
    message: "Verified ALAGA-SYS information is temporarily unavailable.",
    retryable: true,
  },
  grounding_empty: {
    message: "No verified ALAGA-SYS information is available for that request.",
    retryable: false,
  },
  invalid_json: { message: "The request could not be read.", retryable: false },
  invalid_payload: {
    message: "The conversation could not be processed.",
    retryable: false,
  },
});

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
    const safeError = SAFE_FUNCTION_ERRORS[code];
    if (typeof code === "string" && safeError) {
      return new AiAssistantServiceError(code, safeError.message, {
        cause: error,
        retryable: safeError.retryable,
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
