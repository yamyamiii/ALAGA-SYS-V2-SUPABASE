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
});

export function resolveNotificationDestination(notification, can) {
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
