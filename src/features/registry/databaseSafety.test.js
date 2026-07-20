import fs from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = fs.readFileSync(
  "supabase/migrations/20260720001400_registry_workflows.sql",
  "utf8",
);
const residentSchema = fs.readFileSync(
  "supabase/migrations/20260720000400_residents.sql",
  "utf8",
);
const policies = fs.readFileSync(
  "supabase/migrations/20260720001000_rls_policies.sql",
  "utf8",
);
const helpers = fs.readFileSync(
  "supabase/migrations/20260720000800_helper_functions_and_triggers.sql",
  "utf8",
);
const deployment = fs.readFileSync(
  "supabase/migrations/20260720001500_bagongpook_deployment.sql",
  "utf8",
);
const hardening = fs.readFileSync(
  "supabase/migrations/20260720001600_registry_hardening.sql",
  "utf8",
);
const referenceReconciliation = fs.readFileSync(
  "supabase/migrations/20260720001700_reconcile_bagongpook_reference.sql",
  "utf8",
);

describe("registry database safety", () => {
  it("keeps paginated registry queries under caller RLS", () => {
    expect(workflow.match(/security invoker/gi)).toHaveLength(2);
    expect(workflow).toMatch(
      /revoke all on function public\.registry_list_residents[\s\S]*from anon/i,
    );
    expect(workflow).toMatch(
      /grant execute on function public\.registry_list_households[\s\S]*to authenticated, service_role/i,
    );
  });

  it("retains resident self-read and staff/admin mutation policy boundaries", () => {
    expect(helpers).toMatch(
      /current_profile_role\(\) in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'[\s\S]*'nurse'[\s\S]*'midwife'/i,
    );
    expect(policies).toMatch(/residents_select_own/i);
    expect(policies).toMatch(
      /residents_select_staff_active[\s\S]*public\.is_staff\(\)[\s\S]*archived_at is null/i,
    );
    expect(policies).toMatch(
      /residents_select_admin[\s\S]*using \(public\.is_admin\(\)\)/i,
    );
    expect(policies).toMatch(
      /residents_select_own[\s\S]*archived_at is null[\s\S]*linked_profile_id = auth\.uid\(\)/i,
    );
    expect(policies).toMatch(/residents_insert_admin_bhw/i);
    expect(policies).toMatch(/residents_update_admin/i);
    expect(policies).toMatch(/residents_update_bhw_active/i);
    expect(policies).not.toMatch(/residents_delete/i);
  });

  it("generates immutable numbers and enforces archive/locality relationships", () => {
    expect(workflow).toMatch(/nextval\('public\.household_number_seq'\)/i);
    expect(workflow).toMatch(
      /household_number is database-generated and immutable/i,
    );
    expect(workflow).toMatch(/set_registry_archive_state/i);
    expect(workflow).toMatch(/resident household must be current and match/i);
    expect(workflow).toMatch(
      /reassign the household head before moving or archiving/i,
    );
  });

  it("records semantic actions without sensitive values in audit metadata", () => {
    for (const action of [
      "household.created",
      "household.archived",
      "household.restored",
      "household.head_changed",
      "resident.created",
      "resident.archived",
      "resident.restored",
      "resident.household_changed",
    ]) {
      expect(workflow).toContain(action);
    }
    expect(workflow).toMatch(/jsonb_build_object\([\s\S]*'changed_fields'/i);
    expect(workflow).toMatch(
      /public\.audit_safe_snapshot\(tg_table_name, old_row\)/i,
    );
    expect(workflow).toMatch(
      /public\.audit_safe_snapshot\(tg_table_name, new_row\)/i,
    );
  });

  it("derives barangay_id from the selected database purok", () => {
    expect(deployment).toMatch(/new\.barangay_id\s*:=\s*selected_barangay_id/i);
    expect(deployment).toMatch(/households_apply_deployment_locality/i);
    expect(deployment).toMatch(/residents_apply_deployment_locality/i);
    expect(deployment).toMatch(
      /selected purok is not an active Brgy\. Bagongpook/i,
    );
  });

  it("requires seven distinct canonical deployment puroks", () => {
    expect(deployment).toMatch(
      /count\(distinct[\s\S]*expected_distinct_count/i,
    );
    expect(deployment).toMatch(/expected_distinct_count\s*<>\s*7/i);
  });

  it("deactivates Purok 8 only when no registry row references it", () => {
    expect(deployment).toMatch(/set is_active = false/i);
    expect(deployment).toMatch(
      /not exists \([\s\S]*public\.households[\s\S]*not exists \([\s\S]*public\.residents/i,
    );
    expect(deployment).not.toMatch(/delete\s+from\s+public\.puroks/i);
  });

  it("reconciles the original fictional seed without replacing its UUID", () => {
    expect(referenceReconciliation).toMatch(/barangay masigla \(fictional\)/i);
    expect(referenceReconciliation).toMatch(
      /target_barangay_id[\s\S]*Brgy\. Bagongpook[\s\S]*Lipa City[\s\S]*Batangas/i,
    );
    expect(referenceReconciliation).toMatch(
      /update public\.households[\s\S]*barangay_id = target_barangay_id/i,
    );
    expect(referenceReconciliation).toMatch(
      /update public\.residents[\s\S]*barangay_id = target_barangay_id/i,
    );
    expect(referenceReconciliation).not.toMatch(
      /delete\s+from\s+public\.(barangays|puroks|households|residents)/i,
    );
    expect(referenceReconciliation).toMatch(
      /barangay_count <> 1[\s\S]*legacy_purok_count <> 8[\s\S]*legacy_code_count <> 8/i,
    );
    expect(referenceReconciliation).toMatch(
      /does not match the expected single-barangay P01-P08 seed/i,
    );
    expect(referenceReconciliation).toMatch(
      /legacy_barangay_count > 1[\s\S]*multiple Barangay Masigla seed rows/i,
    );
  });

  it("merges duplicate deployment references and restores validated foreign keys", () => {
    expect(referenceReconciliation).toMatch(/Legacy Barangay/i);
    expect(referenceReconciliation).toMatch(
      /Prefer an existing deployment row[\s\S]*registry[\s\S]*references win/i,
    );
    expect(referenceReconciliation).toMatch(
      /add constraint households_purok_belongs_to_barangay[\s\S]*validate constraint households_purok_belongs_to_barangay/i,
    );
    expect(referenceReconciliation).toMatch(
      /add constraint residents_purok_belongs_to_barangay[\s\S]*add constraint residents_household_matches_location[\s\S]*validate constraint residents_household_matches_location/i,
    );
  });

  it("normalizes exactly Purok 1 through 7 and keeps Purok 8 inactive", () => {
    expect(referenceReconciliation).toMatch(/for purok_number in 1\.\.8 loop/i);
    expect(referenceReconciliation).toMatch(
      /is_active = canonical\.ordinal between 1 and 7/i,
    );
    expect(referenceReconciliation).toMatch(
      /p\.name = 'Purok 8'[\s\S]*not p\.is_active/i,
    );
    expect(referenceReconciliation).toMatch(
      /public\.deployment_barangay_id\(\) <> target_barangay_id/i,
    );
  });

  it("keeps resident photos private and resident-row authorized for every role", () => {
    expect(hardening).toMatch(/'resident-photos'[\s\S]*false[\s\S]*5242880/i);
    expect(hardening).toMatch(/resident_photos_select_authorized/i);
    expect(hardening).toMatch(/resident_photos_insert_admin_bhw/i);
    expect(hardening).toMatch(/resident_photos_delete_admin_bhw/i);
    expect(hardening).toMatch(
      /'nurse'[\s\S]*'midwife'[\s\S]*r\.archived_at is null/i,
    );
    expect(hardening).toMatch(
      /p\.role = 'resident'[\s\S]*r\.linked_profile_id = p\.id/i,
    );
    expect(hardening).not.toMatch(/resident_photos[^\n]*using\s*\(\s*true/i);
  });

  it("uses paginated RLS-preserving household and duplicate searches", () => {
    expect(hardening).toMatch(
      /registry_search_households[\s\S]*security invoker/i,
    );
    expect(hardening).toMatch(/p_limit not between 1 and 25/i);
    expect(hardening).toMatch(/h\.archived_at is null/i);
    expect(hardening).toMatch(
      /registry_find_resident_duplicates[\s\S]*security invoker/i,
    );
    expect(hardening).toMatch(/resident\.duplicate_override/i);
  });

  it("requires the trusted administrator workflow for account linking", () => {
    expect(residentSchema).toMatch(
      /constraint residents_linked_profile_unique unique \(linked_profile_id\)/i,
    );
    expect(hardening).toMatch(
      /resident profile links require the trusted administrator workflow/i,
    );
    expect(hardening).toMatch(
      /admin_link_resident_profile[\s\S]*assert_active_administrator/i,
    );
    expect(hardening).toMatch(
      /grant execute on function public\.admin_link_resident_profile[^;]+to service_role/i,
    );
    expect(hardening).not.toMatch(
      /grant execute on function public\.admin_link_resident_profile[^;]+to authenticated/i,
    );
    expect(hardening).toMatch(
      /p\.role = 'resident'[\s\S]*p\.account_status in/i,
    );
    expect(hardening).toMatch(/archived residents cannot be linked/i);
  });

  it("prevents archived assignment and requires active household heads", () => {
    expect(hardening).toMatch(
      /archived residents cannot change household assignment/i,
    );
    expect(hardening).toMatch(
      /household head must be an active member of the household/i,
    );
    expect(hardening).not.toMatch(/delete\s+from\s+public\.residents/i);
  });
});
