export const ANNOUNCEMENT_CATEGORIES = Object.freeze([
  ["general", "General"],
  ["vaccination", "Vaccination"],
  ["maternal", "Maternal"],
  ["child_health", "Child Health"],
  ["clinic_schedule", "Clinic Schedule"],
  ["medical_mission", "Medical Mission"],
  ["emergency", "Emergency"],
  ["advisory", "Advisory"],
]);

export const FAQ_CATEGORIES = Object.freeze([
  ["appointments", "Appointments"],
  ["residents", "Residents"],
  ["health_records", "Health Records"],
  ["maternal_care", "Maternal Care"],
  ["child_care", "Child Care"],
  ["general", "General"],
]);

export const INQUIRY_CATEGORIES = Object.freeze([
  ["appointments", "Appointments"],
  ["resident_records", "Resident Records"],
  ["health_records", "Health Records"],
  ["maternal_care", "Maternal Care"],
  ["child_care", "Child Care"],
  ["general", "General"],
  ["other", "Other"],
]);

export const INQUIRY_STATUSES = Object.freeze([
  ["open", "Open"],
  ["in_progress", "In Progress"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
]);

export const NOTIFICATION_LABELS = Object.freeze({
  appointment_approved: "Appointment approved",
  appointment_rejected: "Appointment rejected",
  appointment_rescheduled: "Appointment rescheduled",
  appointment_cancelled: "Appointment cancelled",
  appointment_checked_in: "Appointment checked in",
  health_encounter_signed: "Health encounter signed",
  new_announcement: "New announcement",
  maternal_event: "Maternal care update",
  child_event: "Child care update",
});

export function optionLabel(options, value) {
  return options.find(([key]) => key === value)?.[1] ?? value;
}
