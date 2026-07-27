import { getSupabaseClient } from "@/lib/supabase/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 20_000;

export class MaternalChildServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "MaternalChildServiceError";
    this.code = code;
  }
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

export function serializePregnancyDate(value) {
  const date = String(value ?? "").trim();
  const displayDate = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (displayDate) {
    return `${displayDate[3]}-${displayDate[2]}-${displayDate[1]}`;
  }
  return date;
}

export function buildPregnancySaveParameters(
  values,
  current = null,
  requestKey,
) {
  return {
    p_id: current?.id ?? null,
    p_expected_version: current?.version ?? null,
    p_values: {
      ...values,
      last_menstrual_period: serializePregnancyDate(
        values.last_menstrual_period,
      ),
      estimated_delivery_date: serializePregnancyDate(
        values.estimated_delivery_date,
      ),
    },
    p_request_key: current ? null : requestKey,
  };
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (/changed by another user|could not serialize/i.test(message)) {
    return new MaternalChildServiceError(
      "stale_record",
      "This record changed in another session. Reload it before continuing.",
      { cause: error },
    );
  }
  if (/already has|duplicate/i.test(message) || error?.code === "23505") {
    return new MaternalChildServiceError(
      "duplicate_record",
      "A matching active record already exists.",
      { cause: error },
    );
  }
  if (/permission|requires|access denied|outside.*scope/i.test(message)) {
    return new MaternalChildServiceError(
      "permission_denied",
      "You do not have permission to access or change this record.",
      { cause: error },
    );
  }
  if (/not found/i.test(message) || error?.code === "P0002") {
    return new MaternalChildServiceError(
      "not_found",
      "The maternal or child care record was not found or is unavailable.",
      { cause: error },
    );
  }
  if (/timeout/i.test(message)) {
    return new MaternalChildServiceError(
      "timeout",
      "The maternal and child care service took too long to respond.",
      { cause: error },
    );
  }
  if (/fetch|network|connection|offline|aborted/i.test(message)) {
    return new MaternalChildServiceError(
      "network_error",
      "The service could not be reached. Check your connection and try again.",
      { cause: error },
    );
  }
  return new MaternalChildServiceError("request_failed", fallback, {
    cause: error,
  });
}

async function run(operation, requestFactory, fallback) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new MaternalChildServiceError(
      "offline",
      "You are offline. Reconnect before accessing care records.",
    );
  }
  let timeoutId;
  try {
    const result = await Promise.race([
      requestFactory(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Maternal and child request timeout")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    const mapped = mapError(error, fallback);
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      console.warn("[ALAGA-SYS maternal-child diagnostic]", {
        operation,
        providerCode: error?.code ?? "none",
        mappedCode: mapped.code,
      });
    }
    throw mapped;
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateId(id) {
  if (!UUID_PATTERN.test(id ?? "")) {
    throw new MaternalChildServiceError(
      "invalid_id",
      "The maternal or child care reference is invalid.",
    );
  }
}

export function createMaternalChildService(clientProvider = getSupabaseClient) {
  const client = () => clientProvider();
  return {
    async listPregnancies(filters) {
      const data = await run(
        "maternal_pregnancy_list",
        () =>
          client().rpc("maternal_pregnancy_list", {
            p_search: nullable(filters.search?.trim()),
            p_status: nullable(filters.status),
            p_limit: filters.page_size,
            p_offset: (filters.page - 1) * filters.page_size,
          }),
        "Pregnancy records could not be loaded.",
      );
      return {
        items: data ?? [],
        total: Number(data?.[0]?.total_count ?? 0),
        page: filters.page,
        page_size: filters.page_size,
      };
    },
    async listChildren(filters) {
      const ageRange =
        filters.age_group === "under_1"
          ? [0, 0]
          : filters.age_group === "1_to_4"
            ? [1, 4]
            : filters.age_group === "5_plus"
              ? [5, null]
              : [null, null];
      const data = await run(
        "child_profile_list",
        () =>
          client().rpc("child_profile_list", {
            p_search: nullable(filters.search?.trim()),
            p_age_min: ageRange[0],
            p_age_max: ageRange[1],
            p_immunization_status: nullable(filters.immunization_status),
            p_limit: filters.page_size,
            p_offset: (filters.page - 1) * filters.page_size,
          }),
        "Child health profiles could not be loaded.",
      );
      return {
        items: data ?? [],
        total: Number(data?.[0]?.total_count ?? 0),
        page: filters.page,
        page_size: filters.page_size,
      };
    },
    async get(type, id) {
      validateId(id);
      const data = await run(
        "maternal_child_get",
        () =>
          client().rpc("maternal_child_get", {
            p_record_type: type,
            p_id: id,
          }),
        "The care record could not be loaded.",
      );
      if (!data) {
        throw new MaternalChildServiceError(
          "not_found",
          "The maternal or child care record was not found or is unavailable.",
        );
      }
      return data;
    },
    async savePregnancy(
      values,
      current = null,
      requestKey = crypto.randomUUID(),
    ) {
      return run(
        "maternal_pregnancy_save",
        () =>
          client().rpc(
            "maternal_pregnancy_save",
            buildPregnancySaveParameters(values, current, requestKey),
          ),
        "The pregnancy record could not be saved.",
      );
    },
    async saveChildProfile(
      values,
      current = null,
      requestKey = crypto.randomUUID(),
    ) {
      return run(
        "child_profile_save",
        () =>
          client().rpc("child_profile_save", {
            p_id: current?.id ?? null,
            p_expected_version: current?.version ?? null,
            p_values: values,
            p_request_key: current ? null : requestKey,
          }),
        "The child health profile could not be saved.",
      );
    },
    async saveMaternalVisit(type, pregnancyId, values, current = null) {
      validateId(pregnancyId);
      return run(
        "maternal_visit_save",
        () =>
          client().rpc("maternal_visit_save", {
            p_visit_type: type,
            p_id: current?.id ?? null,
            p_pregnancy_id: pregnancyId,
            p_expected_version: current?.version ?? null,
            p_values: values,
            p_request_key: current ? null : crypto.randomUUID(),
          }),
        "The maternal visit could not be saved.",
      );
    },
    async saveDelivery(
      pregnancyId,
      values,
      current = null,
      requestKey = crypto.randomUUID(),
    ) {
      validateId(pregnancyId);
      return run(
        "maternal_delivery_save",
        () =>
          client().rpc("maternal_delivery_save", {
            p_id: current?.id ?? null,
            p_pregnancy_id: pregnancyId,
            p_expected_version: current?.version ?? null,
            p_values: values,
            p_request_key: current ? null : requestKey,
          }),
        "The delivery outcome could not be saved.",
      );
    },
    async saveChildEvent(type, childProfileId, values, current = null) {
      validateId(childProfileId);
      return run(
        "child_event_save",
        () =>
          client().rpc("child_event_save", {
            p_event_type: type,
            p_id: current?.id ?? null,
            p_child_profile_id: childProfileId,
            p_expected_version: current?.version ?? null,
            p_values: values,
            p_request_key: current ? null : crypto.randomUUID(),
          }),
        "The child care entry could not be saved.",
      );
    },
    async transitionPregnancy(record, target) {
      return run(
        "maternal_pregnancy_transition",
        () =>
          client().rpc("maternal_pregnancy_transition", {
            p_id: record.id,
            p_expected_version: record.version,
            p_target: target,
          }),
        "The pregnancy status could not be changed.",
      );
    },
    async archive(type, record) {
      return run(
        "maternal_child_archive",
        () =>
          client().rpc("maternal_child_archive", {
            p_record_type: type,
            p_id: record.id,
            p_expected_version: record.version,
          }),
        "The record could not be archived.",
      );
    },
    async dashboard() {
      const data = await run(
        "maternal_child_dashboard",
        () => client().rpc("maternal_child_dashboard"),
        "Maternal and child care totals could not be loaded.",
      );
      return (
        data?.[0] ?? {
          active_pregnancies: 0,
          expected_deliveries: 0,
          prenatal_visits_today: 0,
          immunizations_due: 0,
          child_visits_today: 0,
        }
      );
    },
  };
}

export const maternalChildService = createMaternalChildService();
