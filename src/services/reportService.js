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

export function createReportService(clientProvider = getSupabaseClient) {
  return {
    async load(category, filters, signal) {
      const client = clientProvider();
      if (category === "overview") {
        return {
          summary: await rpc(
            client,
            "report_overview_summary",
            {
              p_start_date: filters.start_date,
              p_end_date: filters.end_date,
            },
            "The overview could not be loaded.",
            signal,
          ),
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
      const data = await rpc(
        clientProvider(),
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
      return {
        rows: (data ?? []).map(({ row_data: row }) => row),
        total: Number(data?.[0]?.total_count ?? 0),
      };
    },
  };
}

export const reportService = createReportService();
