import fs from "node:fs";

import { describe, expect, it } from "vitest";

const foundation = fs.readFileSync(
  "supabase/migrations/20260720002000_health_records_foundation.sql",
  "utf8",
);
const residentSafety = fs.readFileSync(
  "supabase/migrations/20260720003500_resident_clinical_document_safety.sql",
  "utf8",
);
const documents = fs.readFileSync(
  "supabase/migrations/20260720003100_printable_healthcare_documents.sql",
  "utf8",
);
const notifications = fs.readFileSync(
  "supabase/migrations/20260720002700_general_assistance.sql",
  "utf8",
);

function functionBlock(sql, name, nextName) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? sql.indexOf(`create or replace function public.${nextName}`, start + 1)
    : sql.length;
  return sql.slice(start, end);
}

describe("Resident clinical and signed-document isolation", () => {
  it("permits only the Resident's own finalized encounter metadata", () => {
    const detail = functionBlock(residentSafety, "health_record_get");
    expect(detail).toMatch(
      /resident_can_view\s*:=\s*[\s\S]*encounter_record\.resident_id = actor_resident_id/i,
    );
    expect(detail).toMatch(
      /encounter_record\.status in \([\s\S]*'signed'[\s\S]*'amended'/i,
    );
    expect(detail).toMatch(
      /actor_role = 'resident'[\s\S]*not resident_can_view[\s\S]*not authorized/i,
    );
  });

  it("does not deliver raw narrative, amendment reasons, or vitals to Residents", () => {
    const detail = functionBlock(residentSafety, "health_record_get");
    const narrativeRule = detail.slice(
      detail.indexOf("can_view_narrative :="),
      detail.indexOf("can_view_vitals :="),
    );
    expect(narrativeRule).not.toMatch(/resident/i);
    expect(detail).toMatch(
      /'amendment_reason', case[\s\S]*when can_view_narrative then e\.amendment_reason else null/i,
    );
    expect(detail).toMatch(
      /'clinical', case when can_view_narrative then[\s\S]*else null end/i,
    );
    expect(detail).toMatch(
      /'vital_signs', case when can_view_vitals then[\s\S]*else null end/i,
    );
  });

  it("keeps Nurse and scoped Midwife clinical detail access unchanged", () => {
    const detail = functionBlock(residentSafety, "health_record_get");
    expect(detail).toMatch(/actor_role = 'nurse'::public\.app_role/i);
    expect(detail).toMatch(
      /actor_role = 'midwife'[\s\S]*'maternal_care'[\s\S]*'child_health'/i,
    );
  });

  it("exposes only the approved own signed consultation document", () => {
    const summary = functionBlock(
      documents,
      "document_consultation_summary",
      "document_prenatal_summary",
    );
    expect(summary).toMatch(/status not in \([\s\S]*'signed'[\s\S]*'amended'/i);
    expect(summary).toMatch(
      /encounter_record\.resident_id is distinct from public\.current_resident_id\(\)/i,
    );
    expect(summary).not.toMatch(
      /subjective_notes|objective_notes|diagnosis_text|treatment_notes|amendment_reason/i,
    );
  });

  it("returns an appointment-linked encounter to Residents only after finalization", () => {
    const lookup = functionBlock(
      foundation,
      "health_record_for_appointment",
      "health_encounter_create",
    );
    expect(lookup).toMatch(
      /appointment_record\.resident_id = public\.current_resident_id\(\)/i,
    );
    expect(lookup).toMatch(
      /actor_role <> 'resident'[\s\S]*e\.status in \('signed', 'amended'\)/i,
    );
  });

  it("creates narrative-free signed notifications for the linked Resident only", () => {
    const notify = functionBlock(
      notifications,
      "assistance_notify_health_encounter",
      "assistance_notify_maternal_child",
    );
    expect(notify).toMatch(
      /select r\.linked_profile_id into recipient[\s\S]*r\.id=new\.resident_id/i,
    );
    expect(notify).toContain("A health center encounter was signed.");
    expect(notify).not.toMatch(
      /chief_complaint|subjective_notes|objective_notes|assessment|diagnosis|treatment|amendment_reason/i,
    );
  });
});
