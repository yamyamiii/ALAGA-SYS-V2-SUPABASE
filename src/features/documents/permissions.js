import { USER_ROLES } from "@/features/auth/permissions";

const FINAL_ENCOUNTER_STATUSES = ["signed", "amended"];
const MIDWIFE_ENCOUNTER_TYPES = ["maternal_care", "child_health"];

export function canPrintConsultationSummary(role, encounter) {
  if (!FINAL_ENCOUNTER_STATUSES.includes(encounter?.status)) return false;
  if (role === USER_ROLES.NURSE || role === USER_ROLES.RESIDENT) return true;
  return (
    role === USER_ROLES.MIDWIFE &&
    MIDWIFE_ENCOUNTER_TYPES.includes(encounter.encounter_type)
  );
}

export function canCreateReferral(role, encounter, profileId) {
  return (
    [USER_ROLES.NURSE, USER_ROLES.MIDWIFE].includes(role) &&
    FINAL_ENCOUNTER_STATUSES.includes(encounter?.status) &&
    encounter.attending_staff_id === profileId &&
    (role !== USER_ROLES.MIDWIFE ||
      MIDWIFE_ENCOUNTER_TYPES.includes(encounter.encounter_type))
  );
}

export function canQueryReferral(role, encounter) {
  return canPrintConsultationSummary(role, encounter);
}

export function canPrintAppointmentSlip(role, appointment, profileId) {
  if (
    !appointment ||
    appointment.archived_at ||
    !["confirmed", "checked_in", "in_progress", "completed"].includes(
      appointment.status,
    )
  ) {
    return false;
  }
  if (
    role === USER_ROLES.ADMINISTRATOR ||
    role === USER_ROLES.BARANGAY_HEALTH_WORKER ||
    role === USER_ROLES.RESIDENT
  ) {
    return true;
  }
  if (appointment.assigned_staff_id !== profileId) return false;
  if (role === USER_ROLES.NURSE) return true;
  return (
    role === USER_ROLES.MIDWIFE &&
    ["Maternal Care", "Child Health"].includes(appointment.service_type)
  );
}
