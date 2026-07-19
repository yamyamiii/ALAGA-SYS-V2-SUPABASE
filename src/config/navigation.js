import {
  BellRing,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";

import { ROUTES } from "@/config/routes";

export const USER_ROLES = Object.freeze({
  ADMIN: "admin",
  HEALTH_WORKER: "health_worker",
  STAFF: "staff",
});

const allRoles = Object.values(USER_ROLES);

export const navigationItems = [
  {
    label: "Dashboard",
    path: ROUTES.dashboard,
    icon: LayoutDashboard,
    roles: allRoles,
  },
  {
    label: "Residents",
    path: ROUTES.residents,
    icon: UsersRound,
    roles: allRoles,
  },
  {
    label: "Appointments",
    path: ROUTES.appointments,
    icon: CalendarDays,
    roles: allRoles,
  },
  {
    label: "Health Records",
    path: ROUTES.healthRecords,
    icon: HeartPulse,
    roles: allRoles,
  },
  {
    label: "Maternal and Child Care",
    path: ROUTES.maternalChildCare,
    icon: Users,
    roles: [USER_ROLES.ADMIN, USER_ROLES.HEALTH_WORKER],
  },
  {
    label: "Medicine Inventory",
    path: ROUTES.medicineInventory,
    icon: Package,
    roles: allRoles,
  },
  {
    label: "Announcements",
    path: ROUTES.announcements,
    icon: Megaphone,
    roles: allRoles,
  },
  {
    label: "Reports",
    path: ROUTES.reports,
    icon: FileBarChart,
    roles: allRoles,
  },
  {
    label: "Audit Logs",
    path: ROUTES.auditLogs,
    icon: ClipboardList,
    roles: [USER_ROLES.ADMIN],
  },
  {
    label: "User Management",
    path: ROUTES.userManagement,
    icon: ShieldCheck,
    roles: [USER_ROLES.ADMIN],
  },
  { label: "Settings", path: ROUTES.settings, icon: Settings, roles: allRoles },
];

export const quickActionPreviews = [
  { label: "New resident", icon: UsersRound },
  { label: "Schedule appointment", icon: CalendarDays },
  { label: "Post announcement", icon: BellRing },
];
