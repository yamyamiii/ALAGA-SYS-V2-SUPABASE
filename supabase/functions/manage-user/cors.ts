import { ManageUserError } from "./domain.ts";

export const MANAGE_USER_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
} as const;

export function parseAllowedOrigins(value: string) {
  const origins = new Set<string>();
  for (const candidate of value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new ManageUserError(
        "server_configuration_error",
        "ALLOWED_ORIGINS contains an invalid origin.",
        500,
      );
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== candidate ||
      parsed.username ||
      parsed.password
    ) {
      throw new ManageUserError(
        "server_configuration_error",
        "ALLOWED_ORIGINS must contain exact origins without paths or credentials.",
        500,
      );
    }
    origins.add(parsed.origin);
  }
  return origins;
}

export function corsHeaders(request: Request, allowedOrigins: Set<string>) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    throw new ManageUserError(
      "origin_not_allowed",
      "This application origin is not allowed.",
      403,
    );
  }
  return {
    ...MANAGE_USER_CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function corsPreflightResponse(
  request: Request,
  allowedOrigins: Set<string>,
) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, allowedOrigins),
  });
}
