import { z } from "zod";

import {
  ALLERGY_SEVERITIES,
  CLINICAL_ITEM_STATUSES,
  ENCOUNTER_TYPES,
} from "@/features/health-records/constants";

const optionalText = (maximum) =>
  z
    .string()
    .trim()
    .max(maximum, `Use ${maximum.toLocaleString()} characters or fewer.`);

const optionalNumber = (minimum, maximum, label) =>
  z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : Number(value),
    z
      .number({ error: `${label} must be a number.` })
      .min(minimum, `${label} is below the supported physical range.`)
      .max(maximum, `${label} is above the supported physical range.`)
      .optional(),
  );

const vitalFields = [
  "temperature_c",
  "systolic_bp",
  "diastolic_bp",
  "pulse_bpm",
  "respiratory_rate",
  "oxygen_saturation",
  "height_cm",
  "weight_kg",
  "pain_score",
];

export const ENCOUNTER_SIGN_REQUIRED_FIELDS = Object.freeze([
  ["chief_complaint", "Chief complaint"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
]);

export function missingEncounterSignFields(encounter) {
  const clinical = encounter?.clinical ?? encounter ?? {};
  return ENCOUNTER_SIGN_REQUIRED_FIELDS.filter(
    ([field]) => !String(clinical[field] ?? "").trim(),
  ).map(([, label]) => label);
}

export const encounterCreateSchema = z.object({
  resident_id: z.string().uuid("Select an active resident."),
  appointment_id: z.union([z.literal(""), z.string().uuid()]),
  encounter_type: z.enum(ENCOUNTER_TYPES),
  encounter_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid encounter date."),
});

export const encounterClinicalSchema = z.object({
  chief_complaint: optionalText(2000),
  subjective_notes: optionalText(10000),
  objective_notes: optionalText(10000),
  assessment: optionalText(10000),
  plan: optionalText(10000),
  diagnosis_text: optionalText(5000),
  treatment_notes: optionalText(10000),
  follow_up_date: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ]),
});

export const amendmentSchema = z.object({
  amendment_reason: z
    .string()
    .trim()
    .min(1, "Explain why the signed record needs an amendment.")
    .max(1000, "Use 1,000 characters or fewer."),
});

export const vitalSignsSchema = z
  .object({
    temperature_c: optionalNumber(20, 50, "Temperature"),
    systolic_bp: optionalNumber(30, 300, "Systolic pressure"),
    diastolic_bp: optionalNumber(20, 200, "Diastolic pressure"),
    pulse_bpm: optionalNumber(20, 300, "Pulse"),
    respiratory_rate: optionalNumber(5, 100, "Respiratory rate"),
    oxygen_saturation: optionalNumber(20, 100, "Oxygen saturation"),
    height_cm: optionalNumber(20, 250, "Height"),
    weight_kg: optionalNumber(0.2, 500, "Weight"),
    pain_score: optionalNumber(0, 10, "Pain score"),
  })
  .refine(
    (values) => vitalFields.some((field) => typeof values[field] === "number"),
    {
      message: "Record at least one vital-sign measurement.",
    },
  );

export const allergySchema = z.object({
  allergen: z.string().trim().min(1).max(200),
  reaction: optionalText(1000),
  severity: z.enum(ALLERGY_SEVERITIES),
  status: z.enum(CLINICAL_ITEM_STATUSES),
});

export const medicalHistorySchema = z.object({
  condition_name: z.string().trim().min(1).max(200),
  details: optionalText(2000),
  onset_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  status: z.enum(CLINICAL_ITEM_STATUSES),
});

export function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm);
  const weight = Number(weightKg);
  if (!height || !weight || height <= 0 || weight <= 0) return null;
  return Number((weight / (height / 100) ** 2).toFixed(1));
}

export function getVitalWarnings(values) {
  const warnings = [];
  const checks = [
    ["temperature_c", 35, 38, "Temperature is outside the usual adult range."],
    [
      "systolic_bp",
      90,
      180,
      "Systolic pressure is unusual; verify the reading.",
    ],
    [
      "diastolic_bp",
      60,
      120,
      "Diastolic pressure is unusual; verify the reading.",
    ],
    ["pulse_bpm", 50, 120, "Pulse is unusual; verify the reading."],
    [
      "respiratory_rate",
      10,
      30,
      "Respiratory rate is unusual; verify the reading.",
    ],
    [
      "oxygen_saturation",
      90,
      100,
      "Oxygen saturation is unusual; verify the reading.",
    ],
  ];
  for (const [field, minimum, maximum, message] of checks) {
    const value = Number(values[field]);
    if (
      values[field] !== "" &&
      Number.isFinite(value) &&
      (value < minimum || value > maximum)
    ) {
      warnings.push(message);
    }
  }
  return warnings;
}
