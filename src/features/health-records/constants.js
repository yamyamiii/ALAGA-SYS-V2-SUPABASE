export const ENCOUNTER_TYPES = Object.freeze([
  "general_consultation",
  "nursing_care",
  "maternal_care",
  "child_health",
  "immunization",
  "blood_pressure_monitoring",
  "home_visit",
  "follow_up",
  "other",
]);

export const ENCOUNTER_TYPE_LABELS = Object.freeze({
  general_consultation: "General consultation",
  nursing_care: "Nursing care",
  maternal_care: "Maternal care",
  child_health: "Child health",
  immunization: "Immunization",
  blood_pressure_monitoring: "Blood pressure monitoring",
  home_visit: "Home visit",
  follow_up: "Follow-up",
  other: "Other",
});

export const ENCOUNTER_STATUSES = Object.freeze([
  "draft",
  "signed",
  "amended",
  "archived",
]);

export const ENCOUNTER_STATUS_LABELS = Object.freeze({
  draft: "Draft",
  signed: "Signed",
  amended: "Amended",
  archived: "Archived",
});

export const ALLERGY_SEVERITIES = Object.freeze([
  "mild",
  "moderate",
  "severe",
  "unknown",
]);

export const CLINICAL_ITEM_STATUSES = Object.freeze([
  "active",
  "resolved",
  "historical",
]);

export const INITIAL_HEALTH_RECORD_FILTERS = Object.freeze({
  search: "",
  date_from: "",
  date_to: "",
  status: "",
  encounter_type: "",
  attending_staff_id: "",
  include_archived: false,
  page: 1,
  page_size: 20,
});
