import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  corsHeaders,
  corsPreflightResponse,
  parseAllowedOrigins,
} from "./cors.ts";

const indexPath = resolve(
  process.cwd(),
  "supabase/functions/manage-user/index.ts",
);
const configPath = resolve(process.cwd(), "supabase/config.toml");
const edgeEnvironmentExample = readFileSync(
  resolve(process.cwd(), "supabase/functions/.env.example"),
  "utf8",
);
const configuredOrigins = [
  edgeEnvironmentExample.match(/^ALLOWED_ORIGINS=(.+)$/m)?.[1],
  "https://alaga.example.gov.ph",
]
  .filter(Boolean)
  .join(",");

function preflight(origin: string) {
  return new Request("https://project.supabase.co/functions/v1/manage-user", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Headers":
        "authorization, x-client-info, apikey, content-type, x-retry-count, x-supabase-api-version",
      "Access-Control-Request-Method": "POST",
    },
  });
}

describe("manage-user CORS", () => {
  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5175",
    "http://192.168.1.16:5173",
  ])("allows the configured development origin %s", (origin) => {
    const response = corsPreflightResponse(
      preflight(origin),
      parseAllowedOrigins(configuredOrigins),
    );

    expect(response.status).toBe(204);
    expect(Object.fromEntries(response.headers.entries())).toMatchObject({
      "access-control-allow-origin": origin,
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type, x-retry-count, x-supabase-api-version",
      "access-control-allow-methods": "POST, OPTIONS",
      vary: "Origin",
    });
  });

  it("supports an exact future production HTTPS origin", () => {
    const origin = "https://alaga.example.gov.ph";
    expect(
      corsHeaders(preflight(origin), parseAllowedOrigins(configuredOrigins)),
    ).toMatchObject({ "Access-Control-Allow-Origin": origin });
  });

  it("rejects an untrusted origin instead of reflecting it", () => {
    expect(() =>
      corsHeaders(
        preflight("https://untrusted.example"),
        parseAllowedOrigins(configuredOrigins),
      ),
    ).toThrowError(/origin is not allowed/i);
  });

  it.each([
    "*",
    "https://alaga.example.gov.ph/path",
    "https://user:password@alaga.example.gov.ph",
  ])("rejects unsafe allowlist entry %s", (origin) => {
    expect(() => parseAllowedOrigins(origin)).toThrowError(
      /exact origins without paths or credentials|invalid origin/i,
    );
  });

  it("answers OPTIONS before authentication while retaining authenticated Administrator checks for POST", () => {
    const indexSource = readFileSync(indexPath, "utf8");
    const configSource = readFileSync(configPath, "utf8");
    const preflightPosition = indexSource.indexOf(
      'if (request.method === "OPTIONS")',
    );
    const authenticationPosition = indexSource.indexOf(
      "await authenticatedCaller(",
      preflightPosition,
    );

    expect(preflightPosition).toBeGreaterThan(-1);
    expect(authenticationPosition).toBeGreaterThan(preflightPosition);
    expect(indexSource).toMatch(/await callerProfile\(admin, actorId\)/);
    expect(indexSource).toMatch(/authorizeAdministrator\(data\)/);
    expect(configSource).toMatch(
      /\[functions\.manage-user\][\s\S]*?verify_jwt = true/,
    );
  });

  it("returns allowed-origin CORS headers on safe business and internal errors", () => {
    const indexSource = readFileSync(indexPath, "utf8");
    const headersPosition = indexSource.indexOf(
      "headers = corsHeaders(request, allowedOrigins)",
    );
    const actionPosition = indexSource.indexOf(
      "const data = await performAction(",
    );
    const catchPosition = indexSource.lastIndexOf("} catch (error)");
    const errorResponse = indexSource.slice(catchPosition);

    expect(headersPosition).toBeGreaterThan(-1);
    expect(headersPosition).toBeLessThan(actionPosition);
    expect(errorResponse).toMatch(/safeError\.status,\s*headers,/);
  });

  it("keeps the pending Resident registration list behind the same Administrator endpoint", () => {
    const indexSource = readFileSync(indexPath, "utf8");

    expect(indexSource).toMatch(/case "list_resident_registrations"/);
    expect(indexSource).toMatch(/admin_list_resident_registrations/);
    expect(indexSource).not.toMatch(
      /case "list_resident_registrations"[\s\S]*?createClient\([^)]*publishableKey/,
    );
  });
});
