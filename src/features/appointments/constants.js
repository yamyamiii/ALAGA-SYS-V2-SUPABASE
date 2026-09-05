export { MANILA_TIME_ZONE } from "@/lib/dateTime";
export const STAFF_SEARCH_DEFAULT_PAGE_SIZE = 10;
export const STAFF_SEARCH_MAX_PAGE_SIZE = 25;

export const APPOINTMENT_START_TIME_MINUTES = 8 * 60;
export const APPOINTMENT_START_TIME_MAX_MINUTES = 16 * 60;
export const APPOINTMENT_START_TIME_INTERVAL_MINUTES = 30;

function appointmentTimeValue(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function appointmentTimeLabel(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export const APPOINTMENT_START_TIME_OPTIONS = Object.freeze(
  Array.from(
    {
      length:
        (APPOINTMENT_START_TIME_MAX_MINUTES - APPOINTMENT_START_TIME_MINUTES) /
          APPOINTMENT_START_TIME_INTERVAL_MINUTES +
        1,
    },
    (_, index) => {
      const totalMinutes =
        APPOINTMENT_START_TIME_MINUTES +
        index * APPOINTMENT_START_TIME_INTERVAL_MINUTES;
      return Object.freeze({
        value: appointmentTimeValue(totalMinutes),
        label: appointmentTimeLabel(totalMinutes),
      });
    },
  ),
);

export const APPOINTMENT_START_TIMES = Object.freeze(
  APPOINTMENT_START_TIME_OPTIONS.map(({ value }) => value),
);

export function isAppointmentStartTime(value) {
  return APPOINTMENT_START_TIMES.includes(String(value ?? ""));
}

export function nextAppointmentStartTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return APPOINTMENT_START_TIMES[0];

  const totalMinutes = Number(match[1]) * 60 + Number(match[2]);
  const nextSlot =
    Math.ceil(totalMinutes / APPOINTMENT_START_TIME_INTERVAL_MINUTES) *
    APPOINTMENT_START_TIME_INTERVAL_MINUTES;
  const boundedSlot = Math.min(
    Math.max(nextSlot, APPOINTMENT_START_TIME_MINUTES),
    APPOINTMENT_START_TIME_MAX_MINUTES,
  );
  return appointmentTimeValue(boundedSlot);
}

export const APPOINTMENT_TYPES = Object.freeze([
  "scheduled",
  "walk_in",
  "follow_up",
  "home_visit",
]);

export const APPOINTMENT_TYPE_LABELS = Object.freeze({
  scheduled: "Scheduled",
  walk_in: "Walk-in",
  follow_up: "Follow-up",
  home_visit: "Home visit",
});

export const SERVICE_TYPES = Object.freeze([
  "General Consultation",
  "Maternal Care",
  "Child Health",
  "Immunization",
  "Blood Pressure Monitoring",
  "Medicine Refill",
  "Health Certificate",
  "Other",
]);

export const APPOINTMENT_PRIORITIES = Object.freeze([
  "normal",
  "priority",
  "urgent",
]);

export const PRIORITY_LABELS = Object.freeze({
  normal: "Normal",
  priority: "Priority",
  urgent: "Urgent",
});

export const APPOINTMENT_STATUSES = Object.freeze([
  "pending",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
]);

export const APPOINTMENT_STATUS_LABELS = Object.freeze({
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In consultation",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
  rescheduled: "Rescheduled",
});

export const APPOINTMENT_SORTS = Object.freeze({
  scheduled_at: "Schedule",
  appointment_number: "Appointment number",
  priority: "Priority",
  created_at: "Created date",
});

export const APPOINTMENT_ACTIONS = Object.freeze({
  EDIT: "edit",
  CONFIRM: "confirm",
  CHECK_IN: "check_in",
  COMPLETE: "complete",
  NO_SHOW: "no_show",
  CANCEL: "cancel",
  RESCHEDULE: "reschedule",
  ARCHIVE: "archive",
  RESTORE: "restore",
});

export const ACTION_LABELS = Object.freeze({
  edit: "Edit schedule",
  confirm: "Confirm",
  check_in: "Check in",
  complete: "Complete",
  no_show: "Mark no show",
  cancel: "Cancel appointment",
  reschedule: "Reschedule",
  archive: "Archive",
  restore: "Restore",
});

export const ACTION_TARGET_STATUS = Object.freeze({
  confirm: "confirmed",
  check_in: "checked_in",
  complete: "completed",
  no_show: "no_show",
  cancel: "cancelled",
});

export const INITIAL_APPOINTMENT_FILTERS = Object.freeze({
  search: "",
  date_from: "",
  date_to: "",
  status: "",
  appointment_type: "",
  service_type: "",
  priority: "",
  assigned_staff_id: "",
  include_archived: false,
  sort: "scheduled_at",
  direction: "asc",
  page: 1,
  page_size: 20,
});
