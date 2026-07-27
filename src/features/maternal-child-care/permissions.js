import { USER_ROLES } from "@/features/auth/permissions";

export function canCreateMaternalChildProfile(role) {
  return role === USER_ROLES.MIDWIFE;
}

export function canDocumentMaternalChildCare(role) {
  return [USER_ROLES.MIDWIFE, USER_ROLES.NURSE].includes(role);
}

export function canRecordGrowth(role) {
  return [
    USER_ROLES.MIDWIFE,
    USER_ROLES.NURSE,
    USER_ROLES.BARANGAY_HEALTH_WORKER,
  ].includes(role);
}

export function canArchiveMaternalChildCare(role) {
  return role === USER_ROLES.ADMINISTRATOR;
}

export function canViewClinicalMaternalChildDetails(role) {
  return [USER_ROLES.MIDWIFE, USER_ROLES.NURSE].includes(role);
}
