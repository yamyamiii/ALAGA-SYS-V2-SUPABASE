import { getSupabaseClient } from "@/lib/supabase/client";

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
  "barangay_id",
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
  "barangay_id",
  "purok_id",
  "address_line",
  "latitude",
  "longitude",
  "status",
]);

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

function resultPage(data, page, pageSize) {
  return {
    items: data ?? [],
    total: Number(data?.[0]?.total_count ?? 0),
    page,
    page_size: pageSize,
  };
}

export function buildHouseholdListParameters(filters) {
  return {
    p_search: nullable(filters.search?.trim()),
    p_barangay_id: nullable(filters.barangay_id),
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

export function buildResidentListParameters(filters) {
  const booleanFilter = (value) =>
    value === true || value === "true"
      ? true
      : value === false || value === "false"
        ? false
        : null;
  return {
    p_search: nullable(filters.search?.trim()),
    p_barangay_id: nullable(filters.barangay_id),
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
  function client() {
    return clientProvider();
  }

  async function singleResult(query, fallback) {
    const { data, error } = await query;
    if (error || !data) throw mapError(error, fallback);
    return data;
  }

  return {
    async listHouseholds(filters) {
      const { data, error } = await client().rpc(
        "registry_list_households",
        buildHouseholdListParameters(filters),
      );
      if (error) throw mapError(error, "Households could not be loaded.");
      return resultPage(data, filters.page ?? 1, filters.page_size ?? 20);
    },

    async listResidents(filters) {
      const { data, error } = await client().rpc(
        "registry_list_residents",
        buildResidentListParameters(filters),
      );
      if (error) throw mapError(error, "Residents could not be loaded.");
      return resultPage(data, filters.page ?? 1, filters.page_size ?? 20);
    },

    async listBarangays() {
      const { data, error } = await client()
        .from("barangays")
        .select("id, name, city_or_municipality, province")
        .eq("is_active", true)
        .order("name");
      if (error) throw mapError(error, "Barangays could not be loaded.");
      return data ?? [];
    },

    async listPuroks(barangayId) {
      if (!barangayId) return [];
      const { data, error } = await client()
        .from("puroks")
        .select("id, barangay_id, name, code")
        .eq("barangay_id", barangayId)
        .eq("is_active", true)
        .order("name");
      if (error) throw mapError(error, "Puroks could not be loaded.");
      return data ?? [];
    },

    async listHouseholdOptions(barangayId, purokId) {
      if (!barangayId || !purokId) return [];
      const { data, error } = await client()
        .from("households")
        .select("id, household_number, barangay_id, purok_id, address_line")
        .eq("barangay_id", barangayId)
        .eq("purok_id", purokId)
        .is("archived_at", null)
        .order("household_number")
        .limit(100);
      if (error) throw mapError(error, "Households could not be loaded.");
      return data ?? [];
    },

    async listAssignableResidents({ barangayId, purokId, search = "" }) {
      if (!barangayId || !purokId) return [];
      let query = client()
        .from("residents")
        .select(
          "id, resident_number, first_name, middle_name, last_name, suffix, household_id, barangay_id, purok_id",
        )
        .eq("barangay_id", barangayId)
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

    getResident(id) {
      return singleResult(
        client()
          .from("residents")
          .select(
            "id, resident_number, linked_profile_id, household_id, barangay_id, purok_id, first_name, middle_name, last_name, suffix, date_of_birth, sex, civil_status, blood_type, nationality, religion, phone_number, email, occupation, address_line, philhealth_number, emergency_contact_name, emergency_contact_number, emergency_contact_relationship, is_senior_citizen, is_pwd, pregnancy_status, status, photo_path, created_by, updated_by, created_at, updated_at, archived_at, barangay:barangays(id,name,city_or_municipality,province), purok:puroks(id,name,code), household:households(id,household_number,address_line,status)",
          )
          .eq("id", id)
          .single(),
        "The resident could not be loaded.",
      );
    },

    createHousehold(values) {
      const payload = pick(values, HOUSEHOLD_WRITE_FIELDS);
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

    updateHousehold(id, values) {
      return singleResult(
        client()
          .from("households")
          .update(pick(values, HOUSEHOLD_WRITE_FIELDS))
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

    assignResidentToHousehold(residentId, household) {
      return singleResult(
        client()
          .from("residents")
          .update({
            household_id: household.id,
            barangay_id: household.barangay_id,
            purok_id: household.purok_id,
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

    createResident(values) {
      return singleResult(
        client()
          .from("residents")
          .insert(pick(values, RESIDENT_WRITE_FIELDS))
          .select("id, resident_number")
          .single(),
        "The resident could not be created.",
      );
    },

    updateResident(id, values) {
      return singleResult(
        client()
          .from("residents")
          .update(pick(values, RESIDENT_WRITE_FIELDS))
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
