import fs from "node:fs";

import { describe, expect, it } from "vitest";

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read(
  "supabase/migrations/20260720003400_production_security_hardening.sql",
);
const manageUser = read("supabase/functions/manage-user/index.ts");
const backupAdmin = read("supabase/functions/backup-admin/index.ts");
const backupProcessor = read("supabase/functions/process-backups/index.ts");
const notificationProcessor = read(
  "supabase/functions/process-notification-jobs/index.ts",
);
const aiIndex = read("supabase/functions/alaga-ai/index.ts");
const html = read("index.html");
const config = read("supabase/config.toml");

describe("Phase 13 production security boundary", () => {
  it("keeps the hardening forward-only and preserves all earlier migrations", () => {
    expect(migration).toMatch(/^begin;/);
    expect(migration).toMatch(/commit;\s*$/);
    expect(migration).not.toMatch(/drop table|truncate|delete from/i);
  });

  it("requires active resident identities at the shared RLS helpers", () => {
    expect(migration).toMatch(
      /current_resident_id\(\)[\s\S]*account_status = 'active'[\s\S]*role = 'resident'[\s\S]*r\.status = 'active'[\s\S]*r\.archived_at is null/i,
    );
    expect(migration).toMatch(
      /current_household_id\(\)[\s\S]*account_status = 'active'[\s\S]*role = 'resident'[\s\S]*r\.status = 'active'[\s\S]*r\.archived_at is null/i,
    );
  });

  it("denies inactive profile writes and notification preference RPCs", () => {
    expect(migration).toMatch(
      /profiles_update_own[\s\S]*current_profile_role\(\) is not null/i,
    );
    expect(
      migration.match(/actor_id is null or actor_role is null/gi),
    ).toHaveLength(2);
    expect(migration).toMatch(/errcode = '42501'/i);
  });

  it("aligns trusted function volatility without changing their contracts", () => {
    expect(migration).toMatch(
      /alter function public\.report_validate_scope\([\s\S]*\) stable/i,
    );
    expect(migration).toMatch(
      /alter function public\.admin_list_resident_link_candidates\([\s\S]*\) volatile/i,
    );
    expect(migration).toMatch(
      /alter function public\.admin_get_resident_account\(uuid,uuid\) volatile/i,
    );
  });

  it.each([
    ["manage-user", manageUser],
    ["backup-admin", backupAdmin],
  ])(
    "uses exact required origins and hardened responses for %s",
    (_name, source) => {
      expect(source).toMatch(/!origin \|\| !\w+\.has\(origin\)/);
      expect(source).toMatch(/parsed\.origin !== candidate/);
      expect(source).toMatch(/Content-Security-Policy/);
      expect(source).toMatch(/X-Content-Type-Options/);
      expect(source).toMatch(/Referrer-Policy/);
      expect(source).toMatch(/Permissions-Policy/);
    },
  );

  it("keeps scheduler-only backup processing outside browser CORS", () => {
    expect(backupProcessor).toMatch(/request\.headers\.has\("origin"\)/);
    expect(backupProcessor).toMatch(/Browser requests are not accepted/);
    expect(backupProcessor).toMatch(/Content-Security-Policy/);
  });

  it.each([
    ["AI", aiIndex],
    ["notification processor", notificationProcessor],
  ])("uses complete no-store response hardening for %s", (_name, source) => {
    expect(source).toMatch(/Cache-Control/);
    expect(source).toMatch(/Content-Security-Policy/);
    expect(source).toMatch(/X-Content-Type-Options/);
    expect(source).toMatch(/Referrer-Policy/);
    expect(source).toMatch(/Permissions-Policy/);
  });

  it("keeps invitation redirects on an allowlisted application origin", () => {
    expect(manageUser).toMatch(/new URL\(invitationRedirectUrl\)/);
    expect(manageUser).toMatch(
      /allowedOrigins\.has\(invitationRedirect\.origin\)/,
    );
  });

  it("keeps operational logs free from recipients and profile identifiers", () => {
    const deliveryLog = notificationProcessor.slice(
      notificationProcessor.indexOf(
        'console.log("outbound notification result"',
      ),
      notificationProcessor.indexOf("return Response.json(results"),
    );
    expect(deliveryLog).not.toMatch(/recipientProfileId|maskedDestination/);
    const aiLogger = aiIndex.slice(
      aiIndex.indexOf("function logRequest"),
      aiIndex.indexOf("Deno.serve"),
    );
    expect(aiLogger).not.toMatch(/actor_profile_id|message|content/);
  });

  it("sets browser CSP and privacy metadata without enabling inline scripts", () => {
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/);
    expect(html).toMatch(/script-src 'self'/);
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(html).toMatch(/name="referrer" content="no-referrer"/);
  });

  it("uses hardened local auth defaults for production configuration review", () => {
    expect(config).toMatch(/jwt_expiry = 900/);
    expect(config).toMatch(/enable_refresh_token_rotation = true/);
    expect(config).toMatch(
      /password_requirements = "lower_upper_letters_digits"/,
    );
    expect(config).toMatch(/secure_password_change = true/);
    expect(config).toMatch(/enable_signup = false/);
  });
});
