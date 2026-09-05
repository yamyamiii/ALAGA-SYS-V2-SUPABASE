import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

function canonicalMigrationHash(contents) {
  const canonicalSql = contents
    .toString("utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return crypto.createHash("sha256").update(canonicalSql, "utf8").digest("hex");
}

const migration = fs.readFileSync(
  path.join(
    globalThis.process.cwd(),
    "supabase/migrations/20260720004400_resident_self_registration.sql",
  ),
  "utf8",
);
const approvalCorrection = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/migrations/20260720004500_fix_resident_registration_approval.sql",
  ),
  "utf8",
);
const deletionGuard = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/migrations/20260720004600_guard_resident_account_deletion.sql",
  ),
  "utf8",
);
const deletionExtension = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/migrations/20260720004700_extend_safe_resident_account_deletion.sql",
  ),
  "utf8",
);
const deletionAmbiguityFix = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/migrations/20260720004800_fix_resident_delete_ambiguity.sql",
  ),
  "utf8",
);
const generalizedAccountDeletion = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/migrations/20260720004900_generalize_safe_account_deletion.sql",
  ),
  "utf8",
);
const accountCleanupEligibility = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/migrations/20260720005200_fix_account_cleanup_eligibility.sql",
  ),
  "utf8",
);
const allMigrationSql = fs
  .readdirSync(path.resolve(globalThis.process.cwd(), "supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) =>
    fs.readFileSync(
      path.resolve(globalThis.process.cwd(), "supabase/migrations", file),
      "utf8",
    ),
  )
  .join("\n");
const manageUserFunction = fs.readFileSync(
  path.resolve(
    globalThis.process.cwd(),
    "supabase/functions/manage-user/index.ts",
  ),
  "utf8",
);
const activeRoleHelpers = fs.readFileSync(
  path.join(
    globalThis.process.cwd(),
    "supabase/migrations/20260720000800_helper_functions_and_triggers.sql",
  ),
  "utf8",
);
const residentRequests = fs.readFileSync(
  path.join(
    globalThis.process.cwd(),
    "supabase/migrations/20260720002200_resident_appointment_requests.sql",
  ),
  "utf8",
);
const profileTrigger = fs.readFileSync(
  path.join(
    globalThis.process.cwd(),
    "supabase/migrations/20260720000200_profiles_and_auth_trigger.sql",
  ),
  "utf8",
);
const registrationService = fs.readFileSync(
  path.join(
    globalThis.process.cwd(),
    "src/services/residentRegistrationService.js",
  ),
  "utf8",
);

describe("Resident self-registration database safety", () => {
  it("forces pending Resident identity and never trusts browser role values", () => {
    expect(migration).toMatch(
      /registration_kind[\s\S]*resident_self_registration/i,
    );
    expect(migration).toMatch(
      /self-registered accounts must retain the Resident role/i,
    );
    expect(migration).toMatch(
      /registration approval is required before activation/i,
    );
    expect(migration).not.toMatch(/raw_user_meta_data\s*->>\s*'role'/i);
    expect(migration).not.toMatch(
      /raw_user_meta_data\s*->>\s*'account_status'/i,
    );
  });

  it("keeps frontend signup metadata synchronized with the deployed trigger contract", () => {
    for (const key of [
      "registration_kind",
      "first_name",
      "middle_name",
      "last_name",
      "date_of_birth",
      "sex",
      "purok_id",
      "address_line",
      "phone_number",
    ]) {
      expect(registrationService).toContain(key);
      expect(migration).toContain(`'${key}'`);
    }
    expect(registrationService).toContain("resident_self_registration");
    expect(migration).toContain("resident_self_registration");
  });

  it("creates the profile before one idempotent pending-request capture", () => {
    expect(profileTrigger).toMatch(
      /create trigger on_auth_user_created[\s\S]*after insert on auth\.users/i,
    );
    expect(migration).toMatch(
      /create trigger zz_auth_capture_resident_registration[\s\S]*after insert on auth\.users/i,
    );
    expect(
      "on_auth_user_created".localeCompare(
        "zz_auth_capture_resident_registration",
      ),
    ).toBeLessThan(0);
    expect(migration).toMatch(
      /profile_id uuid not null unique references public\.profiles/i,
    );
    expect(migration).toMatch(
      /if coalesce\(new\.raw_user_meta_data ->> 'registration_kind',[\s\S]*<> 'resident_self_registration' then[\s\S]*return new/i,
    );
  });

  it("keeps pending requests owner-readable but browser-immutable", () => {
    expect(migration).toMatch(
      /create policy resident_registration_select_own[\s\S]*profile_id = auth\.uid\(\)/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.resident_registration_requests[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.resident_registration_requests to authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant (?:insert|update|delete)[\s\S]*resident_registration_requests to (?:anon|authenticated)/i,
    );
  });

  it("keeps pending profiles outside Resident and appointment authorization", () => {
    expect(activeRoleHelpers).toMatch(
      /current_profile_role\(\)[\s\S]*account_status = 'active'/i,
    );
    expect(residentRequests).toMatch(
      /resident_appointment_request[\s\S]*actor_role.*current_profile_role\(\)[\s\S]*actor_role is distinct from 'resident'/i,
    );
    expect(migration).toMatch(/status.*default 'pending'/i);
  });

  it("derives Bagongpook locality and server-generated Resident identity", () => {
    expect(migration).toMatch(/Brgy\. Bagongpook/i);
    expect(migration).toMatch(/Lipa City/i);
    expect(migration).toMatch(/Purok 1[\s\S]*Purok 7/i);
    expect(migration).toMatch(
      /insert into public\.residents[\s\S]*linked_profile_id[\s\S]*request_record\.profile_id/i,
    );
    const insertedColumns = migration.match(
      /insert into public\.residents\s*\(([^)]*)\)/i,
    )?.[1];
    expect(insertedColumns).toBeTruthy();
    expect(insertedColumns).not.toMatch(/resident_number/i);
  });

  it("blocks duplicate creation until an Administrator explicitly links a match", () => {
    expect(migration).toMatch(
      /possible resident match requires explicit linkage review/i,
    );
    expect(migration).toMatch(
      /p_existing_resident_id[\s\S]*selected resident does not match the registration identity/i,
    );
    expect(migration).toMatch(
      /selected resident already has a portal account/i,
    );
  });

  it("keeps approval RPCs service-role-only and BHW-inaccessible", () => {
    expect(migration).toMatch(
      /perform public\.assert_active_administrator\(p_actor_id\)/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.admin_approve_resident_registration[\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.admin_approve_resident_registration[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.admin_approve_resident_registration[\s\S]*to authenticated/i,
    );
  });

  it("atomically creates or links the Resident and activates the approved profile", () => {
    const approvalFunction = migration.match(
      /create or replace function public\.admin_approve_resident_registration[\s\S]*?end;\s*\$\$;/i,
    )?.[0];

    expect(approvalFunction).toBeTruthy();
    expect(approvalFunction).toMatch(
      /if p_existing_resident_id is not null then[\s\S]*update public\.residents[\s\S]*set linked_profile_id = request_record\.profile_id/i,
    );
    expect(approvalFunction).toMatch(
      /else[\s\S]*insert into public\.residents[\s\S]*request_record\.profile_id/i,
    );
    expect(approvalFunction).toMatch(
      /update public\.resident_registration_requests[\s\S]*status = 'approved'/i,
    );
    expect(approvalFunction).toMatch(
      /update public\.profiles[\s\S]*role = 'resident'[\s\S]*account_status = 'active'/i,
    );
  });

  it("returns only the requested pending status to an active Administrator", () => {
    expect(migration).toMatch(
      /admin_list_resident_registrations[\s\S]*assert_active_administrator\(p_actor_id\)/i,
    );
    expect(migration).toMatch(
      /where p_status is null or rr\.status = p_status/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.admin_list_resident_registrations[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.admin_list_resident_registrations[\s\S]*to service_role/i,
    );
  });

  it("uses optimistic concurrency and records minimized approval/rejection audit events", () => {
    expect(migration).toMatch(/request_record\.version <> p_expected_version/i);
    expect(migration).toMatch(/resident\.registration_approved/i);
    expect(migration).toMatch(/resident\.registration_rejected/i);
    expect(migration).not.toMatch(/password/i);
  });

  it("keeps registration rejection historical without archiving or relabeling a Resident", () => {
    const rejectionFunction = migration.match(
      /create or replace function public\.admin_reject_resident_registration[\s\S]*?\n\$\$;/i,
    )?.[0];
    expect(rejectionFunction).toMatch(
      /update public\.resident_registration_requests[\s\S]*set status = 'rejected'/i,
    );
    expect(rejectionFunction).not.toMatch(/update public\.profiles/i);
    expect(rejectionFunction).not.toMatch(/update public\.residents/i);
    expect(rejectionFunction).not.toMatch(/status = 'archived'/i);
  });

  it("enables the existing trusted Resident-link boundary only inside approval", () => {
    const trustedSetting = approvalCorrection.indexOf(
      "set_config('app.trusted_resident_linking', 'on', true)",
    );
    const residentWrite = Math.min(
      approvalCorrection.indexOf("update public.residents", trustedSetting),
      approvalCorrection.indexOf(
        "insert into public.residents",
        trustedSetting,
      ),
    );

    expect(approvalCorrection).toMatch(
      /create or replace function public\.admin_approve_resident_registration/i,
    );
    expect(approvalCorrection).toMatch(
      /perform public\.assert_active_administrator\(p_actor_id\)/i,
    );
    expect(trustedSetting).toBeGreaterThan(-1);
    expect(residentWrite).toBeGreaterThan(trustedSetting);
    expect(approvalCorrection).toMatch(
      /request_record\.version <> p_expected_version/i,
    );
  });

  it("preserves generated RES numbers, atomic approval, and profile activation", () => {
    expect(approvalCorrection).not.toMatch(
      /insert into public\.residents\s*\([^)]*resident_number/i,
    );
    expect(approvalCorrection).toMatch(/returning \* into selected_resident/i);
    expect(approvalCorrection).toMatch(
      /update public\.resident_registration_requests[\s\S]*status = 'approved'[\s\S]*resident_id = selected_resident\.id/i,
    );
    expect(approvalCorrection).toMatch(
      /update public\.profiles[\s\S]*role = 'resident'[\s\S]*account_status = 'active'/i,
    );
    expect(approvalCorrection).not.toMatch(/auth\.admin|createUser|password/i);
  });

  it("keeps duplicate identity review and service-role-only authorization", () => {
    expect(approvalCorrection).toMatch(
      /possible resident match requires explicit linkage review/i,
    );
    expect(approvalCorrection).toMatch(
      /selected resident does not match the registration identity/i,
    );
    expect(approvalCorrection).toMatch(
      /revoke all on function public\.admin_approve_resident_registration[\s\S]*from public, anon, authenticated/i,
    );
    expect(approvalCorrection).toMatch(
      /grant execute on function public\.admin_approve_resident_registration[\s\S]*to service_role/i,
    );
    expect(approvalCorrection).not.toMatch(
      /grant execute on function public\.admin_approve_resident_registration[\s\S]*to authenticated/i,
    );
  });

  it("permits permanent deletion only for unlinked pending or rejected self-registrations", () => {
    expect(deletionGuard).toMatch(
      /perform public\.assert_active_administrator\(p_actor_id\)/i,
    );
    expect(deletionGuard).toMatch(
      /registration_record\.status not in \([\s\S]*'pending'[\s\S]*'rejected'/i,
    );
    expect(deletionGuard).toMatch(
      /where resident\.linked_profile_id = p_target_profile_id[\s\S]*cannot be permanently deleted/i,
    );
    expect(deletionGuard).toMatch(
      /registration_record\.version <> p_expected_registration_version/i,
    );
    expect(deletionGuard).toMatch(
      /active Resident accounts must be deactivated/i,
    );
  });

  it("fails closed on protected profile dependencies without deleting protected rows", () => {
    expect(deletionGuard).toMatch(
      /pg_catalog\.pg_constraint[\s\S]*foreign_key\.confrelid = 'public\.profiles'::regclass/i,
    );
    expect(deletionGuard).toMatch(
      /resident_account_delete_protected_dependencies/i,
    );
    expect(deletionGuard).not.toMatch(
      /delete from public\.(?:appointments|health_encounters|residents|audit_logs|clinical_referrals)/i,
    );
    expect(deletionGuard).not.toMatch(/truncate|drop table/i);
  });

  it("keeps deletion RPCs private and permanently deletes Auth only in the Edge Function", () => {
    expect(deletionGuard).toMatch(
      /revoke all on function public\.admin_prepare_resident_account_deletion[\s\S]*from public, anon, authenticated/i,
    );
    expect(deletionGuard).toMatch(
      /grant execute on function public\.admin_prepare_resident_account_deletion[\s\S]*to service_role/i,
    );
    expect(deletionGuard).not.toMatch(
      /grant execute on function public\.admin_prepare_resident_account_deletion[\s\S]*to authenticated/i,
    );
    expect(manageUserFunction).toMatch(
      /admin\.auth\.admin\.deleteUser\(targetId, false\)/i,
    );
    expect(manageUserFunction).toMatch(/admin_restore_account_deletion/i);
    expect(manageUserFunction).not.toMatch(
      /service_role[^\n]*return|secretKey[^\n]*jsonResponse/i,
    );
  });

  it("retains deactivation and suspension while using a recoverable deletion barrier", () => {
    expect(deletionGuard).toMatch(
      /set account_status = 'suspended'::public\.account_status/i,
    );
    expect(deletionGuard).toMatch(
      /admin_restore_resident_account_deletion[\s\S]*set account_status = p_previous_account_status/i,
    );
    expect(manageUserFunction).toMatch(/case "update_account_status"/i);
  });

  it("keeps deployed deletion migrations canonical-content-identical and extends them forward-only", () => {
    expect(canonicalMigrationHash(deletionGuard)).toBe(
      "625ee0cd5b74867a15db0e8a68d808a3763f16a0109113d42fce491928e1664e",
    );
    expect(canonicalMigrationHash(deletionExtension)).toBe(
      "b3e9c8ad0fe0cc63c1a49a80657a9a62e09c3b6dbe49e9e10d7bd6b3d707025a",
    );
    expect(deletionExtension).toMatch(
      /create or replace function public\.admin_prepare_resident_account_deletion/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /create or replace function public\.admin_prepare_resident_account_deletion/i,
    );
    expect(canonicalMigrationHash(deletionAmbiguityFix)).toBe(
      "0b57d56d527f9a9e835b01c63d4f0e57835c0155b1efd67d5095f5de60b5a0b5",
    );
  });

  it("allows approved and active linked Residents only after fail-closed dependency checks", () => {
    expect(deletionExtension).toMatch(
      /registration_record\.status not in \([\s\S]*'pending'[\s\S]*'rejected'[\s\S]*'approved'/i,
    );
    expect(deletionExtension).toMatch(
      /target_profile\.role <> 'resident'::public\.app_role/i,
    );
    expect(deletionExtension).toMatch(
      /resident_account_deletion_blocker\([\s\S]*pg_catalog\.pg_constraint[\s\S]*public\.profiles[\s\S]*public\.residents/i,
    );
    expect(deletionExtension).toMatch(
      /target_resident\.photo_path is not null/i,
    );
    expect(deletionExtension).toMatch(
      /target_profile\.avatar_path is not null/i,
    );
  });

  it("stages and restores linked rows around permanent Auth deletion", () => {
    expect(deletionExtension).toMatch(
      /create table public\.resident_account_deletion_staging/i,
    );
    expect(deletionExtension).toMatch(
      /update public\.profiles[\s\S]*account_status = 'suspended'[\s\S]*delete from public\.notification_preferences[\s\S]*delete from public\.resident_registration_requests[\s\S]*delete from public\.residents/i,
    );
    expect(deletionExtension).toMatch(
      /admin_restore_resident_account_deletion[\s\S]*insert into public\.residents[\s\S]*insert into public\.resident_registration_requests[\s\S]*insert into public\.notification_preferences[\s\S]*set account_status = staged_record\.previous_account_status/i,
    );
    expect(deletionExtension).toMatch(/app\.trusted_resident_account_restore/i);
  });

  it("serializes approval, dependency creation, and deletion races", () => {
    expect(deletionExtension).toMatch(
      /from public\.profiles[\s\S]*for update[\s\S]*from public\.residents[\s\S]*for update[\s\S]*from public\.resident_registration_requests[\s\S]*for update/i,
    );
    expect(deletionExtension).toMatch(
      /registration_record\.version is distinct from p_expected_registration_version/i,
    );
    expect(deletionExtension).toMatch(
      /set account_status = 'suspended'[\s\S]*delete from public\.resident_registration_requests[\s\S]*delete from public\.residents/i,
    );
  });

  it("never deletes appointment, clinical, document, inquiry, job, or audit history", () => {
    expect(deletionExtension).not.toMatch(
      /delete from public\.(?:appointments|health_encounters|vital_signs|resident_allergies|resident_medical_history|clinical_referrals|resident_inquiries|outbound_notification_jobs|audit_logs)/i,
    );
    expect(deletionExtension).toMatch(/resident_dependency:%s\.%s\.%s/i);
    expect(deletionExtension).toMatch(/unknown_resident_reference/i);
    expect(deletionExtension).toMatch(/unknown_profile_reference/i);
  });

  it("keeps eligibility and mutation helpers unavailable to browser roles", () => {
    expect(deletionExtension).toMatch(
      /revoke all on table public\.resident_account_deletion_staging[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(deletionExtension).toMatch(
      /revoke all on function public\.admin_resident_account_deletion_eligibility[\s\S]*from public, anon, authenticated/i,
    );
    expect(deletionExtension).toMatch(
      /grant execute on function public\.admin_resident_account_deletion_eligibility[\s\S]*to service_role/i,
    );
    expect(deletionExtension).not.toMatch(
      /grant (?:delete|all) on (?:table )?public\.(?:residents|profiles|resident_account_deletion_staging)[\s\S]*to authenticated/i,
    );
  });

  it("qualifies the exact profile_id predicates that collided with OUT parameters", () => {
    expect(deletionAmbiguityFix).toMatch(
      /returns table \(\s*profile_id uuid,\s*registration_id uuid,\s*previous_account_status public\.account_status\s*\)/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /delete from public\.notification_preferences as preferences_to_delete\s*where preferences_to_delete\.profile_id = target_profile\.id/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /delete from public\.resident_registration_requests as registration_to_delete\s*where registration_to_delete\.profile_id = target_profile\.id/i,
    );
    expect(deletionAmbiguityFix).not.toMatch(
      /where\s+(?:profile_id|registration_id|previous_account_status)\s*[=<>]/i,
    );
  });

  it("preserves approved, active, pending, rejected, and no-registration preparation", () => {
    expect(deletionAmbiguityFix).toMatch(
      /registration_record\.status not in \([\s\S]*'pending'[\s\S]*'rejected'[\s\S]*'approved'/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /elsif p_expected_registration_version is not null then\s*raise exception 'Resident registration no longer exists'/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /target_profile\.role <> 'resident'::public\.app_role/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /case when has_resident then resident_record\.id else null end/i,
    );
  });

  it("retains Administrator, self-delete, version, lock, and history guards", () => {
    expect(deletionAmbiguityFix).toMatch(
      /perform public\.assert_active_administrator\(p_actor_id\)/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /if p_target_profile_id = p_actor_id[\s\S]*errcode = '42501'/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /registration_record\.version is distinct from p_expected_registration_version/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /from public\.profiles as profile[\s\S]*for update[\s\S]*from public\.residents as resident[\s\S]*for update[\s\S]*from public\.resident_registration_requests as registration[\s\S]*for update/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /resident_account_deletion_blocker[\s\S]*resident_account_delete_protected_dependencies/i,
    );
    expect(deletionAmbiguityFix).not.toMatch(
      /delete from public\.(?:appointments|health_encounters|vital_signs|resident_allergies|resident_medical_history|clinical_referrals|resident_inquiries|outbound_notification_jobs|audit_logs)/i,
    );
  });

  it("qualifies the compensation path and preserves atomic restoration", () => {
    expect(deletionAmbiguityFix).toMatch(
      /create or replace function public\.admin_restore_resident_account_deletion/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /insert into public\.residents[\s\S]*insert into public\.resident_registration_requests[\s\S]*insert into public\.notification_preferences/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /update public\.profiles as profile_to_restore[\s\S]*where profile_to_restore\.id = p_target_profile_id/i,
    );
    expect(deletionAmbiguityFix).toMatch(
      /delete from public\.resident_account_deletion_staging as staging_to_delete\s*where staging_to_delete\.profile_id = p_target_profile_id/i,
    );
    expect(deletionAmbiguityFix).toMatch(/account\.permanent_delete_restored/i);
  });

  it("keeps prepare and compensation RPCs service-role-only", () => {
    for (const functionName of [
      "admin_prepare_resident_account_deletion",
      "admin_restore_resident_account_deletion",
    ]) {
      expect(deletionAmbiguityFix).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(deletionAmbiguityFix).toMatch(
        new RegExp(
          `grant execute on function public\\.${functionName}[\\s\\S]*?to service_role`,
          "i",
        ),
      );
    }
    expect(deletionAmbiguityFix).not.toMatch(
      /grant execute on function public\.admin_(?:prepare|restore)_resident_account_deletion[\s\S]*?to authenticated/i,
    );
  });
});

describe("generalized non-Administrator account deletion safety", () => {
  it("supports Resident, BHW, Nurse, and Midwife while rejecting Administrators", () => {
    for (const role of [
      "resident",
      "barangay_health_worker",
      "nurse",
      "midwife",
    ]) {
      expect(generalizedAccountDeletion).toMatch(
        new RegExp(`'${role}'::public\\.app_role`, "i"),
      );
    }
    expect(generalizedAccountDeletion).toMatch(
      /Administrator accounts cannot be permanently deleted/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /if p_target_profile_id = p_actor_id[\s\S]*errcode = '42501'/i,
    );
  });

  it("requires an active Administrator and service-role-only RPC execution", () => {
    expect(generalizedAccountDeletion).toMatch(
      /perform public\.assert_active_administrator\(p_actor_id\)/i,
    );
    for (const functionName of [
      "admin_account_deletion_eligibility",
      "admin_prepare_account_deletion",
      "admin_restore_account_deletion",
    ]) {
      expect(generalizedAccountDeletion).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(generalizedAccountDeletion).toMatch(
        new RegExp(
          `grant execute on function public\\.${functionName}[\\s\\S]*?to service_role`,
          "i",
        ),
      );
    }
    expect(generalizedAccountDeletion).not.toMatch(
      /grant execute on function public\.admin_(?:account_deletion_eligibility|prepare_account_deletion|restore_account_deletion)[\s\S]*?to authenticated/i,
    );
  });

  it("fails closed across current and future profile foreign keys", () => {
    expect(generalizedAccountDeletion).toMatch(
      /public\.resident_account_deletion_blocker\([\s\S]*p_target_profile_id/i,
    );
    expect(deletionExtension).toMatch(
      /pg_catalog\.pg_constraint[\s\S]*unknown_profile_reference/i,
    );
    expect(allMigrationSql).toMatch(
      /assigned_staff_id uuid references public\.profiles \(id\)/i,
    );
    expect(allMigrationSql).toMatch(
      /attending_staff_id uuid not null references public\.profiles \(id\)/i,
    );
    expect(allMigrationSql).toMatch(
      /actor_profile_id uuid references public\.profiles \(id\) on delete restrict/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /target_profile\.role <> 'resident'::public\.app_role[\s\S]*from public\.assistance_notifications as notification[\s\S]*notification\.recipient_profile_id = target_profile\.id[\s\S]*account_delete_protected_dependencies/i,
    );
  });

  it("removes only staged Resident identity and disposable account state", () => {
    expect(generalizedAccountDeletion).toMatch(
      /delete from public\.notification_preferences as preferences_to_delete/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /delete from public\.resident_registration_requests as registration_to_delete/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /if has_resident then\s*delete from public\.residents as resident_to_delete/i,
    );
    expect(generalizedAccountDeletion).not.toMatch(
      /delete from public\.(?:appointments|health_encounters|vital_signs|resident_allergies|resident_medical_history|clinical_referrals|resident_inquiries|outbound_notification_jobs|audit_logs|announcements)/i,
    );
  });

  it("keeps staff accounts with Resident state ineligible and preserves Resident checks", () => {
    expect(generalizedAccountDeletion).toMatch(
      /target_profile\.role <> 'resident'::public\.app_role[\s\S]*\(has_resident or has_registration\)[\s\S]*account_delete_protected_dependencies/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /registration_record\.status not in \([\s\S]*'pending'[\s\S]*'rejected'[\s\S]*'approved'/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /registration_record\.version is distinct from p_expected_registration_version/i,
    );
  });

  it("locks, stages, audits, and can compensate an Auth deletion failure", () => {
    expect(generalizedAccountDeletion).toMatch(
      /from public\.profiles as profile[\s\S]*for update[\s\S]*from public\.residents as resident[\s\S]*for update[\s\S]*from public\.resident_registration_requests as registration[\s\S]*for update/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /insert into public\.resident_account_deletion_staging[\s\S]*account\.permanent_delete_prepared/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /admin_restore_account_deletion[\s\S]*insert into public\.residents[\s\S]*insert into public\.resident_registration_requests[\s\S]*insert into public\.notification_preferences[\s\S]*account\.permanent_delete_restored/i,
    );
    expect(manageUserFunction).toMatch(
      /admin\.auth\.admin\.deleteUser\(targetId, false\)/i,
    );
    expect(manageUserFunction).toMatch(/admin_restore_account_deletion/i);
  });

  it("uses qualified predicates to avoid SQLSTATE 42702 regressions", () => {
    expect(generalizedAccountDeletion).toMatch(
      /where profile_to_suspend\.id = target_profile\.id/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /where preferences_to_delete\.profile_id = target_profile\.id/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /where registration_to_delete\.profile_id = target_profile\.id/i,
    );
    expect(generalizedAccountDeletion).toMatch(
      /where resident_to_delete\.id = resident_record\.id/i,
    );
    expect(generalizedAccountDeletion).not.toMatch(
      /where\s+(?:profile_id|registration_id|previous_account_status|resident_id|status|version|id)\s*[=<>]/i,
    );
  });
});

describe("archived Resident account cleanup eligibility", () => {
  it("does not treat archived Resident identity as protected history by itself", () => {
    expect(accountCleanupEligibility).toMatch(
      /target_resident\.status not in \([\s\S]*'active'::public\.resident_status[\s\S]*'inactive'::public\.resident_status[\s\S]*'archived'::public\.resident_status/i,
    );
    expect(accountCleanupEligibility).not.toMatch(
      /return 'resident_archived'/i,
    );
    expect(accountCleanupEligibility).toMatch(
      /return 'resident_protected_lifecycle'/i,
    );
  });

  it("continues to inspect every current and future profile and Resident foreign key", () => {
    expect(accountCleanupEligibility).toMatch(
      /pg_catalog\.pg_constraint[\s\S]*foreign_key\.confrelid = 'public\.profiles'::pg_catalog\.regclass[\s\S]*foreign_key\.confrelid = 'public\.residents'::pg_catalog\.regclass/i,
    );
    expect(accountCleanupEligibility).toMatch(
      /unknown_profile_reference[\s\S]*unknown_resident_reference/i,
    );
    expect(accountCleanupEligibility).not.toMatch(
      /delete from public\.(?:appointments|health_encounters|audit_logs|resident_inquiries)/i,
    );
  });

  it("provides only coarse blocker categories through an Administrator-verified service-role RPC", () => {
    expect(accountCleanupEligibility).toMatch(
      /admin_account_deletion_assessment[\s\S]*assert_active_administrator\(p_actor_id\)/i,
    );
    for (const category of [
      "appointment_history",
      "clinical_history",
      "audit_history",
      "inquiry_history",
      "notification_history",
      "retained_media",
    ]) {
      expect(accountCleanupEligibility).toContain(`'${category}'`);
    }
    expect(accountCleanupEligibility).toMatch(
      /revoke all on function public\.admin_account_deletion_assessment[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(accountCleanupEligibility).toMatch(
      /grant execute on function public\.admin_account_deletion_assessment[\s\S]*to service_role/i,
    );
    expect(accountCleanupEligibility).not.toMatch(
      /grant execute on function public\.admin_account_deletion_assessment[\s\S]*to authenticated/i,
    );
  });

  it("preserves migrations 49 through 51 by canonical content", () => {
    const expected = {
      "20260720004900_generalize_safe_account_deletion.sql":
        "b88104ac700ae8610f338d9402d292f0c7131c38a87e44db8e7a5547f588c9d9",
      "20260720005000_fix_resident_household_unassignment.sql":
        "3147a7c263b20b0264fca2f55abc085dcb2a05c444b35d856f078f611c1f4ce9",
      "20260720005100_archive_sole_member_household.sql":
        "5e8fb7d62655fb1ffb563c318bfb27e82114f3a234c3f1987e9e91e573f73406",
    };
    for (const [file, hash] of Object.entries(expected)) {
      const contents = fs.readFileSync(
        path.resolve(globalThis.process.cwd(), "supabase/migrations", file),
      );
      expect(canonicalMigrationHash(contents)).toBe(hash);
    }
  });
});
