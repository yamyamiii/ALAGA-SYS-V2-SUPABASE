import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import {
  canArchiveMaternalChildCare,
  canCreateMaternalChildProfile,
  canDocumentMaternalChildCare,
  canRecordGrowth,
  canViewClinicalMaternalChildDetails,
} from "@/features/maternal-child-care/permissions";

describe("maternal-child UI permissions", () => {
  it("keeps longitudinal profile creation with midwives", () => {
    expect(canCreateMaternalChildProfile(USER_ROLES.MIDWIFE)).toBe(true);
    expect(canCreateMaternalChildProfile(USER_ROLES.ADMINISTRATOR)).toBe(false);
  });

  it("allows assigned clinical documentation roles only", () => {
    expect(canDocumentMaternalChildCare(USER_ROLES.MIDWIFE)).toBe(true);
    expect(canDocumentMaternalChildCare(USER_ROLES.NURSE)).toBe(true);
    expect(
      canDocumentMaternalChildCare(USER_ROLES.BARANGAY_HEALTH_WORKER),
    ).toBe(false);
    expect(canViewClinicalMaternalChildDetails(USER_ROLES.RESIDENT)).toBe(
      false,
    );
  });

  it("limits BHW participation to the measurement affordance", () => {
    expect(canRecordGrowth(USER_ROLES.BARANGAY_HEALTH_WORKER)).toBe(true);
    expect(canArchiveMaternalChildCare(USER_ROLES.ADMINISTRATOR)).toBe(true);
    expect(canArchiveMaternalChildCare(USER_ROLES.MIDWIFE)).toBe(false);
  });
});
