import { USER_ROLES } from "@/features/auth/permissions";

const CLINICAL_ROLES = [USER_ROLES.NURSE, USER_ROLES.MIDWIFE];
const MIDWIFE_TYPES = ["maternal_care", "child_health"];

export function canCreateEncounter(role) {
  return CLINICAL_ROLES.includes(role);
}

export function canViewClinicalNarrative(role, encounter) {
  if (role === USER_ROLES.NURSE || role === USER_ROLES.RESIDENT) return true;
  return (
    role === USER_ROLES.MIDWIFE &&
    MIDWIFE_TYPES.includes(encounter?.encounter_type)
  );
}

export function canEditEncounter(role, encounter, profileId) {
  return (
    CLINICAL_ROLES.includes(role) &&
    encounter?.status === "draft" &&
    encounter.attending_staff_id === profileId &&
    (role !== USER_ROLES.MIDWIFE ||
      MIDWIFE_TYPES.includes(encounter.encounter_type))
  );
}

export function canSignEncounter(role, encounter, profileId) {
  return canEditEncounter(role, encounter, profileId);
}

export function canAmendEncounter(role, encounter) {
  return (
    CLINICAL_ROLES.includes(role) &&
    encounter?.status === "signed" &&
    (role !== USER_ROLES.MIDWIFE ||
      MIDWIFE_TYPES.includes(encounter.encounter_type))
  );
}

export function canArchiveEncounter(role, encounter) {
  return (
    role === USER_ROLES.ADMINISTRATOR &&
    ["signed", "amended"].includes(encounter?.status)
  );
}

export function canRecordVitals(role, encounter, profileId) {
  if (encounter?.status !== "draft") return false;
  if (role === USER_ROLES.BARANGAY_HEALTH_WORKER) {
    return (
      Boolean(encounter.appointment_id) &&
      ["checked_in", "in_progress"].includes(encounter.appointment?.status)
    );
  }
  return canEditEncounter(role, encounter, profileId);
}

export function canManageClinicalHistory(role) {
  return CLINICAL_ROLES.includes(role);
}
