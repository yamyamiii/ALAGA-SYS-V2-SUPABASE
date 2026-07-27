import fs from "node:fs";
import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002400_maternal_child_care.sql",
  "utf8",
);

const migrationFiles = fs
  .readdirSync("supabase/migrations")
  .filter((file) => file.endsWith(".sql"))
  .sort();
const allMigrations = migrationFiles
  .map((file) => fs.readFileSync(`supabase/migrations/${file}`, "utf8"))
  .join("\n");

function collectTableColumns(sql) {
  const tables = new Map();
  for (const match of sql.matchAll(
    /create\s+table\s+public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi,
  )) {
    const columns = new Set();
    for (const line of match[2].split(/\r?\n/)) {
      const column = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+/i)?.[1];
      if (
        column &&
        !["constraint", "primary", "unique", "check", "foreign"].includes(
          column.toLowerCase(),
        )
      ) {
        columns.add(column.toLowerCase());
      }
    }
    tables.set(match[1].toLowerCase(), columns);
  }
  for (const match of sql.matchAll(
    /alter\s+table\s+public\.([a-z_][a-z0-9_]*)\s+add\s+column(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*)/gi,
  )) {
    tables.get(match[1].toLowerCase())?.add(match[2].toLowerCase());
  }
  return tables;
}

function findMissingIndexedColumns(sql, tables) {
  const missing = [];
  for (const match of sql.matchAll(
    /create\s+(?:unique\s+)?index\s+([a-z_][a-z0-9_]*)\s+on\s+public\.([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/gi,
  )) {
    for (const expression of match[3].split(",")) {
      const column = expression.trim().match(/^([a-z_][a-z0-9_]*)/i)?.[1];
      if (
        column &&
        !tables.get(match[2].toLowerCase())?.has(column.toLowerCase())
      ) {
        missing.push(`${match[1]}.${column}`);
      }
    }
  }
  return missing;
}

function findMissingInsertColumns(sql, tables) {
  const missing = [];
  for (const match of sql.matchAll(
    /insert\s+into\s+public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*values/gi,
  )) {
    for (const column of match[2].split(",").map((value) => value.trim())) {
      if (!tables.get(match[1].toLowerCase())?.has(column.toLowerCase())) {
        missing.push(`${match[1]}.${column}`);
      }
    }
  }
  return missing;
}

function findMissingQualifiedColumns(sql, tables) {
  const missing = [];
  for (const [statementNumber, statement] of sql.split(";").entries()) {
    for (const unionBranch of statement.split(/\bunion\s+all\b/i)) {
      const aliases = new Map();
      for (const match of unionBranch.matchAll(
        /(?:from|join|update)\s+public\.([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        if (tables.has(match[1].toLowerCase())) {
          aliases.set(match[2].toLowerCase(), match[1].toLowerCase());
        }
      }
      for (const [alias, table] of aliases) {
        for (const reference of unionBranch.matchAll(
          new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, "gi"),
        )) {
          if (!tables.get(table).has(reference[1].toLowerCase())) {
            missing.push(
              `statement ${statementNumber + 1}: ${table}.${reference[1]}`,
            );
          }
        }
      }
    }
  }
  return missing;
}

describe("maternal-child database safety", () => {
  it("references only columns that exist in table indexes, inserts, and qualified queries", () => {
    const tables = collectTableColumns(allMigrations);
    expect(findMissingIndexedColumns(migration, tables)).toEqual([]);
    expect(findMissingInsertColumns(migration, tables)).toEqual([]);
    expect(findMissingQualifiedColumns(migration, tables)).toEqual([]);
  });

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

  it("implements nullable-column, trusted-boundary immunization idempotency", () => {
    const immunizationTable = migration.slice(
      migration.indexOf("create table public.child_immunizations"),
      migration.indexOf("create table public.child_health_visits"),
    );
    const childEventRpc = migration.slice(
      migration.indexOf("create or replace function public.child_event_save"),
      migration.indexOf(
        "create or replace function public.maternal_child_archive",
      ),
    );
    expect(immunizationTable).toMatch(/\n\s+request_key uuid,/i);
    expect(immunizationTable).not.toMatch(/request_key uuid not null/i);
    expect(immunizationTable).toMatch(
      /unique index child_immunization_request_unique[\s\S]*\(recorded_by,\s*request_key\)[\s\S]*where request_key is not null/i,
    );
    expect(childEventRpc).toMatch(
      /if p_request_key is null then raise exception 'event request key is required'/i,
    );
    expect(childEventRpc).toMatch(
      /where i\.recorded_by=actor_id and i\.request_key=p_request_key[\s\S]*if result is not null then return result-'request_key'/i,
    );
    expect(childEventRpc).toMatch(
      /insert into public\.child_immunizations\([\s\S]*recorded_by,request_key[\s\S]*actor_id,p_request_key/i,
    );
  });

  it("reuses a repeated immunization request while distinct keys remain independent", () => {
    const rows = [];
    function trustedCreate({ actor, requestKey, vaccineCode, doseNumber }) {
      if (!requestKey) throw new Error("event request key is required");
      const repeated = rows.find(
        (row) => row.actor === actor && row.requestKey === requestKey,
      );
      if (repeated) return repeated;
      const created = { actor, requestKey, vaccineCode, doseNumber };
      rows.push(created);
      return created;
    }
    const first = trustedCreate({
      actor: "midwife",
      requestKey: "request-a",
      vaccineCode: "BCG",
      doseNumber: 1,
    });
    expect(
      trustedCreate({
        actor: "midwife",
        requestKey: "request-a",
        vaccineCode: "BCG",
        doseNumber: 1,
      }),
    ).toBe(first);
    trustedCreate({
      actor: "midwife",
      requestKey: "request-b",
      vaccineCode: "PENTA",
      doseNumber: 1,
    });
    expect(rows).toHaveLength(2);
    expect(() =>
      trustedCreate({
        actor: "midwife",
        requestKey: null,
        vaccineCode: "OPV",
        doseNumber: 1,
      }),
    ).toThrow("event request key is required");
  });

  it("keeps migrations 1 through 23 byte-identical to the verified hash lock", () => {
    const verifier = fs.readFileSync("scripts/verify-database.mjs", "utf8");
    const hashEntries = new Map(
      [
        ...verifier.matchAll(
          /"(2026072000[0-9]+_[^"]+\.sql)":\s*"([a-f0-9]{64})"/g,
        ),
      ].map((match) => [match[1], match[2]]),
    );
    const applied = migrationFiles.slice(0, 23);
    expect(applied).toHaveLength(23);
    for (const file of applied) {
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(`supabase/migrations/${file}`))
        .digest("hex");
      expect(actual, file).toBe(hashEntries.get(file));
    }
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
