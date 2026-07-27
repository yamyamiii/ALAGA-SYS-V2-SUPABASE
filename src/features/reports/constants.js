import { USER_ROLES } from "@/features/auth/permissions";

export const REPORT_TIME_ZONE = "Asia/Manila";
export const REPORT_MAX_RANGE_DAYS = 1826;
export const REPORT_EXPORT_LIMIT = 5000;

export const REPORT_CATEGORIES = Object.freeze([
  { id: "overview", label: "Overview", group: "overview" },
  { id: "residents", label: "Residents", group: "registry" },
  { id: "appointments", label: "Appointments", group: "appointments" },
  { id: "health_records", label: "Health records", group: "health" },
  { id: "maternal_care", label: "Maternal care", group: "maternal" },
  { id: "child_care", label: "Child care", group: "child" },
  { id: "staff_workload", label: "Staff workload", group: "workload" },
]);

const roleCategories = Object.freeze({
  [USER_ROLES.ADMINISTRATOR]: REPORT_CATEGORIES.map(({ id }) => id),
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: [
    "overview",
    "residents",
    "appointments",
    "maternal_care",
    "child_care",
  ],
  [USER_ROLES.NURSE]: [
    "overview",
    "appointments",
    "health_records",
    "staff_workload",
  ],
  [USER_ROLES.MIDWIFE]: [
    "overview",
    "appointments",
    "maternal_care",
    "child_care",
    "staff_workload",
  ],
  [USER_ROLES.RESIDENT]: [],
});

export function categoriesForRole(role) {
  const allowed = new Set(roleCategories[role] ?? []);
  return REPORT_CATEGORIES.filter(({ id }) => allowed.has(id));
}

export const QUICK_RANGES = Object.freeze([
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["quarter", "This quarter"],
  ["year", "This year"],
]);

export const REPORT_FORMATS = Object.freeze([
  ["csv", "CSV"],
  ["excel", "Excel"],
  ["pdf", "PDF"],
  ["print", "Print"],
]);
