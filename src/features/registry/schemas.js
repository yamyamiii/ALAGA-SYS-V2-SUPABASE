import { z } from "zod";

import {
  BLOOD_TYPES,
  CIVIL_STATUSES,
  HOUSEHOLD_STATUSES,
  PREGNANCY_STATUSES,
  RESIDENT_STATUSES,
  SEX_OPTIONS,
} from "@/features/registry/constants";
import { normalizeWhitespace } from "@/features/registry/formatters";

const optionalText = (maximum) =>
  z
    .string()
    .transform(normalizeWhitespace)
    .refine(
      (value) => value.length <= maximum,
      `Must be ${maximum} characters or fewer.`,
    )
    .transform((value) => value || "");

const optionalUuid = z.union([
  z.literal(""),
  z.string().uuid("Select a valid record."),
]);

const optionalPhone = z
  .string()
  .transform(normalizeWhitespace)
  .refine(
    (value) => !value || /^[+0-9().\s-]{7,30}$/.test(value),
    "Enter a valid phone number.",
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254, "Email is too long.")
  .refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address.",
  );

const normalizedRequiredName = (label) =>
  z
    .string()
    .transform(normalizeWhitespace)
    .refine((value) => value.length > 0, `${label} is required.`)
    .refine((value) => value.length <= 100, `${label} is too long.`);

export const householdSchema = z.object({
  purok_id: z.string().uuid("Select a purok."),
  address_line: z
    .string()
    .transform(normalizeWhitespace)
    .refine((value) => value.length > 0, "Address is required.")
    .refine((value) => value.length <= 500, "Address is too long."),
  status: z.enum(HOUSEHOLD_STATUSES),
});

export const residentSchema = z
  .object({
    first_name: normalizedRequiredName("First name"),
    middle_name: optionalText(100),
    last_name: normalizedRequiredName("Last name"),
    suffix: optionalText(30),
    date_of_birth: z
      .string()
      .min(1, "Date of birth is required.")
      .refine(
        (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
        "Enter a valid date.",
      )
      .refine((value) => value >= "1900-01-01", "Date of birth is too early.")
      .refine(
        (value) => value <= new Date().toISOString().slice(0, 10),
        "Date of birth cannot be in the future.",
      ),
    sex: z.enum(SEX_OPTIONS, { error: "Select a sex." }),
    civil_status: z.union([z.literal(""), z.enum(CIVIL_STATUSES)]),
    blood_type: z.union([z.literal(""), z.enum(BLOOD_TYPES)]),
    nationality: optionalText(100),
    religion: optionalText(100),
    phone_number: optionalPhone,
    email: optionalEmail,
    occupation: optionalText(150),
    purok_id: z.string().uuid("Select a purok."),
    household_id: optionalUuid,
    address_line: optionalText(500),
    philhealth_number: optionalText(50),
    emergency_contact_name: optionalText(200),
    emergency_contact_number: optionalPhone,
    emergency_contact_relationship: optionalText(100),
    is_senior_citizen: z.boolean(),
    is_pwd: z.boolean(),
    pregnancy_status: z.union([z.literal(""), z.enum(PREGNANCY_STATUSES)]),
    status: z.enum(RESIDENT_STATUSES),
  })
  .superRefine((values, context) => {
    if (values.sex !== "female" && values.pregnancy_status) {
      context.addIssue({
        code: "custom",
        path: ["pregnancy_status"],
        message: "Pregnancy status is available only when sex is female.",
      });
    }
  });

export function validateLocalityConsistency(values, references) {
  const purok = references.puroks?.find((item) => item.id === values.purok_id);
  if (!purok) {
    return "Select an active Purok 1 through Purok 7 in Brgy. Bagongpook.";
  }
  if (values.household_id) {
    const household = references.households?.find(
      (item) => item.id === values.household_id,
    );
    if (
      household &&
      (household.barangay_id !== purok.barangay_id ||
        household.purok_id !== values.purok_id)
    ) {
      return "The selected household does not match the selected locality.";
    }
  }
  return null;
}
