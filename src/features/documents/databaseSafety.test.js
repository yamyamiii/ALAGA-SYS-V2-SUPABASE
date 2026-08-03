import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260720003100_printable_healthcare_documents.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const next = sql.indexOf("create or replace function public.", start + 1);
  return sql.slice(start, next < 0 ? sql.length : next);
}

describe("printable healthcare document database boundary", () => {
  it("creates one RLS-enabled referral table with no direct browser access", () => {
    expect(sql).toMatch(/create table public\.clinical_referrals/);
    expect(sql).toMatch(
      /alter table public\.clinical_referrals enable row level security/,
    );
    expect(sql).toMatch(
      /revoke all on table public\.clinical_referrals from public, anon, authenticated/,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*clinical_referrals[^;]*authenticated/i,
    );
  });

  it("uses atomic identifiers, idempotency, optimistic versions, and finalized immutability", () => {
    expect(sql).toMatch(/nextval\('public\.referral_number_seq'\)/);
    expect(sql).toMatch(/clinical_referrals_request_unique/);
    expect(functionBody("referral_save")).toMatch(/pg_advisory_xact_lock/);
    expect(functionBody("referral_save")).toMatch(
      /request key was reused with different data/,
    );
    expect(functionBody("referral_save")).toMatch(
      /version is distinct from p_expected_version/,
    );
    expect(functionBody("protect_clinical_referral")).toMatch(
      /finalized referrals are immutable/,
    );
  });

  it("derives referral ownership from a signed encounter and the authenticated clinician", () => {
    const save = functionBody("referral_save");
    expect(save).toMatch(
      /encounter_record\.attending_staff_id is distinct from actor_id/,
    );
    expect(save).toMatch(/status not in[\s\S]*'signed'[\s\S]*'amended'/);
    expect(save).not.toMatch(/p_resident_id/);
    expect(save).not.toMatch(/service_role/);
  });

  it("returns minimized appointment slip fields", () => {
    const body = functionBody("document_appointment_slip");
    for (const field of [
      "appointment_number",
      "resident_name",
      "service_type",
      "scheduled_date",
      "start_time",
      "assigned_staff_name",
      "status",
    ]) {
      expect(body).toContain(`'${field}'`);
    }
    expect(body).not.toMatch(/'reason'|'operational_notes'|'resident_id'/);
    expect(body).toMatch(/public\.current_resident_id\(\)/);
  });

  it("limits consultation documents to signed or amended narrative-authorized roles", () => {
    const body = functionBody("document_consultation_summary");
    expect(body).toMatch(/status not in[\s\S]*'signed'[\s\S]*'amended'/);
    expect(body).toMatch(/actor_role <> 'nurse'/);
    expect(body).not.toMatch(/actor_role\s*=\s*'admin'/);
    expect(body).not.toMatch(
      /subjective_notes|objective_notes|diagnosis_text|treatment_notes/,
    );
    expect(body).toMatch(/'is_amended'/);
  });

  it("bounds maternal and child facts without narratives or interpretation", () => {
    const prenatal = functionBody("document_prenatal_summary");
    const child = functionBody("document_child_health_summary");
    expect(prenatal).toMatch(/limit 50/);
    expect(child).toMatch(/limit 12/);
    expect(child).toMatch(/limit 100/);
    expect(prenatal + child).not.toMatch(
      /risk_notes|findings|developmental_notes|\bnotes\b|recommendation|classification/,
    );
  });

  it("keeps referral audits semantic and narrative-free", () => {
    const audit = functionBody("audit_clinical_referral_change");
    expect(audit).toMatch(/referral\.(created|finalized|archived|updated)/);
    expect(audit).not.toMatch(
      /receiving_facility|reason_for_referral|clinical_summary/,
    );
  });

  it("fixes search paths and grants only trusted RPC execution", () => {
    for (const name of [
      "document_appointment_slip",
      "document_consultation_summary",
      "document_prenatal_summary",
      "document_child_health_summary",
      "document_referral_form",
    ]) {
      expect(functionBody(name)).toMatch(
        /security definer[\s\S]*set search_path = ''/,
      );
    }
    expect(sql).toMatch(
      /grant execute on function[\s\S]*to authenticated, service_role/,
    );
  });
});
