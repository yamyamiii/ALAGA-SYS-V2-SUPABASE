import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import {
  isPermanentDeleteCandidate,
  isPermanentRetirementCandidate,
  permanentDeleteRetentionMessage,
} from "@/features/user-management/accountDeletion";

const administratorId = "10000000-0000-4000-8000-000000000001";
const target = {
  id: "10000000-0000-4000-8000-000000000002",
  role: USER_ROLES.RESIDENT,
  account_status: "active",
  registration_status: "approved",
};

describe("managed-account permanent delete presentation", () => {
  it.each([
    ["active Resident", USER_ROLES.RESIDENT, "active", null],
    ["inactive Resident", USER_ROLES.RESIDENT, "inactive", "approved"],
    ["invited rejected signup", USER_ROLES.RESIDENT, "invited", "rejected"],
    ["BHW", USER_ROLES.BARANGAY_HEALTH_WORKER, "active", null],
    ["Nurse", USER_ROLES.NURSE, "suspended", null],
    ["Midwife", USER_ROLES.MIDWIFE, "inactive", null],
  ])(
    "recognizes a managed %s as a cleanup candidate",
    (_label, role, status, registrationStatus) => {
      expect(
        isPermanentDeleteCandidate({
          currentUserId: administratorId,
          currentUserRole: USER_ROLES.ADMINISTRATOR,
          user: {
            ...target,
            role,
            account_status: status,
            registration_status: registrationStatus,
          },
        }),
      ).toBe(true);
    },
  );

  it("keeps pending registration review outside managed-account cleanup", () => {
    expect(
      isPermanentDeleteCandidate({
        currentUserId: administratorId,
        currentUserRole: USER_ROLES.ADMINISTRATOR,
        user: { ...target, registration_status: "pending" },
      }),
    ).toBe(false);
  });

  it("excludes Administrator targets, self, and non-Administrator operators", () => {
    expect(
      isPermanentDeleteCandidate({
        currentUserId: administratorId,
        currentUserRole: USER_ROLES.ADMINISTRATOR,
        user: { ...target, role: USER_ROLES.ADMINISTRATOR },
      }),
    ).toBe(false);
    expect(
      isPermanentDeleteCandidate({
        currentUserId: target.id,
        currentUserRole: USER_ROLES.ADMINISTRATOR,
        user: target,
      }),
    ).toBe(false);
    expect(
      isPermanentDeleteCandidate({
        currentUserId: administratorId,
        currentUserRole: USER_ROLES.BARANGAY_HEALTH_WORKER,
        user: target,
      }),
    ).toBe(false);
  });

  it("uses non-sensitive blocker guidance and recognizes retained accounts", () => {
    expect(
      permanentDeleteRetentionMessage({
        ...target,
        permanent_delete_blocker: "clinical_history",
      }),
    ).toContain("protected clinical history");
    expect(
      permanentDeleteRetentionMessage({
        ...target,
        account_status: "inactive",
        permanent_delete_blocker: "appointment_history",
      }),
    ).toContain("permanently remove login access");
    expect(
      isPermanentRetirementCandidate({
        ...target,
        permanent_delete_eligible: false,
        permanent_delete_blocker: "appointment_history",
      }),
    ).toBe(true);
    expect(
      isPermanentRetirementCandidate({
        ...target,
        permanent_delete_eligible: false,
        permanent_delete_blocker: "account_link_inconsistent",
      }),
    ).toBe(false);
  });
});
