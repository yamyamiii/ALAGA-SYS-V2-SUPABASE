export const HOUSEHOLD_STATUSES = Object.freeze([
  "active",
  "inactive",
  "archived",
]);

export const HOUSEHOLD_STATUS_LABELS = Object.freeze({
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
});

export const RESIDENT_STATUSES = Object.freeze([
  "active",
  "inactive",
  "moved_out",
  "deceased",
  "archived",
]);

export const RESIDENT_STATUS_LABELS = Object.freeze({
  active: "Active",
  inactive: "Inactive",
  moved_out: "Moved out",
  deceased: "Deceased",
  archived: "Archived",
});

export const SEX_OPTIONS = Object.freeze(["male", "female"]);
export const SEX_LABELS = Object.freeze({ male: "Male", female: "Female" });

export const CIVIL_STATUSES = Object.freeze([
  "single",
  "married",
  "widowed",
  "separated",
  "annulled",
]);

export const BLOOD_TYPES = Object.freeze([
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "unknown",
]);

export const PREGNANCY_STATUSES = Object.freeze([
  "not_pregnant",
  "pregnant",
  "postpartum",
  "unknown",
]);

export const PREGNANCY_STATUS_LABELS = Object.freeze({
  not_pregnant: "Not pregnant",
  pregnant: "Pregnant",
  postpartum: "Postpartum",
  unknown: "Unknown",
});

export const PAGE_SIZES = Object.freeze([10, 20, 50]);

export const HOUSEHOLD_SORTS = Object.freeze({
  household_number: "Household number",
  created_at: "Created date",
  address_line: "Address",
});

export const RESIDENT_SORTS = Object.freeze({
  resident_number: "Resident number",
  name: "Name",
  age: "Age",
  created_at: "Created date",
});

export const initialHouseholdFilters = Object.freeze({
  search: "",
  barangay_id: "",
  purok_id: "",
  status: "",
  include_archived: false,
  sort: "household_number",
  direction: "asc",
  page: 1,
  page_size: 20,
});

export const initialResidentFilters = Object.freeze({
  search: "",
  barangay_id: "",
  purok_id: "",
  sex: "",
  status: "",
  is_senior_citizen: "",
  is_pwd: "",
  household_filter: "all",
  archive_filter: "current",
  sort: "resident_number",
  direction: "asc",
  page: 1,
  page_size: 20,
});
