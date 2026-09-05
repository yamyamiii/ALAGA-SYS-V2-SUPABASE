import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isAppointmentStartTime,
  STAFF_SEARCH_DEFAULT_PAGE_SIZE,
  STAFF_SEARCH_MAX_PAGE_SIZE,
} from "@/features/appointments/constants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AppointmentServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AppointmentServiceError";
    this.code = code;
  }
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (/not linked to a resident record/i.test(message)) {
    return new AppointmentServiceError(
      "resident_link_required",
      "Your account is not linked to an active resident record. Contact the health center for assistance.",
      { cause: error },
    );
  }
  if (/linked resident record must be active/i.test(message)) {
    return new AppointmentServiceError(
      "resident_inactive",
      "Your linked resident record is not active. Contact the health center before requesting an appointment.",
      { cause: error },
    );
  }
  if (/matching pending resident request already exists/i.test(message)) {
    return new AppointmentServiceError(
      "duplicate_resident_request",
      "A matching pending appointment request already exists.",
      { cause: error },
    );
  }
  if (/only an own pending resident request can be cancelled/i.test(message)) {
    return new AppointmentServiceError(
      "resident_cancellation_unavailable",
      "Only your own pending appointment request can be cancelled.",
      { cause: error },
    );
  }
  if (/changed by another user|could not serialize|concurrent/i.test(message)) {
    return new AppointmentServiceError(
      "stale_appointment",
      "This appointment changed in another session. Reload it and try again.",
      { cause: error },
    );
  }
  if (/schedule conflicts/i.test(message) || error?.code === "23P01") {
    return new AppointmentServiceError(
      "schedule_conflict",
      message ||
        "The selected staff member already has an overlapping appointment.",
      { cause: error },
    );
  }
  if (
    /permission|authorized|requires an administrator|requires authorized/i.test(
      message,
    )
  ) {
    return new AppointmentServiceError(
      "permission_denied",
      "You do not have permission to complete this appointment action.",
      { cause: error },
    );
  }
  if (/appointment not found/i.test(message) || error?.code === "P0002") {
    return new AppointmentServiceError(
      "appointment_not_found",
      "The appointment was not found or is no longer available.",
      { cause: error },
    );
  }
  if (/resident must be active/i.test(message)) {
    return new AppointmentServiceError(
      "resident_unavailable",
      "The selected resident is no longer active or available for scheduling.",
      { cause: error },
    );
  }
  if (/assigned staff|midwives may be assigned/i.test(message)) {
    return new AppointmentServiceError("staff_unavailable", message, {
      cause: error,
    });
  }
  if (
    /past|current Manila date|start time must be in the future|appointment start time must be a 30-minute slot/i.test(
      message,
    )
  ) {
    return new AppointmentServiceError("invalid_schedule_time", message, {
      cause: error,
    });
  }
  if (
    /invalid appointment status transition|only .* appointments/i.test(message)
  ) {
    return new AppointmentServiceError(
      "invalid_transition",
      "This appointment can no longer move to the selected status.",
      { cause: error },
    );
  }
  if (/fetch|network|timeout|connection|aborted/i.test(message)) {
    return new AppointmentServiceError(
      "network_error",
      "The appointment service could not be reached. Check your connection and try again.",
      { cause: error },
    );
  }
  return new AppointmentServiceError("appointment_request_failed", fallback, {
    cause: error,
  });
}

function diagnostic(operation, error, code) {
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    console.warn("[ALAGA-SYS appointment diagnostic]", {
      operation,
      providerCode: error?.code ?? "none",
      mappedCode: code,
    });
  }
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AppointmentServiceError(
      "offline",
      "You are offline. Reconnect before accessing appointments.",
    );
  }
}

function ensureAppointmentStartTime(value) {
  if (!isAppointmentStartTime(value)) {
    throw new AppointmentServiceError(
      "invalid_schedule_time",
      "Select a start time from 8:00 AM through 4:00 PM in 30-minute intervals.",
    );
  }
}

async function rpc(client, name, parameters, fallback) {
  ensureOnline();
  const { data, error } = await client.rpc(name, parameters);
  if (error) {
    const mapped = mapError(error, fallback);
    diagnostic(name, error, mapped.code);
    throw mapped;
  }
  return data;
}

function firstRow(data, fallback) {
  if (!Array.isArray(data) || !data[0]) {
    throw new AppointmentServiceError("invalid_response", fallback);
  }
  return data[0];
}

function pageResult(data, page, pageSize) {
  return {
    items: data ?? [],
    total: Number(data?.[0]?.total_count ?? 0),
    page,
    page_size: pageSize,
  };
}

function requiredNonnegativeCount(source, key, fallback) {
  const value = Number(source?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppointmentServiceError("invalid_response", fallback);
  }
  return value;
}

function appointmentTotal(data) {
  if (!Array.isArray(data)) {
    throw new AppointmentServiceError(
      "invalid_response",
      "The assigned appointment total response was invalid.",
    );
  }
  if (data.length === 0) return 0;
  return requiredNonnegativeCount(
    data[0],
    "total_count",
    "The assigned appointment total response was invalid.",
  );
}

function normalizePositiveInteger(value, fallback, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.trunc(numeric), 1), maximum);
}

export function buildAppointmentStaffSearchRequest({
  search = "",
  serviceType = "",
  page = 1,
  pageSize = STAFF_SEARCH_DEFAULT_PAGE_SIZE,
} = {}) {
  const normalizedPageSize = normalizePositiveInteger(
    pageSize,
    STAFF_SEARCH_DEFAULT_PAGE_SIZE,
    STAFF_SEARCH_MAX_PAGE_SIZE,
  );
  const maximumPage = Math.floor(2_147_483_647 / normalizedPageSize) + 1;
  const normalizedPage = normalizePositiveInteger(page, 1, maximumPage);

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    parameters: {
      p_search: nullable(String(search ?? "").trim()),
      p_service_type: nullable(String(serviceType ?? "").trim()),
      p_limit: normalizedPageSize,
      p_offset: (normalizedPage - 1) * normalizedPageSize,
    },
  };
}

export function buildAppointmentListParameters(filters) {
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  return {
    p_search: nullable(filters.search?.trim()),
    p_date_from: nullable(filters.date_from),
    p_date_to: nullable(filters.date_to),
    p_status: nullable(filters.status),
    p_appointment_type: nullable(filters.appointment_type),
    p_service_type: nullable(filters.service_type),
    p_priority: nullable(filters.priority),
    p_assigned_staff_id: nullable(filters.assigned_staff_id),
    p_include_archived: Boolean(filters.include_archived),
    p_sort: filters.sort ?? "scheduled_at",
    p_direction: filters.direction ?? "asc",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
}

export function createAppointmentService(clientProvider = getSupabaseClient) {
  function client() {
    return clientProvider();
  }

  return {
    async listAppointments(filters) {
      const data = await rpc(
        client(),
        "appointment_list",
        buildAppointmentListParameters(filters),
        "Appointments could not be loaded.",
      );
      return pageResult(data, filters.page ?? 1, filters.page_size ?? 20);
    },

    async getAppointment(id, options = {}) {
      if (!UUID_PATTERN.test(id ?? "")) {
        throw new AppointmentServiceError(
          "invalid_appointment_id",
          "The appointment reference is invalid.",
        );
      }
      const supabase = client();
      if (options.resident) {
        const data = await rpc(
          supabase,
          "resident_appointment_detail",
          { p_appointment_id: id },
          "The appointment could not be loaded.",
        );
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new AppointmentServiceError(
            "invalid_response",
            "The appointment details response was invalid.",
          );
        }
        return data;
      }

      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, appointment_number, resident_id, assigned_staff_id, appointment_type, service_type, scheduled_date, start_time, end_time, priority, status, reason, operational_notes, cancellation_reason, rescheduled_from_id, request_source, requested_date, requested_start_time, requested_end_time, resident_requested_at, checked_in_at, started_at, completed_at, cancelled_at, created_at, updated_at, archived_at, version, resident:residents(id,resident_number,first_name,middle_name,last_name,suffix,date_of_birth,status,archived_at,purok:puroks(name)), staff:profiles!appointments_assigned_staff_id_fkey(id,first_name,middle_name,last_name,suffix,role)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) {
        const mapped = mapError(error, "The appointment could not be loaded.");
        diagnostic("appointment_detail", error, mapped.code);
        throw mapped;
      }
      if (!data) {
        throw new AppointmentServiceError(
          "appointment_not_found",
          "The appointment was not found or is not available to your account.",
        );
      }

      let rescheduledFrom = null;
      if (data.rescheduled_from_id) {
        const { data: original, error: originalError } = await supabase
          .from("appointments")
          .select("id, appointment_number")
          .eq("id", data.rescheduled_from_id)
          .maybeSingle();
        if (originalError) {
          const mapped = mapError(
            originalError,
            "The original appointment reference could not be loaded.",
          );
          diagnostic("appointment_detail_lineage", originalError, mapped.code);
          throw mapped;
        }
        rescheduledFrom = original;
      }

      return { ...data, rescheduled_from: rescheduledFrom };
    },

    async listQueue({
      date,
      status = "",
      priority = "",
      page = 1,
      pageSize = 100,
    }) {
      const data = await rpc(
        client(),
        "appointment_daily_queue",
        {
          p_date: date,
          p_status: nullable(status),
          p_priority: nullable(priority),
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        },
        "The daily queue could not be loaded.",
      );
      return pageResult(data, page, pageSize);
    },

    async listCalendar({ dateFrom, dateTo }) {
      return (
        (await rpc(
          client(),
          "appointment_calendar",
          { p_date_from: dateFrom, p_date_to: dateTo },
          "The appointment calendar could not be loaded.",
        )) ?? []
      );
    },

    async searchResidents({ search = "", page = 1, pageSize = 10 }) {
      const data = await rpc(
        client(),
        "appointment_search_residents",
        {
          p_search: nullable(search.trim()),
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        },
        "Residents could not be searched.",
      );
      return pageResult(data, page, pageSize);
    },

    async searchStaff({
      search = "",
      serviceType = "",
      page = 1,
      pageSize = STAFF_SEARCH_DEFAULT_PAGE_SIZE,
    } = {}) {
      const request = buildAppointmentStaffSearchRequest({
        search,
        serviceType,
        page,
        pageSize,
      });
      const data = await rpc(
        client(),
        "appointment_search_staff",
        request.parameters,
        "Staff members could not be searched.",
      );
      return pageResult(data, request.page, request.pageSize);
    },

    async listResidentHistory(residentId, page = 1, pageSize = 5) {
      const data = await rpc(
        client(),
        "appointment_resident_history",
        {
          p_resident_id: residentId,
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        },
        "Appointment history could not be loaded.",
      );
      return pageResult(data, page, pageSize);
    },

    async getDashboardSummary() {
      const currentClient = client();
      const [data, visibleAppointments] = await Promise.all([
        rpc(
          currentClient,
          "appointment_dashboard_summary",
          {},
          "Appointment totals could not be loaded.",
        ),
        rpc(
          currentClient,
          "appointment_list",
          buildAppointmentListParameters({ page: 1, page_size: 1 }),
          "The assigned appointment total could not be loaded.",
        ),
      ]);
      const summary = firstRow(
        data,
        "The appointment totals response was invalid.",
      );
      for (const key of [
        "appointments_today",
        "pending_appointments",
        "checked_in_today",
        "completed_today",
        "upcoming_appointments",
      ]) {
        requiredNonnegativeCount(
          summary,
          key,
          "The appointment totals response was invalid.",
        );
      }
      return {
        ...summary,
        assigned_appointments: appointmentTotal(visibleAppointments),
      };
    },

    async listResidentAppointmentRequests(page = 1, pageSize = 5) {
      const data = await rpc(
        client(),
        "appointment_resident_request_list",
        {
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        },
        "Incoming resident appointment requests could not be loaded.",
      );
      return pageResult(data, page, pageSize);
    },

    async createAppointment(values, requestKey = crypto.randomUUID()) {
      ensureAppointmentStartTime(values.start_time);
      const data = await rpc(
        client(),
        "appointment_create",
        {
          p_resident_id: values.resident_id,
          p_appointment_type: values.appointment_type,
          p_service_type: values.service_type,
          p_scheduled_date: values.scheduled_date,
          p_start_time: values.start_time,
          p_end_time: values.end_time,
          p_priority: values.priority,
          p_assigned_staff_id: nullable(values.assigned_staff_id),
          p_reason: nullable(values.reason),
          p_operational_notes: null,
          p_request_key: requestKey,
        },
        "The appointment could not be created.",
      );
      return firstRow(data, "The appointment creation response was invalid.");
    },

    async requestResidentAppointment(values, requestKey = crypto.randomUUID()) {
      ensureAppointmentStartTime(values.start_time);
      const data = await rpc(
        client(),
        "resident_appointment_request",
        {
          p_service_type: values.service_type,
          p_scheduled_date: values.scheduled_date,
          p_start_time: values.start_time,
          p_reason: nullable(values.reason?.trim()),
          p_request_key: requestKey,
        },
        "Your appointment request could not be submitted.",
      );
      return firstRow(data, "The appointment request response was invalid.");
    },

    async cancelResidentAppointment(appointment, cancellationReason) {
      const data = await rpc(
        client(),
        "resident_appointment_cancel",
        {
          p_appointment_id: appointment.id,
          p_expected_version: appointment.version,
          p_cancellation_reason: nullable(cancellationReason?.trim()),
        },
        "Your appointment request could not be cancelled.",
      );
      return firstRow(data, "The resident cancellation response was invalid.");
    },

    async updateAppointment(appointment, values) {
      ensureAppointmentStartTime(values.start_time);
      const data = await rpc(
        client(),
        "appointment_update_schedule",
        {
          p_appointment_id: appointment.id,
          p_expected_version: appointment.version,
          p_appointment_type: values.appointment_type,
          p_service_type: values.service_type,
          p_scheduled_date: values.scheduled_date,
          p_start_time: values.start_time,
          p_end_time: values.end_time,
          p_priority: values.priority,
          p_assigned_staff_id: nullable(values.assigned_staff_id),
          p_reason: nullable(values.reason?.trim()),
          p_operational_notes: nullable(appointment.operational_notes),
        },
        "The appointment changes could not be saved.",
      );
      return firstRow(data, "The appointment update response was invalid.");
    },

    async transition(appointment, targetStatus, options = {}) {
      const data = await rpc(
        client(),
        "appointment_transition",
        {
          p_appointment_id: appointment.id,
          p_expected_version: appointment.version,
          p_target_status: targetStatus,
          p_cancellation_reason: nullable(options.cancellation_reason?.trim()),
          p_operational_notes: nullable(options.operational_notes),
        },
        "The appointment status could not be changed.",
      );
      return firstRow(data, "The appointment transition response was invalid.");
    },

    async updateOperationalNotes(appointment, operationalNotes) {
      const data = await rpc(
        client(),
        "appointment_update_operational_notes",
        {
          p_appointment_id: appointment.id,
          p_expected_version: appointment.version,
          p_operational_notes: operationalNotes,
        },
        "Operational notes could not be saved.",
      );
      return firstRow(data, "The operational-notes response was invalid.");
    },

    async reschedule(appointment, values, requestKey = crypto.randomUUID()) {
      ensureAppointmentStartTime(values.start_time);
      const data = await rpc(
        client(),
        "appointment_reschedule",
        {
          p_appointment_id: appointment.id,
          p_expected_version: appointment.version,
          p_scheduled_date: values.scheduled_date,
          p_start_time: values.start_time,
          p_end_time: values.end_time,
          p_assigned_staff_id: nullable(appointment.assigned_staff_id),
          p_request_key: requestKey,
        },
        "The appointment could not be rescheduled.",
      );
      return firstRow(data, "The reschedule response was invalid.");
    },

    async setArchived(appointment, archived) {
      const data = await rpc(
        client(),
        "appointment_set_archive_state",
        {
          p_appointment_id: appointment.id,
          p_expected_version: appointment.version,
          p_archived: archived,
        },
        `The appointment could not be ${archived ? "archived" : "restored"}.`,
      );
      return firstRow(data, "The archive response was invalid.");
    },
  };
}

export const appointmentService = createAppointmentService();
