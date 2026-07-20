import { format } from "date-fns";

export function normalizeWhitespace(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

export function formatPersonName(person) {
  if (!person) return "Not assigned";
  return [
    person.first_name,
    person.middle_name,
    person.last_name,
    person.suffix,
  ]
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join(" ");
}

export function calculateAge(dateOfBirth, today = new Date()) {
  if (!dateOfBirth) return null;
  const parts = String(dateOfBirth).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  let age = today.getFullYear() - year;
  const birthdayPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

export function formatDate(value, includeTime = false) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return format(parsed, includeTime ? "MMM d, yyyy, h:mm a" : "MMM d, yyyy");
}

export function titleCaseStatus(value) {
  return value
    ? value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unknown";
}
