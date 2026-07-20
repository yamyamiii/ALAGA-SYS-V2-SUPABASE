import { getSupabaseClient } from "@/lib/supabase/client";
import { DEPLOYMENT_BARANGAY } from "@/config/deployment";

const RESIDENT_WRITE_FIELDS = Object.freeze([
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "date_of_birth",
  "sex",
  "civil_status",
  "blood_type",
  "nationality",
  "religion",
  "phone_number",
  "email",
  "occupation",
  "household_id",
  "purok_id",
  "address_line",
  "philhealth_number",
  "emergency_contact_name",
  "emergency_contact_number",
  "emergency_contact_relationship",
  "is_senior_citizen",
  "is_pwd",
  "pregnancy_status",
  "status",
]);

const HOUSEHOLD_WRITE_FIELDS = Object.freeze([
  "purok_id",
  "address_line",
  "latitude",
  "longitude",
  "status",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RegistryServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "RegistryServiceError";
    this.code = code;
  }
}

function nullable(value) {
  return value === "" || value === undefined ? null : value;
}

function pick(values, fields) {
  return Object.fromEntries(
    fields.map((field) => [field, nullable(values[field])]),
  );
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (/Brgy\. Bagongpook|deployment context|deployment purok/i.test(message)) {
    return new RegistryServiceError(
      "deployment_context_invalid",
      message ||
        "The Brgy. Bagongpook deployment reference data is not configured correctly.",
      { cause: error },
    );
  }
  if (/row-level security|permission denied/i.test(message)) {
    return new RegistryServiceError(
      "permission_denied",
      "You do not have permission to complete this registry action.",
      { cause: error },
    );
  }
  if (/household head|head before moving|head before.*archiv/i.test(message)) {
    return new RegistryServiceError(
      "household_head_conflict",
      "Assign a different household head before moving or archiving this resident.",
      { cause: error },
    );
  }
  if (/match.*locality|purok.*barangay|foreign key/i.test(message)) {
    return new RegistryServiceError(
      "locality_mismatch",
      "The barangay, purok, resident, and household locality must match.",
      { cause: error },
    );
  }
  if (/duplicate key|unique constraint/i.test(message)) {
    return new RegistryServiceError(
      "duplicate_record",
      "A registry record with that unique value already exists.",
      { cause: error },
    );
  }
  return new RegistryServiceError("registry_request_failed", fallback, {
    cause: error,
  });
}

function reportDeveloperDiagnostic(operation, error, mappedCode) {
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    console.warn("[ALAGA-SYS registry diagnostic]", {
      operation,
      providerCode: error?.code ?? "none",
      mappedCode,
    });
  }
}

function resultPage(data, page, pageSize) {
  return {
    items: data ?? [],
    total: Number(data?.[0]?.total_count ?? 0),
    page,
    page_size: pageSize,
  };
}

export function buildHouseholdListParameters(filters, barangayId = null) {
  return {
    p_search: nullable(filters.search?.trim()),
    p_barangay_id: nullable(barangayId),
    p_purok_id: nullable(filters.purok_id),
    p_status: nullable(filters.status),
    p_include_archived:
      Boolean(filters.include_archived) || filters.status === "archived",
    p_sort: filters.sort ?? "household_number",
    p_direction: filters.direction ?? "asc",
    p_limit: filters.page_size ?? 20,
    p_offset: ((filters.page ?? 1) - 1) * (filters.page_size ?? 20),
  };
}

export function buildResidentListParameters(filters, barangayId = null) {
  const booleanFilter = (value) =>
    value === true || value === "true"
      ? true
      : value === false || value === "false"
        ? false
        : null;
  return {
    p_search: nullable(filters.search?.trim()),
    p_barangay_id: nullable(barangayId),
    p_purok_id: nullable(filters.purok_id),
    p_sex: nullable(filters.sex),
    p_status: nullable(filters.status),
    p_is_senior_citizen: booleanFilter(filters.is_senior_citizen),
    p_is_pwd: booleanFilter(filters.is_pwd),
    p_household_filter: filters.household_filter ?? "all",
    p_archive_filter: filters.archive_filter ?? "current",
    p_sort: filters.sort ?? "resident_number",
    p_direction: filters.direction ?? "asc",
    p_limit: filters.page_size ?? 20,
    p_offset: ((filters.page ?? 1) - 1) * (filters.page_size ?? 20),
  };
}

export function createRegistryService(clientProvider = getSupabaseClient) {
  let deploymentContextPromise;

  function client() {
    return clientProvider();
  }

  async function singleResult(query, fallback) {
    const { data, error } = await query;
    if (error || !data) throw mapError(error, fallback);
    return data;
  }

  function validateDeploymentContext(rows) {
    const expected = DEPLOYMENT_BARANGAY.expectedPuroks;
    const names = rows?.map((row) => row.purok_name) ?? [];
    const barangayIds = new Set(rows?.map((row) => row.barangay_id));
    const validNames =
      names.length === expected.length &&
      expected.every((name) => names.includes(name)) &&
      !names.includes("Purok 8");

    if (!validNames || barangayIds.size !== 1) {
      throw new RegistryServiceError(
        "deployment_context_invalid",
        "Brgy. Bagongpook must have exactly seven active puroks named Purok 1 through Purok 7.",
      );
    }

    return {
      barangay: {
        id: rows[0].barangay_id,
        name: rows[0].barangay_name,
      },
      puroks: rows.map((row) => ({
        id: row.purok_id,
        barangay_id: row.barangay_id,
        name: row.purok_name,
        code: row.purok_code,
      })),
    };
  }

  async function loadDeploymentContext() {
    const { data, error } = await client().rpc(
      "registry_get_deployment_context",
    );
    if (error) {
      throw mapError(
        error,
        "The Brgy. Bagongpook deployment context could not be loaded.",
      );
    }
    return validateDeploymentContext(data);
  }

  async function resolveDeploymentContext() {
    if (!deploymentContextPromise) {
      deploymentContextPromise = loadDeploymentContext().catch((error) => {
        deploymentContextPromise = undefined;
        throw error;
      });
    }
    return deploymentContextPromise;
  }

  async function resolvePurok(purokId) {
    const context = await resolveDeploymentContext();
    const purok = context.puroks.find((item) => item.id === purokId);
    if (!purok) {
      throw new RegistryServiceError(
        "locality_mismatch",
        "Select an active Purok 1 through Purok 7 in Brgy. Bagongpook.",
      );
    }
    return purok;
  }

  return {
    resolveDeploymentContext,

    async listHouseholds(filters) {
      const context = await resolveDeploymentContext();
      const { data, error } = await client().rpc(
        "registry_list_households",
        buildHouseholdListParameters(filters, context.barangay.id),
      );
      if (error) throw mapError(error, "Households could not be loaded.");
      return resultPage(data, filters.page ?? 1, filters.page_size ?? 20);
    },

    async listResidents(filters) {
      const context = await resolveDeploymentContext();
      const { data, error } = await client().rpc(
        "registry_list_residents",
        buildResidentListParameters(filters, context.barangay.id),
      );
      if (error) throw mapError(error, "Residents could not be loaded.");
      return resultPage(data, filters.page ?? 1, filters.page_size ?? 20);
    },

    async listPuroks() {
      const context = await resolveDeploymentContext();
      return context.puroks;
    },

    async listHouseholdOptions(purokId) {
      if (!purokId) return [];
      const purok = await resolvePurok(purokId);
      const { data, error } = await client()
        .from("households")
        .select("id, household_number, barangay_id, purok_id, address_line")
        .eq("barangay_id", purok.barangay_id)
        .eq("purok_id", purokId)
        .is("archived_at", null)
        .order("household_number")
        .limit(100);
      if (error) throw mapError(error, "Households could not be loaded.");
      return data ?? [];
    },

    async listAssignableResidents({ purokId, search = "" }) {
      if (!purokId) return [];
      const purok = await resolvePurok(purokId);
      let query = client()
        .from("residents")
        .select(
          "id, resident_number, first_name, middle_name, last_name, suffix, household_id, barangay_id, purok_id",
        )
        .eq("barangay_id", purok.barangay_id)
        .eq("purok_id", purokId)
        .is("archived_at", null)
        .order("last_name")
        .limit(100);
      if (search.trim()) {
        query = query.ilike("last_name", `%${search.trim()}%`);
      }
      const { data, error } = await query;
      if (error) throw mapError(error, "Residents could not be loaded.");
      return data ?? [];
    },

    getHousehold(id) {
      return singleResult(
        client()
          .from("households")
          .select(
            "id, household_number, barangay_id, purok_id, address_line, latitude, longitude, head_resident_id, status, created_at, updated_at, archived_at, barangay:barangays(id,name,city_or_municipality,province), purok:puroks(id,name,code)",
          )
          .eq("id", id)
          .single(),
        "The household could not be loaded.",
      );
    },

    async listHouseholdMembers(id) {
      const { data, error } = await client()
        .from("residents")
        .select(
          "id, resident_number, first_name, middle_name, last_name, suffix, date_of_birth, sex, status, archived_at",
        )
        .eq("household_id", id)
        .is("archived_at", null)
        .order("last_name");
      if (error)
        throw mapError(error, "Household members could not be loaded.");
      return data ?? [];
    },

    async getResident(id) {
      if (!UUID_PATTERN.test(id ?? "")) {
        const invalidIdError = new RegistryServiceError(
          "invalid_resident_id",
          "The selected resident reference is invalid.",
        );
        reportDeveloperDiagnostic("resident_detail", null, invalidIdError.code);
        throw invalidIdError;
      }

      const { data, error } = await client()
        .from("residents")
        .select(
          "id, resident_number, linked_profile_id, household_id, barangay_id, purok_id, first_name, middle_name, last_name, suffix, date_of_birth, sex, civil_status, blood_type, nationality, religion, phone_number, email, occupation, address_line, philhealth_number, emergency_contact_name, emergency_contact_number, emergency_contact_relationship, is_senior_citizen, is_pwd, pregnancy_status, status, photo_path, created_by, updated_by, created_at, updated_at, archived_at, barangay:barangays(id,name,city_or_municipality,province), purok:puroks(id,name,code), household:households!residents_household_matches_location(id,household_number,address_line,status)",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        const mapped = mapError(error, "The resident could not be loaded.");
        reportDeveloperDiagnostic("resident_detail", error, mapped.code);
        throw mapped;
      }
      if (!data) {
        const notFoundError = new RegistryServiceError(
          "resident_not_found",
          "The resident record was not found or is not available to your account.",
        );
        reportDeveloperDiagnostic("resident_detail", null, notFoundError.code);
        throw notFoundError;
      }

      return data;
    },

    async createHousehold(values) {
      const purok = await resolvePurok(values.purok_id);
      const payload = pick(values, HOUSEHOLD_WRITE_FIELDS);
      payload.barangay_id = purok.barangay_id;
      payload.status = "active";
      return singleResult(
        client()
          .from("households")
          .insert(payload)
          .select("id, household_number")
          .single(),
        "The household could not be created.",
      );
    },

    async updateHousehold(id, values) {
      const purok = await resolvePurok(values.purok_id);
      const payload = pick(values, HOUSEHOLD_WRITE_FIELDS);
      payload.barangay_id = purok.barangay_id;
      return singleResult(
        client()
          .from("households")
          .update(payload)
          .eq("id", id)
          .select("id, household_number")
          .single(),
        "The household changes could not be saved.",
      );
    },

    setHouseholdStatus(id, status) {
      return singleResult(
        client()
          .from("households")
          .update({ status })
          .eq("id", id)
          .select("id, household_number, status, archived_at")
          .single(),
        `The household could not be ${status === "archived" ? "archived" : "restored"}.`,
      );
    },

    setHouseholdHead(id, residentId) {
      return singleResult(
        client()
          .from("households")
          .update({ head_resident_id: nullable(residentId) })
          .eq("id", id)
          .select("id, head_resident_id")
          .single(),
        "The household head could not be changed.",
      );
    },

    async assignResidentToHousehold(residentId, household) {
      const purok = await resolvePurok(household.purok_id);
      return singleResult(
        client()
          .from("residents")
          .update({
            household_id: household.id,
            barangay_id: purok.barangay_id,
            purok_id: purok.id,
          })
          .eq("id", residentId)
          .select("id, household_id")
          .single(),
        "The resident could not be assigned to this household.",
      );
    },

    removeResidentFromHousehold(residentId) {
      return singleResult(
        client()
          .from("residents")
          .update({ household_id: null })
          .eq("id", residentId)
          .select("id, household_id")
          .single(),
        "The resident could not be removed from this household.",
      );
    },

    async createResident(values) {
      const purok = await resolvePurok(values.purok_id);
      const payload = pick(values, RESIDENT_WRITE_FIELDS);
      payload.barangay_id = purok.barangay_id;
      return singleResult(
        client()
          .from("residents")
          .insert(payload)
          .select("id, resident_number")
          .single(),
        "The resident could not be created.",
      );
    },

    async updateResident(id, values) {
      const purok = await resolvePurok(values.purok_id);
      const payload = pick(values, RESIDENT_WRITE_FIELDS);
      payload.barangay_id = purok.barangay_id;
      return singleResult(
        client()
          .from("residents")
          .update(payload)
          .eq("id", id)
          .select("id, resident_number")
          .single(),
        "The resident changes could not be saved.",
      );
    },

    setResidentStatus(id, status) {
      return singleResult(
        client()
          .from("residents")
          .update({ status })
          .eq("id", id)
          .select("id, resident_number, status, archived_at")
          .single(),
        `The resident could not be ${status === "archived" ? "archived" : "restored"}.`,
      );
    },
  };
}

export const registryService = createRegistryService();
