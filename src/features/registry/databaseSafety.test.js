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
    expect(policies).toMatch(/residents_select_own/i);
    expect(policies).toMatch(/residents_select_staff/i);
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
});
