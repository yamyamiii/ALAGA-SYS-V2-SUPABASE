export const DOCUMENT_TYPES = Object.freeze({
  APPOINTMENT_SLIP: "appointment_slip",
  CONSULTATION_SUMMARY: "consultation_summary",
  REFERRAL_FORM: "referral_form",
  PRENATAL_SUMMARY: "prenatal_summary",
  CHILD_HEALTH_SUMMARY: "child_health_summary",
});

export const CLINICAL_PRIVACY_NOTICE =
  "Confidential healthcare document. Handle according to approved health-center privacy and records policies.";

export const APPOINTMENT_PRIVACY_NOTICE =
  "Private scheduling document. Present only to authorized health-center personnel.";

export const DOCUMENT_RPC = Object.freeze({
  [DOCUMENT_TYPES.APPOINTMENT_SLIP]: {
    name: "document_appointment_slip",
    parameter: "p_appointment_id",
  },
  [DOCUMENT_TYPES.CONSULTATION_SUMMARY]: {
    name: "document_consultation_summary",
    parameter: "p_encounter_id",
  },
  [DOCUMENT_TYPES.REFERRAL_FORM]: {
    name: "document_referral_form",
    parameter: "p_referral_id",
  },
  [DOCUMENT_TYPES.PRENATAL_SUMMARY]: {
    name: "document_prenatal_summary",
    parameter: "p_pregnancy_id",
  },
  [DOCUMENT_TYPES.CHILD_HEALTH_SUMMARY]: {
    name: "document_child_health_summary",
    parameter: "p_child_profile_id",
  },
});
