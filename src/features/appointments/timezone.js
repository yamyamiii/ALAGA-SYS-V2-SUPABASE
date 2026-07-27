import { formatManilaDateTime, MANILA_TIME_ZONE } from "@/lib/dateTime";

function partsFor(date, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: MANILA_TIME_ZONE,
      ...options,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function manilaDateKey(date = new Date()) {
  const parts = partsFor(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function manilaTimeKey(date = new Date()) {
  const parts = partsFor(date, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${parts.hour}:${parts.minute}`;
}

export function addMinutesToTime(value, minutes) {
  const [hour, minute] = String(value).split(":").map(Number);
  const total = (((hour * 60 + minute + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatManilaDate(value, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return "Not available";
  const parsed = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(parsed);
}

export function formatManilaTime(value) {
  if (!/^\d{2}:\d{2}/.test(value ?? "")) return "Not available";
  const [hour, minute] = value.split(":").map(Number);
  const parsed = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function formatManilaTimestamp(value) {
  if (!value) return "Not available";
  return formatManilaDateTime(value, {
    dateStyle: undefined,
    timeStyle: undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function addDaysToDateKey(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthGridRange(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 41);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export function monthKeyFromDate(value) {
  return String(value).slice(0, 7);
}
