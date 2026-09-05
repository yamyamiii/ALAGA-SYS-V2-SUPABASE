import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_START_TIME_OPTIONS,
  APPOINTMENT_START_TIMES,
  APPOINTMENT_STATUSES,
  INITIAL_APPOINTMENT_FILTERS,
  nextAppointmentStartTime,
  SERVICE_TYPES,
} from "@/features/appointments/constants";
import { buildAppointmentListParameters } from "@/services/appointmentService";
import { getAppointmentActions } from "@/features/appointments/permissions";
import {
  appointmentSchema,
  cancellationSchema,
  rejectionSchema,
  residentAppointmentRequestSchema,
  residentRequestStaffEditSchema,
  rescheduleSchema,
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

  it("defines every 30-minute start slot from 8:00 AM through 4:00 PM", () => {
    expect(APPOINTMENT_START_TIMES).toHaveLength(17);
    expect(APPOINTMENT_START_TIME_OPTIONS.at(0)).toEqual({
      value: "08:00",
      label: "8:00 AM",
    });
    expect(APPOINTMENT_START_TIME_OPTIONS).toContainEqual({
      value: "12:30",
      label: "12:30 PM",
    });
    expect(APPOINTMENT_START_TIME_OPTIONS.at(-1)).toEqual({
      value: "16:00",
      label: "4:00 PM",
    });
    expect(nextAppointmentStartTime("07:45")).toBe("08:00");
    expect(nextAppointmentStartTime("09:01")).toBe("09:30");
    expect(nextAppointmentStartTime("16:45")).toBe("16:00");
  });

  it.each([
    ["minimum", "08:00", true],
    ["intermediate", "11:30", true],
    ["maximum", "16:00", true],
    ["before opening", "07:30", false],
    ["after final slot", "16:30", false],
    ["off interval", "08:15", false],
  ])("validates the %s appointment start time", (_, startTime, valid) => {
    const staffAppointment = {
      resident_id: "22222222-2222-4222-8222-222222222222",
      appointment_type: "scheduled",
      service_type: "General Consultation",
      scheduled_date: "2026-08-01",
      start_time: startTime,
      end_time: "16:30",
      priority: "normal",
      assigned_staff_id: "",
      reason: "Routine visit",
    };
    const residentRequest = {
      service_type: "General Consultation",
      scheduled_date: "2026-08-01",
      start_time: startTime,
      reason: "",
    };
    const reschedule = {
      scheduled_date: "2026-08-01",
      start_time: startTime,
      end_time: "16:30",
    };

    expect(appointmentSchema.safeParse(staffAppointment).success).toBe(valid);
    expect(
      residentAppointmentRequestSchema.safeParse(residentRequest).success,
    ).toBe(valid);
    expect(rescheduleSchema.safeParse(reschedule).success).toBe(valid);
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
    ).toBe(true);
    expect(
      residentAppointmentRequestSchema.safeParse({
        ...request,
        reason: " ".repeat(1001),
      }).success,
    ).toBe(true);
    expect(
      residentAppointmentRequestSchema.safeParse({
        ...request,
        reason: "x".repeat(1001),
      }).success,
    ).toBe(false);
    const attemptedOverride = residentAppointmentRequestSchema.safeParse({
      ...request,
      end_time: "23:59",
    });
    expect(attemptedOverride.success).toBe(true);
    expect(attemptedOverride.data).not.toHaveProperty("end_time");
  });

  it("allows only Resident-origin staff edits to retain an empty reason", () => {
    const edit = {
      resident_id: "22222222-2222-4222-8222-222222222222",
      appointment_type: "scheduled",
      service_type: "General Consultation",
      scheduled_date: "2026-08-15",
      start_time: "09:00",
      end_time: "09:30",
      priority: "normal",
      assigned_staff_id: "33333333-3333-4333-8333-333333333333",
      reason: "",
      operational_notes: "",
    };

    expect(residentRequestStaffEditSchema.safeParse(edit).success).toBe(true);
    expect(appointmentSchema.safeParse(edit).success).toBe(false);
    expect(
      residentRequestStaffEditSchema.safeParse({
        ...edit,
        reason: " Existing reason ",
      }).data.reason,
    ).toBe("Existing reason");
    expect(
      residentRequestStaffEditSchema.safeParse({
        ...edit,
        reason: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("separates optional cancellation from required request rejection", () => {
    expect(
      cancellationSchema.safeParse({ cancellation_reason: "" }).success,
    ).toBe(true);
    expect(
      cancellationSchema.safeParse({ cancellation_reason: "   " }).success,
    ).toBe(true);
    expect(
      cancellationSchema.safeParse({
        cancellation_reason: " Change of plans ",
      }).data.cancellation_reason,
    ).toBe("Change of plans");
    expect(
      cancellationSchema.safeParse({
        cancellation_reason: "x".repeat(1001),
      }).success,
    ).toBe(false);
    expect(rejectionSchema.safeParse({ rejection_reason: "" }).success).toBe(
      false,
    );
    expect(
      rejectionSchema.safeParse({ rejection_reason: " Reviewed and denied " })
        .data.rejection_reason,
    ).toBe("Reviewed and denied");
  });

  it("accepts only operational date and time fields for rescheduling", () => {
    const parsed = rescheduleSchema.parse({
      scheduled_date: "2026-08-20",
      start_time: "09:00",
      end_time: "09:30",
      assigned_staff_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(parsed).toEqual({
      scheduled_date: "2026-08-20",
      start_time: "09:00",
      end_time: "09:30",
    });
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
      getAppointmentActions(USER_ROLES.NURSE, confirmed, profileId),
    ).not.toContain("cancel");
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
    expect(
      getAppointmentActions(
        USER_ROLES.MIDWIFE,
        { ...confirmed, service_type: "Maternal Care" },
        profileId,
      ),
    ).not.toContain("cancel");

    const checkedIn = { ...confirmed, status: "checked_in" };
    expect(
      getAppointmentActions(USER_ROLES.ADMINISTRATOR, checkedIn, profileId),
    ).not.toContain("start");
    expect(
      getAppointmentActions(USER_ROLES.ADMINISTRATOR, checkedIn, profileId),
    ).toContain("complete");
    expect(
      getAppointmentActions(USER_ROLES.NURSE, checkedIn, profileId),
    ).not.toContain("start");
    expect(
      getAppointmentActions(USER_ROLES.NURSE, checkedIn, profileId),
    ).toContain("complete");
    expect(
      getAppointmentActions(
        USER_ROLES.MIDWIFE,
        { ...checkedIn, service_type: "Maternal Care" },
        profileId,
      ),
    ).not.toContain("start");
    expect(
      getAppointmentActions(
        USER_ROLES.MIDWIFE,
        { ...checkedIn, service_type: "Maternal Care" },
        profileId,
      ),
    ).toContain("complete");
    expect(
      getAppointmentActions(
        USER_ROLES.BARANGAY_HEALTH_WORKER,
        checkedIn,
        profileId,
      ),
    ).not.toContain("complete");
    expect(
      getAppointmentActions(
        USER_ROLES.NURSE,
        { ...checkedIn, status: "in_progress" },
        profileId,
      ),
    ).toContain("complete");

    for (const [role, roleAppointment, actorId] of [
      [USER_ROLES.ADMINISTRATOR, confirmed, profileId],
      [USER_ROLES.BARANGAY_HEALTH_WORKER, confirmed, profileId],
      [USER_ROLES.NURSE, confirmed, profileId],
      [
        USER_ROLES.MIDWIFE,
        { ...confirmed, service_type: "Maternal Care" },
        profileId,
      ],
      [
        USER_ROLES.RESIDENT,
        { ...pending, request_source: "resident" },
        profileId,
      ],
    ]) {
      expect(
        getAppointmentActions(role, roleAppointment, actorId),
      ).not.toContain("notes");
    }
  });

  it("does not hide nurse assignments with default frontend filters", () => {
    expect(INITIAL_APPOINTMENT_FILTERS).toEqual(
      expect.objectContaining({
        date_from: "",
        date_to: "",
        status: "",
        service_type: "",
        assigned_staff_id: "",
        include_archived: false,
      }),
    );
    expect(buildAppointmentListParameters(INITIAL_APPOINTMENT_FILTERS)).toEqual(
      expect.objectContaining({
        p_date_from: null,
        p_date_to: null,
        p_status: null,
        p_service_type: null,
        p_assigned_staff_id: null,
      }),
    );
  });
});
