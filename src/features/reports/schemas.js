import { z } from "zod";

import { REPORT_MAX_RANGE_DAYS } from "@/features/reports/constants";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export const reportFilterSchema = z
  .object({
    start_date: z.string().regex(ISO_DATE, "Select a valid start date."),
    end_date: z.string().regex(ISO_DATE, "Select a valid end date."),
    purok_id: z.string().uuid().or(z.literal("")),
    service_type: z.string().max(100),
    status: z.string().max(40),
    staff_id: z.string().uuid().or(z.literal("")),
  })
  .superRefine((value, context) => {
    if (!ISO_DATE.test(value.start_date) || !ISO_DATE.test(value.end_date)) {
      return;
    }
    const difference = utcDay(value.end_date) - utcDay(value.start_date);
    if (difference < 0) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "End date must be on or after the start date.",
      });
    } else if (difference > REPORT_MAX_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "Report range cannot exceed five years.",
      });
    }
  });

export function validateReportFilters(filters) {
  const parsed = reportFilterSchema.safeParse(filters);
  if (parsed.success) return { data: parsed.data, error: null };
  return {
    data: null,
    error: parsed.error.issues[0]?.message ?? "Review the report filters.",
  };
}

function dateKey(parts) {
  const value = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function manilaDateKey(now = new Date()) {
  return dateKey(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now),
  );
}

export function quickRange(key, now = new Date()) {
  const today = manilaDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const formatUtc = (value) => value.toISOString().slice(0, 10);
  if (key === "today") return { start_date: today, end_date: today };
  if (key === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    return { start_date: formatUtc(start), end_date: today };
  }
  if (key === "quarter") {
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return {
      start_date: `${year}-${String(quarterMonth).padStart(2, "0")}-01`,
      end_date: today,
    };
  }
  if (key === "year") {
    return { start_date: `${year}-01-01`, end_date: today };
  }
  return {
    start_date: `${year}-${String(month).padStart(2, "0")}-01`,
    end_date: today,
  };
}

export function initialReportFilters(now = new Date()) {
  return {
    ...quickRange("month", now),
    purok_id: "",
    service_type: "",
    status: "",
    staff_id: "",
  };
}
