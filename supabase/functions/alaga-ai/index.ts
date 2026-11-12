import { GoogleGenAI } from "npm:@google/genai@2";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  AiAssistantError,
  exactOriginCorsHeaders,
  isSupportedRole,
  MAX_BODY_BYTES,
  parseAllowedOrigins,
  parsePositiveInteger,
  PROVIDER_TIMEOUT_MS,
  sanitizeGroundingSources,
  sanitizeResidentAppointmentStatusRows,
  validateConversationPayload,
  type CanonicalRole,
} from "./domain.ts";
import { respondToConversation } from "./conversation.ts";

type SafeRecord = Record<string, unknown>;
const REQUEST_BUDGET_MS = 70_000;

function firstNamedKey(variableName: string): string | null {
  const raw = Deno.env.get(variableName);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SafeRecord;
    return (
      (Object.values(parsed).find((value) => typeof value === "string") as
        string | undefined) ?? null
    );
  } catch {
    return null;
  }
}

function configuredAllowedOrigins() {
  return parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"));
}

function environment() {
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    firstNamedKey("SUPABASE_PUBLISHABLE_KEYS");
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    firstNamedKey("SUPABASE_SECRET_KEYS");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL")?.trim();
  const maximumRequestsPerHour = parsePositiveInteger(
    Deno.env.get("AI_MAX_REQUESTS_PER_HOUR"),
    20,
    1,
    100,
    "AI_MAX_REQUESTS_PER_HOUR",
  );
  const maximumInputCharacters = parsePositiveInteger(
    Deno.env.get("AI_MAX_INPUT_CHARACTERS"),
    8_000,
    2_000,
    20_000,
    "AI_MAX_INPUT_CHARACTERS",
  );

  if (!url || !publishableKey || !secretKey || !geminiApiKey || !model) {
    throw new AiAssistantError(
      "server_configuration_error",
      "The AI assistant is not configured.",
      500,
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,100}$/i.test(model)) {
    throw new AiAssistantError(
      "server_configuration_error",
      "GEMINI_MODEL is not configured correctly.",
      500,
    );
  }
  return {
    url,
    publishableKey,
    secretKey,
    geminiApiKey,
    model,
    maximumRequestsPerHour,
    maximumInputCharacters,
  };
}

function jsonResponse(
  body: SafeRecord,
  status: number,
  headers: Record<string, string>,
) {
  return Response.json(body, {
    status,
    headers: {
      ...headers,
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  });
}

async function authenticatedCaller(
  request: Request,
  url: string,
  publishableKey: string,
  requestFetch: typeof fetch,
) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AiAssistantError(
      "authentication_required",
      "A valid signed-in session is required.",
      401,
    );
  }

  const userClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${match[1]}` },
      fetch: requestFetch,
    },
  });
  const { data, error } = await userClient.auth.getUser(match[1]);
  if (error || !data.user) {
    throw new AiAssistantError(
      "invalid_session",
      "Your session is invalid or expired. Sign in again.",
      401,
    );
  }
  return data.user.id;
}

async function activeProfile(admin: SupabaseClient, callerId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", callerId)
    .maybeSingle();
  if (error) {
    throw new AiAssistantError(
      "authorization_unavailable",
      "Account authorization could not be verified. Try again later.",
      503,
    );
  }
  if (!data) {
    throw new AiAssistantError(
      "profile_missing",
      "Your account profile is unavailable. Contact an administrator.",
      403,
    );
  }
  if (data.account_status === "suspended") {
    throw new AiAssistantError(
      "profile_suspended",
      "Your account is suspended.",
      403,
    );
  }
  if (data.account_status !== "active") {
    throw new AiAssistantError(
      "profile_inactive",
      "Your account is not active.",
      403,
    );
  }
  if (!isSupportedRole(data.role)) {
    throw new AiAssistantError(
      "unsupported_role",
      "Your account role cannot use the AI assistant.",
      403,
    );
  }
  return {
    id: data.id as string,
    role: data.role as CanonicalRole,
  };
}

async function consumeRateLimit(
  admin: SupabaseClient,
  profileId: string,
  maximumRequests: number,
) {
  const { data, error } = await admin.rpc("consume_ai_request_rate_limit", {
    p_profile_id: profileId,
    p_max_requests: maximumRequests,
  });
  if (error || !Array.isArray(data) || !data[0]) {
    throw new AiAssistantError(
      "rate_limit_unavailable",
      "The AI assistant cannot verify its request limit. Try again later.",
      503,
    );
  }
  return {
    allowed: data[0].allowed === true,
    remaining: Number(data[0].remaining ?? 0),
    retryAfterSeconds: Number(data[0].retry_after_seconds ?? 0),
  };
}

async function loadApprovedGrounding(
  admin: SupabaseClient,
  profileId: string,
  sourceTypes: string[],
) {
  const { data, error } = await admin.rpc("ai_grounding_context", {
    p_profile_id: profileId,
    p_source_types: sourceTypes,
    p_per_source_limit: 8,
  });
  if (error || !Array.isArray(data)) {
    throw new AiAssistantError(
      "grounding_unavailable",
      "Verified ALAGA-SYS information is temporarily unavailable. Please try again later.",
      503,
    );
  }
  // Interleave source types before the existing global character cap so a
  // long FAQ list cannot crowd every current announcement out of the snapshot.
  const groups = ["health_center", "announcement", "faq"].map((type) =>
    data.filter((row: SafeRecord) => row.source_type === type),
  );
  const interleaved = Array.from({ length: 8 }, (_, rank) =>
    groups.flatMap((rows) => (rows[rank] ? [rows[rank]] : [])),
  ).flat();
  return sanitizeGroundingSources(
    interleaved.map((row) => ({
      ...row,
      content:
        typeof row.content === "string"
          ? row.content.slice(0, 1500)
          : row.content,
    })),
  );
}

async function loadResidentAppointmentStatus(
  admin: SupabaseClient,
  profileId: string,
) {
  const { data, error } = await admin.rpc("ai_resident_appointment_status", {
    p_profile_id: profileId,
  });
  if (error?.code === "42501") {
    return { hasActiveResidentLink: false, appointments: [] };
  }
  if (error || !Array.isArray(data)) {
    throw new AiAssistantError(
      "appointment_status_unavailable",
      "Your appointment status is temporarily unavailable. Please try again later.",
      503,
    );
  }
  return {
    hasActiveResidentLink: true,
    appointments: sanitizeResidentAppointmentStatusRows(data),
  };
}

async function withProviderTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, parent]);
  const cleanup = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(
          new AiAssistantError(
            "provider_timeout",
            "The assistant took too long to respond. Please try again.",
            504,
          ),
        );
      }, PROVIDER_TIMEOUT_MS);
    });
    const cancelled = new Promise<never>((_, reject) => {
      const abort = () =>
        reject(
          new AiAssistantError(
            controller.signal.aborted ? "provider_timeout" : "request_timeout",
            "The assistant took too long to respond. Please try again.",
            504,
          ),
        );
      if (signal.aborted) abort();
      else
        signal.addEventListener("abort", abort, {
          once: true,
          signal: cleanup.signal,
        });
    });
    try {
      return await Promise.race([operation(signal), timeout, cancelled]);
    } catch (error) {
      if (controller.signal.aborted)
        throw new AiAssistantError(
          "provider_timeout",
          "The assistant took too long to respond. Please try again.",
          504,
        );
      throw error;
    }
  } finally {
    cleanup.abort();
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function mapProviderError(error: unknown) {
  if (error instanceof AiAssistantError) return error;
  if (error instanceof Error && /timeout/i.test(error.name))
    return new AiAssistantError(
      "provider_timeout",
      "The assistant took too long to respond. Please try again.",
      504,
    );
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  if (status === 408)
    return new AiAssistantError(
      "provider_timeout",
      "The assistant took too long to respond. Please try again.",
      504,
    );
  if (status === 429 || status >= 500) {
    return new AiAssistantError(
      "provider_unavailable",
      "The assistant is temporarily unavailable. Please try again shortly.",
      503,
    );
  }
  if (status === 401 || status === 403 || status === 404) {
    return new AiAssistantError(
      "provider_configuration_error",
      "The assistant is temporarily unavailable. Contact an administrator if this continues.",
      503,
    );
  }
  return new AiAssistantError(
    "provider_failure",
    "The assistant could not complete that request. Please try again.",
    502,
  );
}

// Retry only an explicit upstream overload rejection, never an ambiguous
// timeout/network failure. This runs solely inside the read-only generation
// callback and its existing shared provider/request abort boundary.
async function recoverTransient503<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  deadline: number,
  diagnostics: SafeRecord,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted();
    if (attempt > 0) diagnostics.retry_count = attempt;
    try {
      const result = await operation();
      diagnostics.upstream_status = "success";
      return result;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : null;
      if (
        status !== 503 ||
        attempt >= 1 ||
        signal.aborted ||
        (error instanceof Error && /timeout|abort/i.test(error.name))
      )
        throw error;
      const delay = 500 * 2 ** attempt + Math.floor(Math.random() * 251);
      if (deadline - performance.now() < delay + 1_000) throw error;
      diagnostics.upstream_status = 503;
      diagnostics.last_transient_status = 503;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, delay);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
    }
  }
}

function logRequest(
  requestId: string,
  role: CanonicalRole | null,
  category: string,
  startedAt: number,
  diagnostics: SafeRecord = {},
) {
  console.log("alaga-ai request", {
    request_id: requestId,
    canonical_role: role,
    category,
    latency_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    timestamp: new Date().toISOString(),
    ...diagnostics,
  });
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let headers: Record<string, string> = {};
  let actorProfileId: string | null = null;
  let role: CanonicalRole | null = null;
  let failureCategory = "internal_error";
  const diagnostics: SafeRecord = { retry_count: 0 };
  const controller = new AbortController();
  const onDisconnect = () => controller.abort();
  request.signal.addEventListener("abort", onDisconnect, { once: true });
  if (request.signal.aborted) controller.abort();
  const deadline = setTimeout(() => controller.abort(), REQUEST_BUDGET_MS);
  const requestFetch: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([
        controller.signal,
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
  async function measure<T>(phase: string, operation: () => Promise<T>) {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      diagnostics[phase] = Math.max(0, Math.round(performance.now() - start));
    }
  }

  try {
    const allowedOrigins = configuredAllowedOrigins();
    headers = exactOriginCorsHeaders(request, allowedOrigins);
    if (request.method === "OPTIONS") {
      logRequest(requestId, null, "cors_preflight", startedAt);
      return new Response(null, { status: 204, headers });
    }
    const env = environment();
    if (request.method !== "POST") {
      throw new AiAssistantError(
        "method_not_allowed",
        "Only POST requests are supported.",
        405,
      );
    }
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get("content-type") ?? "",
      )
    ) {
      throw new AiAssistantError(
        "unsupported_media_type",
        "Request content must be JSON.",
        415,
      );
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
      throw new AiAssistantError(
        "request_too_large",
        "The request body is too large.",
        413,
      );
    }

    actorProfileId = await measure("auth_ms", () =>
      authenticatedCaller(request, env.url, env.publishableKey, requestFetch),
    );
    const admin = createClient(env.url, env.secretKey, {
      global: { fetch: requestFetch },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const profile = await measure("profile_ms", () =>
      activeProfile(admin, actorProfileId!),
    );
    role = profile.role;

    const rateLimit = await measure("rate_limit_ms", () =>
      consumeRateLimit(admin, profile.id, env.maximumRequestsPerHour),
    );
    headers["X-RateLimit-Remaining"] = String(rateLimit.remaining);
    if (!rateLimit.allowed) {
      headers["Retry-After"] = String(rateLimit.retryAfterSeconds);
      throw new AiAssistantError(
        "rate_limited",
        "The hourly assistant request limit was reached. Try again after the current hour resets.",
        429,
      );
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new AiAssistantError(
        "request_too_large",
        "The request body is too large.",
        413,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new AiAssistantError(
        "invalid_json",
        "Request body must contain valid JSON.",
      );
    }
    const messages = validateConversationPayload(
      parsed,
      env.maximumInputCharacters,
    );
    let providerUsed = false;
    const reply = await respondToConversation(messages, profile.role, {
      loadPublicInformation: () =>
        measure("grounding_ms", () =>
          loadApprovedGrounding(admin, profile.id, [
            "health_center",
            "announcement",
            "faq",
          ]),
        ),
      loadOwnStatus: () =>
        measure("own_status_ms", () =>
          loadResidentAppointmentStatus(admin, profile.id),
        ),
      generate: async (input, instruction) => {
        providerUsed = true;
        diagnostics.model = /^gemini-[a-z0-9._-]{1,90}$/i.test(env.model)
          ? env.model
          : "configured_model";
        diagnostics.timeout_ms = PROVIDER_TIMEOUT_MS;
        const providerStart = performance.now();
        const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
        try {
          const interaction = await withProviderTimeout(
            (signal) =>
              recoverTransient503(
                () =>
                  ai.interactions.create(
                    {
                      model: env.model,
                      input,
                      system_instruction: instruction,
                      response_format: {
                        type: "text",
                        mime_type: "application/json",
                        schema: {
                          type: "object",
                          properties: {
                            message: { type: "string" },
                            actionIds: {
                              type: "array",
                              items: { type: "string" },
                              maxItems: 6,
                            },
                            sourceIndexes: {
                              type: "array",
                              items: { type: "integer" },
                              maxItems: 12,
                            },
                            lookup: {
                              type: "string",
                              enum: ["none", "own_appointment_status"],
                            },
                          },
                          required: [
                            "message",
                            "actionIds",
                            "sourceIndexes",
                            "lookup",
                          ],
                          additionalProperties: false,
                        },
                      },
                      generation_config: {
                        max_output_tokens: 500,
                        thinking_level: "low",
                      },
                      store: false,
                      automatic_continuation: false,
                    },
                    {
                      signal,
                      timeout_ms: PROVIDER_TIMEOUT_MS,
                      retries: {
                        strategy: "attempt-count-backoff",
                        maxRetries: 0,
                      },
                    },
                  ),
                signal,
                Math.min(
                  providerStart + PROVIDER_TIMEOUT_MS,
                  startedAt + REQUEST_BUDGET_MS,
                ),
                diagnostics,
              ),
            controller.signal,
          );
          return interaction.output_text;
        } catch (error) {
          const status =
            typeof error === "object" && error !== null && "status" in error
              ? Number(error.status)
              : 0;
          if (status)
            diagnostics.upstream_status = [
              401, 403, 404, 429, 500, 502, 503, 504,
            ].includes(status)
              ? status
              : status >= 500 && status <= 599
                ? "5xx"
                : "none";
          throw mapProviderError(error);
        } finally {
          diagnostics.provider_ms = Math.max(
            0,
            Math.round(performance.now() - providerStart),
          );
        }
      },
    });
    // The response never exposes grounding bodies or raw database/provider data.
    const data = {
      message: reply.message,
      sources: reply.sources.map(({ type, label, title, updatedAt }) => ({
        type,
        label,
        title,
        updatedAt,
      })),
      actions: reply.actions,
      ...(reply.contextMessage ? { contextMessage: reply.contextMessage } : {}),
    };
    logRequest(
      requestId,
      profile.role,
      providerUsed ? "provider_success" : "safety_response",
      startedAt,
      diagnostics,
    );
    return jsonResponse({ data, request_id: requestId }, 200, headers);
  } catch (error) {
    const safeError = controller.signal.aborted
      ? new AiAssistantError(
          "request_timeout",
          "The assistant request timed out. Please try again.",
          504,
        )
      : error instanceof AiAssistantError
        ? error
        : new AiAssistantError(
            "internal_error",
            "The assistant request could not be completed. Please try again.",
            500,
          );
    failureCategory = safeError.code;
    diagnostics.timeout_category =
      safeError.code === "provider_timeout"
        ? "provider_deadline"
        : controller.signal.aborted
          ? "request_budget_or_disconnect"
          : "none";
    logRequest(requestId, role, failureCategory, startedAt, diagnostics);
    return jsonResponse(
      {
        error: { code: safeError.code, message: safeError.message },
        request_id: requestId,
      },
      safeError.status,
      headers,
    );
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", onDisconnect);
  }
});
