import {
  APPOINTMENT_PRIVACY_NOTICE,
  CLINICAL_PRIVACY_NOTICE,
  DOCUMENT_TYPES,
} from "@/features/documents/constants";
import {
  formatManilaDate,
  formatManilaTime,
  formatManilaTimestamp,
} from "@/features/appointments/timezone";
import { formatManilaDateTime, MANILA_TIME_ZONE } from "@/lib/dateTime";

export function sanitizeDocumentFilename(value) {
  const safe = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
  return `${safe || "ALAGA-Document"}.pdf`;
}

function text(value) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  return String(value);
}

function titleCase(value) {
  return text(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function measure(value, unit) {
  return value === null || value === undefined
    ? "Not available"
    : `${value} ${unit}`;
}

function generationDateParts(generatedAt) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: MANILA_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(generatedAt)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
}

export function calculateDocumentAge(birthDate, generatedAt = new Date()) {
  const match = String(birthDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const birth = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const current = generationDateParts(generatedAt);
  let age = current.year - birth.year;
  if (
    current.month < birth.month ||
    (current.month === birth.month && current.day < birth.day)
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function baseModel({
  type,
  title,
  identifier,
  filename,
  privacyNotice,
  generatedAt,
}) {
  return {
    type,
    title,
    identifier,
    filename: sanitizeDocumentFilename(filename),
    generatedAt: generatedAt.toISOString(),
    generatedLabel: `${formatManilaDateTime(generatedAt)} · ${MANILA_TIME_ZONE}`,
    privacyNotice,
    fields: [],
    sections: [],
    signature: null,
  };
}

function appointmentModel(payload, generatedAt) {
  const model = baseModel({
    type: DOCUMENT_TYPES.APPOINTMENT_SLIP,
    title: "Appointment Slip",
    identifier: payload.appointment_number,
    filename: `ALAGA-Appointment-${payload.appointment_number}`,
    privacyNotice: APPOINTMENT_PRIVACY_NOTICE,
    generatedAt,
  });
  model.fields = [
    { label: "Appointment number", value: text(payload.appointment_number) },
    { label: "Resident", value: text(payload.resident_name) },
    { label: "Service", value: text(payload.service_type) },
    { label: "Appointment type", value: titleCase(payload.appointment_type) },
    {
      label: "Scheduled date",
      value: formatManilaDate(payload.scheduled_date),
    },
    {
      label: "Start time",
      value: formatManilaTime(payload.start_time),
    },
    { label: "Assigned staff", value: text(payload.assigned_staff_name) },
    { label: "Current status", value: titleCase(payload.status) },
  ];
  model.sections = [
    {
      title: "Arrival reminder",
      note: "Please arrive 10–15 minutes before the scheduled time. This slip confirms the recorded schedule but does not replace health-center instructions.",
    },
  ];
  return model;
}

function consultationModel(payload, generatedAt) {
  const model = baseModel({
    type: DOCUMENT_TYPES.CONSULTATION_SUMMARY,
    title: payload.is_amended
      ? "Consultation Summary — Amended Record"
      : "Consultation Summary",
    identifier: payload.encounter_number,
    filename: `ALAGA-Consultation-${payload.encounter_number}`,
    privacyNotice: CLINICAL_PRIVACY_NOTICE,
    generatedAt,
  });
  model.fields = [
    { label: "Encounter number", value: text(payload.encounter_number) },
    { label: "Resident", value: text(payload.resident_name) },
    { label: "Visit date", value: formatManilaDate(payload.encounter_date) },
    { label: "Encounter type", value: titleCase(payload.encounter_type) },
    {
      label: "Attending clinical staff",
      value: text(payload.attending_staff_name),
    },
    { label: "Record status", value: titleCase(payload.status) },
  ];
  model.sections = [
    { title: "Chief complaint", note: text(payload.chief_complaint) },
    { title: "Assessment", note: text(payload.assessment) },
    { title: "Plan", note: text(payload.plan) },
    {
      title: "Follow-up",
      fields: [
        {
          label: "Follow-up date",
          value: payload.follow_up_date
            ? formatManilaDate(payload.follow_up_date)
            : "Not scheduled",
        },
      ],
    },
  ];
  if (payload.vital_signs) {
    model.sections.push({
      title: "Latest authorized vital-sign summary",
      fields: [
        {
          label: "Recorded",
          value: formatManilaTimestamp(payload.vital_signs.recorded_at),
        },
        {
          label: "Temperature",
          value: measure(payload.vital_signs.temperature_c, "°C"),
        },
        {
          label: "Blood pressure",
          value:
            payload.vital_signs.systolic_bp == null ||
            payload.vital_signs.diastolic_bp == null
              ? "Not available"
              : `${payload.vital_signs.systolic_bp}/${payload.vital_signs.diastolic_bp} mmHg`,
        },
        {
          label: "Pulse",
          value: measure(payload.vital_signs.pulse_bpm, "bpm"),
        },
        {
          label: "Respiratory rate",
          value: measure(payload.vital_signs.respiratory_rate, "/min"),
        },
        {
          label: "Oxygen saturation",
          value: measure(payload.vital_signs.oxygen_saturation, "%"),
        },
        {
          label: "Height",
          value: measure(payload.vital_signs.height_cm, "cm"),
        },
        {
          label: "Weight",
          value: measure(payload.vital_signs.weight_kg, "kg"),
        },
        { label: "BMI", value: text(payload.vital_signs.bmi) },
        { label: "Pain score", value: text(payload.vital_signs.pain_score) },
      ],
    });
  }
  if (payload.is_amended && payload.amends_encounter_number) {
    model.sections.unshift({
      title: "Amendment notice",
      note: `This document represents an amended encounter linked to ${payload.amends_encounter_number}. The source record remains preserved.`,
    });
  }
  model.signature = {
    label: "Attending clinical staff",
    name: text(payload.attending_staff_name),
    detail: "Printed name and signature",
  };
  return model;
}

function referralModel(payload, generatedAt) {
  const model = baseModel({
    type: DOCUMENT_TYPES.REFERRAL_FORM,
    title: "Referral Form",
    identifier: payload.referral_number,
    filename: `ALAGA-Referral-${payload.referral_number}`,
    privacyNotice: CLINICAL_PRIVACY_NOTICE,
    generatedAt,
  });
  model.fields = [
    { label: "Referral number", value: text(payload.referral_number) },
    { label: "Resident", value: text(payload.resident_name) },
    { label: "Referral date", value: formatManilaDate(payload.referral_date) },
    { label: "Referring staff", value: text(payload.referring_staff_name) },
    { label: "Receiving facility", value: text(payload.receiving_facility) },
  ];
  model.sections = [
    { title: "Reason for referral", note: text(payload.reason_for_referral) },
    {
      title: "Approved concise clinical summary",
      note: text(payload.clinical_summary),
    },
  ];
  model.signature = {
    label: "Referring clinical staff",
    name: text(payload.referring_staff_name),
    detail: `${titleCase(payload.referring_staff_role)} · Finalized ${formatManilaTimestamp(payload.finalized_at)}`,
  };
  return model;
}

function prenatalModel(payload, generatedAt) {
  const model = baseModel({
    type: DOCUMENT_TYPES.PRENATAL_SUMMARY,
    title: "Prenatal Summary",
    identifier: payload.pregnancy_number,
    filename: `ALAGA-Prenatal-${payload.pregnancy_number}`,
    privacyNotice: CLINICAL_PRIVACY_NOTICE,
    generatedAt,
  });
  model.fields = [
    { label: "Pregnancy number", value: text(payload.pregnancy_number) },
    { label: "Resident", value: text(payload.resident_name) },
    { label: "LMP", value: formatManilaDate(payload.last_menstrual_period) },
    {
      label: "Estimated delivery date",
      value: formatManilaDate(payload.estimated_delivery_date),
    },
    { label: "Gravida", value: text(payload.gravida) },
    { label: "Para", value: text(payload.para) },
    { label: "Term births", value: text(payload.term_births) },
    { label: "Preterm births", value: text(payload.preterm_births) },
    { label: "Pregnancy losses", value: text(payload.pregnancy_losses) },
    { label: "Living children", value: text(payload.living_children) },
    { label: "Risk level", value: titleCase(payload.risk_level) },
    { label: "Current status", value: titleCase(payload.status) },
  ];
  model.sections = [
    {
      title: "Prenatal visits",
      table: {
        columns: [
          { key: "visit_date", label: "Visit date" },
          { key: "gestational_age", label: "Gestational age" },
          { key: "attending_staff", label: "Attending staff" },
        ],
        rows: (payload.prenatal_visits ?? []).map((visit) => ({
          visit_date: formatManilaDate(visit.visit_date),
          gestational_age:
            visit.gestational_age_weeks == null
              ? "Not available"
              : `${visit.gestational_age_weeks} weeks`,
          attending_staff: text(visit.attending_staff_name),
        })),
        empty: payload.clinical_fields_visible
          ? "No prenatal visits recorded."
          : "Prenatal visit details are not available to this role.",
      },
    },
  ];
  model.signature = {
    label: "Attending midwife / authorized clinical staff",
    name: text(payload.attending_midwife_name),
    detail: "Printed name and signature",
  };
  return model;
}

function childModel(payload, generatedAt) {
  const age = calculateDocumentAge(payload.birth_date, generatedAt);
  const model = baseModel({
    type: DOCUMENT_TYPES.CHILD_HEALTH_SUMMARY,
    title: "Child Health Summary",
    identifier: payload.child_number,
    filename: `ALAGA-Child-${payload.child_number}`,
    privacyNotice: CLINICAL_PRIVACY_NOTICE,
    generatedAt,
  });
  model.fields = [
    { label: "Child health number", value: text(payload.child_number) },
    { label: "Child name", value: text(payload.child_name) },
    { label: "Date of birth", value: formatManilaDate(payload.birth_date) },
    {
      label: "Age at generation",
      value: age === null ? "Not available" : `${age} years`,
    },
    { label: "Mother", value: text(payload.mother_name) },
    { label: "Guardian", value: text(payload.guardian_name) },
  ];
  model.sections = [
    {
      title: "Latest growth measurements",
      table: {
        columns: [
          { key: "date", label: "Date" },
          { key: "weight", label: "Weight" },
          { key: "height", label: "Height" },
          { key: "head", label: "Head circumference" },
          { key: "muac", label: "MUAC" },
        ],
        rows: (payload.growth_measurements ?? []).map((measurement) => ({
          date: formatManilaTimestamp(measurement.measured_at),
          weight: measure(measurement.weight_kg, "kg"),
          height: measure(measurement.height_cm, "cm"),
          head: measure(measurement.head_circumference_cm, "cm"),
          muac: measure(measurement.mid_upper_arm_circumference_cm, "cm"),
        })),
        empty: payload.clinical_fields_visible
          ? "No growth measurements recorded."
          : "Growth details are not available to this role.",
      },
    },
    {
      title: "Completed immunizations",
      table: {
        columns: [
          { key: "vaccine", label: "Vaccine" },
          { key: "dose", label: "Dose" },
          { key: "date", label: "Date given" },
        ],
        rows: (payload.immunizations ?? []).map((immunization) => ({
          vaccine: text(immunization.vaccine_name),
          dose: text(immunization.dose_number),
          date: formatManilaDate(immunization.administered_date),
        })),
        empty: payload.clinical_fields_visible
          ? "No completed immunizations recorded."
          : "Immunization details are not available to this role.",
      },
    },
  ];
  if (payload.latest_child_visit) {
    model.sections.push({
      title: "Latest child health visit",
      fields: [
        {
          label: "Visit date",
          value: formatManilaDate(payload.latest_child_visit.visit_date),
        },
        {
          label: "Attending staff",
          value: text(payload.latest_child_visit.attending_staff_name),
        },
      ],
    });
  }
  model.signature = {
    label: "Authorized health-center staff",
    name: payload.latest_child_visit?.attending_staff_name ?? "",
    detail: "Printed name and signature",
  };
  return model;
}

export function buildDocumentModel(type, payload, generatedAt = new Date()) {
  if (!payload || payload.document_type !== type) {
    throw new Error("The document payload does not match the requested type.");
  }
  const builders = {
    [DOCUMENT_TYPES.APPOINTMENT_SLIP]: appointmentModel,
    [DOCUMENT_TYPES.CONSULTATION_SUMMARY]: consultationModel,
    [DOCUMENT_TYPES.REFERRAL_FORM]: referralModel,
    [DOCUMENT_TYPES.PRENATAL_SUMMARY]: prenatalModel,
    [DOCUMENT_TYPES.CHILD_HEALTH_SUMMARY]: childModel,
  };
  const builder = builders[type];
  if (!builder) throw new Error("Unsupported printable document type.");
  return builder(payload, generatedAt);
}
