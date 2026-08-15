import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002200_resident_appointment_requests.sql",
  "utf8",
);
const durationMigration = fs.readFileSync(
  "supabase/migrations/20260720002300_simplify_resident_request_duration.sql",
  "utf8",
);
const optionalReasonMigration = fs.readFileSync(
  "supabase/migrations/20260720003600_optional_resident_appointment_reason.sql",
  "utf8",
);
const staffEditReasonMigration = fs.readFileSync(
  "supabase/migrations/20260720003700_preserve_optional_resident_appointment_reason.sql",
  "utf8",
);
const optionalCancellationMigration = fs.readFileSync(
  "supabase/migrations/20260720003800_optional_resident_cancellation_reason.sql",
  "utf8",
);
const authorizedCancellationMigration = fs.readFileSync(
  "supabase/migrations/20260720004100_optional_authorized_cancellation_reason.sql",
  "utf8",
);
const singleRowAppointmentMigration = fs.readFileSync(
  "supabase/migrations/20260720004000_enforce_single_row_appointment_lifecycle.sql",
  "utf8",
);
const workflow = fs.readFileSync(
  "supabase/migrations/20260720001800_appointment_workflows.sql",
  "utf8",
);
const rls = fs.readFileSync(
  "supabase/migrations/20260720001000_rls_policies.sql",
  "utf8",
);

function functionBlock(name, nextName) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? migration.indexOf(
        `create or replace function public.${nextName}`,
        start + 1,
      )
    : migration.length;
  return migration.slice(start, end);
}

describe("resident appointment request database safety", () => {
  const request = functionBlock(
    "resident_appointment_request",
    "resident_appointment_cancel",
  );
  const cancel = optionalCancellationMigration.slice(
    optionalCancellationMigration.indexOf(
      "create or replace function public.resident_appointment_cancel(",
    ),
  );
  const detail = functionBlock(
    "resident_appointment_detail",
    "appointment_resident_request_list",
  );

  it("derives an active resident server-side and forces safe request fields", () => {
    expect(request).toMatch(/linked_profile_id = actor_id/i);
    expect(request).toMatch(/resident_record\.status <> 'active'/i);
    expect(request).toMatch(/resident_record\.archived_at is not null/i);
    expect(request).toMatch(
      /resident_record\.id,\s*null,\s*'scheduled'::public\.appointment_type/i,
    );
    expect(request).toMatch(
      /'normal'::public\.appointment_priority,\s*'pending'::public\.appointment_status/i,
    );
    expect(request).not.toMatch(
      /p_resident_id|p_assigned_staff_id|p_priority/i,
    );
  });

  it("serializes duplicate checks and validates Manila scheduling", () => {
    expect(request).toMatch(/pg_advisory_xact_lock/gi);
    expect(request).toMatch(/appointment request key was reused/i);
    expect(request).toMatch(/matching pending resident request/i);
    expect(request).toMatch(/appointment_validate_schedule/i);
    expect(request).toMatch(/p_request_key/i);
    expect(workflow).toMatch(
      /manila_now timestamp := pg_catalog\.now\(\) at time zone 'Asia\/Manila'[\s\S]*p_scheduled_date < manila_now::date/i,
    );
  });

  it("limits cancellation to an own pending resident request", () => {
    expect(cancel).toMatch(
      /appointment_record\.resident_id is distinct from resident_record\.id/i,
    );
    expect(cancel).toMatch(/request_source is distinct from[\s\S]*'resident'/i);
    expect(cancel).toMatch(/status is distinct from[\s\S]*'pending'/i);
    expect(cancel).toMatch(/version <> p_expected_version/i);
    expect(cancel).toMatch(
      /normalized_cancellation_reason text :=[\s\S]*nullif\(btrim\(p_cancellation_reason\), ''\)/i,
    );
    expect(cancel).toMatch(
      /char_length\(normalized_cancellation_reason\) > 1000/i,
    );
    expect(cancel).not.toMatch(/cancellation reason is required/i);
    expect(cancel).toMatch(
      /status = 'cancelled'[\s\S]*cancellation_reason = normalized_cancellation_reason[\s\S]*cancelled_at = pg_catalog\.now\(\)/i,
    );
  });

  it("returns a resident-safe detail shape without internal notes", () => {
    expect(detail).toMatch(/a\.resident_id = resident_record\.id/i);
    expect(detail).toMatch(/'reason', a\.reason/i);
    expect(detail).not.toMatch(
      /operational_notes|priority|resident_number|contact/i,
    );
  });

  it("denies the daily queue to resident callers", () => {
    expect(migration).toMatch(
      /appointment_daily_queue[\s\S]*current_profile_role\(\) = 'resident'[\s\S]*residents cannot access the daily appointment queue/i,
    );
  });

  it("keeps direct appointment writes revoked and helper access narrow", () => {
    expect(workflow).toMatch(
      /revoke insert, update on table public\.appointments from authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update)[^;]*public\.appointments/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resident_appointment_request[\s\S]*to authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resident_appointment_cancel[\s\S]*to authenticated/i,
    );
  });

  it("retains own-row RLS and staff-only review and confirmation", () => {
    expect(rls).toMatch(
      /appointments_select_own[\s\S]*resident_id = public\.current_resident_id\(\)/i,
    );
    expect(migration).toMatch(
      /appointment_resident_request_list[\s\S]*current_profile_role\(\) not in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'/i,
    );
    expect(workflow).toMatch(
      /appointment_update_schedule[\s\S]*appointment editing requires an administrator or BHW[\s\S]*assigned_staff_id = p_assigned_staff_id/i,
    );
    expect(workflow).toMatch(
      /appointment_transition[\s\S]*\('pending'::public\.appointment_status, 'confirmed'::public\.appointment_status\)/i,
    );
    expect(migration).toMatch(
      /require_resident_request_assignment[\s\S]*new\.status = 'confirmed'[\s\S]*new\.assigned_staff_id is null/i,
    );
  });

  it("keeps Resident dashboard metrics RLS-scoped with explicit Manila and status semantics", () => {
    const summary = workflow.slice(
      workflow.indexOf(
        "create or replace function public.appointment_dashboard_summary",
      ),
      workflow.indexOf("-- Replace the generic appointment audit"),
    );
    expect(summary).toMatch(/security invoker/i);
    expect(summary).toMatch(
      /now\(\) at time zone 'Asia\/Manila'\)::date as today/i,
    );
    expect(summary).toMatch(/status = 'pending' and a\.archived_at is null/i);
    expect(summary).toMatch(
      /scheduled_date > c\.today[\s\S]*status in \('pending', 'confirmed'\)[\s\S]*archived_at is null/i,
    );
    expect(summary).toMatch(
      /scheduled_date = c\.today and a\.status = 'completed' and a\.archived_at is null/i,
    );
    expect(summary).not.toMatch(
      /status in \('checked_in',\s*'in_progress',\s*'completed'\)/i,
    );
  });

  it("treats an old checked-in appointment as unfinished data, not a completed visit", () => {
    const transition = workflow.slice(
      workflow.indexOf(
        "create or replace function public.appointment_transition",
      ),
      workflow.indexOf(
        "create or replace function public.appointment_update_operational_notes",
      ),
    );
    expect(transition).toMatch(
      /\('checked_in'::public\.appointment_status, 'in_progress'::public\.appointment_status\)/i,
    );
    expect(transition).toMatch(
      /\('in_progress'::public\.appointment_status, 'completed'::public\.appointment_status\)/i,
    );
    expect(transition).not.toMatch(
      /scheduled_date\s*[<>]\s*(?:current_date|now\()/i,
    );

    const healthRecords = fs.readFileSync(
      "supabase/migrations/20260720002000_health_records_foundation.sql",
      "utf8",
    );
    const createEncounter = healthRecords.slice(
      healthRecords.indexOf(
        "create or replace function public.health_encounter_create",
      ),
      healthRecords.indexOf(
        "create or replace function public.health_encounter_update_draft",
      ),
    );
    const signEncounter = healthRecords.slice(
      healthRecords.indexOf(
        "create or replace function public.health_encounter_sign",
      ),
      healthRecords.indexOf(
        "create or replace function public.health_encounter_amend",
      ),
    );
    expect(createEncounter).toMatch(
      /appointment_record\.status not in \('in_progress', 'completed'\)/i,
    );
    expect(signEncounter).not.toMatch(/update public\.appointments/i);
  });

  it("emits reason-free request audit and notification-boundary events", () => {
    for (const action of [
      "appointment.resident_requested",
      "appointment.resident_cancelled",
      "appointment.request_confirmed",
      "appointment.request_schedule_adjusted",
      "appointment.request_rejected",
    ]) {
      expect(migration).toContain(action);
    }
    const eventInsert = migration.slice(
      migration.indexOf("insert into public.appointment_request_events"),
    );
    expect(eventInsert).not.toMatch(/\breason\b|contact|token|secret/i);
    expect(migration).toMatch(
      /revoke all on table public\.appointment_request_events[\s\S]*authenticated/i,
    );
  });

  it("preserves original preference metadata through staff rescheduling", () => {
    expect(migration).toMatch(
      /current_record\.request_source,\s*current_record\.requested_date,\s*current_record\.requested_start_time,\s*current_record\.requested_end_time/i,
    );
    expect(migration).toMatch(
      /'requested_schedule', jsonb_build_object\([\s\S]*new\.requested_date/i,
    );
  });
});

describe("optional authorized cancellation reason", () => {
  const residentCancel = optionalCancellationMigration.slice(
    optionalCancellationMigration.indexOf(
      "create or replace function public.resident_appointment_cancel(",
    ),
  );
  const staffTransition = authorizedCancellationMigration.slice(
    authorizedCancellationMigration.indexOf(
      "create or replace function public.appointment_transition(",
    ),
    authorizedCancellationMigration.indexOf("revoke all on function"),
  );

  it("keeps Resident self-cancellation nullable without placeholder text", () => {
    expect(optionalCancellationMigration).toMatch(
      /appointments_cancelled_fields_consistent[\s\S]*status = 'cancelled'[\s\S]*cancelled_at is not null[\s\S]*cancellation_reason is not null[\s\S]*request_source = 'resident'/i,
    );
    expect(residentCancel).toMatch(
      /cancellation_reason = normalized_cancellation_reason/i,
    );
    expect(residentCancel).not.toMatch(/N\/A|None|No reason|Not provided/i);
  });

  it("allows SQL null for true staff cancellation while requiring request rejection justification", () => {
    expect(authorizedCancellationMigration).toMatch(
      /appointments_cancelled_fields_consistent[\s\S]*status = 'cancelled' and cancelled_at is not null[\s\S]*status <> 'cancelled' and cancelled_at is null/i,
    );
    expect(authorizedCancellationMigration).not.toMatch(
      /appointments_cancelled_fields_consistent[\s\S]*cancellation_reason is not null/i,
    );
    expect(staffTransition).toMatch(
      /p_target_status = 'cancelled'[\s\S]*current_record\.status = 'pending'[\s\S]*current_record\.request_source =[\s\S]*'resident'[\s\S]*normalized_cancellation_reason is null[\s\S]*rejection reason is required/i,
    );
    expect(staffTransition).toMatch(
      /normalized_cancellation_reason text :=[\s\S]*nullif\(btrim\(p_cancellation_reason\), ''\)[\s\S]*char_length\(normalized_cancellation_reason\) > 1000/i,
    );
    expect(staffTransition).toMatch(
      /cancellation_reason = case[\s\S]*then normalized_cancellation_reason/i,
    );
    expect(staffTransition).not.toMatch(/N\/A|None|No reason|Not provided/i);
  });

  it("preserves staff roles, status eligibility, locking, and concurrency", () => {
    expect(staffTransition).toMatch(
      /actor_role = 'admin'[\s\S]*actor_allowed := true/i,
    );
    expect(staffTransition).toMatch(
      /actor_role = 'barangay_health_worker'[\s\S]*'cancelled'[\s\S]*current_record\.status <> 'in_progress'/i,
    );
    expect(staffTransition).toMatch(
      /actor_role in \([\s\S]*'nurse'[\s\S]*'midwife'[\s\S]*p_target_status in \([\s\S]*'no_show'[\s\S]*\)/i,
    );
    const clinicianTargets = staffTransition.slice(
      staffTransition.indexOf("elsif actor_role in ("),
      staffTransition.indexOf("if not actor_allowed"),
    );
    expect(clinicianTargets).not.toMatch(/'cancelled'/i);
    expect(staffTransition).toMatch(
      /select \* into current_record[\s\S]*for update/i,
    );
    expect(staffTransition).toMatch(
      /current_record\.version <> p_expected_version[\s\S]*errcode = '40001'/i,
    );
    expect(staffTransition).toMatch(
      /if not transition_allowed[\s\S]*invalid appointment status transition/i,
    );
  });

  it("retains ownership, eligibility, locking, and optimistic concurrency", () => {
    expect(residentCancel).toMatch(/linked_profile_id = actor_id/i);
    expect(residentCancel).toMatch(
      /appointment_record\.resident_id is distinct from resident_record\.id/i,
    );
    expect(residentCancel).toMatch(
      /select \* into appointment_record[\s\S]*for update/i,
    );
    expect(residentCancel).toMatch(
      /request_source is distinct from[\s\S]*resident/i,
    );
    expect(residentCancel).toMatch(/status is distinct from[\s\S]*pending/i);
    expect(residentCancel).toMatch(/archived_at is not null/i);
    expect(residentCancel).toMatch(/version <> p_expected_version/i);
  });

  it("keeps minimized cancellation audit and event generation reason-free", () => {
    expect(migration).toMatch(
      /actor_role = 'resident'[\s\S]*appointment\.resident_cancelled/i,
    );
    expect(migration).toMatch(
      /when 'appointment\.resident_cancelled' then 'request_cancelled'/i,
    );
    const eventInsert = migration.slice(
      migration.indexOf("insert into public.appointment_request_events"),
      migration.indexOf(
        "return new;",
        migration.indexOf("insert into public.appointment_request_events"),
      ),
    );
    expect(eventInsert).toMatch(
      /appointment_number[\s\S]*status[\s\S]*occurred_at/i,
    );
    expect(eventInsert).not.toMatch(/cancellation_reason/i);
  });

  it("adds no RLS policy or direct appointment mutation permission", () => {
    expect(authorizedCancellationMigration).not.toMatch(
      /create\s+policy|alter\s+table[\s\S]*enable\s+row\s+level\s+security/i,
    );
    expect(authorizedCancellationMigration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.appointments/i,
    );
    expect(authorizedCancellationMigration).toMatch(
      /grant execute on function public\.appointment_transition\([\s\S]*to authenticated, service_role/i,
    );
  });

  it("keeps structured audit and cancellation notifications narrative-free", () => {
    const appointmentNotifications = singleRowAppointmentMigration.slice(
      singleRowAppointmentMigration.indexOf(
        "create or replace function public.assistance_notify_appointment()",
      ),
    );
    expect(migration).toMatch(
      /appointment\.request_rejected[\s\S]*request_rejected/i,
    );
    expect(migration).toMatch(
      /appointment\.cancelled[\s\S]*audit_safe_snapshot\('appointments'/i,
    );
    expect(appointmentNotifications).toMatch(
      /new\.status = 'cancelled'[\s\S]*event_type := 'appointment_cancelled'/i,
    );
    expect(appointmentNotifications).not.toMatch(
      /event_summary\s*:=\s*[^;]*cancellation_reason/i,
    );
  });
});

describe("resident request provisional duration", () => {
  const refinedRequest = durationMigration.slice(
    durationMigration.indexOf(
      "create or replace function public.resident_appointment_request(",
    ),
  );

  it("centralizes and derives a thirty-minute provisional end time", () => {
    expect(durationMigration).toMatch(
      /resident_appointment_provisional_duration\(\)[\s\S]*select interval '30 minutes'/i,
    );
    expect(refinedRequest).toMatch(
      /provisional_end_at\s*:=\s*p_scheduled_date \+ p_start_time \+ provisional_duration/i,
    );
    expect(refinedRequest).toMatch(
      /appointment_validate_schedule\([\s\S]*p_start_time,\s*provisional_end_time/i,
    );
    expect(refinedRequest).toMatch(
      /p_start_time,\s*provisional_end_time,\s*'normal'::public\.appointment_priority/i,
    );
  });

  it("rejects a derived range that crosses the selected date", () => {
    expect(refinedRequest).toMatch(
      /provisional_end_at::date is distinct from p_scheduled_date/i,
    );
    expect(refinedRequest).toMatch(/provisional_end_time <= p_start_time/i);
  });

  it("removes the browser end-time override while preserving idempotency", () => {
    expect(durationMigration).toMatch(
      /drop function public\.resident_appointment_request\(\s*text, date, time, time, text, uuid\s*\)/i,
    );
    const signature = refinedRequest.slice(0, refinedRequest.indexOf(")"));
    expect(signature).not.toMatch(/p_end_time/i);
    expect(refinedRequest).toMatch(
      /existing_record\.end_time is distinct from provisional_end_time/i,
    );
    expect(refinedRequest).toMatch(/pg_advisory_xact_lock/);
    expect(refinedRequest).toMatch(/matching pending resident request/i);
  });

  it("keeps staff-controlled final schedule adjustment intact", () => {
    expect(workflow).toMatch(
      /appointment_update_schedule\([\s\S]*p_start_time time,\s*p_end_time time/i,
    );
    expect(workflow).toMatch(
      /appointment editing requires an administrator or BHW/i,
    );
  });
});

describe("optional Resident appointment reason", () => {
  const request = optionalReasonMigration.slice(
    optionalReasonMigration.indexOf(
      "create or replace function public.resident_appointment_request(",
    ),
  );
  const validator = optionalReasonMigration.slice(
    optionalReasonMigration.indexOf(
      "create or replace function public.appointment_validate_schedule(",
    ),
    optionalReasonMigration.indexOf(
      "create or replace function public.resident_appointment_request(",
    ),
  );

  it("normalizes an omitted or blank reason to SQL null", () => {
    expect(request).toMatch(
      /normalized_reason text := nullif\(btrim\(p_reason\), ''\)/i,
    );
    expect(request).toMatch(
      /'pending'::public\.appointment_status,\s*normalized_reason,\s*null,\s*p_request_key/i,
    );
    expect(request).not.toMatch(/N\/A|None|Not provided/i);
  });

  it("retains trimming and the 1,000-character boundary when provided", () => {
    expect(request).toMatch(/char_length\(normalized_reason\) > 1000/i);
    expect(request).toMatch(
      /reason for visit must be 1,000 characters or fewer/i,
    );
    expect(request).not.toMatch(/reason for visit is required/i);
  });

  it("keeps staff-created scheduled reasons required", () => {
    expect(validator).toMatch(
      /resident_request boolean :=[\s\S]*current_profile_role\(\) = 'resident'[\s\S]*p_staff_id is null[\s\S]*p_exclude_id is null/i,
    );
    expect(validator).toMatch(
      /and not resident_request[\s\S]*nullif\(btrim\(p_reason\), ''\) is null[\s\S]*appointment reason is required/i,
    );
  });

  it("preserves identity derivation, authorization, idempotency, and duration", () => {
    expect(request).toMatch(
      /actor_role is distinct from 'resident'[\s\S]*errcode = '42501'/i,
    );
    expect(request).toMatch(/where r\.linked_profile_id = actor_id/i);
    expect(request).not.toMatch(
      /p_resident_id|p_assigned_staff_id|p_end_time/i,
    );
    expect(request).toMatch(/pg_advisory_xact_lock/);
    expect(request).toMatch(/resident_appointment_provisional_duration\(\)/i);
    expect(request).toMatch(
      /appointment_validate_schedule\([\s\S]*normalized_reason/i,
    );
    expect(optionalReasonMigration).toMatch(
      /revoke all on function public\.appointment_validate_schedule\([\s\S]*from public, anon, authenticated/i,
    );
    expect(optionalReasonMigration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.appointments/i,
    );
  });
});

describe("optional Resident reason during authorized staff scheduling", () => {
  const validator = staffEditReasonMigration.slice(
    staffEditReasonMigration.indexOf(
      "create or replace function public.appointment_validate_schedule(",
    ),
    staffEditReasonMigration.indexOf(
      "create or replace function public.appointment_reschedule(",
    ),
  );
  const reschedule = singleRowAppointmentMigration.slice(
    singleRowAppointmentMigration.indexOf(
      "create or replace function public.appointment_reschedule(",
    ),
    singleRowAppointmentMigration.indexOf(
      "create or replace function public.assistance_notify_appointment()",
    ),
  );
  const update = workflow.slice(
    workflow.indexOf(
      "create or replace function public.appointment_update_schedule(",
    ),
    workflow.indexOf(
      "create or replace function public.appointment_transition(",
    ),
  );
  const transition = authorizedCancellationMigration.slice(
    authorizedCancellationMigration.indexOf(
      "create or replace function public.appointment_transition(",
    ),
    authorizedCancellationMigration.indexOf("revoke all on function"),
  );

  it("derives optional-reason eligibility from the trusted existing row", () => {
    expect(validator).toMatch(
      /where a\.id = p_exclude_id[\s\S]*a\.resident_id = p_resident_id[\s\S]*a\.request_source = 'resident'/i,
    );
    expect(validator).toMatch(
      /and not resident_reason_optional[\s\S]*nullif\(btrim\(p_reason\), ''\) is null[\s\S]*appointment reason is required/i,
    );
    expect(validator).not.toMatch(/p_request_source/i);
  });

  it("keeps update authorization, concurrency, and SQL-null persistence", () => {
    expect(update).toMatch(
      /actor_role not in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'/i,
    );
    expect(update).toMatch(/current_record\.version <> p_expected_version/i);
    expect(update).toMatch(
      /appointment_validate_schedule\([\s\S]*p_reason, current_record\.id/i,
    );
    expect(update).toMatch(/reason = nullif\(btrim\(p_reason\), ''\)/i);
    expect(update).not.toMatch(/N\/A|None|Not provided/i);
  });

  it("preserves a nullable reason through the in-place reschedule workflow", () => {
    expect(reschedule).toMatch(
      /select \* into current_record[\s\S]*for update/i,
    );
    expect(reschedule).toMatch(
      /current_record\.version <> p_expected_version/i,
    );
    expect(reschedule).toMatch(
      /appointment_validate_schedule\([\s\S]*current_record\.reason,\s*current_record\.id/i,
    );
    expect(reschedule).toMatch(
      /update public\.appointments as appointment[\s\S]*scheduled_date = p_scheduled_date/i,
    );
    expect(reschedule).not.toMatch(/insert into public\.appointments/i);
    expect(reschedule).not.toMatch(/reason\s*=/i);
  });

  it("retains assignment-before-confirmation and required rejection justification", () => {
    expect(migration).toMatch(
      /new\.status = 'confirmed'[\s\S]*new\.assigned_staff_id is null[\s\S]*resident requests require assigned staff/i,
    );
    expect(transition).toMatch(
      /p_target_status = 'cancelled'[\s\S]*current_record\.status = 'pending'[\s\S]*request_source =[\s\S]*resident[\s\S]*normalized_cancellation_reason is null/i,
    );
    expect(transition).toMatch(/char_length[\s\S]*> 1000/i);
  });

  it("does not alter RLS, ownership, or direct appointment grants", () => {
    expect(staffEditReasonMigration).toMatch(
      /revoke all on function public\.appointment_validate_schedule\([\s\S]*from public, anon, authenticated/i,
    );
    expect(staffEditReasonMigration).not.toMatch(
      /create\s+policy|alter\s+table[\s\S]*enable\s+row\s+level\s+security/i,
    );
    expect(staffEditReasonMigration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.appointments/i,
    );
  });
});
