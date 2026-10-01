import { ROUTES } from "@/config/routes";
import { PERMISSIONS } from "@/features/auth/permissions";

const NOTIFICATION_DESTINATIONS = Object.freeze({
  appointment_approved: {
    path: ROUTES.appointments,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
  },
  appointment_rejected: {
    path: ROUTES.appointments,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
  },
  appointment_rescheduled: {
    path: ROUTES.appointments,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
  },
  appointment_cancelled: {
    path: ROUTES.appointments,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
  },
  appointment_checked_in: {
    path: ROUTES.appointments,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
  },
  new_announcement: {
    path: ROUTES.announcements,
    permission: PERMISSIONS.VIEW_ANNOUNCEMENTS,
  },
  health_encounter_signed: {
    path: ROUTES.healthRecords,
    permission: PERMISSIONS.VIEW_HEALTH_RECORDS,
  },
  resident_registration_pending: {
    path: ROUTES.userManagement,
    permission: PERMISSIONS.MANAGE_USERS,
  },
});

export function resolveNotificationDestination(notification, can) {
  // The existing notification-list RPC intentionally omits source identifiers.
  // Its exact allowlisted path can still open the event index safely; never
  // derive an event ID or arbitrary URL from notification text.
  if (
    notification?.action_path === ROUTES.healthEvents &&
    notification.source_type == null &&
    notification.source_id == null &&
    ["appointment_approved", "appointment_cancelled"].includes(
      notification.notification_type,
    )
  ) {
    return typeof can === "function" && can(PERMISSIONS.VIEW_APPOINTMENTS)
      ? ROUTES.healthEvents
      : null;
  }
  if (notification?.source_type === "health_events") {
    return ["appointment_approved", "appointment_cancelled"].includes(
      notification.notification_type,
    ) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        notification.source_id ?? "",
      ) &&
      notification.action_path === ROUTES.healthEvents &&
      typeof can === "function" &&
      can(PERMISSIONS.VIEW_APPOINTMENTS)
      ? `${ROUTES.healthEvents}?event=${notification.source_id}`
      : null;
  }
  const target = NOTIFICATION_DESTINATIONS[notification?.notification_type];
  if (
    !target ||
    notification.action_path !== target.path ||
    typeof can !== "function" ||
    !can(target.permission)
  ) {
    return null;
  }
  return target.path;
}
