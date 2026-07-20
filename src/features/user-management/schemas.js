import { z } from "zod";

import { USER_ROLES } from "@/features/auth/permissions";

export const ACCOUNT_STATUSES = Object.freeze([
  "invited",
  "active",
  "inactive",
  "suspended",
]);

export const STATUS_TRANSITIONS = Object.freeze({
  invited: ["active", "inactive"],
  active: ["inactive", "suspended"],
  inactive: ["active"],
  suspended: ["active", "inactive"],
});

const optionalText = (maximum) =>
  z
    .string()
    .trim()
    .max(maximum, `Must be ${maximum} characters or fewer.`)
    .optional()
    .or(z.literal(""));

export const profileFieldsSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100, "First name is too long."),
  middle_name: optionalText(100),
  last_name: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(100, "Last name is too long."),
  suffix: optionalText(30),
  phone_number: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^[+0-9()\-.\s]{7,30}$/.test(value),
      "Enter a valid phone number.",
    )
    .optional()
    .or(z.literal("")),
});

const provisioningFields = profileFieldsSchema.extend({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  role: z.enum(Object.values(USER_ROLES)),
});

export const inviteUserSchema = provisioningFields;
export const createUserSchema = provisioningFields.extend({
  temporary_password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(128, "Temporary password is too long."),
});

export const roleChangeSchema = z.object({
  role: z.enum(Object.values(USER_ROLES)),
});

export const statusChangeSchema = z.object({
  account_status: z.enum(ACCOUNT_STATUSES),
});
