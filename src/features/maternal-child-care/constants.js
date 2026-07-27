export const MATERNAL_CHILD_TABS = Object.freeze([
  { id: "pregnancies", label: "Pregnancies", kind: "pregnancy" },
  { id: "prenatal", label: "Prenatal Visits", kind: "pregnancy" },
  { id: "deliveries", label: "Deliveries", kind: "pregnancy" },
  { id: "postnatal", label: "Postnatal Care", kind: "pregnancy" },
  { id: "children", label: "Child Profiles", kind: "child" },
  { id: "growth", label: "Growth Monitoring", kind: "child" },
  { id: "immunizations", label: "Immunizations", kind: "child" },
]);

export const PREGNANCY_STATUSES = Object.freeze([
  "active",
  "delivered",
  "completed",
  "archived",
]);

export const INITIAL_MATERNAL_CHILD_FILTERS = Object.freeze({
  search: "",
  status: "",
  age_group: "",
  immunization_status: "",
  page: 1,
  page_size: 20,
});
