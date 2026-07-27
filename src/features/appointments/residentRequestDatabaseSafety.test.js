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
  const cancel = functionBlock(
    "resident_appointment_cancel",
    "resident_appointment_detail",
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
    expect(cancel).toMatch(/cancellation reason is required/i);
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
