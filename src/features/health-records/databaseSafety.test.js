import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002000_health_records_foundation.sql",
  "utf8",
);
const residentSafetyMigration = fs.readFileSync(
  "supabase/migrations/20260720003500_resident_clinical_document_safety.sql",
  "utf8",
);

function findUndeclaredIntoTargets(sql) {
  const undeclared = [];
  const functions = [
    ...sql.matchAll(
      /create or replace function public\.([a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*returns[\s\S]*?language plpgsql[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi,
    ),
  ];

  for (const match of functions) {
    const [, functionName, body] = match;
    const declarationBlock =
      body.match(/^\s*declare\s+([\s\S]*?)\bbegin\b/i)?.[1] ?? "";
    const declared = new Set(
      [...declarationBlock.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gim)].map(
        (declaration) => declaration[1].toLowerCase(),
      ),
    );
    const targets = new Set();

    for (const statement of body.split(";")) {
      for (const target of statement.matchAll(
        /\bselect\b[\s\S]*?\binto\s+(?:strict\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        targets.add(target[1].toLowerCase());
      }
      for (const target of statement.matchAll(
        /\breturning\b[\s\S]*?\binto\s+([a-z_][a-z0-9_]*)/gi,
      )) {
        targets.add(target[1].toLowerCase());
      }
    }

    for (const target of targets) {
      if (!declared.has(target)) {
        undeclared.push(`${functionName}.${target}`);
      }
    }
  }

  return { functionCount: functions.length, undeclared };
}

describe("health-record database safety", () => {
  it("declares every PL/pgSQL SELECT/RETURNING INTO target in its function", () => {
    const declarationAudit = findUndeclaredIntoTargets(migration);
    expect(declarationAudit.functionCount).toBe(19);
    expect(declarationAudit.undeclared).toEqual([]);
    expect(migration).toMatch(
      /create or replace function public\.health_encounter_create[\s\S]*?declare[\s\S]*?existing_record public\.health_encounters%rowtype;[\s\S]*?begin/i,
    );
  });

  it("generates immutable encounter numbers atomically", () => {
    expect(migration).toMatch(
      /create sequence public\.health_encounter_number_seq/i,
    );
    expect(migration).toMatch(
      /nextval\('public\.health_encounter_number_seq'\)/i,
    );
    expect(migration).toMatch(
      /encounter_number is database-generated and immutable/i,
    );
    expect(migration).not.toMatch(/select\s+max\s*\(/i);
  });

  it("locks appointment linkage and prevents duplicate primary encounters", () => {
    expect(migration).toMatch(/health_encounters_appointment_unique/i);
    expect(migration).toMatch(
      /select \* into appointment_record[\s\S]*from public\.appointments[\s\S]*for update/i,
    );
    expect(migration).toMatch(
      /appointment and encounter resident do not match/i,
    );
    expect(migration).toMatch(/appointment must be in progress or completed/i);
    expect(migration).toMatch(/health_encounters_request_unique/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(
      /encounter request key was reused with different data/i,
    );
    expect(migration).toMatch(
      /actor_role = 'nurse'::public\.app_role[\s\S]*appointment_record\.assigned_staff_id = actor_id/i,
    );
  });

  it("prevents stale updates and signed-record overwrites", () => {
    expect(migration).toMatch(/current_record\.version <> p_expected_version/i);
    expect(migration).toMatch(/signed health encounters are immutable/i);
    expect(migration).toMatch(/signed clinical content cannot be overwritten/i);
    expect(migration).toMatch(/health_encounter_amend/i);
    expect(migration).toMatch(/for update/i);
  });

  it("keeps resident drafts invisible and limits midwife scope", () => {
    const residentPolicy = migration.slice(
      migration.indexOf(
        "create policy health_encounters_select_resident_signed",
      ),
      migration.indexOf("create policy vital_signs_select_clinical"),
    );
    expect(residentPolicy).toMatch(
      /resident_id = public\.current_resident_id\(\)/i,
    );
    expect(residentPolicy).toMatch(/'signed'[\s\S]*'amended'/i);
    expect(residentPolicy).not.toMatch(/'draft'/i);
    expect(migration).toMatch(
      /health_encounters_select_midwife[\s\S]*'maternal_care'[\s\S]*'child_health'/i,
    );
  });

  it("does not grant browser writes or broad clinical narrative access", () => {
    expect(migration).toMatch(
      /revoke all on table public\.health_encounters from public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant (?:insert|update)[^;]*health_encounters[^;]*authenticated/i,
    );
    expect(migration).not.toMatch(
      /create policy health_encounters_select_(?:admin|bhw)/i,
    );
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("returns metadata but no clinical narrative to BHW, Administrator, or Resident detail callers", () => {
    const detailFunction = residentSafetyMigration.slice(
      residentSafetyMigration.indexOf(
        "create or replace function public.health_record_get",
      ),
    );
    const narrativeAssignment = detailFunction.slice(
      detailFunction.indexOf("can_view_narrative :="),
      detailFunction.indexOf("can_view_vitals :="),
    );

    expect(narrativeAssignment).toMatch(
      /can_view_narrative\s*:=\s*[\s\S]*actor_role = 'nurse'[\s\S]*actor_role = 'midwife'/i,
    );
    expect(narrativeAssignment).not.toMatch(
      /actor_role = '(?:admin|barangay_health_worker|resident)'/i,
    );
    expect(detailFunction).toMatch(
      /resident_can_view\s*:=\s*[\s\S]*resident_id = actor_resident_id[\s\S]*status in \([\s\S]*'signed'[\s\S]*'amended'/i,
    );
    expect(detailFunction).toMatch(
      /'clinical', case when can_view_narrative then jsonb_build_object\([\s\S]*?'chief_complaint'[\s\S]*?'diagnosis_text'[\s\S]*?'treatment_notes'[\s\S]*?\) else null end/i,
    );
    expect(detailFunction).toMatch(
      /'amendment_reason', case[\s\S]*?when can_view_narrative then e\.amendment_reason else null[\s\S]*?end/i,
    );
    expect(detailFunction).toMatch(
      /'vital_signs', case when can_view_vitals then/i,
    );
  });

  it("calculates BMI without a writable BMI column", () => {
    const vitalTable = migration.slice(
      migration.indexOf("create table public.vital_signs"),
      migration.indexOf("create table public.resident_allergies"),
    );
    expect(vitalTable).not.toMatch(/\bbmi\s+(?:numeric|decimal|real|double)/i);
    expect(migration).toMatch(
      /v\.weight_kg \/ power\(v\.height_cm \/ 100, 2\)/i,
    );
  });

  it("excludes clinical narratives and measurements from audit values", () => {
    const audit = migration.slice(
      migration.indexOf(
        "create or replace function public.audit_clinical_change",
      ),
      migration.indexOf("revoke all on function public.health_record_list"),
    );
    expect(audit).toMatch(/encounter\.created/);
    expect(audit).toMatch(/encounter\.signed/);
    expect(audit).toMatch(/allergy\.archived/);
    expect(audit).not.toMatch(
      /new\.(?:chief_complaint|subjective_notes|objective_notes|assessment|plan|diagnosis_text|treatment_notes|allergen|reaction|condition_name|details)/i,
    );
  });

  it("keeps appointment overview APIs free of clinical fields", () => {
    const appointmentMigrations = [
      "supabase/migrations/20260720001800_appointment_workflows.sql",
      "supabase/migrations/20260720001900_fix_appointment_rpc_contracts.sql",
    ]
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    expect(appointmentMigrations).not.toMatch(
      /\bchief_complaint\b|\bsubjective_notes\b|\bdiagnosis_text\b|\btreatment_notes\b/i,
    );
  });
});
