import fs from "node:fs";

import { describe, expect, it } from "vitest";

const correction = fs.readFileSync(
  "supabase/migrations/20260720003900_fix_reschedule_propagation_notifications.sql",
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
const outboundFoundation = fs.readFileSync(
  "supabase/migrations/20260720003200_outbound_notification_foundation.sql",
  "utf8",
);
const authorizedCancellation = fs.readFileSync(
  "supabase/migrations/20260720004100_optional_authorized_cancellation_reason.sql",
  "utf8",
);
const rls = fs.readFileSync(
  "supabase/migrations/20260720001000_rls_policies.sql",
  "utf8",
);
const service = fs.readFileSync("src/services/appointmentService.js", "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? source.length : to);
}

const reschedule = between(
  correction,
  "create or replace function public.appointment_reschedule(",
  "create or replace function public.assistance_notify_appointment()",
);
const inApp = between(
  correction,
  "create or replace function public.assistance_notify_appointment()",
  "create or replace function public.notification_notify_appointment_outbound()",
);
const outbound = between(
  correction,
  "create or replace function public.notification_notify_appointment_outbound()",
  "commit;",
);

describe("authoritative appointment reschedule propagation", () => {
  it("updates one locked appointment row and returns its unchanged identity", () => {
    expect(reschedule).toMatch(
      /select \* into current_record[\s\S]*for update/i,
    );
    expect(reschedule).toMatch(
      /update public\.appointments as a[\s\S]*scheduled_date = p_scheduled_date[\s\S]*start_time = p_start_time[\s\S]*end_time = p_end_time/i,
    );
    expect(reschedule).not.toMatch(/insert into public\.appointments/i);
    expect(reschedule).not.toMatch(/set status = 'rescheduled'/i);
    expect(reschedule).toMatch(
      /select u\.id, u\.version, u\.id, u\.appointment_number, u\.version/i,
    );
  });

  it("preserves assignment by default and changes it only through the trusted parameter", () => {
    expect(reschedule).toMatch(/assigned_staff_id = p_assigned_staff_id/i);
    expect(reschedule).toMatch(
      /appointment_validate_schedule\([\s\S]*p_assigned_staff_id[\s\S]*current_record\.id/i,
    );
    expect(reschedule).not.toMatch(
      /requested_date\s*=|requested_start_time\s*=|requested_end_time\s*=|resident_requested_at\s*=/i,
    );
    expect(reschedule).not.toMatch(
      /appointment_number\s*=|resident_id\s*=|request_source\s*=/i,
    );
  });

  it("retains authorization, row locking, and optimistic concurrency", () => {
    expect(reschedule).toMatch(
      /actor_role not in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'/i,
    );
    expect(reschedule).toMatch(/pg_advisory_xact_lock/i);
    expect(reschedule).toMatch(
      /current_record\.version <> p_expected_version/i,
    );
    expect(reschedule).toMatch(/status not in \('pending', 'confirmed'\)/i);
    expect(correction).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.appointments/i,
    );
  });

  it("serves the updated row to list, detail, calendar, queue, and assigned Nurse reads", () => {
    expect(contracts).toMatch(
      /function public\.appointment_list[\s\S]*from public\.appointments as a/i,
    );
    expect(contracts).toMatch(
      /function public\.appointment_calendar[\s\S]*from public\.appointments as a/i,
    );
    expect(residentRequests).toMatch(
      /function public\.appointment_daily_queue[\s\S]*from public\.appointments as a/i,
    );
    expect(service).toMatch(
      /\.from\("appointments"\)[\s\S]*\.eq\("id", id\)[\s\S]*\.maybeSingle\(\)/i,
    );
    expect(rls).toMatch(
      /appointments_select_assigned_clinician[\s\S]*assigned_staff_id = auth\.uid\(\)/i,
    );
    expect(workflow).toMatch(
      /function public\.appointment_dashboard_summary[\s\S]*security invoker[\s\S]*from public\.appointments as a/i,
    );
  });

  it("creates one safe in-app notification for the trusted Resident recipient", () => {
    expect(inApp).toMatch(
      /select r\.linked_profile_id into resident_profile[\s\S]*r\.id = new\.resident_id/i,
    );
    expect(inApp).toMatch(
      /schedule_changed[\s\S]*event_type := 'appointment_rescheduled'[\s\S]*schedule was updated/i,
    );
    expect(inApp).toMatch(
      /appointment:' \|\| new\.id::text \|\| ':schedule:' \|\|[\s\S]*new\.version::text/i,
    );
    expect(inApp).not.toMatch(
      /reason|operational_notes|diagnosis|assessment|treatment/i,
    );
    expect(reschedule + inApp + outbound).not.toMatch(/p_recipient/i);
    expect(outbound).not.toMatch(
      /reason|operational_notes|diagnosis|assessment|treatment/i,
    );
    expect(inApp).toMatch(
      /after update of status, scheduled_date, start_time, end_time/i,
    );
  });

  it("cancels the old reminder and schedules the new Manila-time reminder", () => {
    expect(outbound).toMatch(
      /reminder_schedule_changed[\s\S]*notification_cancel_appointment_reminders\(new\.id\)/i,
    );
    expect(outbound).toMatch(
      /event_suffix := 'schedule:' \|\| new\.version::text/i,
    );
    expect(outbound).toMatch(
      /new\.status = 'confirmed'[\s\S]*reminder_schedule_changed[\s\S]*notification_schedule_appointment_reminder\(new\)/i,
    );
    expect(outboundFoundation).toMatch(
      /appointment_at :=[\s\S]*at time zone 'Asia\/Manila'/i,
    );
    expect(outboundFoundation).toMatch(
      /notification_cancel_appointment_reminders[\s\S]*job\.status in \('pending', 'processing'\)/i,
    );
  });

  it("prevents duplicate updates, notifications, and reminders on retries", () => {
    expect(reschedule).toMatch(
      /current_record\.version <> p_expected_version[\s\S]*errcode = '40001'/i,
    );
    expect(reschedule).toMatch(
      /current_record\.scheduled_date = p_scheduled_date[\s\S]*current_record\.assigned_staff_id is not distinct from p_assigned_staff_id[\s\S]*return query/i,
    );
    expect(outboundFoundation).toMatch(
      /unique\(recipient_profile_id, channel, event_key\)/i,
    );
    expect(outboundFoundation).toMatch(
      /on conflict\(recipient_profile_id, channel, event_key\) do nothing/i,
    );
  });

  it("keeps preferred schedule, audit events, and existing lifecycle protections", () => {
    expect(reschedule).not.toMatch(
      /requested_(?:date|start_time|end_time)\s*=/i,
    );
    expect(residentRequests).toMatch(
      /appointment\.request_schedule_adjusted[\s\S]*schedule_changed/i,
    );
    expect(residentRequests).toMatch(
      /new\.status = 'confirmed'[\s\S]*new\.assigned_staff_id is null[\s\S]*resident requests require assigned staff/i,
    );
    expect(authorizedCancellation).toMatch(
      /p_target_status = 'cancelled'[\s\S]*request_source =[\s\S]*resident[\s\S]*rejection reason is required/i,
    );
  });
});
