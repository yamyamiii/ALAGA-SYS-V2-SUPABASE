import { getSupabaseClient } from "@/lib/supabase/client";

const TIMEOUT_MS = 20_000;

export class AssistanceServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AssistanceServiceError";
    this.code = code;
  }
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

function pagination(filters, defaultSize, maximumSize) {
  const requestedPage = Number(filters?.page);
  const requestedSize = Number(filters?.page_size);
  const pageNumber =
    Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const pageSize =
    Number.isInteger(requestedSize) && requestedSize >= 1
      ? Math.min(requestedSize, maximumSize)
      : defaultSize;
  return {
    pageNumber,
    pageSize,
    offset: (pageNumber - 1) * pageSize,
  };
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (
    error?.code === "42501" ||
    /not authorized|require.*access|permission/i.test(message)
  ) {
    return new AssistanceServiceError(
      "permission_denied",
      "You do not have permission to complete this action.",
      { cause: error },
    );
  }
  if (/not found/i.test(message) || error?.code === "P0002") {
    return new AssistanceServiceError(
      "not_found",
      "The record was not found.",
      {
        cause: error,
      },
    );
  }
  if (/changed by another user/i.test(message)) {
    return new AssistanceServiceError(
      "stale_record",
      "This record changed in another session. Reload it and try again.",
      { cause: error },
    );
  }
  if (/timeout|abort/i.test(message)) {
    return new AssistanceServiceError(
      "timeout",
      "The request took too long. Try again.",
      { cause: error },
    );
  }
  if (/fetch|network|connection/i.test(message)) {
    return new AssistanceServiceError(
      "network_error",
      "The service could not be reached. Check your connection and try again.",
      { cause: error },
    );
  }
  return new AssistanceServiceError("request_failed", fallback, {
    cause: error,
  });
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AssistanceServiceError(
      "offline",
      "You are offline. Reconnect before continuing.",
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
        () => reject(new Error("Assistance request timeout")),
        TIMEOUT_MS,
      );
    });
    const { data, error } = await Promise.race([request, timeout]);
    if (error) throw error;
    return data;
  } catch (error) {
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      console.warn("[ALAGA-SYS assistance diagnostic]", {
        operation: name,
        providerCode: error?.code ?? "none",
      });
    }
    throw mapError(error, fallback);
  } finally {
    clearTimeout(timer);
  }
}

function page(data, pageNumber, pageSize) {
  return {
    items: data ?? [],
    total: Number(data?.[0]?.total_count ?? 0),
    page: pageNumber,
    page_size: pageSize,
  };
}

export function createAssistanceService(clientProvider = getSupabaseClient) {
  const client = () => clientProvider();
  return {
    async listAnnouncements(filters, signal) {
      const { pageNumber, pageSize, offset } = pagination(filters, 20, 50);
      const data = await rpc(
        client(),
        "announcement_list",
        {
          p_search: nullable(filters.search?.trim()),
          p_category: nullable(filters.category),
          p_include_archived: Boolean(filters.include_archived),
          p_limit: pageSize,
          p_offset: offset,
        },
        "Announcements could not be loaded.",
        signal,
      );
      return page(data, pageNumber, pageSize);
    },
    saveAnnouncement(values) {
      return rpc(
        client(),
        "announcement_save",
        {
          p_id: nullable(values.id),
          p_title: values.title,
          p_category: values.category,
          p_content: values.content,
          p_publish_at: values.publish_at,
          p_expires_at: nullable(values.expires_at),
          p_is_pinned: Boolean(values.is_pinned),
          p_expected_version: nullable(values.version),
          p_request_key: nullable(values.request_key),
        },
        "The announcement could not be saved.",
      );
    },
    archiveAnnouncement(id, version) {
      return rpc(
        client(),
        "announcement_archive",
        { p_id: id, p_expected_version: version },
        "The announcement could not be archived.",
      );
    },
    async listNotifications(filters, signal) {
      const { pageNumber, pageSize, offset } = pagination(filters, 20, 50);
      const data = await rpc(
        client(),
        "assistance_notification_list",
        {
          p_unread_only: Boolean(filters.unread_only),
          p_limit: pageSize,
          p_offset: offset,
        },
        "Notifications could not be loaded.",
        signal,
      );
      return {
        ...page(data, pageNumber, pageSize),
        unread: Number(data?.[0]?.unread_count ?? 0),
      };
    },
    markNotificationRead(id) {
      return rpc(
        client(),
        "assistance_notification_read",
        { p_id: id },
        "The notification could not be marked as read.",
      );
    },
    markAllNotificationsRead() {
      return rpc(
        client(),
        "assistance_notification_read_all",
        {},
        "Notifications could not be marked as read.",
      );
    },
    async listActivity(filters, signal) {
      const { pageNumber, pageSize, offset } = pagination(filters, 30, 100);
      const data = await rpc(
        client(),
        "assistance_activity_list",
        {
          p_limit: pageSize,
          p_offset: offset,
        },
        "Activity could not be loaded.",
        signal,
      );
      return page(data, pageNumber, pageSize);
    },
    getHealthCenter(signal) {
      return rpc(
        client(),
        "health_center_information_get",
        {},
        "Health center information could not be loaded.",
        signal,
      );
    },
    saveHealthCenter(values) {
      return rpc(
        client(),
        "health_center_information_save",
        {
          p_health_center_name: values.health_center_name,
          p_address: values.address,
          p_contact_number: values.contact_number,
          p_email: values.email,
          p_operating_hours: values.operating_hours,
          p_emergency_contacts: values.emergency_contacts,
          p_services_offered: values.services_offered,
          p_doctors: values.doctors,
          p_midwives: values.midwives,
          p_nurses: values.nurses,
          p_bhws: values.bhws,
          p_expected_version: values.version,
        },
        "Health center information could not be saved.",
      );
    },
    async listFaqs(filters, signal) {
      const { pageNumber, pageSize, offset } = pagination(filters, 50, 100);
      const data = await rpc(
        client(),
        "faq_list",
        {
          p_search: nullable(filters.search?.trim()),
          p_category: nullable(filters.category),
          p_include_archived: Boolean(filters.include_archived),
          p_limit: pageSize,
          p_offset: offset,
        },
        "FAQs could not be loaded.",
        signal,
      );
      return page(data, pageNumber, pageSize);
    },
    saveFaq(values) {
      return rpc(
        client(),
        "faq_save",
        {
          p_id: nullable(values.id),
          p_category: values.category,
          p_question: values.question,
          p_answer: values.answer,
          p_display_order: Number(values.display_order),
          p_expected_version: nullable(values.version),
          p_request_key: nullable(values.request_key),
        },
        "The FAQ could not be saved.",
      );
    },
    archiveFaq(id, version) {
      return rpc(
        client(),
        "faq_archive",
        { p_id: id, p_expected_version: version },
        "The FAQ could not be archived.",
      );
    },
    createInquiry(values) {
      return rpc(
        client(),
        "inquiry_create",
        {
          p_subject: values.subject,
          p_category: values.category,
          p_message: values.message,
          p_request_key: values.request_key,
        },
        "The inquiry could not be submitted.",
      );
    },
    async listInquiries(filters, signal) {
      const { pageNumber, pageSize, offset } = pagination(filters, 20, 50);
      const data = await rpc(
        client(),
        "inquiry_list",
        {
          p_status: nullable(filters.status),
          p_limit: pageSize,
          p_offset: offset,
        },
        "Inquiries could not be loaded.",
        signal,
      );
      return page(data, pageNumber, pageSize);
    },
    updateInquiry(values) {
      return rpc(
        client(),
        "inquiry_update_status",
        {
          p_id: values.id,
          p_status: values.status,
          p_staff_response: nullable(values.staff_response),
          p_expected_version: values.version,
        },
        "The inquiry could not be updated.",
      );
    },
  };
}

export const assistanceService = createAssistanceService();
