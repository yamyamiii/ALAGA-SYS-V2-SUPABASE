import fs from "node:fs";

import { describe, expect, it } from "vitest";

const modelFix = fs.readFileSync(
  "supabase/migrations/20260720004000_enforce_single_row_appointment_lifecycle.sql",
  "utf8",
);
const workflow = fs.readFileSync(
  "supabase/migrations/20260720001800_appointment_workflows.sql",
  "utf8",
);
const contracts = fs.readFileSync(
  "supabase/migrations/20260720001900_fix_appointment_rpc_contracts.sql",
  "utf8",
);
const residentRequests = fs.readFileSync(
  "supabase/migrations/20260720002200_resident_appointment_requests.sql",
  "utf8",
);
const duration = fs.readFileSync(
  "supabase/migrations/20260720002300_simplify_resident_request_duration.sql",
  "utf8",
);
const reports = fs.readFileSync(
  "supabase/migrations/20260720002600_reports_analytics.sql",
  "utf8",
);
const outbound = fs.readFileSync(
  "supabase/migrations/20260720003900_fix_reschedule_propagation_notifications.sql",
  "utf8",
);
const outboundFoundation = fs.readFileSync(
  "supabase/migrations/20260720003200_outbound_notification_foundation.sql",
  "utf8",
);
const rls = fs.readFileSync(
  "supabase/migrations/20260720001000_rls_policies.sql",
  "utf8",
);
const authorizedCancellation = fs.readFileSync(
  "supabase/migrations/20260720004100_optional_authorized_cancellation_reason.sql",
  "utf8",
);

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? source.length : to);
}

const reschedule = between(
  modelFix,
  "create or replace function public.appointment_reschedule(",
  "create or replace function public.assistance_notify_appointment()",
);
const notification = between(
  modelFix,
  "create or replace function public.assistance_notify_appointment()",
  "commit;",
);
const outboundTrigger = between(
  outbound,
  "create or replace function public.notification_notify_appointment_outbound()",
  "commit;",
);

function findRelationshipProvenLegacySources(appointments) {
  return appointments
    .filter(
      (candidate) =>
        candidate.status === "rescheduled" &&
        candidate.archived_at === null &&
        appointments.some(
          (replacement) => replacement.rescheduled_from_id === candidate.id,
        ),
    )
    .map((appointment) => appointment.appointment_number);
}

function visibleAppointmentNumbers(appointments, includeArchived = false) {
  return appointments
    .filter(
      (appointment) => includeArchived || appointment.archived_at === null,
    )
    .map((appointment) => appointment.appointment_number);
}

describe("single-row appointment lifecycle", () => {
  it("keeps pending and confirmed reschedules on the same id and APT number", () => {
    expect(reschedule).toMatch(/status not in \('pending', 'confirmed'\)/i);
    expect(reschedule).toMatch(
      /select updated\.id, updated\.version, updated\.id,[\s\S]*updated\.appointment_number, updated\.version/i,
    );
    expect(reschedule).not.toMatch(/nextval|set_appointment_number/i);
  });

  it("updates only operational schedule fields and never inserts a replacement", () => {
    expect(reschedule).toMatch(
      /update public\.appointments as appointment[\s\S]*scheduled_date = p_scheduled_date[\s\S]*start_time = p_start_time[\s\S]*end_time = p_end_time[\s\S]*updated_by = actor_id/i,
    );
    expect(reschedule).not.toMatch(/insert into public\.appointments/i);
    expect(reschedule).not.toMatch(
      /(?:set|,)\s*(?:appointment_number|resident_id|service_type|status|request_source|requested_date|requested_start_time|requested_end_time)\s*=/i,
    );
  });

  it("preserves the assigned Nurse and rejects assignment changes", () => {
    expect(reschedule).toMatch(
      /p_assigned_staff_id is distinct from current_record\.assigned_staff_id[\s\S]*cannot change the assigned staff member/i,
    );
    expect(reschedule).toMatch(
      /appointment_validate_schedule\([\s\S]*current_record\.assigned_staff_id/i,
    );
    expect(reschedule).not.toMatch(/(?:set|,)\s*assigned_staff_id\s*=/i);
  });

  it("blocks every future insert using the retired replacement relationship", () => {
    expect(modelFix).toMatch(
      /before insert on public\.appointments[\s\S]*prevent_appointment_replacement_insert/i,
    );
    expect(modelFix).toMatch(
      /new\.rescheduled_from_id is not null[\s\S]*replacement-row appointment rescheduling is retired/i,
    );
  });

  it("archives only relationship-proven legacy superseded rows", () => {
    expect(modelFix).toMatch(
      /update public\.appointments as legacy[\s\S]*legacy\.status = 'rescheduled'[\s\S]*replacement\.rescheduled_from_id = legacy\.id/i,
    );
    expect(modelFix).not.toMatch(/delete from public\.appointments/i);
    expect(modelFix).not.toMatch(/set\s+rescheduled_from_id\s*=/i);
  });

  it("never treats a similar independent appointment as a legacy replacement", () => {
    const appointments = [
      {
        id: "legacy-source",
        appointment_number: "APT-2026-000004",
        resident_id: "resident-one",
        service_type: "Blood Pressure Monitoring",
        scheduled_date: "2026-08-15",
        assigned_staff_id: "nurse-one",
        status: "rescheduled",
        archived_at: null,
        rescheduled_from_id: null,
      },
      {
        id: "independent-request",
        appointment_number: "APT-2026-000006",
        resident_id: "resident-one",
        service_type: "Blood Pressure Monitoring",
        scheduled_date: "2026-08-15",
        assigned_staff_id: "nurse-one",
        status: "confirmed",
        archived_at: null,
        rescheduled_from_id: null,
      },
      {
        id: "legacy-replacement",
        appointment_number: "APT-2026-000007",
        resident_id: "resident-one",
        service_type: "Blood Pressure Monitoring",
        scheduled_date: "2026-08-15",
        assigned_staff_id: "nurse-one",
        status: "confirmed",
        archived_at: null,
        rescheduled_from_id: "legacy-source",
      },
    ];

    expect(findRelationshipProvenLegacySources(appointments)).toEqual([
      "APT-2026-000004",
    ]);
    expect(findRelationshipProvenLegacySources(appointments)).not.toContain(
      "APT-2026-000006",
    );
  });

  it("shows an archived legacy source only when archived rows are requested", () => {
    const appointments = [
      {
        appointment_number: "APT-2026-000004",
        archived_at: "2026-08-14T13:32:36.917790+00:00",
      },
      { appointment_number: "APT-2026-000006", archived_at: null },
      { appointment_number: "APT-2026-000007", archived_at: null },
    ];

    expect(visibleAppointmentNumbers(appointments)).toEqual([
      "APT-2026-000006",
      "APT-2026-000007",
    ]);
    expect(visibleAppointmentNumbers(appointments, true)).toEqual([
      "APT-2026-000004",
      "APT-2026-000006",
      "APT-2026-000007",
    ]);
  });

  it("keeps legacy rows out of default list, calendar, queue, dashboard, and reports", () => {
    expect(contracts).toMatch(
      /function public\.appointment_list[\s\S]*p_include_archived or a\.archived_at is null/i,
    );
    expect(contracts).toMatch(
      /function public\.appointment_calendar[\s\S]*a\.archived_at is null/i,
    );
    expect(residentRequests).toMatch(
      /function public\.appointment_daily_queue[\s\S]*a\.archived_at is null/i,
    );
    expect(workflow).toMatch(
      /function public\.appointment_dashboard_summary[\s\S]*a\.archived_at is null/i,
    );
    for (const reportFunction of [
      "report_overview_summary",
      "report_appointment_summary",
      "report_appointments_over_time",
      "report_services_distribution",
      "report_staff_workload",
    ]) {
      expect(reports).toMatch(
        new RegExp(
          `function public\\.${reportFunction}[\\s\\S]*?a\\.archived_at is null`,
          "i",
        ),
      );
    }
  });

  it("retains legacy relationship and audit/history access", () => {
    expect(modelFix).not.toMatch(/drop column[\s\S]*rescheduled_from_id/i);
    expect(workflow).toMatch(
      /function public\.appointment_resident_history[\s\S]*where a\.resident_id = p_resident_id[\s\S]*order by/i,
    );
    expect(residentRequests).toMatch(
      /appointment\.request_schedule_adjusted[\s\S]*schedule_changed/i,
    );
  });

  it("creates one trusted, safe, version-idempotent Resident notification", () => {
    expect(notification).toMatch(
      /select resident\.linked_profile_id into resident_profile[\s\S]*resident\.id = new\.resident_id/i,
    );
    expect(notification).toMatch(
      /event_type := 'appointment_rescheduled'[\s\S]*new\.scheduled_date[\s\S]*new\.start_time/i,
    );
    expect(notification).toMatch(
      /appointment:' \|\| new\.id::text \|\| ':schedule:' \|\|[\s\S]*new\.version::text/i,
    );
    expect(notification).not.toMatch(
      /reason|operational_notes|diagnosis|assessment|treatment/i,
    );
  });

  it("cancels the old reminder and schedules one replacement in Manila time", () => {
    expect(outboundTrigger).toMatch(
      /reminder_schedule_changed[\s\S]*notification_cancel_appointment_reminders\(new\.id\)/i,
    );
    expect(outboundTrigger).toMatch(
      /event_suffix := 'schedule:' \|\| new\.version::text/i,
    );
    expect(outboundTrigger).toMatch(
      /notification_schedule_appointment_reminder\(new\)/i,
    );
    expect(outboundFoundation).toMatch(/at time zone 'Asia\/Manila'/i);
  });

  it("keeps new appointment creation separate from rescheduling", () => {
    expect(workflow).toMatch(
      /function public\.appointment_create[\s\S]*insert into public\.appointments/i,
    );
    expect(duration).toMatch(
      /function public\.resident_appointment_request[\s\S]*insert into public\.appointments/i,
    );
    expect(reschedule).not.toMatch(/insert into public\.appointments/i);
  });

  it("preserves cancellation rules, RLS, and optimistic concurrency", () => {
    expect(authorizedCancellation).toMatch(
      /p_target_status = 'cancelled'[\s\S]*request_source =[\s\S]*resident[\s\S]*rejection reason is required/i,
    );
    expect(reschedule).toMatch(
      /current_record\.version <> p_expected_version[\s\S]*errcode = '40001'/i,
    );
    expect(reschedule).toMatch(
      /actor_role not in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'/i,
    );
    expect(rls).toMatch(
      /appointments_select_assigned_clinician[\s\S]*assigned_staff_id = auth\.uid\(\)/i,
    );
    expect(modelFix).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.appointments/i,
    );
  });
});
