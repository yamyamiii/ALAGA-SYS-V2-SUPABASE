import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720001800_appointment_workflows.sql",
  "utf8",
);
const contractFix = fs.readFileSync(
  "supabase/migrations/20260720001900_fix_appointment_rpc_contracts.sql",
  "utf8",
);

describe("appointment database safety", () => {
  it("uses version checks and serialized staff-date overlap checks", () => {
    expect(migration).toMatch(/add column version bigint not null default 1/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(
      /a\.start_time < p_end_time[\s\S]*a\.end_time > p_start_time/i,
    );
    expect(migration).toMatch(/current_record\.version <> p_expected_version/i);
    expect(migration).toMatch(/appointments_staff_conflict_idx/i);
  });

  it("retires direct browser writes and independently authorizes trusted RPCs", () => {
    expect(migration).toMatch(
      /revoke insert, update on table public\.appointments from authenticated/i,
    );
    expect(migration).toMatch(
      /appointment creation requires an administrator or BHW/i,
    );
    expect(migration).toMatch(/current_record\.assigned_staff_id = actor_id/i);
    expect(migration).toMatch(
      /appointment archive changes require an administrator/i,
    );
    expect(migration).not.toMatch(/service[_ -]?role.*frontend/i);
  });

  it("enforces the exact state machine and atomic rescheduling", () => {
    for (const transition of [
      ["pending", "confirmed"],
      ["pending", "cancelled"],
      ["confirmed", "checked_in"],
      ["confirmed", "cancelled"],
      ["confirmed", "no_show"],
      ["checked_in", "in_progress"],
      ["checked_in", "cancelled"],
      ["in_progress", "completed"],
      ["in_progress", "cancelled"],
    ]) {
      expect(migration).toMatch(
        new RegExp(`'${transition[0]}'[\\s\\S]{0,80}'${transition[1]}'`, "i"),
      );
    }
    expect(migration).toMatch(/use the atomic reschedule workflow/i);
    expect(migration).toMatch(/appointments_single_replacement_unique/i);
    expect(migration).toMatch(
      /insert into public\.appointments[\s\S]*update public\.appointments[\s\S]*status = 'rescheduled'/i,
    );
  });

  it("keeps list, queue, calendar, and history reads under caller RLS", () => {
    for (const name of [
      "appointment_list",
      "appointment_daily_queue",
      "appointment_calendar",
      "appointment_search_residents",
      "appointment_search_staff",
      "appointment_resident_history",
    ]) {
      expect(migration).toMatch(
        new RegExp(`function public\\.${name}[\\s\\S]*?security invoker`, "i"),
      );
    }
    expect(migration).toMatch(
      /appointment_dashboard_summary\(\)[\s\S]*language sql/i,
    );
  });

  it("protects midwife scope and resident ownership through RLS", () => {
    expect(migration).toMatch(
      /current_profile_role\(\) = 'midwife'[\s\S]*service_type in \('Maternal Care', 'Child Health'\)/i,
    );
    expect(migration).not.toMatch(
      /drop policy if exists appointments_select_own/i,
    );
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("returns no reasons or notes in overview APIs and audits safe semantics", () => {
    const overview = migration.slice(
      migration.indexOf("create or replace function public.appointment_list"),
      migration.indexOf("-- Replace the generic appointment audit"),
    );
    expect(overview).not.toMatch(
      /\breason\b|\boperational_notes\b|\bcancellation_reason\b/i,
    );
    expect(migration).toMatch(/appointment\.checked_in/i);
    expect(migration).toMatch(/appointment\.rescheduled/i);
    expect(migration).toMatch(
      /public\.audit_safe_snapshot\('appointments', old_row\)/i,
    );
    expect(migration).toMatch(/'changed_fields'/i);
  });

  it("casts appointment_list column 10 to its declared text contract", () => {
    const listFunction = contractFix.slice(
      contractFix.indexOf("create or replace function public.appointment_list"),
      contractFix.indexOf(
        "create or replace function public.appointment_daily_queue",
      ),
    );
    expect(listFunction).toMatch(
      /p\.role, a\.appointment_type, a\.service_type::text, a\.scheduled_date/i,
    );
    expect(listFunction).toMatch(
      /appointment_type public\.appointment_type, service_type text, scheduled_date date/i,
    );
  });

  it("casts appointment_daily_queue column 8 to its declared text contract", () => {
    const queueFunction = contractFix.slice(
      contractFix.indexOf(
        "create or replace function public.appointment_daily_queue",
      ),
      contractFix.indexOf(
        "create or replace function public.appointment_calendar",
      ),
    );
    expect(queueFunction).toMatch(
      /q\.resident_name, q\.appointment_type,\s*q\.service_type::text, q\.scheduled_date/i,
    );
    expect(queueFunction).toMatch(
      /appointment_type public\.appointment_type,\s*service_type text, scheduled_date date/i,
    );
  });

  it("uses the same explicit text contract for calendar and resident history", () => {
    expect(contractFix).toMatch(
      /appointment_calendar[\s\S]*a\.service_type::text/i,
    );
    expect(contractFix).toMatch(
      /appointment_resident_history[\s\S]*a\.service_type::text/i,
    );
  });

  it("keeps staff search callable under caller RLS without exposing the helper", () => {
    const staffSearch = contractFix.slice(
      contractFix.indexOf(
        "create or replace function public.appointment_search_staff",
      ),
      contractFix.indexOf("-- CREATE OR REPLACE preserves ownership"),
    );
    expect(staffSearch).toMatch(/security invoker/i);
    expect(staffSearch).toMatch(/p_service_type not in \(/i);
    expect(staffSearch).not.toMatch(
      /appointment_service_type_valid\(p_service_type\)/i,
    );
    expect(contractFix).toMatch(
      /grant execute on function public\.appointment_search_staff\(text, text, integer, integer\) to authenticated, service_role/i,
    );
    expect(contractFix).toMatch(
      /revoke all on function public\.appointment_search_staff\(text, text, integer, integer\) from public, anon/i,
    );
  });

  it("keeps unauthorized roles RLS-restricted and the validator private", () => {
    expect(contractFix).toMatch(
      /from public\.profiles as p[\s\S]*p\.account_status = 'active'[\s\S]*p\.role in \('barangay_health_worker', 'nurse', 'midwife'\)/i,
    );
    expect(contractFix).toMatch(
      /revoke all on function public\.appointment_service_type_valid\(text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(contractFix).not.toMatch(
      /grant execute on function public\.appointment_service_type_valid\(text\)[^;]*authenticated/i,
    );
  });

  it("does not restore direct appointment mutations or mutation-RPC grants", () => {
    expect(contractFix).not.toMatch(
      /grant\s+(?:select,\s*)?(?:insert|update)|grant\s+[^;]*(?:insert|update)[^;]*appointments/i,
    );
    expect(contractFix).not.toMatch(
      /grant execute on function public\.appointment_(create|update_schedule|transition|reschedule|set_archive_state)/i,
    );
    expect(contractFix).not.toMatch(/security definer/i);
  });
});
