import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import {
  canCreateReferral,
  canPrintAppointmentSlip,
  canPrintConsultationSummary,
} from "@/features/documents/permissions";

describe("document action visibility", () => {
  it("offers appointment slips to operational roles only for valid records", () => {
    for (const status of [
      "confirmed",
      "checked_in",
      "in_progress",
      "completed",
    ]) {
      for (const role of [
        USER_ROLES.ADMINISTRATOR,
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        USER_ROLES.RESIDENT,
      ]) {
        expect(
          canPrintAppointmentSlip(role, { status, archived_at: null }),
        ).toBe(true);
      }
    }
    for (const status of [
      "pending",
      "cancelled",
      "no_show",
      "rescheduled",
      "rejected",
    ]) {
      expect(
        canPrintAppointmentSlip(USER_ROLES.ADMINISTRATOR, {
          status,
          archived_at: null,
        }),
      ).toBe(false);
    }
    expect(
      canPrintAppointmentSlip(
        USER_ROLES.ADMINISTRATOR,
        {
          status: "completed",
          archived_at: "2026-08-01",
        },
        "admin-1",
      ),
    ).toBe(false);
  });

  it("limits Nurse and Midwife appointment slips to their assigned scope", () => {
    const assigned = {
      status: "confirmed",
      archived_at: null,
      assigned_staff_id: "staff-1",
      service_type: "Maternal Care",
    };

    expect(canPrintAppointmentSlip(USER_ROLES.NURSE, assigned, "staff-1")).toBe(
      true,
    );
    expect(canPrintAppointmentSlip(USER_ROLES.NURSE, assigned, "staff-2")).toBe(
      false,
    );
    expect(
      canPrintAppointmentSlip(USER_ROLES.MIDWIFE, assigned, "staff-1"),
    ).toBe(true);
    expect(
      canPrintAppointmentSlip(
        USER_ROLES.MIDWIFE,
        { ...assigned, service_type: "General Consultation" },
        "staff-1",
      ),
    ).toBe(false);
    expect(canPrintAppointmentSlip("unknown", assigned, "staff-1")).toBe(false);
  });

  it("hides clinical summaries from metadata-only roles and drafts", () => {
    const signed = { status: "signed", encounter_type: "general_consultation" };
    expect(canPrintConsultationSummary(USER_ROLES.NURSE, signed)).toBe(true);
    expect(canPrintConsultationSummary(USER_ROLES.RESIDENT, signed)).toBe(true);
    expect(canPrintConsultationSummary(USER_ROLES.ADMINISTRATOR, signed)).toBe(
      false,
    );
    expect(
      canPrintConsultationSummary(USER_ROLES.BARANGAY_HEALTH_WORKER, signed),
    ).toBe(false);
    expect(
      canPrintConsultationSummary(USER_ROLES.NURSE, {
        ...signed,
        status: "draft",
      }),
    ).toBe(false);
  });

  it("allows only the attending nurse or scoped midwife to create a referral", () => {
    const encounter = {
      status: "signed",
      attending_staff_id: "staff-1",
      encounter_type: "maternal_care",
    };
    expect(canCreateReferral(USER_ROLES.NURSE, encounter, "staff-1")).toBe(
      true,
    );
    expect(canCreateReferral(USER_ROLES.NURSE, encounter, "staff-2")).toBe(
      false,
    );
    expect(canCreateReferral(USER_ROLES.MIDWIFE, encounter, "staff-1")).toBe(
      true,
    );
    expect(
      canCreateReferral(
        USER_ROLES.MIDWIFE,
        { ...encounter, encounter_type: "general_consultation" },
        "staff-1",
      ),
    ).toBe(false);
    expect(canCreateReferral(USER_ROLES.RESIDENT, encounter, "staff-1")).toBe(
      false,
    );
  });
});
