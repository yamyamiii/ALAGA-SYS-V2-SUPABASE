import { ManageUserError, mapDatabaseError } from "./domain.ts";

type UnknownRecord = Record<string, unknown>;

export type DatabaseDiagnostic = {
  postgresCode: string;
  databaseFunction: string;
  constraint: string | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeIdentifier(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[^a-zA-Z0-9_.]/g, "_").slice(0, 96);
  return normalized || fallback;
}

function constraintFrom(error: unknown) {
  if (!isRecord(error)) return null;
  if (typeof error.constraint === "string") {
    return safeIdentifier(error.constraint, "unknown_constraint");
  }
  const diagnosticText = [error.details, error.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const match = diagnosticText.match(/constraint\s+["']?([a-zA-Z0-9_]+)/i);
  return match ? safeIdentifier(match[1], "unknown_constraint") : null;
}

export function databaseDiagnostic(
  error: unknown,
  functionName: string,
): DatabaseDiagnostic {
  return {
    postgresCode: safeIdentifier(
      isRecord(error) ? error.code : null,
      "unknown",
    ),
    databaseFunction: safeIdentifier(functionName, "unknown_function"),
    constraint: constraintFrom(error),
  };
}

export class DatabaseActionError extends ManageUserError {
  diagnostic: DatabaseDiagnostic;

  constructor(error: unknown, functionName: string) {
    const safeError = mapDatabaseError(error);
    super(safeError.code, safeError.message, safeError.status);
    this.name = "DatabaseActionError";
    this.diagnostic = databaseDiagnostic(error, functionName);
  }
}
