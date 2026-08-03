import { describe, expect, it } from "vitest";

import { ROUTES } from "@/config/routes";
import { USER_ROLES } from "@/features/auth/permissions";
import {
  isKnownAiActionId,
  resolveAiAction,
  resolveAiNavigationAction,
  resolveAiUiAction,
} from "@/features/ai-assistant/navigation";

const navigate = (actionId) => ({
  type: "navigate",
  actionId,
  label: "Untrusted server label",
  requiresConfirmation: false,
});

describe("ALAGA AI frontend navigation boundary", () => {
  it("maps a symbolic action ID to a locally known route and label", () => {
    expect(
      resolveAiNavigationAction(
        navigate("open_notifications"),
        USER_ROLES.RESIDENT,
      ),
    ).toEqual({
      actionId: "open_notifications",
      label: "Open Notifications",
      route: ROUTES.notifications,
      requiresConfirmation: false,
    });
  });

  it("uses the resident-specific label for the existing appointments action", () => {
    expect(
      resolveAiNavigationAction(
        navigate("open_appointments"),
        USER_ROLES.RESIDENT,
      ),
    ).toEqual({
      actionId: "open_appointments",
      label: "Open My Appointments",
      route: ROUTES.appointments,
      requiresConfirmation: false,
    });
    expect(
      resolveAiNavigationAction(navigate("open_appointments"), USER_ROLES.NURSE)
        ?.label,
    ).toBe("Open Appointments");
  });

  it("resolves the resident-only appointment form action", () => {
    const action = {
      type: "ui_action",
      actionId: "open_appointment_request_form",
      label: "Untrusted server label",
      requiresConfirmation: false,
    };
    expect(resolveAiUiAction(action, USER_ROLES.RESIDENT)).toEqual({
      type: "ui_action",
      actionId: "open_appointment_request_form",
      label: "Request an Appointment",
      route: ROUTES.appointments,
      requiresConfirmation: false,
    });
    expect(resolveAiAction(action, USER_ROLES.RESIDENT)).toEqual(
      resolveAiUiAction(action, USER_ROLES.RESIDENT),
    );
    for (const role of [
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.NURSE,
      USER_ROLES.MIDWIFE,
    ]) {
      expect(resolveAiUiAction(action, role)).toBeNull();
    }
  });

  it("rejects action type confusion and unexpected UI action fields", () => {
    expect(
      resolveAiNavigationAction(
        navigate("open_appointment_request_form"),
        USER_ROLES.RESIDENT,
      ),
    ).toBeNull();
    expect(
      resolveAiUiAction(
        {
          type: "ui_action",
          actionId: "open_appointments",
          component: "ResidentAppointmentRequestDialog",
        },
        USER_ROLES.RESIDENT,
      ),
    ).toBeNull();
  });

  it("does not allow residents to open reports", () => {
    expect(
      resolveAiNavigationAction(navigate("open_reports"), USER_ROLES.RESIDENT),
    ).toBeNull();
  });

  it("does not allow nurses to open user management", () => {
    expect(
      resolveAiNavigationAction(
        navigate("open_user_management"),
        USER_ROLES.NURSE,
      ),
    ).toBeNull();
  });

  it("allows an administrator to open reports", () => {
    expect(
      resolveAiNavigationAction(
        navigate("open_reports"),
        USER_ROLES.ADMINISTRATOR,
      )?.route,
    ).toBe(ROUTES.reports);
  });

  it("allows a Barangay Health Worker to open authorized reports", () => {
    expect(
      resolveAiNavigationAction(
        navigate("open_reports"),
        USER_ROLES.BARANGAY_HEALTH_WORKER,
      )?.route,
    ).toBe(ROUTES.reports);
  });

  it.each([
    ["open_appointment_calendar", ROUTES.appointmentCalendar],
    ["open_appointment_queue", ROUTES.appointmentQueue],
    ["open_health_record_encounters", ROUTES.healthRecordEncounters],
    ["open_health_record_vital_signs", ROUTES.healthRecordVitalSigns],
    ["open_pregnancies", ROUTES.maternalPregnancies],
    ["open_child_records", ROUTES.maternalChildRecords],
    ["open_appointment_reports", ROUTES.appointmentReports],
    ["open_monthly_reports", ROUTES.monthlyReports],
  ])("maps nested action %s to its fixed route", (actionId, route) => {
    expect(
      resolveAiNavigationAction(navigate(actionId), USER_ROLES.ADMINISTRATOR)
        ?.route,
    ).toBe(route);
  });

  it("keeps staff-only nested destinations unavailable to residents", () => {
    for (const actionId of [
      "open_appointment_calendar",
      "open_appointment_queue",
      "open_appointment_reports",
      "open_monthly_reports",
    ]) {
      expect(
        resolveAiNavigationAction(navigate(actionId), USER_ROLES.RESIDENT),
      ).toBeNull();
    }
  });

  it("rejects unknown IDs, raw URLs, and model-generated routes", () => {
    expect(isKnownAiActionId("open_everything")).toBe(false);
    expect(
      resolveAiNavigationAction(
        {
          ...navigate("open_everything"),
          route: "https://evil.example",
        },
        USER_ROLES.ADMINISTRATOR,
      ),
    ).toBeNull();
    expect(
      resolveAiNavigationAction(
        {
          type: "navigate",
          actionId: "https://evil.example",
          label: "Open",
        },
        USER_ROLES.ADMINISTRATOR,
      ),
    ).toBeNull();
  });
});
