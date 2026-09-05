import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720001200_trusted_user_management.sql",
  "utf8",
);
const bootstrap = fs.readFileSync("supabase/bootstrap/first_admin.sql", "utf8");

describe("trusted user-management migration", () => {
  it("protects the final active administrator in the database", () => {
    expect(migration).toMatch(/protect_last_active_administrator/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/final active administrator cannot be/i);
    expect(migration).toMatch(/before delete on public\.profiles/i);
  });

  it("evaluates the final-administrator guard only when an active Administrator is removed", () => {
    expect(migration).toMatch(
      /removes_active_admin\s*:=\s*old\.role\s*=\s*'admin'::public\.app_role[\s\S]*old\.account_status\s*=\s*'active'::public\.account_status/i,
    );
    expect(migration).toMatch(
      /if not removes_active_admin then[\s\S]*return new;/i,
    );
  });

  it("removes direct browser-admin profile mutation", () => {
    expect(migration).toMatch(
      /drop policy if exists profiles_update_admin on public\.profiles/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.admin_update_user_role[^;]+to authenticated/i,
    );
  });

  it("grants privileged RPC execution only to service_role", () => {
    expect(migration).toMatch(
      /grant execute on function public\.admin_update_user_role[^;]+to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.admin_update_user_role[^;]+from anon, authenticated/i,
    );
  });

  it("makes the reviewed bootstrap compatible with lifecycle protection", () => {
    expect(bootstrap).toMatch(
      /set_config\('app\.trusted_user_management',\s*'on',\s*true\)/i,
    );
    expect(bootstrap).toMatch(
      /target_user_id constant uuid := '(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'/i,
    );
    expect(bootstrap).not.toMatch(/(?:service[_ -]?role|secret[_ -]?key|eyJ)/i);
    expect(bootstrap).toMatch(/bootstrap retired: an active administrator/i);
  });
});
