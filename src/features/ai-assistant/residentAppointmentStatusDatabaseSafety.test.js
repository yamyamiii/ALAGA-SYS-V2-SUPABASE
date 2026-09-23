import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720005800_ai_defense_readiness.sql",
  "utf8",
);
const functionStart = migration.indexOf(
  "create or replace function public.ai_resident_appointment_status",
);
const functionBody = migration.slice(
  functionStart,
  migration.indexOf(
    "revoke all on function public.ai_resident_appointment_status",
    functionStart,
  ),
);
const returnShape = functionBody.slice(
  functionBody.indexOf("returns table"),
  functionBody.indexOf("language plpgsql"),
);

describe("ALAGA AI Resident own-appointment database boundary", () => {
  it("returns only the approved minimal status summary", () => {
    expect(returnShape).toMatch(
      /status text[\s\S]*service_type text[\s\S]*scheduled_date date[\s\S]*start_time time[\s\S]*schedule_changed boolean/i,
    );
    expect(returnShape).not.toMatch(
      /resident_id|resident_number|appointment_number|reason|cancellation|operational|assigned_staff|diagnosis|encounter|vital/i,
    );
  });

  it("independently requires one active Resident profile link", () => {
    expect(functionBody).toMatch(/profile\.id = p_profile_id/i);
    expect(functionBody).toMatch(/profile\.account_status = 'active'/i);
    expect(functionBody).toMatch(/profile\.role = 'resident'/i);
    expect(functionBody).toMatch(/resident\.linked_profile_id = profile\.id/i);
    expect(functionBody).toMatch(/resident\.status = 'active'/i);
    expect(functionBody).toMatch(/resident\.archived_at is null/i);
    expect(functionBody).toMatch(
      /cardinality\(coalesce\(linked_resident_ids, '\{\}'::uuid\[\]\)\) <> 1/i,
    );
  });

  it("scopes appointments to that linked Resident and excludes archives", () => {
    expect(functionBody).toMatch(
      /appointment\.resident_id = linked_resident_id/i,
    );
    expect(functionBody).toMatch(/appointment\.archived_at is null/i);
    expect(functionBody).toMatch(/limit 5/i);
    expect(functionBody).not.toMatch(
      /p_resident_id|p_limit|p_offset|p_search/i,
    );
    expect(functionBody).not.toMatch(
      /assistance_notifications|outbound_notification_jobs|notification_delivery_attempts/i,
    );
  });

  it("uses current single-row schedule data and only a boolean change signal", () => {
    expect(functionBody).toMatch(
      /appointment\.requested_date is distinct from appointment\.scheduled_date/i,
    );
    expect(functionBody).toMatch(
      /appointment\.requested_start_time is distinct from appointment\.start_time/i,
    );
    expect(returnShape).not.toMatch(/requested_date|requested_start_time/i);
    expect(functionBody).not.toMatch(/rescheduled_from_id/i);
  });

  it("is read-only and executable only by service_role", () => {
    expect(functionBody).toMatch(
      /language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/i,
    );
    expect(functionBody).not.toMatch(
      /\b(?:insert\s+into|update\s+public|delete\s+from|nextval|execute\s+format)\b/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.ai_resident_appointment_status\(uuid\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.ai_resident_appointment_status\(uuid\)[\s\S]*to service_role/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.ai_resident_appointment_status\(uuid\)\s+to (?:public|anon|authenticated)/i,
    );
  });
});
