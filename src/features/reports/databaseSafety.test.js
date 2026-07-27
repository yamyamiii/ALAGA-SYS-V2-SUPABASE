import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260720002600_reports_analytics.sql"),
  "utf8",
);

describe("reports database boundary", () => {
  it("keeps registry and appointment aggregate reads under caller RLS", () => {
    expect(
      migration.match(/security invoker/gi)?.length,
    ).toBeGreaterThanOrEqual(7);
    expect(migration).toMatch(/actor_role is null or actor_role = 'resident'/i);
    expect(migration).toMatch(/from public, anon, authenticated/i);
  });

  it("does not expose clinical narrative fields", () => {
    expect(migration).not.toMatch(
      /\b(chief_complaint|subjective_notes|objective_notes|assessment|diagnosis_text|treatment_notes|risk_notes|developmental_notes)\b/i,
    );
  });

  it("uses narrow aggregate definers where source RLS hides raw clinical rows", () => {
    for (const name of [
      "report_overview_summary",
      "report_health_summary",
      "report_maternal_summary",
      "report_child_summary",
      "report_staff_workload",
    ]) {
      const start = migration.indexOf(`function public.${name}`);
      const end = migration.indexOf("$$;", start);
      expect(migration.slice(start, end)).toMatch(/security definer/i);
      expect(migration.slice(start, end)).toMatch(/report_validate_scope/i);
      expect(migration.slice(start, end)).toMatch(/set search_path = ''/i);
    }
  });

  it("uses bounded inclusive Manila-aware periods", () => {
    expect(migration).toMatch(/at time zone 'Asia\/Manila'/i);
    expect(migration).toMatch(/between p_start_date and p_end_date/i);
    expect(migration).toMatch(/report date range cannot exceed five years/i);
  });

  it("caps and minimally audits exports", () => {
    expect(migration).toMatch(/p_limit < 1 or p_limit > 5000/i);
    expect(migration).toMatch(/report\.large_export_requested/i);
    expect(migration).toMatch(/'filter_fields', p_filter_fields/i);
    expect(migration).not.toMatch(/'resident_id',/i);
  });
});
