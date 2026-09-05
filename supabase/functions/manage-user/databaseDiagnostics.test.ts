import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  databaseDiagnostic,
  DatabaseActionError,
} from "./databaseDiagnostics.ts";

const indexSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/manage-user/index.ts"),
  "utf8",
);
const diagnosticSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/functions/manage-user/databaseDiagnostics.ts",
  ),
  "utf8",
);

describe("manage-user database diagnostics", () => {
  it("retains only bounded database identifiers for server-side logging", () => {
    const diagnostic = databaseDiagnostic(
      {
        code: "23505",
        message:
          'duplicate value for private@example.test violates constraint "residents_linked_profile_unique"',
      },
      "admin_approve_resident_registration",
    );

    expect(diagnostic).toEqual({
      postgresCode: "23505",
      databaseFunction: "admin_approve_resident_registration",
      constraint: "residents_linked_profile_unique",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("private@example.test");
  });

  it("keeps the browser error generic while attaching safe server diagnostics", () => {
    const error = new DatabaseActionError(
      {
        code: "P0001",
        message:
          "resident profile links require the trusted administrator workflow",
      },
      "admin_approve_resident_registration",
    );

    expect(error).toMatchObject({
      code: "database_action_failed",
      message: "The account change could not be saved.",
      status: 500,
      diagnostic: {
        postgresCode: "P0001",
        databaseFunction: "admin_approve_resident_registration",
        constraint: null,
      },
    });
  });

  it("logs the request operation and safe PostgreSQL fields without raw database details", () => {
    expect(indexSource).toMatch(/operation = validated\.action/);
    expect(indexSource).toMatch(/databaseDiagnostic =/);
    expect(indexSource).toMatch(/\.\.\.\(databaseDiagnostic \?\? \{\}\)/);
    expect(diagnosticSource).toMatch(/postgresCode/);
    expect(diagnosticSource).toMatch(/databaseFunction/);
    expect(diagnosticSource).toMatch(/constraint/);
    expect(indexSource).not.toMatch(/console\.error\([^;]*error\.message/s);
  });
});
