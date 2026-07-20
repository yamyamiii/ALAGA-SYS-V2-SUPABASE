import fs from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = fs.readFileSync(
  "supabase/migrations/20260720001400_registry_workflows.sql",
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
});
