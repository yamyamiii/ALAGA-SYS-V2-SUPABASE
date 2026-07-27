import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002700_general_assistance.sql",
  "utf8",
);

describe("general assistance database boundary", () => {
  it("uses RPC-only tables with RLS and no authenticated table writes", () => {
    for (const table of [
      "announcements",
      "assistance_notifications",
      "health_center_information",
      "faq_entries",
      "resident_inquiries",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i",
        ),
      );
    }
    expect(migration).toMatch(
      /revoke all on table public\.announcements,[\s\S]*resident_inquiries from public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*public\.(?:announcements|assistance_notifications|health_center_information|faq_entries|resident_inquiries)[^;]*authenticated/i,
    );
  });

  it("shows residents only published, unexpired announcements in pinned order", () => {
    expect(migration).toMatch(/a\.publish_at <= now\(\)/i);
    expect(migration).toMatch(
      /a\.expires_at is null or a\.expires_at > now\(\)/i,
    );
    expect(migration).toMatch(
      /order by a\.is_pinned desc,\s*a\.publish_at desc,\s*a\.id/i,
    );
    expect(migration).toMatch(
      /archived announcements require announcement management access/i,
    );
  });

  it("limits notifications and resident activity to the authenticated owner", () => {
    expect(migration).toMatch(
      /recipient_profile_id=auth\.uid\(\)[\s\S]*available_at<=now\(\)/i,
    );
    expect(migration).toMatch(
      /r\.linked_profile_id=auth\.uid\(\)[\s\S]*a\.entity_type='appointments'/i,
    );
    expect(migration).toMatch(
      /r\.linked_profile_id=auth\.uid\(\)[\s\S]*a\.entity_type='health_encounters'/i,
    );
    expect(migration).not.toMatch(
      /\b(?:chief_complaint|subjective_notes|objective_notes|assessment|diagnosis_text|treatment_notes|risk_notes|developmental_notes)\b/i,
    );
  });

  it("creates concise event notifications from trusted row relationships", () => {
    expect(migration).toMatch(
      /create trigger appointments_assistance_notifications/i,
    );
    expect(migration).toMatch(
      /select r\.linked_profile_id into resident_profile from public\.residents/i,
    );
    expect(migration).toMatch(
      /create trigger health_encounters_assistance_notifications/i,
    );
    expect(migration).toMatch(
      /maternal_pregnancies[\s\S]*child_health_visits[\s\S]*assistance_notify_maternal_child/i,
    );
    expect(migration).toMatch(/unique\(recipient_profile_id,\s*dedup_key\)/i);
  });

  it("enforces the resident inquiry ownership and staff workflow", () => {
    expect(migration).toMatch(
      /linked_profile_id=auth\.uid\(\)[\s\S]*status='active'[\s\S]*archived_at is null/i,
    );
    expect(migration).toMatch(
      /actor_role in \('admin','barangay_health_worker'\)[\s\S]*or i\.resident_profile_id=auth\.uid\(\)/i,
    );
    expect(migration).toMatch(/closed inquiry cannot be changed/i);
    expect(migration).toMatch(
      /unique index resident_inquiries_request_unique[\s\S]*resident_profile_id,\s*request_key/i,
    );
  });

  it("audits every required assistance action without payload values", () => {
    for (const action of [
      "announcement.created",
      "announcement.updated",
      "announcement.archived",
      "announcement.pinned",
      "notification.read",
      "notification.read_all",
      "inquiry.created",
      "inquiry.status_changed",
    ]) {
      expect(migration).toContain(`'${action}'`);
    }
    expect(migration).toMatch(
      /jsonb_build_object\('changed_fields',\s*p_changed_fields\)/i,
    );
  });

  it("validates bounded public-information lists at the trusted boundary", () => {
    expect(migration).toMatch(
      /cardinality\(coalesce\(p_emergency_contacts,'\{\}'\)\) > 20/i,
    );
    expect(migration).toMatch(/char_length\(btrim\(item\.value\)\) > 500/i);
    expect(migration).toMatch(
      /raise exception 'invalid health center information'/i,
    );
  });
});
