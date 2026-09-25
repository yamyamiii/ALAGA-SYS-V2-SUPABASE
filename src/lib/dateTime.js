export const MANILA_TIME_ZONE = "Asia/Manila";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TIME_ZONE,
  weekday: "long",
});

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TIME_ZONE,
  month: "long",
  day: "numeric",
  year: "numeric",
});

const clockTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const manilaDateTimeInputFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function validDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatManilaClock(value = new Date()) {
  const date = validDate(value);
  if (!date) {
    return {
      date: "Date unavailable",
      time: `Time unavailable • ${MANILA_TIME_ZONE}`,
      dateTime: undefined,
    };
  }

  return {
    date: `${weekdayFormatter.format(date)} • ${calendarDateFormatter.format(date)}`,
    time: `${clockTimeFormatter.format(date)} • ${MANILA_TIME_ZONE}`,
    dateTime: date.toISOString(),
  };
}

export function formatManilaDateTime(value, options = {}) {
  const date = validDate(value);
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}

export function formatManilaDate(value) {
  const date = validDate(value);
  if (!date) return "Date unavailable";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    dateStyle: "medium",
  }).format(date);
}

export function formatManilaDateTimeInput(value) {
  const date = validDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(
    manilaDateTimeInputFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function manilaDateTimeInputToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value ?? "")) return null;
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
