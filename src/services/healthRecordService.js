import { getSupabaseClient } from "@/lib/supabase/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 20_000;

export class HealthRecordServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "HealthRecordServiceError";
    this.code = code;
  }
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (/changed by another user|could not serialize/i.test(message)) {
    return new HealthRecordServiceError(
      "stale_encounter",
      "This health record changed in another session. Reload it before continuing.",
      { cause: error },
    );
  }
  if (/already exists|duplicate/i.test(message) || error?.code === "23505") {
    return new HealthRecordServiceError(
      "encounter_exists",
      "A health record already exists for this appointment.",
      { cause: error },
    );
  }
  if (
    /signed health encounters are immutable|after an encounter is signed/i.test(
      message,
    )
  ) {
    return new HealthRecordServiceError(
      "signed_record_immutable",
      "Signed clinical records cannot be overwritten. Create an amendment instead.",
      { cause: error },
    );
  }
  if (
    /not authorized|permission|requires.*staff|outside.*scope/i.test(message)
  ) {
    return new HealthRecordServiceError(
      "permission_denied",
      "You do not have permission to access or change this clinical record.",
      { cause: error },
    );
  }
  if (/resident.*not found|resident must be active/i.test(message)) {
    return new HealthRecordServiceError(
      "resident_unavailable",
      "The resident was not found or is not active.",
      { cause: error },
    );
  }
  if (/appointment.*resident.*match|appointment mismatch/i.test(message)) {
    return new HealthRecordServiceError(
      "appointment_mismatch",
      "The appointment does not belong to the selected resident.",
      { cause: error },
    );
  }
  if (
    /encounter not found|record not found/i.test(message) ||
    error?.code === "P0002"
  ) {
    return new HealthRecordServiceError(
      "health_record_not_found",
      "The health record was not found or is unavailable to your account.",
      { cause: error },
    );
  }
  if (/timeout/i.test(message)) {
    return new HealthRecordServiceError(
      "timeout",
      "The clinical service took too long to respond. Please try again.",
      { cause: error },
    );
  }
  if (/fetch|network|connection|offline|aborted/i.test(message)) {
    return new HealthRecordServiceError(
      "network_error",
      "The clinical service could not be reached. Check your connection and try again.",
      { cause: error },
    );
  }
  return new HealthRecordServiceError(
    "health_record_request_failed",
    fallback,
    {
      cause: error,
    },
  );
}

function diagnostic(operation, error, code) {
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    console.warn("[ALAGA-SYS clinical diagnostic]", {
      operation,
      providerCode: error?.code ?? "none",
      mappedCode: code,
    });
  }
}

async function withTimeout(request) {
  let timeoutId;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Clinical request timeout")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new HealthRecordServiceError(
      "offline",
      "You are offline. Reconnect before accessing clinical records.",
    );
  }
}

async function run(operation, requestFactory, fallback) {
  ensureOnline();
  let result;
  try {
    result = await withTimeout(requestFactory());
  } catch (error) {
    const mapped = mapError(error, fallback);
    diagnostic(operation, error, mapped.code);
    throw mapped;
  }
  if (result.error) {
    const mapped = mapError(result.error, fallback);
    diagnostic(operation, result.error, mapped.code);
    throw mapped;
  }
  return result.data;
}

function firstRow(data, fallback) {
  if (!Array.isArray(data) || !data[0]) {
    throw new HealthRecordServiceError("invalid_response", fallback);
  }
  return data[0];
}

function validateId(id) {
  if (!UUID_PATTERN.test(id ?? "")) {
    throw new HealthRecordServiceError(
      "invalid_health_record_id",
      "The health-record reference is invalid.",
    );
  }
}

export function buildHealthRecordListParameters(filters) {
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  return {
    p_search: nullable(filters.search?.trim()),
    p_date_from: nullable(filters.date_from),
    p_date_to: nullable(filters.date_to),
    p_status: nullable(filters.status),
    p_encounter_type: nullable(filters.encounter_type),
    p_attending_staff_id: nullable(filters.attending_staff_id),
    p_include_archived: Boolean(filters.include_archived),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
}

export function createHealthRecordService(clientProvider = getSupabaseClient) {
  function client() {
    return clientProvider();
  }

  return {
    async list(filters) {
      const data = await run(
        "health_record_list",
        () =>
          client().rpc(
            "health_record_list",
            buildHealthRecordListParameters(filters),
          ),
        "Health records could not be loaded.",
      );
      return {
        items: data ?? [],
        total: Number(data?.[0]?.total_count ?? 0),
        page: filters.page ?? 1,
        page_size: filters.page_size ?? 20,
      };
    },

    async get(id) {
      validateId(id);
      const data = await run(
        "health_record_get",
        () => client().rpc("health_record_get", { p_encounter_id: id }),
        "The health record could not be loaded.",
      );
      if (!data) {
        throw new HealthRecordServiceError(
          "health_record_not_found",
          "The health record was not found or is unavailable to your account.",
        );
      }
      return data;
    },

    async forAppointment(appointmentId) {
      validateId(appointmentId);
      const data = await run(
        "health_record_for_appointment",
        () =>
          client().rpc("health_record_for_appointment", {
            p_appointment_id: appointmentId,
          }),
        "The appointment health-record status could not be loaded.",
      );
      return data?.[0] ?? null;
    },

    async create(values, requestKey = crypto.randomUUID()) {
      const data = await run(
        "health_encounter_create",
        () =>
          client().rpc("health_encounter_create", {
            p_resident_id: values.resident_id,
            p_appointment_id: nullable(values.appointment_id),
            p_encounter_type: values.encounter_type,
            p_encounter_date: values.encounter_date,
            p_request_key: requestKey,
          }),
        "The health encounter could not be created.",
      );
      return firstRow(data, "The encounter creation response was invalid.");
    },

    async update(encounter, values) {
      const data = await run(
        "health_encounter_update",
        () =>
          client().rpc("health_encounter_update", {
            p_encounter_id: encounter.id,
            p_expected_version: encounter.version,
            p_chief_complaint: nullable(values.chief_complaint),
            p_subjective_notes: nullable(values.subjective_notes),
            p_objective_notes: nullable(values.objective_notes),
            p_assessment: nullable(values.assessment),
            p_plan: nullable(values.plan),
            p_diagnosis_text: nullable(values.diagnosis_text),
            p_treatment_notes: nullable(values.treatment_notes),
            p_follow_up_date: nullable(values.follow_up_date),
          }),
        "The draft clinical documentation could not be saved.",
      );
      return firstRow(data, "The encounter update response was invalid.");
    },

    async sign(encounter) {
      const data = await run(
        "health_encounter_sign",
        () =>
          client().rpc("health_encounter_sign", {
            p_encounter_id: encounter.id,
            p_expected_version: encounter.version,
          }),
        "The encounter could not be signed.",
      );
      return firstRow(data, "The encounter signing response was invalid.");
    },

    async amend(encounter, reason, requestKey = crypto.randomUUID()) {
      const data = await run(
        "health_encounter_amend",
        () =>
          client().rpc("health_encounter_amend", {
            p_encounter_id: encounter.id,
            p_expected_version: encounter.version,
            p_amendment_reason: reason,
            p_request_key: requestKey,
          }),
        "The amendment could not be created.",
      );
      return firstRow(data, "The amendment response was invalid.");
    },

    async archive(encounter) {
      const data = await run(
        "health_encounter_archive",
        () =>
          client().rpc("health_encounter_archive", {
            p_encounter_id: encounter.id,
            p_expected_version: encounter.version,
          }),
        "The health record could not be archived.",
      );
      return firstRow(data, "The archive response was invalid.");
    },

    async saveVitals(encounterId, values) {
      const parameters = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          `p_${key}`,
          nullable(value),
        ]),
      );
      const data = await run(
        "health_vital_signs_save",
        () =>
          client().rpc("health_vital_signs_save", {
            p_encounter_id: encounterId,
            ...parameters,
          }),
        "Vital signs could not be saved.",
      );
      return firstRow(data, "The vital-sign response was invalid.");
    },

    async listAllergies(residentId) {
      validateId(residentId);
      return (
        (await run(
          "resident_allergies",
          () =>
            client()
              .from("resident_allergies")
              .select(
                "id,resident_id,allergen,reaction,severity,status,noted_at,updated_at",
              )
              .eq("resident_id", residentId)
              .is("archived_at", null)
              .order("noted_at", { ascending: false }),
          "Allergies could not be loaded.",
        )) ?? []
      );
    },

    async saveAllergy(residentId, values, id = null) {
      return run(
        "health_allergy_save",
        () =>
          client().rpc("health_allergy_save", {
            p_id: id,
            p_resident_id: residentId,
            p_allergen: values.allergen,
            p_reaction: nullable(values.reaction),
            p_severity: values.severity,
            p_status: values.status,
          }),
        "The allergy record could not be saved.",
      );
    },

    async archiveAllergy(id) {
      return run(
        "health_allergy_archive",
        () => client().rpc("health_allergy_archive", { p_id: id }),
        "The allergy record could not be archived.",
      );
    },

    async listMedicalHistory(residentId) {
      validateId(residentId);
      return (
        (await run(
          "resident_medical_history",
          () =>
            client()
              .from("resident_medical_history")
              .select(
                "id,resident_id,condition_name,details,onset_date,status,noted_at,updated_at",
              )
              .eq("resident_id", residentId)
              .is("archived_at", null)
              .order("noted_at", { ascending: false }),
          "Medical history could not be loaded.",
        )) ?? []
      );
    },

    async saveMedicalHistory(residentId, values, id = null) {
      return run(
        "health_medical_history_save",
        () =>
          client().rpc("health_medical_history_save", {
            p_id: id,
            p_resident_id: residentId,
            p_condition_name: values.condition_name,
            p_details: nullable(values.details),
            p_onset_date: nullable(values.onset_date),
            p_status: values.status,
          }),
        "The medical-history record could not be saved.",
      );
    },

    async archiveMedicalHistory(id) {
      return run(
        "health_medical_history_archive",
        () => client().rpc("health_medical_history_archive", { p_id: id }),
        "The medical-history record could not be archived.",
      );
    },
  };
}

export const healthRecordService = createHealthRecordService();
