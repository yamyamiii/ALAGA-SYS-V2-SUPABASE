import fs from "node:fs";

import { describe, expect, it } from "vitest";

const foundation = fs.readFileSync(
  "supabase/migrations/20260720002000_health_records_foundation.sql",
  "utf8",
);
const correction = fs.readFileSync(
  "supabase/migrations/20260720002100_fix_clinical_manila_dates.sql",
  "utf8",
);

function businessDateAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(instant)
    .reduce((values, part) => {
      if (part.type !== "literal") values[part.type] = part.value;
      return values;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isAllowedOn(candidateDate, instant) {
  return candidateDate <= businessDateAt(instant, "Asia/Manila");
}

describe("clinical Manila business dates", () => {
  const boundaryInstant = new Date("2026-07-26T22:21:00.000Z");

  it("distinguishes the UTC date from the Manila business date", () => {
    expect(businessDateAt(boundaryInstant, "UTC")).toBe("2026-07-26");
    expect(businessDateAt(boundaryInstant, "Asia/Manila")).toBe("2026-07-27");
  });

  it("accepts July 27 while it is already July 27 in Manila", () => {
    expect(isAllowedOn("2026-07-27", boundaryInstant)).toBe(true);
  });

  it("rejects July 28 as genuinely future in Manila", () => {
    expect(isAllowedOn("2026-07-28", boundaryInstant)).toBe(false);
  });

  it("uses explicit deterministic SQL instead of the database session timezone", () => {
    expect(foundation).toMatch(
      /health_encounters_date_valid check \(\s*encounter_date <= current_date/i,
    );
    expect(correction).toMatch(
      /encounter_date\s*<=\s*\(pg_catalog\.now\(\)\s+at time zone 'Asia\/Manila'\)::date/i,
    );
    expect(correction).not.toMatch(/\bcurrent_date\b/i);
    expect(correction).not.toMatch(
      /current_setting\s*\(\s*'TimeZone'|set\s+(?:local\s+)?time\s+zone/i,
    );
  });

  it("corrects every date-only clinical rule without changing UTC timestamps", () => {
    expect(
      correction.match(
        /manila_today date\s*:=\s*\(pg_catalog\.now\(\)\s+at time zone 'Asia\/Manila'\)::date/gi,
      ),
    ).toHaveLength(3);
    expect(correction).toMatch(
      /onset_date\s+is null[\s\S]*onset_date\s*<=\s*\(pg_catalog\.now\(\)\s+at time zone 'Asia\/Manila'\)::date/i,
    );
    expect(correction).toMatch(/p_onset_date > manila_today/i);
    expect(correction).toMatch(/coalesce\(p_encounter_date, manila_today\)/i);
    expect(foundation).toMatch(
      /health_encounters_follow_up_valid check \([\s\S]*follow_up_date >= encounter_date/i,
    );
    expect(foundation).toMatch(
      /recorded_at timestamptz not null default now\(\)/i,
    );
    expect(foundation).toMatch(
      /noted_at timestamptz not null default now\(\)/i,
    );
    expect(correction).not.toMatch(
      /alter\s+(?:table|column)[\s\S]*\btimestamptz\b/i,
    );
  });
});
