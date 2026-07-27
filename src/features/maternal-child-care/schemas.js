import { z } from "zod";

const optionalUuid = z.union([z.literal(""), z.uuid()]);
const optionalNumber = z.union([
  z.literal(""),
  z.coerce.number().nonnegative(),
]);

export const pregnancySchema = z
  .object({
    resident_id: z.uuid("Select a valid resident record."),
    last_menstrual_period: z
      .string()
      .min(1, "Last menstrual period is required."),
    estimated_delivery_date: z
      .string()
      .min(1, "Estimated delivery date is required."),
    gravida: z.coerce.number().int().min(1).max(30),
    para: z.coerce.number().int().min(0).max(30),
    term_births: z.coerce.number().int().min(0).max(30),
    preterm_births: z.coerce.number().int().min(0).max(30),
    abortions: z.coerce.number().int().min(0).max(30),
    living_children: z.coerce.number().int().min(0).max(30),
    pregnancy_risk_level: z.enum(["unassessed", "low", "moderate", "high"]),
    risk_notes: z.string().max(5000),
  })
  .refine(
    (value) => value.estimated_delivery_date >= value.last_menstrual_period,
    {
      message: "Estimated delivery date must follow the last menstrual period.",
      path: ["estimated_delivery_date"],
    },
  );

export const childProfileSchema = z.object({
  child_resident_id: z.uuid("Select a valid child resident."),
  mother_resident_id: optionalUuid,
  guardian_resident_id: optionalUuid,
  birth_date: z.string().min(1, "Birth date is required."),
  birth_weight_kg: optionalNumber,
  birth_length_cm: optionalNumber,
  gestational_age_weeks: optionalNumber,
  birth_place: z.string().max(500),
  delivery_type: z.string().max(100),
  newborn_screening_status: z.string().max(100),
  blood_type: z.enum([
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
    "unknown",
  ]),
});

export function validateMaternalChildForm(kind, values) {
  return kind === "pregnancy"
    ? pregnancySchema.safeParse(values)
    : childProfileSchema.safeParse(values);
}
