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
import { PERMISSIONS } from "@/features/auth/permissions";

export const navigationItems = [
  {
    label: "Dashboard",
    path: ROUTES.dashboard,
    icon: LayoutDashboard,
    permission: PERMISSIONS.VIEW_DASHBOARD,
  },
  {
    label: "Residents",
    path: ROUTES.residents,
    icon: UsersRound,
    permission: PERMISSIONS.MANAGE_RESIDENTS,
  },
  {
    label: "Appointments",
    path: ROUTES.appointments,
    icon: CalendarDays,
    permission: PERMISSIONS.MANAGE_APPOINTMENTS,
  },
  {
    label: "Health Records",
    path: ROUTES.healthRecords,
    icon: HeartPulse,
    permission: PERMISSIONS.MANAGE_CONSULTATIONS,
  },
  {
    label: "Maternal and Child Care",
    path: ROUTES.maternalChildCare,
    icon: Users,
    permission: PERMISSIONS.MANAGE_MATERNAL_CARE,
  },
  {
    label: "Medicine Inventory",
    path: ROUTES.medicineInventory,
    icon: Package,
    permission: PERMISSIONS.MANAGE_MEDICINES,
  },
  {
    label: "Announcements",
    path: ROUTES.announcements,
    icon: Megaphone,
    permission: PERMISSIONS.MANAGE_ANNOUNCEMENTS,
  },
  {
    label: "Reports",
    path: ROUTES.reports,
    icon: FileBarChart,
    permission: PERMISSIONS.VIEW_REPORTS,
  },
  {
    label: "Audit Logs",
    path: ROUTES.auditLogs,
    icon: ClipboardList,
    permission: PERMISSIONS.VIEW_AUDIT_LOGS,
  },
  {
    label: "User Management",
    path: ROUTES.userManagement,
    icon: ShieldCheck,
    permission: PERMISSIONS.MANAGE_USERS,
  },
  {
    label: "Settings",
    path: ROUTES.settings,
    icon: Settings,
    permission: PERMISSIONS.MANAGE_SETTINGS,
  },
];

export const quickActionPreviews = [
  { label: "New resident", icon: UsersRound },
  { label: "Schedule appointment", icon: CalendarDays },
  { label: "Post announcement", icon: BellRing },
];
