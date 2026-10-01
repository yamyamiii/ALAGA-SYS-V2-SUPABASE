import { z } from "zod";
import {
  APPOINTMENT_START_TIMES,
  SERVICE_TYPES,
} from "@/features/appointments/constants";
import { manilaDateKey } from "@/features/appointments/timezone";

export const EVENT_SERVICES = SERVICE_TYPES.filter(
  (s) => s !== "Postpartum Home Visit",
);
export function equalAllocation(capacity, ids) {
  const ordered = [...new Set(ids)].sort();
  return ordered.map((id, i) => ({
    id,
    quota:
      Math.floor(capacity / ordered.length) +
      (i < capacity % ordered.length ? 1 : 0),
  }));
}
export const healthEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Enter an event title (at least 3 characters)")
      .max(200),
    service_type: z.enum(EVENT_SERVICES),
    event_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (date) => date >= manilaDateKey(new Date()),
        "Choose today or a future date",
      ),
    start_time: z.enum(APPOINTMENT_START_TIMES),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    capacity: z.coerce.number().int().min(1).max(1000),
    staff_ids: z.array(z.uuid()).min(1, "Select participating staff").max(25),
    publish: z.boolean(),
    notify: z.boolean(),
  })
  .refine((v) => v.end_time > v.start_time && v.end_time <= "16:30", {
    path: ["end_time"],
    message: "End must be after start and no later than 4:30 PM",
  });
