import { ROUTES } from "@/config/routes";
import { USER_ROLES } from "@/features/auth/permissions";

export const FINAL_SCOPE_FEATURES = Object.freeze({
  maternalChildCare: false,
  referrals: false,
  advancedClinicalReports: false,
  clinicalExtendedDocuments: false,
  medicineInventory: false,
  standaloneHouseholds: false,
  activity: false,
  administratorTools: false,
  settings: false,
});

export const FINAL_SCOPE_REPORT_CATEGORIES = Object.freeze([
  "overview",
  "residents",
  "appointments",
  "staff_workload",
]);

export const FINAL_SCOPE_REPORT_ROLES = Object.freeze([
  USER_ROLES.ADMINISTRATOR,
  USER_ROLES.BARANGAY_HEALTH_WORKER,
]);

export const HIDDEN_FINAL_SCOPE_ROUTES = Object.freeze([
  ROUTES.households,
  ROUTES.maternalChildCare,
  ROUTES.medicineInventory,
  ROUTES.activity,
  ROUTES.auditLogs,
  ROUTES.backupRestore,
  ROUTES.settings,
]);

export function isFinalScopeReportRole(role) {
  return FINAL_SCOPE_REPORT_ROLES.includes(role);
}
