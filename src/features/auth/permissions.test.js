import { describe, expect, it } from "vitest";

import {
  getRoleLabel,
  hasPermission,
  isSupportedRole,
  PERMISSIONS,
  USER_ROLES,
} from "@/features/auth/permissions";

describe("role permissions", () => {
  it("gives administrators every centralized permission", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission(USER_ROLES.ADMINISTRATOR, permission)).toBe(true);
    }
  });

  it("limits clinical and community roles to their assigned capabilities", () => {
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.MANAGE_RESIDENTS,
      ),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.NURSE, PERMISSIONS.MANAGE_CONSULTATIONS),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.MIDWIFE, PERMISSIONS.MANAGE_MATERNAL_CARE),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.MANAGE_RESIDENTS),
    ).toBe(false);
  });

  it("rejects unknown frontend role values", () => {
    expect(isSupportedRole("health_worker")).toBe(false);
    expect(hasPermission("admin-from-browser", PERMISSIONS.MANAGE_USERS)).toBe(
      false,
    );
    expect(getRoleLabel(USER_ROLES.BARANGAY_HEALTH_WORKER)).toBe(
      "Barangay Health Worker",
    );
  });
});
