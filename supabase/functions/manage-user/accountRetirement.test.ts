import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  authorizeAdministrator,
  mapDatabaseError,
  validateManageUserRequest,
} from "./domain.ts";

const indexSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/manage-user/index.ts"),
  "utf8",
);
const retirementFlow = indexSource.slice(
  indexSource.indexOf("function retiredAuthEmail"),
  indexSource.indexOf("async function performAction"),
);
const targetId = "10000000-0000-4000-8000-000000000002";

describe("manage-user protected-history account retirement", () => {
  it("accepts only the bounded symbolic retirement payload", () => {
    expect(
      validateManageUserRequest({
        action: "retire_user_account",
        payload: { user_id: targetId },
      }),
    ).toEqual({
      action: "retire_user_account",
      payload: { user_id: targetId },
    });
    expect(() =>
      validateManageUserRequest({
        action: "retire_user_account",
        payload: { user_id: targetId, force: true },
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
  });

  it("tombstones and bans Auth without deleting the retained identity", () => {
    expect(retirementFlow).toMatch(/admin_prepare_account_retirement/);
    expect(retirementFlow).toMatch(/retired-\$\{targetId\}@retired\.invalid/);
    expect(retirementFlow).toMatch(
      /updateUserById\(targetId,[\s\S]*ban_duration:\s*"876000h"/,
    );
    expect(retirementFlow).not.toMatch(/\.deleteUser\(/);
    expect(retirementFlow).not.toMatch(
      /appointments|health_encounters|audit_logs/,
    );
  });

  it("restores database lifecycle state when Auth retirement fails", () => {
    expect(retirementFlow).toMatch(/admin_restore_account_retirement/);
    expect(retirementFlow).toMatch(
      /p_previous_account_status:\s*previousStatus/,
    );
    expect(retirementFlow).toMatch(/account_retirement_incomplete/);
  });

  it("maps forbidden and dependency-free retirement attempts safely", () => {
    expect(
      mapDatabaseError({
        message: "Administrator accounts cannot be retired",
      }),
    ).toMatchObject({ code: "account_retirement_forbidden", status: 403 });
    expect(
      mapDatabaseError({
        message: "dependency-free accounts must use permanent deletion",
      }),
    ).toMatchObject({ code: "account_retirement_not_required", status: 409 });
  });
});
