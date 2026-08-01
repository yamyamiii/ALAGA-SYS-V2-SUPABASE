import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import {
  canAmendEncounter,
  canArchiveEncounter,
  canCreateEncounter,
  canEditEncounter,
  canRecordVitals,
} from "@/features/health-records/permissions";
import { missingEncounterSignFields } from "@/features/health-records/schemas";

const profileId = "11111111-1111-4111-8111-111111111111";
const draft = {
  status: "draft",
  encounter_type: "general_consultation",
  attending_staff_id: profileId,
  appointment_id: "33333333-3333-4333-8333-333333333333",
  appointment: { status: "checked_in" },
};

describe("clinical UI permissions", () => {
  it("allows nurses and midwives, but not BHWs or admins, to create encounters", () => {
    expect(canCreateEncounter(USER_ROLES.NURSE)).toBe(true);
    expect(canCreateEncounter(USER_ROLES.MIDWIFE)).toBe(true);
    expect(canCreateEncounter(USER_ROLES.BARANGAY_HEALTH_WORKER)).toBe(false);
    expect(canCreateEncounter(USER_ROLES.ADMINISTRATOR)).toBe(false);
  });

  it("allows only the attending clinician to edit or sign a draft", () => {
    expect(canEditEncounter(USER_ROLES.NURSE, draft, profileId)).toBe(true);
    expect(
      canEditEncounter(
        USER_ROLES.NURSE,
        draft,
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toBe(false);
    expect(canEditEncounter(USER_ROLES.MIDWIFE, draft, profileId)).toBe(false);
  });

  it("allows BHW preliminary vitals but no clinical narrative edits", () => {
    expect(
      canRecordVitals(USER_ROLES.BARANGAY_HEALTH_WORKER, draft, profileId),
    ).toBe(true);
    expect(
      canEditEncounter(USER_ROLES.BARANGAY_HEALTH_WORKER, draft, profileId),
    ).toBe(false);
    expect(
      canRecordVitals(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        { ...draft, appointment: { status: "completed" } },
        profileId,
      ),
    ).toBe(false);
    expect(
      canRecordVitals(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        { ...draft, appointment_id: null, appointment: null },
        profileId,
      ),
    ).toBe(false);
  });

  it("uses amendment and controlled admin archival for signed records", () => {
    const signed = { ...draft, status: "signed" };
    expect(canAmendEncounter(USER_ROLES.NURSE, signed)).toBe(true);
    expect(canArchiveEncounter(USER_ROLES.ADMINISTRATOR, signed)).toBe(true);
    expect(canArchiveEncounter(USER_ROLES.NURSE, signed)).toBe(false);
  });

  it("identifies every missing field required by the signing RPC", () => {
    expect(
      missingEncounterSignFields({
        clinical: { chief_complaint: "Complaint", assessment: "", plan: " " },
      }),
    ).toEqual(["Assessment", "Plan"]);
    expect(
      missingEncounterSignFields({
        clinical: {
          chief_complaint: "Complaint",
          assessment: "Assessment",
          plan: "Plan",
        },
      }),
    ).toEqual([]);
  });
});
