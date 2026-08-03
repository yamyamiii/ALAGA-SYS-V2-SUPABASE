import { getSupabaseClient } from "@/lib/supabase/client";

const TIMEOUT_MS = 20_000;

export class NotificationServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "NotificationServiceError";
    this.code = code;
  }
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (
    error?.code === "42501" ||
    /requires an administrator|permission/i.test(message)
  ) {
    return new NotificationServiceError(
      "permission_denied",
      "You do not have permission to complete this notification action.",
      { cause: error },
    );
  }
  if (/verified email is unavailable/i.test(message)) {
    return new NotificationServiceError(
      "email_unavailable",
      "A verified account email is required before email notifications can be enabled.",
      { cause: error },
    );
  }
  if (/verified mobile number is unavailable/i.test(message)) {
    return new NotificationServiceError(
      "sms_unavailable",
      "A verified Philippine mobile number is required before SMS can be enabled.",
      { cause: error },
    );
  }
  if (/changed in another session/i.test(message) || error?.code === "40001") {
    return new NotificationServiceError(
      "stale_record",
      "Notification settings changed in another session. Reload and try again.",
      { cause: error },
    );
  }
  if (/not found/i.test(message) || error?.code === "P0002") {
    return new NotificationServiceError(
      "not_found",
      "The notification job was not found.",
      {
        cause: error,
      },
    );
  }
  if (/not retry eligible/i.test(message)) {
    return new NotificationServiceError(
      "retry_unavailable",
      "This delivery is no longer eligible for another manual retry.",
      { cause: error },
    );
  }
  if (/timeout|abort/i.test(message)) {
    return new NotificationServiceError(
      "timeout",
      "The notification service took too long to respond. Try again.",
      { cause: error },
    );
  }
  if (/fetch|network|connection/i.test(message)) {
    return new NotificationServiceError(
      "network_error",
      "The notification service could not be reached. Check your connection.",
      { cause: error },
    );
  }
  return new NotificationServiceError("request_failed", fallback, {
    cause: error,
  });
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new NotificationServiceError(
      "offline",
      "You are offline. Reconnect before changing notification settings.",
    );
  }
}

async function rpc(client, name, parameters, fallback, signal) {
  ensureOnline();
  let request = client.rpc(name, parameters);
  if (signal && typeof request?.abortSignal === "function") {
    request = request.abortSignal(signal);
  }
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Notification request timeout")),
        TIMEOUT_MS,
      );
    });
    const { data, error } = await Promise.race([request, timeout]);
    if (error) throw error;
    return data;
  } catch (error) {
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      console.warn("[ALAGA-SYS notification diagnostic]", {
        operation: name,
        providerCode: error?.code ?? "none",
      });
    }
    throw mapError(error, fallback);
  } finally {
    clearTimeout(timer);
  }
}

export function createNotificationService(clientProvider = getSupabaseClient) {
  const client = () => clientProvider();
  return {
    getPreferences(signal) {
      return rpc(
        client(),
        "notification_preferences_get",
        {},
        "Notification preferences could not be loaded.",
        signal,
      );
    },
    updatePreferences(values) {
      return rpc(
        client(),
        "notification_preferences_update",
        {
          p_in_app_enabled: values.in_app_enabled,
          p_email_enabled: values.email_enabled,
          p_sms_enabled: values.sms_enabled,
          p_appointment_updates_enabled: values.appointment_updates_enabled,
          p_appointment_reminders_enabled: values.appointment_reminders_enabled,
          p_announcement_enabled: values.announcement_enabled,
          p_inquiry_updates_enabled: values.inquiry_updates_enabled,
          p_maternal_child_reminders_enabled:
            values.maternal_child_reminders_enabled,
          p_document_updates_enabled: values.document_updates_enabled,
          p_locale: values.locale,
          p_expected_version: values.version,
        },
        "Notification preferences could not be saved.",
      );
    },
    getDeliverySummary(signal) {
      return rpc(
        client(),
        "notification_delivery_summary",
        {},
        "Notification delivery status could not be loaded.",
        signal,
      );
    },
    retryFailedJob(job) {
      return rpc(
        client(),
        "notification_retry_failed_job",
        { p_job_id: job.id, p_expected_version: job.version },
        "The notification delivery could not be retried.",
      );
    },
  };
}

export const notificationService = createNotificationService();
