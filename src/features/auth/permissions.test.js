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
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.MANAGE_HOUSEHOLDS,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.MANAGE_RESIDENT_PHOTOS,
      ),
    ).toBe(true);
    expect(hasPermission(USER_ROLES.NURSE, PERMISSIONS.VIEW_RESIDENTS)).toBe(
      true,
    );
    expect(hasPermission(USER_ROLES.NURSE, PERMISSIONS.MANAGE_RESIDENTS)).toBe(
      false,
    );
    expect(
      hasPermission(USER_ROLES.NURSE, PERMISSIONS.VIEW_RESIDENT_PHOTOS),
    ).toBe(true);
    expect(hasPermission(USER_ROLES.MIDWIFE, PERMISSIONS.VIEW_RESIDENTS)).toBe(
      true,
    );
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.RESTORE_ARCHIVED_REGISTRY,
      ),
    ).toBe(false);
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.VIEW_REPORTS,
      ),
    ).toBe(true);
    expect(hasPermission(USER_ROLES.NURSE, PERMISSIONS.VIEW_REPORTS)).toBe(
      true,
    );
    expect(hasPermission(USER_ROLES.MIDWIFE, PERMISSIONS.VIEW_REPORTS)).toBe(
      true,
    );
    expect(hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_REPORTS)).toBe(
      false,
    );
    expect(
      hasPermission(USER_ROLES.NURSE, PERMISSIONS.MANAGE_CONSULTATIONS),
    ).toBe(true);
    expect(hasPermission(USER_ROLES.NURSE, PERMISSIONS.VIEW_APPOINTMENTS)).toBe(
      true,
    );
    expect(
      hasPermission(USER_ROLES.NURSE, PERMISSIONS.OPERATE_APPOINTMENTS),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.NURSE, PERMISSIONS.SCHEDULE_APPOINTMENTS),
    ).toBe(false);
    expect(
      hasPermission(USER_ROLES.MIDWIFE, PERMISSIONS.MANAGE_MATERNAL_CARE),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.MIDWIFE, PERMISSIONS.VIEW_APPOINTMENTS),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.MIDWIFE, PERMISSIONS.MANAGE_RESIDENT_PHOTOS),
    ).toBe(false);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.MANAGE_RESIDENTS),
    ).toBe(false);
    expect(hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_RESIDENTS)).toBe(
      false,
    );
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_RESIDENT_PHOTOS),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_APPOINTMENTS),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.OPERATE_APPOINTMENTS),
    ).toBe(false);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.REQUEST_OWN_APPOINTMENT),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.CANCEL_OWN_APPOINTMENT),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_APPOINTMENT_QUEUE),
    ).toBe(false);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_APPOINTMENT_CALENDAR),
    ).toBe(false);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.VIEW_HEALTH_RECORDS),
    ).toBe(true);
    expect(
      hasPermission(USER_ROLES.RESIDENT, PERMISSIONS.DOCUMENT_HEALTH_RECORDS),
    ).toBe(false);
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.RECORD_VITAL_SIGNS,
      ),
    ).toBe(true);
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.DOCUMENT_HEALTH_RECORDS,
      ),
    ).toBe(false);
    expect(
      hasPermission(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        PERMISSIONS.LINK_RESIDENT_ACCOUNTS,
      ),
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
