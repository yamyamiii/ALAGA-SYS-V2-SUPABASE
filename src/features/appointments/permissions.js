import {
  APPOINTMENT_ACTIONS,
  APPOINTMENT_STATUS_LABELS,
} from "@/features/appointments/constants";
import { USER_ROLES } from "@/features/auth/permissions";

export function appointmentIsAssignedTo(appointment, profileId) {
  return Boolean(profileId && appointment?.assigned_staff_id === profileId);
}

export function getAppointmentActions(role, appointment, profileId) {
  if (!appointment) return [];
  const status = appointment.status;
  const archived = Boolean(appointment.archived_at);
  const assigned = appointmentIsAssignedTo(appointment, profileId);
  const maternalRelevant =
    role !== USER_ROLES.MIDWIFE ||
    ["Maternal Care", "Child Health"].includes(appointment.service_type);

  if (role === USER_ROLES.RESIDENT) {
    return !archived &&
      appointment.request_source === "resident" &&
      status === "pending"
      ? [APPOINTMENT_ACTIONS.CANCEL]
      : [];
  }

  if (role === USER_ROLES.ADMINISTRATOR) {
    if (archived) return [APPOINTMENT_ACTIONS.RESTORE];
    const actions = [APPOINTMENT_ACTIONS.NOTES];
    if (["pending", "confirmed"].includes(status)) {
      actions.push(
        APPOINTMENT_ACTIONS.EDIT,
        APPOINTMENT_ACTIONS.RESCHEDULE,
        APPOINTMENT_ACTIONS.CANCEL,
      );
    }
    if (status === "pending") actions.push(APPOINTMENT_ACTIONS.CONFIRM);
    if (status === "confirmed") {
      actions.push(APPOINTMENT_ACTIONS.CHECK_IN, APPOINTMENT_ACTIONS.NO_SHOW);
    }
    if (status === "checked_in") {
      actions.push(APPOINTMENT_ACTIONS.START, APPOINTMENT_ACTIONS.CANCEL);
    }
    if (status === "in_progress") {
      actions.push(APPOINTMENT_ACTIONS.COMPLETE, APPOINTMENT_ACTIONS.CANCEL);
    }
    if (["completed", "cancelled", "no_show", "rescheduled"].includes(status)) {
      actions.push(APPOINTMENT_ACTIONS.ARCHIVE);
    }
    return [...new Set(actions)];
  }

  if (archived) return [];
  if (role === USER_ROLES.BARANGAY_HEALTH_WORKER) {
    const actions = [];
    if (["pending", "confirmed"].includes(status)) {
      actions.push(
        APPOINTMENT_ACTIONS.EDIT,
        APPOINTMENT_ACTIONS.RESCHEDULE,
        APPOINTMENT_ACTIONS.CANCEL,
        APPOINTMENT_ACTIONS.NOTES,
      );
    }
    if (status === "pending") actions.push(APPOINTMENT_ACTIONS.CONFIRM);
    if (status === "confirmed") actions.push(APPOINTMENT_ACTIONS.CHECK_IN);
    if (status === "checked_in") actions.push(APPOINTMENT_ACTIONS.CANCEL);
    return actions;
  }

  if (
    [USER_ROLES.NURSE, USER_ROLES.MIDWIFE].includes(role) &&
    assigned &&
    maternalRelevant
  ) {
    const actions = [APPOINTMENT_ACTIONS.NOTES];
    if (status === "confirmed") {
      actions.push(APPOINTMENT_ACTIONS.CHECK_IN, APPOINTMENT_ACTIONS.NO_SHOW);
    }
    if (status === "checked_in") actions.push(APPOINTMENT_ACTIONS.START);
    if (status === "in_progress") actions.push(APPOINTMENT_ACTIONS.COMPLETE);
    return actions;
  }

  return [];
}

export function transitionDescription(action, appointment) {
  const next = {
    confirm: "Confirmed",
    check_in: "Checked in",
    start: "In progress",
    complete: "Completed",
    no_show: "No show",
  }[action];
  return next
    ? `${appointment.appointment_number} will move from ${APPOINTMENT_STATUS_LABELS[appointment.status]} to ${next}.`
    : "This appointment will be updated through the authorized workflow.";
}
