import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002400_maternal_child_care.sql",
  "utf8",
);

describe("maternal-child database safety", () => {
  it("creates normalized longitudinal tables without stored age or BMI", () => {
    for (const table of [
      "maternal_pregnancies",
      "maternal_prenatal_visits",
      "maternal_delivery_outcomes",
      "maternal_postnatal_visits",
      "child_health_profiles",
      "child_growth_measurements",
      "child_immunizations",
      "child_health_visits",
    ]) {
      expect(migration).toMatch(new RegExp(`create table public\\.${table}`));
    }
    expect(migration).not.toMatch(/\bage_years\s+(?:integer|smallint)/i);
    expect(migration).not.toMatch(/\bbmi\s+(?:numeric|decimal|real|double)/i);
  });

  it("uses atomic immutable identifiers and duplicate guards", () => {
    expect(migration).toMatch(
      /nextval\('public\.maternal_pregnancy_number_seq'\)/i,
    );
    expect(migration).toMatch(
      /nextval\('public\.child_health_profile_number_seq'\)/i,
    );
    expect(migration).toMatch(/database-generated and immutable/i);
    expect(migration).toMatch(/maternal_one_active_pregnancy/i);
    expect(migration).toMatch(/child_one_active_profile/i);
    expect(migration).toMatch(/maternal_delivery_request_unique/i);
    expect(migration).toMatch(
      /where d\.recorded_by=auth\.uid\(\) and d\.request_key=p_request_key/i,
    );
    expect(migration).not.toMatch(/select\s+max\s*\(/i);
  });

  it("requires trusted mutation RPCs and keeps browser table writes revoked", () => {
    expect(migration).toMatch(
      /revoke all on table public\.maternal_pregnancies[\s\S]*authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*to authenticated/i,
    );
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("enforces role scope and appointment or encounter consistency", () => {
    expect(migration).toMatch(/child profile management requires a midwife/i);
    expect(migration).toMatch(
      /nurse child documentation requires an assigned appointment or encounter/i,
    );
    expect(migration).toMatch(
      /BHW growth recording requires a checked-in child appointment/i,
    );
    expect(migration).toMatch(
      /linked appointment does not belong to the resident/i,
    );
    expect(migration).toMatch(
      /linked encounter does not belong to the resident or appointment/i,
    );
  });

  it("uses Manila business dates and preserves UTC event timestamps", () => {
    expect(migration).toMatch(/at time zone 'Asia\/Manila'/i);
    expect(migration).toMatch(/measured_at timestamptz not null/i);
    expect(migration).toMatch(
      /created_at timestamptz not null default now\(\)/i,
    );
  });

  it("provides semantic minimized audits without clinical values", () => {
    const audit = migration.slice(
      migration.indexOf(
        "create or replace function public.audit_maternal_child_change",
      ),
      migration.indexOf(
        "create or replace function public.maternal_pregnancy_list",
      ),
    );
    expect(audit).toMatch(/maternal\.pregnancy_created/);
    expect(audit).toMatch(/child\.immunization_created/);
    expect(audit).toMatch(/changed_fields/);
    expect(audit).not.toMatch(
      /new\.(?:risk_notes|findings|plan|developmental_notes|notes)/i,
    );
  });

  it("does not grant parent or guardian access by default", () => {
    const residentBranches = migration.match(/when 'resident' then [^\n]+/gi);
    expect(residentBranches?.join("\n")).not.toMatch(
      /mother_resident_id|guardian_resident_id/i,
    );
    expect(migration).toMatch(
      /actor_role='resident' and resident_id<>public\.current_resident_id\(\)/i,
    );
  });
});
