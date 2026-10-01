import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720010300_automated_resident_appointments.sql",
  "utf8",
);
const realtimeMigration = fs.readFileSync(
  "supabase/migrations/20260720010200_realtime_state_consistency.sql",
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

function dateAllowed({ isoWeekday, occurrence }, isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  const weekOfMonth = Math.floor((date.getUTCDate() - 1) / 7) + 1;
  return (
    (isoWeekday == null || weekday === isoWeekday) &&
    (occurrence == null || weekOfMonth === occurrence)
  );
}

describe("automated Resident appointment database safety", () => {
  const availability = functionBlock(
    "appointment_resident_available_slots",
    "appointment_validate_schedule",
  );
  const staffSearch = functionBlock(
    "appointment_search_staff",
    "resident_appointment_request",
  );
  const booking = functionBlock(
    "resident_appointment_request",
    "notify_automated_resident_appointment",
  );
  const notifications = functionBlock(
    "notify_automated_resident_appointment",
    "audit_appointment_change",
  );
  const audit = functionBlock("audit_appointment_change");

  it("defines the six authoritative services and separates coordination", () => {
    expect(migration).toMatch(
      /\('General Consultation', 'AUTO_SLOT', null, null, 30, 30, '08:00', '16:00', 1\)/i,
    );
    expect(migration).toMatch(
      /\('Buntis \/ Prenatal Care', 'AUTO_SLOT', 2, null, 30, 30, '08:00', '16:00', 2\)/i,
    );
    expect(migration).toMatch(
      /\('Maternal Care', 'AUTO_SLOT', 2, 1, 30, 30, '08:00', '16:00', 3\)/i,
    );
    expect(migration).toMatch(
      /\('Immunization', 'AUTO_SLOT', 3, 1, 30, 30, '08:00', '16:00', 4\)/i,
    );
    expect(migration).toMatch(
      /\('Family Planning', 'AUTO_SLOT', 4, null, 30, 30, '08:00', '16:00', 5\)/i,
    );
    expect(migration).toMatch(
      /\('Postpartum Home Visit', 'COORDINATION_REQUIRED', null, null, null, null, null, null, 6\)/i,
    );
  });

  it("models weekday and first-occurrence rules across multiple months", () => {
    const daily = { isoWeekday: null, occurrence: null };
    const tuesday = { isoWeekday: 2, occurrence: null };
    const thursday = { isoWeekday: 4, occurrence: null };
    const firstTuesday = { isoWeekday: 2, occurrence: 1 };
    const firstWednesday = { isoWeekday: 3, occurrence: 1 };

    expect(dateAllowed(daily, "2026-10-31")).toBe(true);
    expect(dateAllowed(daily, "2026-11-01")).toBe(true);
    expect(dateAllowed(tuesday, "2026-10-06")).toBe(true);
    expect(dateAllowed(tuesday, "2026-11-03")).toBe(true);
    expect(dateAllowed(tuesday, "2026-10-07")).toBe(false);
    expect(dateAllowed(thursday, "2026-10-01")).toBe(true);
    expect(dateAllowed(thursday, "2026-11-05")).toBe(true);
    expect(dateAllowed(firstTuesday, "2026-10-06")).toBe(true);
    expect(dateAllowed(firstTuesday, "2026-10-13")).toBe(false);
    expect(dateAllowed(firstTuesday, "2026-11-03")).toBe(true);
    expect(dateAllowed(firstWednesday, "2026-10-07")).toBe(true);
    expect(dateAllowed(firstWednesday, "2026-10-14")).toBe(false);
    expect(dateAllowed(firstWednesday, "2026-11-04")).toBe(true);
  });

  it("returns only safe server-derived availability for the linked Resident", () => {
    expect(availability).toMatch(
      /returns table \(\s*scheduled_date date,\s*start_time time,\s*end_time time\s*\)/i,
    );
    expect(availability).toMatch(/linked_profile_id = actor_id/i);
    expect(availability).toMatch(/resident\.status = 'active'/i);
    expect(availability).toMatch(/resident\.archived_at is null/i);
    expect(availability).toMatch(/generate_series/i);
    expect(availability).toMatch(/appointment_service_date_allowed/i);
    expect(availability).toMatch(/appointment_staff_role_eligible/i);
    expect(availability).toMatch(/staff\.account_status = 'active'/i);
    expect(availability).toMatch(/staff\.retired_at is null/i);
    expect(availability).not.toMatch(
      /resident_number|first_name|last_name|contact_number|assigned_staff_id\s+(?:uuid|text)/i,
    );
  });

  it("accepts no browser-selected Resident, staff, status, duration, or end time", () => {
    const signature = booking.slice(0, booking.indexOf("returns table"));
    expect(signature).toMatch(
      /resident_appointment_request\(\s*p_service_type text,\s*p_scheduled_date date,\s*p_start_time time,\s*p_reason text,\s*p_request_key uuid\s*\)/i,
    );
    expect(signature).not.toMatch(
      /p_resident_id|p_assigned_staff_id|p_status|p_end_time|p_duration/i,
    );
    expect(booking).toMatch(/linked_profile_id = actor_id/i);
    expect(booking).toMatch(/schedule\.slot_duration_minutes/i);
    expect(booking).toMatch(/selected_staff_id/i);
    expect(booking).toMatch(/'confirmed'::public\.appointment_status/i);
  });

  it("revalidates service, date, time, capacity, and Resident overlap atomically", () => {
    expect(booking).toMatch(/schedule\.booking_mode <> 'AUTO_SLOT'/i);
    expect(booking).toMatch(/appointment_service_date_allowed/i);
    expect(booking).toMatch(/appointment_start_time_valid/i);
    expect(booking).toMatch(/selected time is not a valid appointment slot/i);
    expect(booking).toMatch(/alaga:resident-appointment-date:/i);
    expect(booking).toMatch(
      /own_appointment\.start_time < appointment_end_time/i,
    );
    expect(booking).toMatch(
      /assigned_appointment\.start_time < appointment_end_time/i,
    );
    expect(booking).toMatch(/That appointment slot is no longer available/i);
  });

  it("assigns active eligible staff fairly with deterministic tie-breaking", () => {
    expect(booking).toMatch(/staff\.account_status = 'active'/i);
    expect(booking).toMatch(/staff\.retired_at is null/i);
    expect(booking).toMatch(/appointment_staff_role_eligible/i);
    expect(booking).toMatch(
      /order by \(\s*select count\(\*\)[\s\S]*workload\.scheduled_date = p_scheduled_date[\s\S]*\), staff\.id/i,
    );
    expect(booking).toMatch(/alaga:appointment-slot:/i);
    expect(staffSearch).toMatch(/appointment_staff_role_eligible/i);
  });

  it("is idempotent without leaking another profile's request key", () => {
    expect(booking).toMatch(/alaga:resident-request-key:/i);
    expect(booking).toMatch(
      /appointment\.created_by = actor_id\s+and appointment\.request_key = p_request_key/i,
    );
    expect(booking).toMatch(/request key was reused with different data/i);
    expect(booking).toMatch(
      /return query\s+select existing_record\.id,[\s\S]*existing_record\.version/i,
    );
  });

  it("creates safe idempotent notifications for confirmed automatic bookings", () => {
    expect(notifications).toMatch(
      /new\.request_source is distinct from[\s\S]*'resident'/i,
    );
    expect(notifications).toMatch(
      /new\.status is distinct from[\s\S]*'confirmed'/i,
    );
    expect(notifications).toMatch(/appointment_approved/i);
    expect(notifications).toMatch(/appointment_confirmed/i);
    expect(notifications).toMatch(
      /notification_schedule_appointment_reminder/i,
    );
    expect(notifications).toMatch(
      /appointment:' \|\| new\.id::text \|\| ':confirmed'/i,
    );
    expect(notifications).not.toMatch(
      /new\.reason|operational_notes|diagnosis/i,
    );
    expect(realtimeMigration).toMatch(
      /create trigger appointments_realtime_sync/i,
    );
    expect(realtimeMigration).toMatch(
      /create trigger assistance_notifications_realtime_sync/i,
    );
  });

  it("records minimized automatic scheduling audit and history metadata", () => {
    expect(audit).toMatch(/appointment\.auto_scheduled/i);
    expect(audit).toMatch(/request_event := 'request_confirmed'/i);
    expect(audit).toMatch(/'staff_assignment', 'automatic'/i);
    expect(audit).toMatch(/'confirmation', 'automatic'/i);
    expect(audit).not.toMatch(/'reason', new\.reason/i);
  });

  it("keeps schedule data and helpers private while exposing only trusted RPCs", () => {
    expect(migration).toMatch(
      /alter table public\.appointment_service_schedules enable row level security/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.appointment_service_schedules\s+from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.appointment_staff_role_eligible[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.appointment_resident_available_slots[\s\S]*to authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resident_appointment_request[\s\S]*to authenticated, service_role/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*appointment_service_schedules[^;]*authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*appointments[^;]*authenticated/i,
    );
  });

  it("preserves legacy pending and staff-assisted appointment infrastructure", () => {
    expect(migration).toMatch(
      /p_exclude_id is not null[\s\S]*appointment\.request_source =[\s\S]*'resident'::public\.appointment_request_source[\s\S]*into resident_reason_optional/i,
    );
    expect(migration).not.toMatch(/alter type public\.appointment_status/i);
    expect(migration).not.toMatch(/delete from public\.appointments/i);
    expect(migration).not.toMatch(/drop function public\.appointment_/i);
    expect(migration).not.toMatch(
      /create or replace function public\.appointment_list/i,
    );
    expect(migration).not.toMatch(
      /create or replace function public\.appointment_dashboard_summary/i,
    );
  });
});
