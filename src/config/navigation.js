import {
  Activity,
  Bell,
  Building2,
  DatabaseBackup,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  FileBarChart,
  HeartPulse,
  House,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
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
    label: "Households",
    path: ROUTES.households,
    icon: House,
    permission: PERMISSIONS.VIEW_HOUSEHOLDS,
  },
  {
    label: "Residents",
    path: ROUTES.residents,
    icon: UsersRound,
    permission: PERMISSIONS.VIEW_RESIDENTS,
  },
  {
    label: "Appointments",
    path: ROUTES.appointments,
    icon: CalendarDays,
    permission: PERMISSIONS.VIEW_APPOINTMENTS,
  },
  {
    label: "Health Records",
    path: ROUTES.healthRecords,
    icon: HeartPulse,
    permission: PERMISSIONS.VIEW_HEALTH_RECORDS,
  },
  {
    label: "Maternal and Child Care",
    path: ROUTES.maternalChildCare,
    icon: Users,
    permission: PERMISSIONS.VIEW_MATERNAL_CHILD_CARE,
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
    permission: PERMISSIONS.VIEW_ANNOUNCEMENTS,
  },
  {
    label: "Notifications",
    path: ROUTES.notifications,
    icon: Bell,
    permission: PERMISSIONS.VIEW_NOTIFICATIONS,
  },
  {
    label: "Activity",
    path: ROUTES.activity,
    icon: Activity,
    permission: PERMISSIONS.VIEW_ACTIVITY,
  },
  {
    label: "Health Center",
    path: ROUTES.healthCenter,
    icon: Building2,
    permission: PERMISSIONS.VIEW_HEALTH_CENTER,
  },
  {
    label: "FAQ",
    path: ROUTES.faq,
    icon: CircleHelp,
    permission: PERMISSIONS.VIEW_FAQ,
  },
  {
    label: "Contact",
    path: ROUTES.contact,
    icon: MessageSquare,
    permission: PERMISSIONS.VIEW_INQUIRIES,
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
    label: "Backup & Restore",
    path: ROUTES.backupRestore,
    icon: DatabaseBackup,
    permission: PERMISSIONS.MANAGE_BACKUPS,
  },
];
