export const USER_ROLES = Object.freeze({
  ADMINISTRATOR: "admin",
  BARANGAY_HEALTH_WORKER: "barangay_health_worker",
  NURSE: "nurse",
  MIDWIFE: "midwife",
  RESIDENT: "resident",
});

export const ROLE_LABELS = Object.freeze({
  [USER_ROLES.ADMINISTRATOR]: "Administrator",
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: "Barangay Health Worker",
  [USER_ROLES.NURSE]: "Nurse",
  [USER_ROLES.MIDWIFE]: "Midwife",
  [USER_ROLES.RESIDENT]: "Resident",
});

export const PERMISSIONS = Object.freeze({
  VIEW_DASHBOARD: "dashboard:view",
  VIEW_RESIDENTS: "residents:view",
  MANAGE_RESIDENTS: "residents:manage",
  VIEW_RESIDENT_PHOTOS: "residents:photos:view",
  MANAGE_RESIDENT_PHOTOS: "residents:photos:manage",
  LINK_RESIDENT_ACCOUNTS: "residents:accounts:link",
  VIEW_HOUSEHOLDS: "households:view",
  MANAGE_HOUSEHOLDS: "households:manage",
  RESTORE_ARCHIVED_REGISTRY: "registry:archived:restore",
  VIEW_APPOINTMENTS: "appointments:view",
  SCHEDULE_APPOINTMENTS: "appointments:schedule",
  OPERATE_APPOINTMENTS: "appointments:operate",
  ADMINISTER_APPOINTMENTS: "appointments:administer",
  MANAGE_ANNOUNCEMENTS: "announcements:manage",
  MANAGE_CONSULTATIONS: "consultations:manage",
  MANAGE_MATERNAL_CARE: "maternal_care:manage",
  VIEW_OWN_PROFILE: "profile:own:view",
  MANAGE_MEDICINES: "medicines:manage",
  VIEW_REPORTS: "reports:view",
  VIEW_AUDIT_LOGS: "audit_logs:view",
  MANAGE_USERS: "users:manage",
  MANAGE_SETTINGS: "settings:manage",
});

const allPermissions = Object.values(PERMISSIONS);

const rolePermissions = Object.freeze({
  [USER_ROLES.ADMINISTRATOR]: new Set(allPermissions),
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_RESIDENTS,
    PERMISSIONS.MANAGE_RESIDENTS,
    PERMISSIONS.VIEW_RESIDENT_PHOTOS,
    PERMISSIONS.MANAGE_RESIDENT_PHOTOS,
    PERMISSIONS.VIEW_HOUSEHOLDS,
    PERMISSIONS.MANAGE_HOUSEHOLDS,
    PERMISSIONS.VIEW_APPOINTMENTS,
    PERMISSIONS.SCHEDULE_APPOINTMENTS,
    PERMISSIONS.OPERATE_APPOINTMENTS,
    PERMISSIONS.MANAGE_ANNOUNCEMENTS,
  ]),
  [USER_ROLES.NURSE]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_RESIDENTS,
    PERMISSIONS.VIEW_RESIDENT_PHOTOS,
    PERMISSIONS.VIEW_APPOINTMENTS,
    PERMISSIONS.OPERATE_APPOINTMENTS,
    PERMISSIONS.MANAGE_CONSULTATIONS,
  ]),
  [USER_ROLES.MIDWIFE]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_RESIDENTS,
    PERMISSIONS.VIEW_RESIDENT_PHOTOS,
    PERMISSIONS.VIEW_APPOINTMENTS,
    PERMISSIONS.OPERATE_APPOINTMENTS,
    PERMISSIONS.MANAGE_MATERNAL_CARE,
  ]),
  [USER_ROLES.RESIDENT]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.VIEW_RESIDENT_PHOTOS,
    PERMISSIONS.VIEW_APPOINTMENTS,
  ]),
});

export function isSupportedRole(role) {
  return Object.hasOwn(ROLE_LABELS, role);
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? "Unknown role";
}

export function hasRole(role, allowedRoles = []) {
  return allowedRoles.includes(role);
}

export function hasPermission(role, permission) {
  return rolePermissions[role]?.has(permission) ?? false;
}
