import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720010200_realtime_state_consistency.sql",
  "utf8",
);

describe("realtime state consistency database boundary", () => {
  it("publishes only a minimized event table with RLS", () => {
    expect(migration).toMatch(/create table public\.realtime_sync_events/i);
    expect(migration).toMatch(
      /alter table public\.realtime_sync_events enable row level security/i,
    );
    expect(migration).toMatch(
      /audience_profile_id = auth\.uid\(\)[\s\S]*audience_role = public\.current_profile_role\(\)/i,
    );
    expect(migration).toMatch(
      /alter publication supabase_realtime add table public\.realtime_sync_events/i,
    );
    expect(migration).not.toMatch(
      /alter publication supabase_realtime add table public\.(?:profiles|residents|appointments|announcements|assistance_notifications|health_encounters)/i,
    );
  });

  it("does not grant browser writes or direct sensitive-table access", () => {
    expect(migration).toMatch(
      /revoke all on table public\.realtime_sync_events[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.realtime_sync_events to authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant (?:insert|update|delete)[^;]*realtime_sync_events to authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant select[^;]*public\.(?:announcements|assistance_notifications|health_encounters)[^;]*authenticated/i,
    );
  });

  it("targets account, registration, registry, and appointment audiences", () => {
    expect(migration).toMatch(
      /profiles_realtime_sync[\s\S]*account_status[\s\S]*retired_at/i,
    );
    expect(migration).toMatch(/resident_registration_requests_realtime_sync/i);
    expect(migration).toMatch(/residents_realtime_sync/i);
    expect(migration).toMatch(
      /'registry', row_id, null, 'nurse'[^;]*;[\s\S]*'registry', row_id, null, 'midwife'/i,
    );
    expect(migration).toMatch(
      /emit_appointment_realtime_sync[\s\S]*resident\.linked_profile_id[\s\S]*new\.assigned_staff_id/i,
    );
  });

  it("keeps notifications private and announcement timing authoritative", () => {
    expect(migration).toMatch(
      /'notification', row_id, recipient_id, null, event_available_at/i,
    );
    expect(migration).toMatch(
      /publication_at[\s\S]*new\.publish_at[\s\S]*expiration_at[\s\S]*new\.expires_at/i,
    );
    expect(migration).not.toMatch(
      /diagnosis|assessment|treatment_plan|clinical_notes|reason|phone_number|address_line/i,
    );
    expect(migration).toMatch(
      /create index realtime_sync_events_available_idx[\s\S]*available_at, id/i,
    );
  });

  it("keeps trigger failures non-blocking and helper execution private", () => {
    expect(migration).toMatch(
      /when others then[\s\S]*raise warning 'realtime sync event emission failed/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.emit_realtime_sync_event[\s\S]*from public, anon, authenticated/i,
    );
  });
});
