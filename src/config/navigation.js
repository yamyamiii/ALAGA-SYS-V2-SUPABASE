import {
  Bell,
  CalendarDays,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { ROUTES } from "@/config/routes";
import { PERMISSIONS, USER_ROLES } from "@/features/auth/permissions";

const ALL_ROLES = Object.freeze(Object.values(USER_ROLES));
const STAFF_ROLES = Object.freeze([
  USER_ROLES.ADMINISTRATOR,
  USER_ROLES.BARANGAY_HEALTH_WORKER,
  USER_ROLES.NURSE,
  USER_ROLES.MIDWIFE,
]);

export const navigationItems = [
  {
    label: "Dashboard",
    path: ROUTES.dashboard,
    icon: LayoutDashboard,
    permission: PERMISSIONS.VIEW_DASHBOARD,
    roles: ALL_ROLES,
  },
  {
    label: "Appointments",
    roleLabels: { [USER_ROLES.RESIDENT]: "My Appointments" },
    path: ROUTES.appointments,
    icon: CalendarDays,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
    roles: ALL_ROLES,
  },
  {
    label: "Residents",
    path: ROUTES.residents,
    icon: UsersRound,
    permission: PERMISSIONS.VIEW_RESIDENTS,
    roles: [USER_ROLES.ADMINISTRATOR, USER_ROLES.BARANGAY_HEALTH_WORKER],
  },
  {
    label: "Health Records",
    path: ROUTES.healthRecords,
    icon: HeartPulse,
    permission: PERMISSIONS.VIEW_HEALTH_RECORDS,
    roles: STAFF_ROLES,
  },
  {
    label: "Announcements",
    path: ROUTES.announcements,
    icon: Megaphone,
    permission: PERMISSIONS.VIEW_ANNOUNCEMENTS,
    roles: ALL_ROLES,
  },
  {
    label: "Notifications",
    path: ROUTES.notifications,
    icon: Bell,
    permission: PERMISSIONS.VIEW_NOTIFICATIONS,
    roles: [USER_ROLES.RESIDENT],
  },
  {
    label: "Reports",
    path: ROUTES.reports,
    icon: FileBarChart,
    permission: PERMISSIONS.VIEW_REPORTS,
    roles: STAFF_ROLES,
  },
  {
    label: "User Management",
    path: ROUTES.userManagement,
    icon: ShieldCheck,
    permission: PERMISSIONS.MANAGE_USERS,
    roles: [USER_ROLES.ADMINISTRATOR],
  },
];

export function primaryNavigationForRole(role, can) {
  return navigationItems
    .filter((item) => item.roles.includes(role) && can(item.permission))
    .map((item) => ({
      ...item,
      label: item.roleLabels?.[role] ?? item.label,
    }));
}
