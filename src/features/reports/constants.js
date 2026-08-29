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
  [USER_ROLES.NURSE]: ["appointments"],
  [USER_ROLES.MIDWIFE]: ["appointments"],
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

export const REPORT_SUMMARY_METRICS = Object.freeze({
  overview: Object.freeze([
    ["active_residents", "Active residents"],
    ["total_appointments", "Total appointments"],
    ["pending_requests", "Pending requests"],
    ["confirmed_appointments", "Confirmed appointments"],
    ["completed_appointments", "Completed appointments"],
    ["cancelled_appointments", "Cancelled appointments"],
    ["appointments_today", "Appointments today"],
    ["checked_in_queue", "Checked-in queue"],
  ]),
  residents: Object.freeze([
    ["active_residents", "Active residents"],
    ["male", "Male residents"],
    ["female", "Female residents"],
    ["senior_citizens", "Senior citizens"],
    ["pwd_residents", "PWD residents"],
    ["without_household", "Residents without household assignment"],
    ["inactive", "Inactive residents"],
    ["moved_out", "Moved-out residents"],
    ["deceased", "Deceased residents"],
    ["archived", "Archived residents"],
  ]),
});

export function reportSummaryEntries(category, summary = {}) {
  const metrics = REPORT_SUMMARY_METRICS[category];
  if (!metrics) {
    return Object.entries(summary)
      .filter(([, value]) => typeof value !== "object")
      .map(([key, value]) => ({ key, value }));
  }

  return metrics.map(([key, label]) => ({
    key,
    label,
    value: summary[key] ?? 0,
  }));
}
