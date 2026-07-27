import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_STATUSES,
  SERVICE_TYPES,
} from "@/features/appointments/constants";
import { getAppointmentActions } from "@/features/appointments/permissions";
import {
  appointmentSchema,
  residentAppointmentRequestSchema,
} from "@/features/appointments/schemas";
import {
  addDaysToDateKey,
  formatManilaTimestamp,
  manilaDateKey,
  monthGridRange,
} from "@/features/appointments/timezone";
import { USER_ROLES } from "@/features/auth/permissions";

const profileId = "11111111-1111-4111-8111-111111111111";

describe("appointment foundations", () => {
  it("keeps the exact appointment state vocabulary and service allowlist", () => {
    expect(APPOINTMENT_STATUSES).toEqual([
      "pending",
      "confirmed",
      "checked_in",
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
      "rescheduled",
    ]);
    expect(SERVICE_TYPES).toContain("Maternal Care");
    expect(SERVICE_TYPES).toContain("Other");
    expect(SERVICE_TYPES).toHaveLength(8);
  });

  it("validates time order and requires reasons outside walk-ins", () => {
    const base = {
      resident_id: "22222222-2222-4222-8222-222222222222",
      appointment_type: "scheduled",
      service_type: "General Consultation",
      scheduled_date: "2026-08-01",
      start_time: "08:00",
      end_time: "08:30",
      priority: "normal",
      assigned_staff_id: "",
      reason: "Routine visit",
      operational_notes: "",
    };
    expect(appointmentSchema.safeParse(base).success).toBe(true);
    expect(appointmentSchema.safeParse({ ...base, reason: "" }).success).toBe(
      false,
    );
    expect(
      appointmentSchema.safeParse({
        ...base,
        appointment_type: "walk_in",
        reason: "",
      }).success,
    ).toBe(true);
    expect(
      appointmentSchema.safeParse({ ...base, end_time: "07:59" }).success,
    ).toBe(false);
  });

  it("validates the resident-friendly request fields only", () => {
    const request = {
      service_type: "General Consultation",
      scheduled_date: "2026-08-01",
      start_time: "08:00",
      end_time: "08:30",
      reason: "Routine visit",
    };
    expect(residentAppointmentRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(
      residentAppointmentRequestSchema.safeParse({
        ...request,
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      residentAppointmentRequestSchema.safeParse({
        ...request,
        end_time: "07:59",
      }).success,
    ).toBe(false);
  });

  it("calculates date-only values without browser timezone drift", () => {
    expect(addDaysToDateKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(monthGridRange("2026-08")).toEqual({
      from: "2026-07-26",
      to: "2026-09-05",
    });
    expect(manilaDateKey(new Date("2026-07-25T16:15:00Z"))).toBe("2026-07-26");
    expect(formatManilaTimestamp("2026-07-25T16:15:00Z")).toMatch(
      /Jul 26, 2026/i,
    );
  });

  it("exposes only role- and assignment-valid operational actions", () => {
    const pending = {
      status: "pending",
      archived_at: null,
      assigned_staff_id: profileId,
      service_type: "General Consultation",
    };
    expect(
      getAppointmentActions(USER_ROLES.BARANGAY_HEALTH_WORKER, pending, "bhw"),
    ).toEqual(
      expect.arrayContaining(["edit", "reschedule", "cancel", "confirm"]),
    );
    expect(
      getAppointmentActions(USER_ROLES.NURSE, pending, profileId),
    ).not.toContain("confirm");

    const confirmed = { ...pending, status: "confirmed" };
    expect(
      getAppointmentActions(USER_ROLES.NURSE, confirmed, profileId),
    ).toEqual(expect.arrayContaining(["check_in", "no_show"]));
    expect(
      getAppointmentActions(USER_ROLES.NURSE, confirmed, "other-user"),
    ).toEqual([]);
    expect(
      getAppointmentActions(USER_ROLES.RESIDENT, confirmed, profileId),
    ).toEqual([]);
    expect(
      getAppointmentActions(
        USER_ROLES.RESIDENT,
        {
          ...pending,
          request_source: "resident",
        },
        profileId,
      ),
    ).toEqual(["cancel"]);
    expect(
      getAppointmentActions(USER_ROLES.MIDWIFE, confirmed, profileId),
    ).toEqual([]);
    expect(
      getAppointmentActions(
        USER_ROLES.MIDWIFE,
        { ...confirmed, service_type: "Maternal Care" },
        profileId,
      ),
    ).toContain("check_in");
  });
});
