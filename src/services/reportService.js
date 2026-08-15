import { getSupabaseClient } from "@/lib/supabase/client";

const REQUEST_TIMEOUT_MS = 20_000;

export class ReportServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ReportServiceError";
    this.code = code;
  }
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (/permission|unavailable to this role|require/i.test(message)) {
    return new ReportServiceError(
      "permission_denied",
      "You do not have permission to view this report.",
      { cause: error },
    );
  }
  if (/date range|five years|filter|pagination|row limit/i.test(message)) {
    return new ReportServiceError("invalid_report_request", message, {
      cause: error,
    });
  }
  if (/abort|timeout/i.test(message)) {
    return new ReportServiceError(
      "timeout",
      "The report took too long to load. Narrow the date range and try again.",
      { cause: error },
    );
  }
  if (/fetch|network|connection/i.test(message)) {
    return new ReportServiceError(
      "network_error",
      "The reporting service could not be reached. Check your connection and try again.",
      { cause: error },
    );
  }
  return new ReportServiceError("report_failed", fallback, { cause: error });
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ReportServiceError(
      "offline",
      "You are offline. Reconnect before loading reports.",
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
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Report request timeout")),
      REQUEST_TIMEOUT_MS,
    );
  });
  try {
    const { data, error } = await Promise.race([request, timeout]);
    if (error) throw error;
    return data;
  } catch (error) {
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      console.warn("[ALAGA-SYS report diagnostic]", {
        operation: name,
        providerCode: error?.code ?? "none",
      });
    }
    throw mapError(error, fallback);
  } finally {
    clearTimeout(timer);
  }
}

function common(filters) {
  return {
    p_start_date: filters.start_date,
    p_end_date: filters.end_date,
    p_purok_id: nullable(filters.purok_id),
  };
}

function appointment(filters) {
  return {
    ...common(filters),
    p_service_type: nullable(filters.service_type),
    p_status: nullable(filters.status),
    p_staff_id: nullable(filters.staff_id),
  };
}

function normalizedOverviewSummary(overview = {}, appointments = {}) {
  const statusCounts = appointments.status_counts ?? {};
  return {
    active_residents: overview.active_residents ?? 0,
    total_appointments: appointments.total ?? 0,
    pending_requests: overview.pending_requests ?? 0,
    confirmed_appointments: statusCounts.confirmed ?? 0,
    completed_appointments: appointments.completed ?? 0,
    cancelled_appointments: appointments.cancelled ?? 0,
    appointments_today: overview.appointments_today ?? 0,
    checked_in_queue: overview.checked_in_queue ?? 0,
  };
}

function overviewExportRows(summary) {
  const labels = {
    active_residents: "Active residents",
    total_appointments: "Total appointments",
    pending_requests: "Pending requests",
    confirmed_appointments: "Confirmed appointments",
    completed_appointments: "Completed appointments",
    cancelled_appointments: "Cancelled appointments",
    appointments_today: "Appointments today",
    checked_in_queue: "Checked-in queue",
  };
  return Object.entries(labels).map(([key, metric]) => ({
    metric,
    value: summary[key],
  }));
}

function sanitizeExportRows(category, rows) {
  if (category !== "staff_workload") return rows;
  return rows.map(
    ({ staff, role, assigned_appointments, completed_appointments }) => ({
      staff,
      role,
      assigned_appointments,
      completed_appointments,
    }),
  );
}

function requiredDashboardCount(source, key) {
  const value = Number(source?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ReportServiceError(
      "invalid_response",
      "The dashboard aggregate response was invalid.",
    );
  }
  return value;
}

const DASHBOARD_APPOINTMENT_TOTAL_PARAMETERS = Object.freeze({
  p_search: null,
  p_date_from: null,
  p_date_to: null,
  p_status: null,
  p_appointment_type: null,
  p_service_type: null,
  p_priority: null,
  p_assigned_staff_id: null,
  p_include_archived: false,
  p_sort: "scheduled_at",
  p_direction: "asc",
  p_limit: 1,
  p_offset: 0,
});

export function createReportService(clientProvider = getSupabaseClient) {
  return {
    async loadDashboard(today, signal) {
      const client = clientProvider();
      const [overview, visibleAppointments] = await Promise.all([
        rpc(
          client,
          "report_overview_summary",
          { p_start_date: today, p_end_date: today },
          "Dashboard totals could not be loaded.",
          signal,
        ),
        rpc(
          client,
          "appointment_list",
          DASHBOARD_APPOINTMENT_TOTAL_PARAMETERS,
          "The authorized appointment total could not be loaded.",
          signal,
        ),
      ]);

      return {
        active_residents: requiredDashboardCount(overview, "active_residents"),
        total_appointments: visibleAppointments?.length
          ? requiredDashboardCount(visibleAppointments[0], "total_count")
          : 0,
        pending_requests: requiredDashboardCount(overview, "pending_requests"),
        appointments_today: requiredDashboardCount(
          overview,
          "appointments_today",
        ),
      };
    },

    async load(category, filters, signal) {
      const client = clientProvider();
      if (category === "overview") {
        const [overview, appointments] = await Promise.all([
          rpc(
            client,
            "report_overview_summary",
            {
              p_start_date: filters.start_date,
              p_end_date: filters.end_date,
            },
            "The overview could not be loaded.",
            signal,
          ),
          rpc(
            client,
            "report_appointment_summary",
            appointment(filters),
            "Appointment totals could not be loaded.",
            signal,
          ),
        ]);
        return {
          summary: normalizedOverviewSummary(overview, appointments),
        };
      }
      if (category === "residents") {
        const [summary, byPurok, byAge] = await Promise.all([
          rpc(
            client,
            "report_registry_summary",
            common(filters),
            "Resident totals could not be loaded.",
            signal,
          ),
          rpc(
            client,
            "report_residents_by_purok",
            { p_start_date: filters.start_date, p_end_date: filters.end_date },
            "Purok totals could not be loaded.",
            signal,
          ),
          rpc(
            client,
            "report_residents_by_age_group",
            common(filters),
            "Age-group totals could not be loaded.",
            signal,
          ),
        ]);
        return { summary, byPurok, byAge };
      }
      if (category === "appointments") {
        const [summary, overTime, services] = await Promise.all([
          rpc(
            client,
            "report_appointment_summary",
            appointment(filters),
            "Appointment totals could not be loaded.",
            signal,
          ),
          rpc(
            client,
            "report_appointments_over_time",
            appointment(filters),
            "Appointment trend could not be loaded.",
            signal,
          ),
          rpc(
            client,
            "report_services_distribution",
            {
              p_start_date: filters.start_date,
              p_end_date: filters.end_date,
              p_purok_id: nullable(filters.purok_id),
              p_status: nullable(filters.status),
              p_staff_id: nullable(filters.staff_id),
            },
            "Service distribution could not be loaded.",
            signal,
          ),
        ]);
        return { summary, overTime, services };
      }
      const names = {
        health_records: "report_health_summary",
        maternal_care: "report_maternal_summary",
        child_care: "report_child_summary",
      };
      if (names[category]) {
        const parameters = common(filters);
        if (category === "health_records") {
          parameters.p_staff_id = nullable(filters.staff_id);
        }
        if (category === "child_care") parameters.p_growth_threshold_days = 180;
        return {
          summary: await rpc(
            client,
            names[category],
            parameters,
            "The report could not be loaded.",
            signal,
          ),
        };
      }
      if (category === "staff_workload") {
        return {
          workload: await rpc(
            client,
            "report_staff_workload",
            {
              p_start_date: filters.start_date,
              p_end_date: filters.end_date,
              p_service_type: nullable(filters.service_type),
              p_staff_id: nullable(filters.staff_id),
            },
            "Staff workload could not be loaded.",
            signal,
          ),
        };
      }
      throw new ReportServiceError(
        "invalid_category",
        "Unknown report category.",
      );
    },

    async exportRows(category, filters, format) {
      const client = clientProvider();
      const data = await rpc(
        client,
        "report_export_rows",
        {
          p_report_type: category,
          ...appointment(filters),
          p_format: format,
          p_limit: 5000,
          p_offset: 0,
        },
        "The report export could not be prepared.",
      );
      const rawRows = (data ?? []).map(({ row_data: row }) => row);
      if (category === "overview") {
        const [overview, appointments] = await Promise.all([
          rpc(
            client,
            "report_overview_summary",
            {
              p_start_date: filters.start_date,
              p_end_date: filters.end_date,
            },
            "The overview export could not be prepared.",
          ),
          rpc(
            client,
            "report_appointment_summary",
            appointment(filters),
            "Appointment totals could not be loaded.",
          ),
        ]);
        const rows = overviewExportRows(
          normalizedOverviewSummary(overview, appointments),
        );
        return { rows, total: rows.length };
      }
      return {
        rows: sanitizeExportRows(category, rawRows),
        total: Number(data?.[0]?.total_count ?? 0),
      };
    },
  };
}

export const reportService = createReportService();
