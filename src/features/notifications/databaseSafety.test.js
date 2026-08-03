import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720003200_outbound_notification_foundation.sql",
  "utf8",
);

describe("outbound notification database boundary", () => {
  it("keeps operational tables RLS-protected and inaccessible to browsers", () => {
    for (const table of [
      "notification_preferences",
      "outbound_notification_channel_status",
      "outbound_notification_jobs",
      "notification_delivery_attempts",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i",
        ),
      );
    }
    expect(migration).toMatch(
      /revoke all on table public\.notification_preferences,[\s\S]*notification_delivery_attempts from public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*outbound_notification_jobs[^;]*authenticated/i,
    );
  });

  it("derives the current user and verified contacts at the trusted boundary", () => {
    expect(migration).toMatch(/actor_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(
      /select u\.email, u\.email_confirmed_at, u\.phone, u\.phone_confirmed_at/i,
    );
    expect(migration).not.toMatch(
      /p_(?:recipient|profile|email|phone)\b[\s\S]*notification_preferences_update/i,
    );
    expect(migration).toMatch(/resident_status[\s\S]*archived_at is null/i);
  });

  it("allows only strict minimized template variables", () => {
    expect(migration).toMatch(/jsonb_object_keys\(p_variables\)/i);
    expect(migration).toMatch(/actual_keys is distinct from expected_keys/i);
    expect(migration).toMatch(/variable_value ~ '\[\\r\\n\]'/i);
    expect(migration).not.toMatch(
      /'chief_complaint'|'diagnosis'|'treatment_plan'|'vital_signs'|'appointment_reason'|'address'/i,
    );
  });

  it("uses idempotent enqueue and bounded concurrent processing", () => {
    expect(migration).toMatch(
      /unique\(recipient_profile_id, channel, event_key\)/i,
    );
    expect(migration).toMatch(
      /on conflict\(recipient_profile_id, channel, event_key\) do nothing/i,
    );
    expect(migration).toMatch(/for update of job skip locked/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/manual_retry_count >= 2/i);
    expect(migration).toMatch(/stale_lock_recovered/i);
  });

  it("replaces appointment reminders and stores Manila-derived instants", () => {
    expect(migration).toMatch(/notification_cancel_appointment_reminders/i);
    expect(migration).toMatch(/appointment_at - interval '24 hours'/i);
    expect(migration).toMatch(/at time zone 'Asia\/Manila'/i);
    expect(migration).toMatch(/source_changed/i);
    expect(migration).toMatch(/appointment:.*:reminder:/i);
  });

  it("keeps source workflows independent from external delivery", () => {
    expect(migration).toMatch(/exception when others then\s+return new/i);
    expect(migration).toMatch(
      /provider_configured boolean not null default false/i,
    );
    expect(migration).toMatch(
      /auth\.role\(\) is distinct from 'service_role'/i,
    );
  });
});
