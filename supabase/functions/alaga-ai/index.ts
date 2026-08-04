import { GoogleGenAI } from "npm:@google/genai@2";
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  AiAssistantError,
  boundedResponse,
  buildProviderInput,
  buildSystemInstruction,
  exactOriginCorsHeaders,
  groundedResponseFor,
  groundingSourceTypesFor,
  isSupportedRole,
  MAX_BODY_BYTES,
  navigationResponseFor,
  parseAllowedOrigins,
  parsePositiveInteger,
  PROVIDER_TIMEOUT_MS,
  requiresLiveGrounding,
  safetyResponseFor,
  sanitizeGroundingSources,
  validateConversationPayload,
  withWorkflowGrounding,
  uncertaintyMessageFor,
  workflowResponseFor,
  type AssistantAction,
  type CanonicalRole,
  type GroundingSource,
} from "./domain.ts";

type SupabaseClient = ReturnType<typeof createClient>;
type SafeRecord = Record<string, unknown>;

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
  const allowedOrigins = parseAllowedOrigins(
    Deno.env.get("AI_ALLOWED_ORIGINS"),
  );
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
    allowedOrigins,
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
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
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
  let hasActiveResidentLink = false;
  if (data.role === "resident") {
    const { count: residentCount, error: residentError } = await admin
      .from("residents")
      .select("linked_profile_id", { count: "exact", head: true })
      .eq("linked_profile_id", data.id)
      .eq("status", "active")
      .is("archived_at", null);
    if (residentError || residentCount === null || residentCount > 1) {
      throw new AiAssistantError(
        "authorization_unavailable",
        "Resident account linking could not be verified. Try again later.",
        503,
      );
    }
    hasActiveResidentLink = residentCount === 1;
  }
  return {
    id: data.id as string,
    role: data.role as CanonicalRole,
    hasActiveResidentLink,
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
  return sanitizeGroundingSources(data);
}

function assistantData(
  message: string,
  sources: GroundingSource[] = [],
  actions: AssistantAction[] = [],
) {
  return {
    message,
    sources: sources.map(({ type, label, title, updatedAt }) => ({
      type,
      label,
      title,
      updatedAt,
    })),
    actions,
  };
}

async function withProviderTimeout<T>(operation: Promise<T>) {
  let timeoutId: number | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new AiAssistantError(
              "provider_timeout",
              "The assistant took too long to respond. Please try again.",
              504,
            ),
          ),
        PROVIDER_TIMEOUT_MS,
      );
    });
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function mapProviderError(error: unknown) {
  if (error instanceof AiAssistantError) return error;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  if (status === 429 || status >= 500) {
    return new AiAssistantError(
      "provider_unavailable",
      "The assistant is temporarily unavailable. Please try again shortly.",
      503,
    );
  }
  if (status === 401 || status === 403) {
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

function logRequest(
  requestId: string,
  role: CanonicalRole | null,
  category: string,
  startedAt: number,
) {
  console.log("alaga-ai request", {
    request_id: requestId,
    canonical_role: role,
    category,
    latency_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    timestamp: new Date().toISOString(),
  });
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let headers: Record<string, string> = {};
  let actorProfileId: string | null = null;
  let role: CanonicalRole | null = null;
  let failureCategory = "internal_error";

  try {
    const env = environment();
    headers = exactOriginCorsHeaders(request, env.allowedOrigins);
    if (request.method === "OPTIONS") {
      logRequest(requestId, null, "cors_preflight", startedAt);
      return new Response(null, { status: 204, headers });
    }
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

    actorProfileId = await authenticatedCaller(
      request,
      env.url,
      env.publishableKey,
    );
    const admin = createClient(env.url, env.secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const profile = await activeProfile(admin, actorProfileId);
    role = profile.role;

    const rateLimit = await consumeRateLimit(
      admin,
      profile.id,
      env.maximumRequestsPerHour,
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
    const finalUserMessage = messages.at(-1)?.content ?? "";
    const safetyResponse = safetyResponseFor(finalUserMessage);
    if (safetyResponse) {
      logRequest(requestId, profile.role, safetyResponse.category, startedAt);
      return jsonResponse(
        {
          data: assistantData(safetyResponse.response),
          request_id: requestId,
        },
        200,
        headers,
      );
    }

    const navigationResponse = navigationResponseFor(
      finalUserMessage,
      profile.role,
    );
    if (navigationResponse) {
      logRequest(
        requestId,
        profile.role,
        navigationResponse.category,
        startedAt,
      );
      return jsonResponse(
        {
          data: assistantData(
            navigationResponse.message,
            [],
            navigationResponse.actions,
          ),
          request_id: requestId,
        },
        200,
        headers,
      );
    }

    const workflowResponse = workflowResponseFor(
      finalUserMessage,
      profile.role,
      profile.hasActiveResidentLink,
    );
    if (workflowResponse) {
      logRequest(requestId, profile.role, workflowResponse.category, startedAt);
      return jsonResponse(
        {
          data: assistantData(
            workflowResponse.message,
            workflowResponse.sources,
            workflowResponse.actions,
          ),
          request_id: requestId,
        },
        200,
        headers,
      );
    }

    const sourceTypes = groundingSourceTypesFor(finalUserMessage);
    const liveGrounding = sourceTypes.length
      ? await loadApprovedGrounding(admin, profile.id, sourceTypes)
      : [];
    if (requiresLiveGrounding(finalUserMessage) && liveGrounding.length === 0) {
      logRequest(requestId, profile.role, "grounding_empty", startedAt);
      return jsonResponse(
        {
          data: assistantData(uncertaintyMessageFor(finalUserMessage)),
          request_id: requestId,
        },
        200,
        headers,
      );
    }
    const groundedResponse = groundedResponseFor(
      finalUserMessage,
      liveGrounding,
    );
    if (groundedResponse) {
      logRequest(requestId, profile.role, groundedResponse.category, startedAt);
      return jsonResponse(
        {
          data: assistantData(
            groundedResponse.message,
            groundedResponse.sources,
          ),
          request_id: requestId,
        },
        200,
        headers,
      );
    }
    const grounding = withWorkflowGrounding(liveGrounding, profile.role);

    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
    let interaction;
    try {
      interaction = await withProviderTimeout(
        ai.interactions.create({
          model: env.model,
          input: buildProviderInput(messages, grounding),
          system_instruction: buildSystemInstruction(profile.role),
          generation_config: {
            max_output_tokens: 800,
            thinking_level: "low",
          },
          store: false,
        }),
      );
    } catch (error) {
      throw mapProviderError(error);
    }
    const message = boundedResponse(interaction.output_text);

    logRequest(requestId, profile.role, "success", startedAt);
    return jsonResponse(
      { data: assistantData(message, grounding), request_id: requestId },
      200,
      headers,
    );
  } catch (error) {
    const safeError =
      error instanceof AiAssistantError
        ? error
        : new AiAssistantError(
            "internal_error",
            "The assistant request could not be completed. Please try again.",
            500,
          );
    failureCategory = safeError.code;
    logRequest(requestId, role, failureCategory, startedAt);
    return jsonResponse(
      {
        error: { code: safeError.code, message: safeError.message },
        request_id: requestId,
      },
      safeError.status,
      headers,
    );
  }
});
