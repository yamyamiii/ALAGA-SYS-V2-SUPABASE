import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002900_ai_assistant_rate_limit.sql",
  "utf8",
);

describe("ALAGA AI database rate-limit boundary", () => {
  it("stores only profile, window, and counter metadata", () => {
    const table = migration.slice(
      migration.indexOf("create table public.ai_request_rate_limits"),
      migration.indexOf("alter table public.ai_request_rate_limits"),
    );
    expect(table).toMatch(/profile_id uuid primary key/);
    expect(table).toMatch(/window_started_at timestamptz/);
    expect(table).toMatch(/request_count integer/);
    expect(table).not.toMatch(
      /message|prompt|response|content|diagnos|appointment_reason|clinical/i,
    );
  });

  it("uses RLS and denies direct browser access", () => {
    expect(migration).toMatch(
      /alter table public\.ai_request_rate_limits enable row level security/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.ai_request_rate_limits[\s\S]*public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(/create policy/i);
  });

  it("keeps the atomic consumer service-role-only", () => {
    expect(migration).toMatch(
      /function public\.consume_ai_request_rate_limit\([\s\S]*security definer[\s\S]*set search_path = ''/i,
    );
    expect(migration).toMatch(/on conflict \(profile_id\) do update/i);
    expect(migration).toMatch(
      /revoke all on function public\.consume_ai_request_rate_limit\(uuid, integer\)[\s\S]*public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.consume_ai_request_rate_limit\(uuid, integer\)[\s\S]*to service_role/i,
    );
    expect(migration).not.toMatch(/to authenticated/i);
  });

  it("fails closed for malformed limits and inactive profiles", () => {
    expect(migration).toMatch(/p_max_requests not between 1 and 100/i);
    expect(migration).toMatch(/account_status = 'active'/i);
    expect(migration).toMatch(/active supported profile required/i);
    expect(migration).toMatch(/pg_catalog\.date_trunc\([\s\S]*'hour'/i);
    expect(migration).toMatch(/statement_timestamp\(\) at time zone 'UTC'/i);
  });
});
