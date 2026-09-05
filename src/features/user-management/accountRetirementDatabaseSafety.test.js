import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720005300_retire_protected_accounts.sql",
  "utf8",
);
const prepareFunction = migration.slice(
  migration.indexOf(
    "create or replace function public.admin_prepare_account_retirement",
  ),
  migration.indexOf(
    "create or replace function public.admin_restore_account_retirement",
  ),
);
const restoreFunction = migration.slice(
  migration.indexOf(
    "create or replace function public.admin_restore_account_retirement",
  ),
  migration.indexOf("create or replace function public.admin_list_users"),
);

describe("protected-history account retirement migration", () => {
  it("retains a tombstoned profile identity instead of deleting protected rows", () => {
    expect(migration).toMatch(/add column retired_at timestamptz/i);
    expect(migration).toMatch(/create table public\.account_retirements/i);
    expect(prepareFunction).toMatch(
      /account_status = 'inactive'::public\.account_status/i,
    );
    expect(prepareFunction).not.toMatch(
      /delete from public\.(profiles|residents|appointments|health_encounters|audit_logs)/i,
    );
  });

  it("allows only supported non-Administrator targets with protected blockers", () => {
    expect(prepareFunction).toMatch(
      /assert_active_administrator\(p_actor_id\)/i,
    );
    expect(prepareFunction).toMatch(/p_target_profile_id = p_actor_id/i);
    expect(prepareFunction).toMatch(
      /target_profile\.role not in \([\s\S]*resident[\s\S]*barangay_health_worker[\s\S]*nurse[\s\S]*midwife/i,
    );
    expect(prepareFunction).toMatch(
      /if deletion_assessment\.eligible then[\s\S]*must use permanent deletion/i,
    );
    expect(prepareFunction).toMatch(
      /appointment_history[\s\S]*clinical_history[\s\S]*audit_history/i,
    );
  });

  it("makes retired lifecycle state immutable outside compensation", () => {
    expect(migration).toMatch(/protect_retired_profile_lifecycle/i);
    expect(migration).toMatch(/retired account profile is immutable/i);
    expect(migration).toMatch(
      /create trigger profiles_protect_retired_lifecycle\s+before update on public\.profiles/i,
    );
    expect(restoreFunction).toMatch(
      /set_config\([\s\S]*app\.trusted_account_retirement_restore/i,
    );
    expect(restoreFunction).toMatch(
      /account_status = retirement_record\.previous_account_status/i,
    );
  });

  it("excludes retired accounts from normal list and detail RPCs", () => {
    expect(migration).toMatch(
      /admin_list_users[\s\S]*profile\.retired_at is null/i,
    );
    expect(migration).toMatch(
      /admin_get_user[\s\S]*profile\.retired_at is null/i,
    );
  });

  it("keeps retirement tables and RPCs service-role-only", () => {
    expect(migration).toMatch(
      /revoke all on table public\.account_retirements[\s\S]*public, anon, authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.admin_prepare_account_retirement[\s\S]*public, anon, authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.admin_prepare_account_retirement[\s\S]*to service_role/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.admin_(?:prepare|restore)_account_retirement[^;]*to authenticated/i,
    );
  });
});
