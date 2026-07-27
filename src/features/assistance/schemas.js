import { z } from "zod";

const requiredText = (label, maximum) =>
  z
    .string()
    .trim()
    .min(3, `${label} is required.`)
    .max(maximum, `${label} is too long.`);

export const announcementSchema = z
  .object({
    title: requiredText("Title", 200),
    category: z.string().min(1),
    content: requiredText("Content", 10000),
    publish_at: z.string().min(1, "Publish date is required."),
    expires_at: z.string(),
    is_pinned: z.boolean(),
  })
  .refine(
    (value) =>
      !value.expires_at ||
      new Date(value.expires_at).getTime() >
        new Date(value.publish_at).getTime(),
    { path: ["expires_at"], message: "Expiration must follow publication." },
  );

export const faqSchema = z.object({
  category: z.string().min(1),
  question: requiredText("Question", 500),
  answer: requiredText("Answer", 10000),
  display_order: z.coerce.number().int().min(0).max(100000),
});

export const inquirySchema = z.object({
  subject: requiredText("Subject", 200),
  category: z.string().min(1),
  message: z
    .string()
    .trim()
    .min(5, "Message is required.")
    .max(5000, "Message is too long."),
});

export const inquiryUpdateSchema = z.object({
  status: z.string().min(1),
  staff_response: z.string().trim().max(2000),
});

const optionalText = (minimum, maximum, message) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value.length === 0 ||
        (value.length >= minimum && value.length <= maximum),
      message,
    );

const publicList = (maximumItems) =>
  z.array(z.string().trim().min(1).max(500)).max(maximumItems);

export const healthCenterSchema = z.object({
  health_center_name: requiredText("Health center name", 200),
  address: optionalText(
    3,
    500,
    "Address must be between 3 and 500 characters.",
  ),
  contact_number: optionalText(
    7,
    50,
    "Contact number must be between 7 and 50 characters.",
  ),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  operating_hours: optionalText(
    3,
    2000,
    "Operating hours must be between 3 and 2,000 characters.",
  ),
  emergency_contacts: publicList(20),
  services_offered: publicList(50),
  doctors: publicList(30),
  midwives: publicList(30),
  nurses: publicList(30),
  bhws: publicList(100),
  version: z.coerce.number().int().positive(),
});

export function parseList(value) {
  return String(value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatList(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}
