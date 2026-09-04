import { z } from "zod";

import { passwordPolicySchema } from "@/features/auth/passwordSchemas";

const normalizedText = (label, maximum, optional = false) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .refine((value) => optional || value.length > 0, `${label} is required.`)
    .refine(
      (value) => value.length <= maximum,
      `${label} must be ${maximum} characters or fewer.`,
    );

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export const residentRegistrationSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .max(254, "Email is too long.")
      .email("Enter a valid email address."),
    password: passwordPolicySchema,
    confirm_password: z.string().min(1, "Confirm your password."),
    first_name: normalizedText("First name", 100),
    middle_name: normalizedText("Middle name", 100, true),
    last_name: normalizedText("Last name", 100),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth.")
      .refine((value) => value >= "1900-01-01", "Date of birth is too early.")
      .refine(
        (value) => value <= manilaToday(),
        "Date of birth cannot be in the future.",
      ),
    sex: z.enum(["male", "female"], {
      error: "Select a sex.",
    }),
    purok_id: z.string().uuid("Select a valid purok."),
    address_line: normalizedText("Address", 500, true),
    phone_number: normalizedText("Phone number", 30, true).refine(
      (value) => !value || /^[+0-9().\s-]{7,30}$/.test(value),
      "Enter a valid phone number.",
    ),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });

export const residentRegistrationDefaults = Object.freeze({
  email: "",
  password: "",
  confirm_password: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  date_of_birth: "",
  sex: "",
  purok_id: "",
  address_line: "",
  phone_number: "",
});
