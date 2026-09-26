import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = globalThis.process.cwd();
const readMigration = (file) =>
  fs.readFileSync(path.join(root, "supabase", "migrations", file), "utf8");

const retirementMigration = readMigration(
  "20260720005300_retire_protected_accounts.sql",
);
const relinkMigration = readMigration(
  "20260720010100_allow_retired_resident_relink.sql",
);
const approvalMigration = readMigration(
  "20260720004500_fix_resident_registration_approval.sql",
);
const manageUserFunction = fs.readFileSync(
  path.join(root, "supabase", "functions", "manage-user", "index.ts"),
  "utf8",
);

const prepareFunction = relinkMigration.slice(
  relinkMigration.indexOf(
    "create or replace function public.admin_prepare_account_retirement",
  ),
  relinkMigration.indexOf(
    "create or replace function public.admin_restore_account_retirement",
  ),
);
const restoreFunction = relinkMigration.slice(
  relinkMigration.indexOf(
    "create or replace function public.admin_restore_account_retirement",
  ),
  relinkMigration.indexOf("-- Reconcile only links"),
);
const reconciliation = relinkMigration.slice(
  relinkMigration.indexOf("-- Reconcile only links"),
  relinkMigration.indexOf(
    "revoke all on function public.admin_prepare_account_retirement",
  ),
);

describe("retired Resident replacement portal-account safety", () => {
  it("records and releases only the retiring profile current Resident link", () => {
    expect(relinkMigration).toMatch(
      /add column released_resident_id uuid[\s\S]*references public\.residents \(id\) on delete restrict/i,
    );
    expect(prepareFunction).toMatch(
      /from public\.residents as resident[\s\S]*resident\.linked_profile_id = target_profile\.id[\s\S]*for update/i,
    );
    expect(prepareFunction).toMatch(
      /released_resident_id[\s\S]*case when has_linked_resident then linked_resident\.id else null end/i,
    );
    expect(prepareFunction).toMatch(
      /app\.trusted_resident_linking[\s\S]*set[\s\S]*linked_profile_id = null[\s\S]*resident_to_release\.linked_profile_id = target_profile\.id/i,
    );
    expect(prepareFunction).not.toMatch(
      /delete from public\.(?:profiles|residents|appointments|health_encounters|audit_logs)/i,
    );
  });

  it("restores the exact link transactionally when Auth retirement fails", () => {
    expect(restoreFunction).toMatch(
      /resident\.id = retirement_record\.released_resident_id[\s\S]*for update/i,
    );
    expect(restoreFunction).toMatch(
      /released_resident\.linked_profile_id is not null[\s\S]*replacement portal account/i,
    );
    expect(restoreFunction).toMatch(
      /app\.trusted_resident_linking[\s\S]*linked_profile_id = target_profile\.id/i,
    );
    expect(restoreFunction).toMatch(
      /app\.trusted_account_retirement_restore[\s\S]*retired_at = null/i,
    );
    expect(manageUserFunction).toMatch(
      /updateUserById\(targetId,[\s\S]*admin_restore_account_retirement/i,
    );
  });

  it("reconciles only internally consistent retired Resident profiles", () => {
    expect(reconciliation).toMatch(/retirement\.profile_id = profile\.id/i);
    expect(reconciliation).toMatch(
      /profile\.role = 'resident'::public\.app_role/i,
    );
    expect(reconciliation).toMatch(
      /profile\.account_status = 'inactive'::public\.account_status/i,
    );
    expect(reconciliation).toMatch(/profile\.retired_at is not null/i);
    expect(reconciliation).toMatch(/profile\.retired_by is not null/i);
    expect(reconciliation).toMatch(
      /retirement\.retired_at = profile\.retired_at/i,
    );
    expect(reconciliation).toMatch(
      /retirement\.retired_by = profile\.retired_by/i,
    );
  });

  it("is idempotent and cannot unlink a replacement current profile", () => {
    expect(reconciliation).toMatch(/retirement\.released_resident_id is null/i);
    expect(reconciliation).toMatch(
      /resident_to_release\.linked_profile_id = profile\.id/i,
    );
    expect(reconciliation).not.toMatch(
      /resident_to_release\.linked_profile_id\s+is\s+not\s+null/i,
    );
  });

  it("keeps explicit Administrator selection and identity checks authoritative", () => {
    expect(approvalMigration).toMatch(
      /perform public\.assert_active_administrator\(p_actor_id\)/i,
    );
    expect(approvalMigration).toMatch(
      /if p_existing_resident_id is not null[\s\S]*where resident\.id = p_existing_resident_id[\s\S]*for update/i,
    );
    expect(approvalMigration).toMatch(
      /selected_resident\.linked_profile_id is not null[\s\S]*already has a portal account/i,
    );
    expect(approvalMigration).toMatch(
      /selected_resident\.first_name[\s\S]*selected_resident\.last_name[\s\S]*selected_resident\.date_of_birth[\s\S]*selected_resident\.sex[\s\S]*does not match the registration identity/i,
    );
  });

  it("preserves the same Resident identity and activates only the new profile", () => {
    expect(approvalMigration).toMatch(
      /set linked_profile_id = request_record\.profile_id[\s\S]*where id = selected_resident\.id[\s\S]*returning \* into selected_resident/i,
    );
    expect(approvalMigration).not.toMatch(/set\s+resident_number\s*=/i);
    expect(approvalMigration).toMatch(
      /update public\.profiles[\s\S]*account_status = 'active'::public\.account_status[\s\S]*where id = request_record\.profile_id/i,
    );
    expect(approvalMigration).toMatch(
      /'linked_existing', p_existing_resident_id is not null/i,
    );
  });

  it("continues to reject archived Residents and unmatched identities", () => {
    expect(approvalMigration).toMatch(
      /selected_resident\.status <> 'active'::public\.resident_status[\s\S]*selected_resident\.archived_at is not null[\s\S]*selected resident is not active/i,
    );
    expect(approvalMigration).toMatch(
      /selected resident does not match the registration identity/i,
    );
  });

  it("preserves retired profiles, historical references, and released email semantics", () => {
    expect(retirementMigration).toMatch(
      /retired account profile is immutable/i,
    );
    expect(relinkMigration).not.toMatch(/delete from public\.profiles/i);
    expect(relinkMigration).not.toMatch(
      /update public\.(?:appointments|health_encounters|audit_logs)/i,
    );
    expect(manageUserFunction).toMatch(
      /retired-\$\{targetId\}@retired\.invalid/i,
    );
    expect(manageUserFunction).not.toMatch(
      /permanentlyRetireAccount[\s\S]*\.deleteUser\(/i,
    );
  });

  it("keeps both lifecycle RPCs service-role-only", () => {
    for (const functionName of [
      "admin_prepare_account_retirement",
      "admin_restore_account_retirement",
    ]) {
      expect(relinkMigration).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(relinkMigration).toMatch(
        new RegExp(
          `grant execute on function public\\.${functionName}[\\s\\S]*?to service_role`,
          "i",
        ),
      );
    }
    expect(relinkMigration).not.toMatch(
      /grant execute on function public\.admin_(?:prepare|restore)_account_retirement[\s\S]*?to authenticated/i,
    );
  });
});
