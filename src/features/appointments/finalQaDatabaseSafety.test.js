import fs from "node:fs";

import { describe, expect, it } from "vitest";

const read = (name) => fs.readFileSync(`supabase/migrations/${name}`, "utf8");

const qaFix = read("20260720002800_final_qa_fixes.sql");
const appointmentWorkflow = read("20260720001800_appointment_workflows.sql");
const appointmentContracts = read(
  "20260720001900_fix_appointment_rpc_contracts.sql",
);
const healthRecords = read("20260720002000_health_records_foundation.sql");
const residentRequests = read(
  "20260720002200_resident_appointment_requests.sql",
);
const residentCancellation = read(
  "20260720003800_optional_resident_cancellation_reason.sql",
);
const authorizedCancellation = read(
  "20260720004100_optional_authorized_cancellation_reason.sql",
);
const assistance = read("20260720002700_general_assistance.sql");
const reports = read("20260720002600_reports_analytics.sql");
const rls = read("20260720001000_rls_policies.sql");
const profiles = read("20260720000200_profiles_and_auth_trigger.sql");
const helpers = read("20260720000800_helper_functions_and_triggers.sql");
const appointmentTable = read("20260720000600_appointments.sql");

function functionBlock(source, name, nextMarker = "commit;") {
  const start = source.indexOf(`function public.${name}`);
  const end = source.indexOf(nextMarker, start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

describe("final appointment and clinical QA database fixes", () => {
  it("replaces the invalid notification path repetition with bounded validation", () => {
    const correctedConstraint = qaFix.slice(
      qaFix.indexOf("add constraint assistance_notification_path_safe"),
      qaFix.indexOf("-- Resident preference fields"),
    );
    expect(assistance).toMatch(/\{1,300\}/);
    expect(qaFix).toMatch(/drop constraint assistance_notification_path_safe/i);
    expect(correctedConstraint).toMatch(
      /char_length\(action_path\) between 2 and 301/i,
    );
    expect(correctedConstraint).toContain("action_path ~ '^/[a-z0-9_/?=&-]+$'");
    expect(correctedConstraint).not.toMatch(/\{1,300\}/);
  });

  it("keeps staff and Resident cancellation narrow and reason-bounded", () => {
    const staffCancel = functionBlock(
      authorizedCancellation,
      "appointment_transition",
      "revoke all on function",
    );
    const residentCancel = functionBlock(
      residentCancellation,
      "resident_appointment_cancel",
      "revoke all on function",
    );

    expect(staffCancel).toMatch(
      /actor_role = 'admin'[\s\S]*actor_allowed := true/i,
    );
    expect(staffCancel).toMatch(
      /actor_role = 'barangay_health_worker'[\s\S]*'cancelled'/i,
    );
    expect(staffCancel).toMatch(
      /normalized_cancellation_reason text :=[\s\S]*nullif\(btrim\(p_cancellation_reason\), ''\)/i,
    );
    expect(staffCancel).toMatch(
      /request_source =[\s\S]*resident[\s\S]*rejection reason is required/i,
    );
    expect(staffCancel).toMatch(/char_length[\s\S]*> 1000/i);
    expect(residentCancel).toMatch(/linked_profile_id = actor_id/i);
    expect(residentCancel).toMatch(
      /request_source is distinct from[\s\S]*resident/i,
    );
    expect(residentCancel).toMatch(/status is distinct from[\s\S]*pending/i);
    expect(residentCancel).toMatch(
      /char_length\(normalized_cancellation_reason\) > 1000/i,
    );
  });

  it("retains assignment-before-confirmation for staff review", () => {
    expect(residentRequests).toMatch(
      /new\.status = 'confirmed'[\s\S]*new\.assigned_staff_id is null[\s\S]*resident requests require assigned staff/i,
    );
    expect(appointmentWorkflow).toMatch(
      /\('pending'::public\.appointment_status, 'confirmed'::public\.appointment_status\)/i,
    );
    expect(appointmentWorkflow).toMatch(
      /assigned staff must be an active eligible staff member/i,
    );
  });

  it("separates immutable resident preference metadata from the current schedule", () => {
    const consistency = qaFix.slice(
      qaFix.indexOf("add constraint appointments_resident_request_consistent"),
      qaFix.indexOf(
        "create or replace function public.protect_appointment_request_metadata",
      ),
    );
    expect(consistency).toMatch(
      /requested_date is not null[\s\S]*requested_end_time > requested_start_time/i,
    );
    expect(consistency).not.toMatch(
      /\band appointment_type\b|\band priority\b/i,
    );
    expect(qaFix).toMatch(
      /new\.requested_date is distinct from old\.requested_date[\s\S]*new\.requested_start_time is distinct from old\.requested_start_time[\s\S]*new\.requested_end_time is distinct from old\.requested_end_time/i,
    );
    expect(qaFix).toMatch(
      /new\.resident_id is distinct from old\.resident_id[\s\S]*new\.created_by is distinct from old\.created_by/i,
    );
    expect(appointmentWorkflow).toMatch(
      /appointment_update_schedule[\s\S]*scheduled_date = p_scheduled_date[\s\S]*start_time = p_start_time[\s\S]*end_time = p_end_time/i,
    );
  });

  it("keeps nurse visibility assigned, active-profile-backed, and RLS-limited", () => {
    expect(profiles).toMatch(
      /create table public\.profiles[\s\S]*id uuid primary key references auth\.users \(id\)/i,
    );
    expect(appointmentTable).toMatch(
      /assigned_staff_id uuid references public\.profiles \(id\)/i,
    );
    expect(helpers).toMatch(
      /function public\.current_profile_role[\s\S]*p\.id = auth\.uid\(\)[\s\S]*p\.account_status = 'active'/i,
    );
    expect(rls).toMatch(
      /appointments_select_assigned_clinician[\s\S]*current_profile_role\(\) in \('nurse', 'midwife'\)[\s\S]*assigned_staff_id = auth\.uid\(\)/i,
    );
    expect(appointmentContracts).toMatch(/security invoker/i);
  });

  it("uses a non-ambiguous, still-validated vital-sign upsert", () => {
    const vitalSave = functionBlock(
      qaFix,
      "health_vital_signs_save",
      "-- CREATE OR REPLACE retains",
    );
    expect(vitalSave).toMatch(
      /v_encounter_record public\.health_encounters%rowtype/i,
    );
    expect(vitalSave).toMatch(/select e\.\* into v_encounter_record/i);
    expect(vitalSave).toMatch(
      /on conflict on constraint vital_signs_encounter_unique do update/i,
    );
    expect(vitalSave).not.toMatch(/on conflict \(encounter_id\)/i);
    expect(vitalSave).toMatch(/recorded_by = v_actor_id/i);
    expect(vitalSave).toMatch(/v_vital_record\.weight_kg[\s\S]*power\(/i);
  });

  it("preserves the required signing workflow", () => {
    const sign = functionBlock(
      healthRecords,
      "health_encounter_sign",
      "create or replace function public.health_encounter_amend",
    );
    expect(sign).toMatch(
      /current_record\.chief_complaint[\s\S]*current_record\.assessment[\s\S]*current_record\.plan/i,
    );
    expect(sign).toMatch(/chief complaint, assessment, and plan are required/i);
    expect(sign).toMatch(/status = 'signed'[\s\S]*signed_by = actor_id/i);
  });

  it("does not leak cancellation reasons or clinical narratives to broad outputs", () => {
    const appointmentOverviews = appointmentContracts.slice(
      appointmentContracts.indexOf("function public.appointment_list"),
      appointmentContracts.indexOf("-- CREATE OR REPLACE preserves ownership"),
    );
    const notificationTrigger = functionBlock(
      assistance,
      "assistance_notify_appointment",
      "create trigger appointments_assistance_notifications",
    );
    expect(appointmentOverviews).not.toMatch(
      /cancellation_reason|chief_complaint|assessment|treatment_notes/i,
    );
    expect(notificationTrigger).not.toMatch(
      /cancellation_reason|\bnew\.reason\b/i,
    );
    const finalAuditFields = functionBlock(
      qaFix,
      "appointment_changed_fields",
      "revoke all on function public.appointment_changed_fields",
    );
    expect(finalAuditFields).not.toMatch(
      /cancellation_reason|operational_notes|['"]reason['"]/i,
    );
    expect(reports).not.toMatch(
      /cancellation_reason|chief_complaint|subjective_notes|treatment_notes/i,
    );
  });
});
