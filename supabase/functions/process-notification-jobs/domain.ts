export type NotificationChannel = "email" | "sms";
export type NotificationLocale = "en" | "fil";
export type TemplateKey =
  | "appointment_request_received"
  | "appointment_confirmed"
  | "appointment_rejected"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_reminder"
  | "inquiry_updated"
  | "important_announcement"
  | "signed_document_available";

export type ClaimedJob = {
  id: string;
  event_type: string;
  recipient_profile_id: string;
  channel: NotificationChannel;
  template_key: TemplateKey;
  locale: NotificationLocale;
  safe_variables: Record<string, string>;
  attempt_number: number;
};

export type RenderedTemplate = {
  subject: string;
  text: string;
  html: string;
  sms: string;
};

export const MAX_BODY_BYTES = 4_096;
export const PROVIDER_TIMEOUT_MS = 12_000;
export const MAX_SMS_CHARACTERS = 320;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const VARIABLE_KEYS: Readonly<Record<TemplateKey, readonly string[]>> =
  Object.freeze({
    appointment_request_received: [],
    appointment_confirmed: ["date", "time"],
    appointment_rejected: [],
    appointment_rescheduled: ["date", "time"],
    appointment_cancelled: [],
    appointment_reminder: ["date", "time"],
    inquiry_updated: ["status"],
    important_announcement: ["title"],
    signed_document_available: ["document_kind"],
  });

export class NotificationProcessorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "NotificationProcessorError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const maximum = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < maximum; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized)
    ? normalized
    : null;
}

export function normalizePhilippineMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (/^09[0-9]{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639[0-9]{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function maskEmail(value: string): string {
  const normalized = normalizeEmail(value);
  if (!normalized) return "***";
  const [local, domain] = normalized.split("@");
  return `${local[0]}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

export function maskMobile(value: string): string {
  const normalized = normalizePhilippineMobile(value);
  return normalized
    ? `${normalized.slice(0, 3)}******${normalized.slice(-3)}`
    : "***";
}

export function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(value)) {
    throw new NotificationProcessorError(
      "server_configuration_error",
      "Notification processing limits are not configured correctly.",
      500,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new NotificationProcessorError(
      "server_configuration_error",
      "Notification processing limits are not configured correctly.",
      500,
    );
  }
  return parsed;
}

export function validateProcessorRequest(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { batchSize: 20 };
  }
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "batch_size")
  ) {
    throw new NotificationProcessorError(
      "validation_error",
      "The notification processor request is invalid.",
    );
  }
  const batchSize = value.batch_size ?? 20;
  if (
    !Number.isInteger(batchSize) ||
    Number(batchSize) < 1 ||
    Number(batchSize) > 50
  ) {
    throw new NotificationProcessorError(
      "validation_error",
      "Batch size must be between 1 and 50.",
    );
  }
  return { batchSize: Number(batchSize) };
}

export function validateClaimedJob(value: unknown): ClaimedJob {
  if (!isRecord(value)) {
    throw new NotificationProcessorError(
      "invalid_job_contract",
      "The notification queue returned an invalid job.",
      500,
    );
  }
  const template = value.template_key as TemplateKey;
  const variables = value.safe_variables;
  if (
    !UUID_PATTERN.test(String(value.id ?? "")) ||
    !UUID_PATTERN.test(String(value.recipient_profile_id ?? "")) ||
    !["email", "sms"].includes(String(value.channel)) ||
    !["en", "fil"].includes(String(value.locale)) ||
    !Object.hasOwn(VARIABLE_KEYS, template) ||
    !isRecord(variables) ||
    !Number.isInteger(value.attempt_number) ||
    Number(value.attempt_number) < 1 ||
    Number(value.attempt_number) > 7
  ) {
    throw new NotificationProcessorError(
      "invalid_job_contract",
      "The notification queue returned an invalid job.",
      500,
    );
  }
  const expected = [...VARIABLE_KEYS[template]].sort();
  const actual = Object.keys(variables).sort();
  if (
    expected.length !== actual.length ||
    expected.some((key, index) => key !== actual[index]) ||
    Object.values(variables).some(
      (item) =>
        typeof item !== "string" || item.length > 200 || /[\r\n]/.test(item),
    )
  ) {
    throw new NotificationProcessorError(
      "invalid_job_variables",
      "The notification queue returned invalid template variables.",
      500,
    );
  }
  return {
    id: String(value.id),
    event_type: String(value.event_type),
    recipient_profile_id: String(value.recipient_profile_id),
    channel: value.channel as NotificationChannel,
    template_key: template,
    locale: value.locale as NotificationLocale,
    safe_variables: variables as Record<string, string>,
    attempt_number: Number(value.attempt_number),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function documentLabel(kind: string, locale: NotificationLocale) {
  if (locale === "fil") {
    return kind === "referral form" ? "referral form" : "consultation summary";
  }
  return kind;
}

export function renderTemplate(job: ClaimedJob): RenderedTemplate {
  const variables = job.safe_variables;
  const filipino = job.locale === "fil";
  let subject: string;
  let text: string;
  switch (job.template_key) {
    case "appointment_request_received":
      subject = "ALAGA-SYS Appointment Request Received";
      text = filipino
        ? "Natanggap na ng Barangay Health Center ang iyong appointment request. Mag-sign in sa ALAGA-SYS upang tingnan ang status."
        : "The Barangay Health Center received your appointment request. Sign in to ALAGA-SYS to view its status.";
      break;
    case "appointment_confirmed":
      subject = "ALAGA-SYS Appointment Confirmed";
      text = filipino
        ? `Nakumpirma ang iyong appointment sa ${variables.date} nang ${variables.time}. Mag-sign in sa ALAGA-SYS upang tingnan ang kumpletong detalye.`
        : `Your appointment has been confirmed for ${variables.date} at ${variables.time}. Sign in to ALAGA-SYS to view the complete details.`;
      break;
    case "appointment_rejected":
      subject = "ALAGA-SYS Appointment Request Update";
      text = filipino
        ? "Hindi nakumpirma ng Barangay Health Center ang iyong appointment request. Mag-sign in sa ALAGA-SYS upang tingnan ang status."
        : "The Barangay Health Center could not confirm your appointment request. Sign in to ALAGA-SYS to view its status.";
      break;
    case "appointment_rescheduled":
      subject = "ALAGA-SYS Appointment Rescheduled";
      text = filipino
        ? `Inilipat ang iyong appointment sa ${variables.date} nang ${variables.time}. Mag-sign in sa ALAGA-SYS upang tingnan ang kumpletong detalye.`
        : `Your appointment was rescheduled to ${variables.date} at ${variables.time}. Sign in to ALAGA-SYS to view the complete details.`;
      break;
    case "appointment_cancelled":
      subject = "ALAGA-SYS Appointment Cancelled";
      text = filipino
        ? "Nakansela ang iyong appointment. Mag-sign in sa ALAGA-SYS upang tingnan ang status."
        : "Your appointment was cancelled. Sign in to ALAGA-SYS to view its status.";
      break;
    case "appointment_reminder":
      subject = "ALAGA-SYS Appointment Reminder";
      text = filipino
        ? `Paalala: may nakumpirma kang appointment sa ${variables.date} nang ${variables.time}. Mag-sign in sa ALAGA-SYS upang tingnan ang detalye.`
        : `Reminder: you have a confirmed appointment on ${variables.date} at ${variables.time}. Sign in to ALAGA-SYS to view details.`;
      break;
    case "inquiry_updated":
      subject = "ALAGA-SYS Inquiry Update";
      text = filipino
        ? `Na-update ang iyong inquiry. Kasalukuyang status: ${variables.status}. Mag-sign in sa ALAGA-SYS upang tingnan ang tugon.`
        : `Your inquiry was updated. Current status: ${variables.status}. Sign in to ALAGA-SYS to view the response.`;
      break;
    case "important_announcement":
      subject = "Important ALAGA-SYS Announcement";
      text = filipino
        ? `May mahalagang anunsyo ang Barangay Health Center: ${variables.title}. Mag-sign in sa ALAGA-SYS upang basahin ito.`
        : `The Barangay Health Center published an important announcement: ${variables.title}. Sign in to ALAGA-SYS to read it.`;
      break;
    case "signed_document_available": {
      const kind = documentLabel(variables.document_kind, job.locale);
      subject = "ALAGA-SYS Document Available";
      text = filipino
        ? `May available nang ${kind} sa iyong account. Mag-sign in sa ALAGA-SYS upang ligtas itong tingnan.`
        : `A ${kind} is now available in your account. Sign in to ALAGA-SYS to view it securely.`;
      break;
    }
  }
  if (/\r|\n/.test(subject) || subject.length > 120) {
    throw new NotificationProcessorError(
      "unsafe_template_subject",
      "The selected notification template is invalid.",
      500,
    );
  }
  const sms =
    text.length <= MAX_SMS_CHARACTERS
      ? text
      : `${text.slice(0, MAX_SMS_CHARACTERS - 1)}…`;
  return {
    subject,
    text,
    sms,
    html: `<p>${escapeHtml(text)}</p>`,
  };
}
