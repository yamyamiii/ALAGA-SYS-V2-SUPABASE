import { describe, expect, it } from "vitest";

import { ROUTES } from "@/config/routes";
import { USER_ROLES } from "@/features/auth/permissions";
import {
  isKnownAiActionId,
  resolveAiNavigationAction,
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
