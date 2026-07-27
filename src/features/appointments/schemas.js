import { z } from "zod";

import {
  APPOINTMENT_PRIORITIES,
  APPOINTMENT_TYPES,
  SERVICE_TYPES,
} from "@/features/appointments/constants";

const optionalUuid = z.union([
  z.literal(""),
  z.string().uuid("Select a valid staff member."),
]);
const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const timeValue = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.");

export const appointmentSchema = z
  .object({
    resident_id: z.string().uuid("Select an active resident."),
    appointment_type: z.enum(APPOINTMENT_TYPES),
    service_type: z.enum(SERVICE_TYPES, { error: "Select a service." }),
    scheduled_date: dateValue,
    start_time: timeValue,
    end_time: timeValue,
    priority: z.enum(APPOINTMENT_PRIORITIES),
    assigned_staff_id: optionalUuid,
    reason: z
      .string()
      .trim()
      .max(1000, "Reason must be 1,000 characters or fewer."),
    operational_notes: z
      .string()
      .trim()
      .max(2000, "Operational notes must be 2,000 characters or fewer."),
  })
  .superRefine((values, context) => {
    if (values.end_time <= values.start_time) {
      context.addIssue({
        code: "custom",
        path: ["end_time"],
        message: "End time must be after start time.",
      });
    }
    if (values.appointment_type !== "walk_in" && !values.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Reason is required for this appointment type.",
      });
    }
  });

export const cancellationSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .min(1, "Cancellation reason is required.")
    .max(1000, "Cancellation reason must be 1,000 characters or fewer."),
});

export const residentAppointmentRequestSchema = z.object({
  service_type: z.enum(SERVICE_TYPES, { error: "Select a service." }),
  scheduled_date: dateValue,
  start_time: timeValue,
  reason: z
    .string()
    .trim()
    .min(1, "Reason for visit is required.")
    .max(1000, "Reason must be 1,000 characters or fewer."),
});

export const rescheduleSchema = z
  .object({
    scheduled_date: dateValue,
    start_time: timeValue,
    end_time: timeValue,
    assigned_staff_id: optionalUuid,
  })
  .refine((values) => values.end_time > values.start_time, {
    path: ["end_time"],
    message: "End time must be after start time.",
  });

export const operationalNotesSchema = z.object({
  operational_notes: z
    .string()
    .trim()
    .max(2000, "Operational notes must be 2,000 characters or fewer."),
});
