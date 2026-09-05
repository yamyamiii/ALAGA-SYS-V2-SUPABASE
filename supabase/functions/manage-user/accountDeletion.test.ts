import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountDeletionBlockerMessage,
  authorizeAdministrator,
  mapDatabaseError,
  validateManageUserRequest,
} from "./domain.ts";

const indexSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/manage-user/index.ts"),
  "utf8",
);
const targetId = "10000000-0000-4000-8000-000000000002";

describe("manage-user generalized permanent deletion", () => {
  it("accepts only the bounded symbolic delete action payload", () => {
    expect(
      validateManageUserRequest({
        action: "delete_user_account",
        payload: { user_id: targetId, version: null },
      }),
    ).toEqual({
      action: "delete_user_account",
      payload: { user_id: targetId, version: null },
    });
    expect(() =>
      validateManageUserRequest({
        action: "delete_user_account",
        payload: { user_id: targetId, version: null, role: "admin" },
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
  });

  it("keeps active Administrator authorization authoritative", () => {
    expect(
      authorizeAdministrator({ role: "admin", account_status: "active" }),
    ).toMatchObject({ role: "admin" });
    for (const role of [
      "resident",
      "barangay_health_worker",
      "nurse",
      "midwife",
    ]) {
      expect(() =>
        authorizeAdministrator({ role, account_status: "active" }),
      ).toThrowError(
        expect.objectContaining({ code: "administrator_required" }),
      );
    }
    expect(() =>
      authorizeAdministrator({ role: "admin", account_status: "suspended" }),
    ).toThrowError(expect.objectContaining({ code: "administrator_inactive" }));
  });

  it("uses generalized service-role RPCs and hard-deletes Auth so the email can be reused", () => {
    expect(indexSource).toMatch(/admin_account_deletion_assessment/);
    expect(indexSource).toMatch(/admin_prepare_account_deletion/);
    expect(indexSource).toMatch(/admin_restore_account_deletion/);
    expect(indexSource).toMatch(
      /admin\.auth\.admin\.deleteUser\(targetId, false\)/,
    );
    expect(indexSource).not.toMatch(
      /case "delete_user_account"[\s\S]*admin_prepare_resident_account_deletion/,
    );
  });

  it("returns useful non-sensitive retention guidance before preparation", () => {
    expect(
      accountDeletionBlockerMessage("appointment_history", "resident"),
    ).toBe(
      "This Resident has appointment history and cannot be permanently deleted. Remove account access permanently instead.",
    );
    expect(
      accountDeletionBlockerMessage("clinical_history", "resident"),
    ).not.toMatch(/diagnosis|treatment|resident name|appointment number/i);
    expect(indexSource).toMatch(
      /deletionAssessmentByProfile[\s\S]*accountDeletionBlockerMessage[\s\S]*admin_prepare_account_deletion/i,
    );
  });

  it("maps protected staff history and Administrator targets to safe errors", () => {
    expect(
      mapDatabaseError({
        code: "23503",
        message:
          "this account has protected dependencies and cannot be permanently deleted",
      }),
    ).toMatchObject({
      code: "account_delete_has_dependencies",
      status: 409,
      message:
        "This account has existing records and cannot be permanently deleted. Remove account access permanently instead.",
    });
    expect(
      mapDatabaseError({
        code: "42501",
        message: "Administrator accounts cannot be permanently deleted",
      }),
    ).toMatchObject({
      code: "account_delete_not_eligible",
      status: 409,
    });
  });
});
