import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720004200_simplify_appointment_completion.sql",
  "utf8",
);
const queueMigration = fs.readFileSync(
  "supabase/migrations/20260720002200_resident_appointment_requests.sql",
  "utf8",
);
const reportMigration = fs.readFileSync(
  "supabase/migrations/20260720002600_reports_analytics.sql",
  "utf8",
);
const notificationMigration = fs.readFileSync(
  "supabase/migrations/20260720004000_enforce_single_row_appointment_lifecycle.sql",
  "utf8",
);

describe("simplified appointment lifecycle database safety", () => {
  it("allows direct checked-in completion while preserving the internal clinical path", () => {
    expect(migration).toMatch(
      /\('checked_in'::public\.appointment_status, 'completed'::public\.appointment_status\)/i,
    );
    expect(migration).toMatch(
      /\('checked_in'::public\.appointment_status, 'in_progress'::public\.appointment_status\)/i,
    );
    expect(migration).toMatch(
      /\('in_progress'::public\.appointment_status, 'completed'::public\.appointment_status\)/i,
    );
    expect(migration).not.toMatch(/health_encounters|health_record/i);
  });

  it("updates the same appointment identity with optimistic concurrency", () => {
    expect(migration).toMatch(
      /select \* into current_record[\s\S]*for update/i,
    );
    expect(migration).toMatch(
      /current_record\.version <> p_expected_version[\s\S]*errcode = '40001'/i,
    );
    expect(migration).toMatch(
      /update public\.appointments as appointment[\s\S]*where appointment\.id = current_record\.id[\s\S]*returning appointment\.id, appointment\.appointment_number/i,
    );
    expect(migration).not.toMatch(
      /insert into public\.appointments|delete from public\.appointments/i,
    );
  });

  it("satisfies completed timestamp integrity with one trusted server instant", () => {
    expect(migration).toMatch(
      /transitioned_at timestamptz := pg_catalog\.now\(\)/i,
    );
    expect(migration).toMatch(
      /started_at = case[\s\S]*p_target_status in \([\s\S]*'in_progress'[\s\S]*'completed'[\s\S]*coalesce\(appointment\.started_at, transitioned_at\)/i,
    );
    expect(migration).toMatch(
      /completed_at = case[\s\S]*p_target_status = 'completed'[\s\S]*coalesce\(appointment\.completed_at, transitioned_at\)/i,
    );
  });

  it("keeps existing role and assignment restrictions", () => {
    const bhwBlock = migration.slice(
      migration.indexOf("elsif actor_role = 'barangay_health_worker'"),
      migration.indexOf("elsif actor_role in ("),
    );
    const clinicianBlock = migration.slice(
      migration.indexOf("elsif actor_role in ("),
      migration.indexOf("if not actor_allowed"),
    );

    expect(bhwBlock).not.toMatch(/'completed'/i);
    expect(clinicianBlock).toMatch(
      /current_record\.assigned_staff_id = actor_id/i,
    );
    expect(clinicianBlock).toMatch(/'completed'/i);
    expect(clinicianBlock).toMatch(
      /actor_role <> 'midwife'[\s\S]*service_type in \('Maternal Care', 'Child Health'\)/i,
    );
    expect(migration).toMatch(
      /actor_role is null or actor_role = 'resident'[\s\S]*errcode = '42501'/i,
    );
  });

  it("does not change RLS, direct writes, or trusted RPC grants", () => {
    expect(migration).not.toMatch(
      /create\s+policy|enable\s+row\s+level\s+security/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.appointments/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.appointment_transition\([\s\S]*from public, anon/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.appointment_transition\([\s\S]*to authenticated, service_role/i,
    );
  });

  it("keeps queue, reports, and completion notifications status-driven", () => {
    expect(queueMigration).toMatch(
      /appointment_daily_queue[\s\S]*a\.status <> 'rescheduled'/i,
    );
    expect(reportMigration).toMatch(
      /completed_today[\s\S]*a\.status = 'completed'/i,
    );
    expect(queueMigration).toMatch(/appointment\.completed/i);
    expect(notificationMigration).toMatch(
      /appointments_assistance_notifications[\s\S]*after update of status, scheduled_date, start_time, end_time/i,
    );
  });
});
