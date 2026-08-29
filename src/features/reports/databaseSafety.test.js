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
    expect(migration).toMatch(
      /p_group = 'registry'[\s\S]*actor_role not in \('admin', 'barangay_health_worker'\)/i,
    );
    expect(migration).not.toMatch(
      /p_group = 'appointments'[\s\S]{0,180}actor_role not in/i,
    );
    for (const name of [
      "report_appointment_summary",
      "report_appointments_over_time",
      "report_services_distribution",
      "report_export_rows",
    ]) {
      const start = migration.indexOf(`function public.${name}`);
      const end = migration.indexOf("$$;", start);
      expect(migration.slice(start, end)).toMatch(/security invoker/i);
      expect(migration.slice(start, end)).toMatch(/report_validate_scope/i);
    }
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

  it("uses an explicitly aliased PostgreSQL date series", () => {
    expect(migration).toMatch(
      /with days\(period_date\) as \([\s\S]*from pg_catalog\.generate_series\([\s\S]*\) as generated\(generated_at\)/i,
    );
    expect(migration).toMatch(
      /left join filtered on filtered\.scheduled_date = days\.period_date[\s\S]*group by days\.period_date[\s\S]*order by days\.period_date/i,
    );
    expect(migration).not.toMatch(/::date\s+day\b/i);
    expect(migration).not.toMatch(/\)\s+rows\b/i);
    expect(migration).not.toMatch(/\bgroups\s*\(/i);
  });

  it("keeps aggregate filters and export ordinality syntactically explicit", () => {
    expect(migration).toMatch(
      /count\(\*\) filter \(where status = 'completed'\)/i,
    );
    expect(migration).toMatch(
      /with ordinality as export_element\(value, position\)/i,
    );
    expect(migration).toMatch(/order by 8 desc, 2/i);
  });

  it("caps and minimally audits exports", () => {
    expect(migration).toMatch(/p_limit < 1 or p_limit > 5000/i);
    expect(migration).toMatch(/report\.large_export_requested/i);
    expect(migration).toMatch(/'filter_fields', p_filter_fields/i);
    expect(migration).not.toMatch(/'resident_id',/i);
  });
});
