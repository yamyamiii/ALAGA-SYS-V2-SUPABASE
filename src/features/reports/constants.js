import { USER_ROLES } from "@/features/auth/permissions";
import { FINAL_SCOPE_REPORT_CATEGORIES } from "@/config/finalScope";

export const REPORT_TIME_ZONE = "Asia/Manila";
export const REPORT_MAX_RANGE_DAYS = 1826;
export const REPORT_EXPORT_LIMIT = 5000;

const reportCategoryMetadata = Object.freeze({
  overview: { id: "overview", label: "Overview", group: "overview" },
  residents: { id: "residents", label: "Resident summary", group: "registry" },
  appointments: {
    id: "appointments",
    label: "Appointment reports",
    group: "appointments",
  },
  staff_workload: {
    id: "staff_workload",
    label: "Appointment workload",
    group: "workload",
  },
});

export const REPORT_CATEGORIES = Object.freeze(
  FINAL_SCOPE_REPORT_CATEGORIES.map((id) => reportCategoryMetadata[id]),
);

const roleCategories = Object.freeze({
  [USER_ROLES.ADMINISTRATOR]: REPORT_CATEGORIES.map(({ id }) => id),
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: [
    "overview",
    "residents",
    "appointments",
  ],
  [USER_ROLES.NURSE]: [],
  [USER_ROLES.MIDWIFE]: [],
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
