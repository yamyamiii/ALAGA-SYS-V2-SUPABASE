import { ROUTES } from "@/config/routes";
import { USER_ROLES } from "@/features/auth/permissions";

const ALL_ROLES = Object.freeze(Object.values(USER_ROLES));

export const AI_NAVIGATION_TARGETS = Object.freeze({
  open_dashboard: {
    label: "Open Dashboard",
    route: ROUTES.dashboard,
    roles: ALL_ROLES,
  },
  open_appointments: {
    label: "Open Appointments",
    roleLabels: { [USER_ROLES.RESIDENT]: "Open My Appointments" },
    route: ROUTES.appointments,
    roles: ALL_ROLES,
  },
  open_appointment_requests: {
    label: "Open Incoming Appointment Requests",
    route: ROUTES.appointments,
    roles: [USER_ROLES.ADMINISTRATOR, USER_ROLES.BARANGAY_HEALTH_WORKER],
  },
  open_appointment_queue: {
    label: "Open Today's Queue",
    route: ROUTES.appointmentQueue,
    roles: [
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.NURSE,
      USER_ROLES.MIDWIFE,
    ],
  },
  open_notifications: {
    label: "Open Notifications",
    route: ROUTES.notifications,
    roles: ALL_ROLES,
  },
  open_announcements: {
    label: "Open Announcements",
    route: ROUTES.announcements,
    roles: ALL_ROLES,
  },
  open_faq: {
    label: "Open FAQ",
    route: ROUTES.faq,
    roles: ALL_ROLES,
  },
  open_health_center: {
    label: "Open Health Center Information",
    route: ROUTES.healthCenter,
    roles: ALL_ROLES,
  },
  open_inquiries: {
    label: "Open Inquiries",
    route: ROUTES.contact,
    roles: [
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.RESIDENT,
    ],
  },
  open_residents: {
    label: "Open Residents",
    route: ROUTES.residents,
    roles: [USER_ROLES.ADMINISTRATOR, USER_ROLES.BARANGAY_HEALTH_WORKER],
  },
  open_households: {
    label: "Open Households",
    route: ROUTES.households,
    roles: [USER_ROLES.ADMINISTRATOR, USER_ROLES.BARANGAY_HEALTH_WORKER],
  },
  open_health_records: {
    label: "Open Health Records",
    route: ROUTES.healthRecords,
    roles: ALL_ROLES,
  },
  open_maternal_child_care: {
    label: "Open Maternal and Child Care",
    route: ROUTES.maternalChildCare,
    roles: ALL_ROLES,
  },
  open_pregnancies: {
    label: "Open Pregnancies",
    route: ROUTES.maternalChildCare,
    roles: [USER_ROLES.ADMINISTRATOR, USER_ROLES.MIDWIFE],
  },
  open_immunizations: {
    label: "Open Immunizations",
    route: ROUTES.maternalChildCare,
    roles: [USER_ROLES.ADMINISTRATOR, USER_ROLES.MIDWIFE],
  },
  open_reports: {
    label: "Open Reports",
    route: ROUTES.reports,
    roles: [
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.NURSE,
      USER_ROLES.MIDWIFE,
    ],
  },
  open_user_management: {
    label: "Open User Management",
    route: ROUTES.userManagement,
    roles: [USER_ROLES.ADMINISTRATOR],
  },
  open_audit_logs: {
    label: "Open Audit Logs",
    route: ROUTES.auditLogs,
    roles: [USER_ROLES.ADMINISTRATOR],
  },
});

export function isKnownAiActionId(actionId) {
  return Object.hasOwn(AI_NAVIGATION_TARGETS, actionId);
}

export function resolveAiNavigationAction(action, role) {
  if (
    !action ||
    action.type !== "navigate" ||
    typeof action.actionId !== "string"
  ) {
    return null;
  }
  const target = AI_NAVIGATION_TARGETS[action.actionId];
  if (!target || !target.roles.includes(role)) return null;
  return {
    actionId: action.actionId,
    label: target.roleLabels?.[role] ?? target.label,
    route: target.route,
    requiresConfirmation: action.requiresConfirmation === true,
  };
}
