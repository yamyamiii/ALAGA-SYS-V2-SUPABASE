import { describe, expect, it, vi } from "vitest";

import { ROUTES } from "@/config/routes";
import { PERMISSIONS } from "@/features/auth/permissions";
import { resolveNotificationDestination } from "@/features/notifications/navigation";

describe("notification navigation", () => {
  const allowed = vi.fn().mockReturnValue(true);

  it.each([
    ["appointment_approved", ROUTES.appointments],
    ["appointment_rejected", ROUTES.appointments],
    ["appointment_rescheduled", ROUTES.appointments],
    ["appointment_cancelled", ROUTES.appointments],
    ["appointment_checked_in", ROUTES.appointments],
    ["new_announcement", ROUTES.announcements],
    ["health_encounter_signed", ROUTES.healthRecords],
  ])("resolves the trusted %s destination", (notificationType, path) => {
    expect(
      resolveNotificationDestination(
        { notification_type: notificationType, action_path: path },
        allowed,
      ),
    ).toBe(path);
  });

  it("rejects an action path that does not match its symbolic notification type", () => {
    expect(
      resolveNotificationDestination(
        {
          notification_type: "new_announcement",
          action_path: ROUTES.userManagement,
        },
        allowed,
      ),
    ).toBeNull();
  });

  it("rejects destinations unavailable to the current role", () => {
    const denied = vi.fn().mockReturnValue(false);
    expect(
      resolveNotificationDestination(
        {
          notification_type: "health_encounter_signed",
          action_path: ROUTES.healthRecords,
        },
        denied,
      ),
    ).toBeNull();
    expect(denied).toHaveBeenCalledWith(PERMISSIONS.VIEW_HEALTH_RECORDS);
  });

  it("does not fabricate destinations for unsupported notification types", () => {
    expect(
      resolveNotificationDestination(
        { notification_type: "unknown", action_path: "/arbitrary" },
        allowed,
      ),
    ).toBeNull();
  });
});
