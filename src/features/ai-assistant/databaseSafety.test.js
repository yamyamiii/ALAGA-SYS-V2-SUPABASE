import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002900_ai_assistant_rate_limit.sql",
  "utf8",
);

function utcHourBoundary(value) {
  const date = new Date(value);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
    ),
  );
}

function consumeModel(state, maximum, nowValue) {
  const now = new Date(nowValue);
  const windowStartedAt = utcHourBoundary(now);
  const reset = !state || state.windowStartedAt < windowStartedAt;
  const requestCount = reset
    ? 1
    : Math.min(state.requestCount + 1, maximum + 1);
  const allowed = requestCount <= maximum;

  return {
    allowed,
    remaining: Math.max(maximum - requestCount, 0),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(
          1,
          Math.ceil(
            (windowStartedAt.getTime() + 60 * 60 * 1000 - now.getTime()) / 1000,
          ),
        ),
    requestCount,
    windowStartedAt,
  };
}

function hasBalancedParentheses(sql) {
  const syntaxOnly = sql
    .replace(/--.*$/gm, "")
    .replace(/'(?:''|[^'])*'/g, "''");
  let depth = 0;

  for (const character of syntaxOnly) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }

  return depth === 0;
}

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

  it("fails closed for malformed limits and inactive or unsupported profiles", () => {
    expect(migration).toMatch(/p_max_requests is null/i);
    expect(migration).toMatch(/p_max_requests not between 1 and 100/i);
    expect(migration).toMatch(/account_status = 'active'/i);
    expect(migration).toMatch(
      /p\.role in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'[\s\S]*'nurse'[\s\S]*'midwife'[\s\S]*'resident'/i,
    );
    expect(migration).toMatch(/active supported profile required/i);
    expect(migration).toMatch(/pg_catalog\.date_trunc\([\s\S]*'hour'/i);
    expect(migration).toMatch(/statement_timestamp\(\) at time zone 'UTC'/i);
  });

  it("returns the final inserted or updated request count atomically", () => {
    expect(migration).toMatch(
      /insert into public\.ai_request_rate_limits as rate_limit[\s\S]*on conflict \(profile_id\) do update[\s\S]*returning rate_limit\.request_count into v_request_count/i,
    );
    expect(migration).toMatch(
      /least\(rate_limit\.request_count \+ 1, p_max_requests \+ 1\)/i,
    );
  });

  it("uses valid PostgreSQL special syntax and paired parentheses", () => {
    expect(migration).toMatch(/extract\(\s*epoch from \(/i);
    expect(migration).not.toMatch(
      /pg_catalog\.(?:extract|greatest|least)\s*\(/i,
    );
    expect(migration).toMatch(/pg_catalog\.ceil\([\s\S]*\)::integer/i);
    expect(hasBalancedParentheses(migration)).toBe(true);
  });

  it("allows the first and final permitted requests", () => {
    const first = consumeModel(null, 20, "2026-08-02T03:15:00.000Z");
    const final = consumeModel(
      {
        requestCount: 19,
        windowStartedAt: utcHourBoundary("2026-08-02T03:15:00.000Z"),
      },
      20,
      "2026-08-02T03:30:00.000Z",
    );

    expect(first).toMatchObject({
      allowed: true,
      remaining: 19,
      requestCount: 1,
      retryAfterSeconds: 0,
    });
    expect(final).toMatchObject({
      allowed: true,
      remaining: 0,
      requestCount: 20,
      retryAfterSeconds: 0,
    });
  });

  it("denies the first over-limit request with a bounded retry time", () => {
    const denied = consumeModel(
      {
        requestCount: 20,
        windowStartedAt: utcHourBoundary("2026-08-02T03:15:00.000Z"),
      },
      20,
      "2026-08-02T03:59:59.250Z",
    );
    const repeatedlyDenied = consumeModel(
      denied,
      20,
      "2026-08-02T03:59:59.900Z",
    );

    expect(denied.allowed).toBe(false);
    expect(denied.requestCount).toBe(21);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(3600);
    expect(repeatedlyDenied.requestCount).toBe(21);
    expect(repeatedlyDenied.remaining).toBe(0);
  });

  it("resets atomically at the next UTC-hour boundary", () => {
    const reset = consumeModel(
      {
        requestCount: 21,
        windowStartedAt: utcHourBoundary("2026-08-02T03:59:59.999Z"),
      },
      20,
      "2026-08-02T04:00:00.000Z",
    );

    expect(reset.windowStartedAt.toISOString()).toBe(
      "2026-08-02T04:00:00.000Z",
    );
    expect(reset).toMatchObject({
      allowed: true,
      remaining: 19,
      requestCount: 1,
      retryAfterSeconds: 0,
    });
  });
});
