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
  "status",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESIDENT_PHOTO_BUCKET = "resident-photos";
const MAX_RESIDENT_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

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

function photoError(code, message, cause) {
  return new RegistryServiceError(code, message, { cause });
}

export async function validateResidentPhoto(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw photoError("photo_required", "Choose a resident photo to upload.");
  }
  if (file.size > MAX_RESIDENT_PHOTO_BYTES) {
    throw photoError(
      "photo_too_large",
      "Resident photos must be 5 MB or smaller.",
    );
  }
  if (!PHOTO_MIME_TYPES[file.type]) {
    throw photoError(
      "photo_type_invalid",
      "Use a JPEG, PNG, or WebP resident photo.",
    );
  }

  const bytes = new Uint8Array((await file.arrayBuffer()).slice(0, 16));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const detectedMime = isJpeg
    ? "image/jpeg"
    : isPng
      ? "image/png"
      : isWebp
        ? "image/webp"
        : null;

  if (!detectedMime || detectedMime !== file.type) {
    throw photoError(
      "photo_content_invalid",
      "The selected file content does not match its image type.",
    );
  }
  return { mimeType: detectedMime, extension: PHOTO_MIME_TYPES[detectedMime] };
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

    async searchHouseholds({ purokId, search = "", page = 1, pageSize = 10 }) {
      if (!purokId) return { items: [], total: 0, page, page_size: pageSize };
      await resolvePurok(purokId);
      const { data, error } = await client().rpc("registry_search_households", {
        p_purok_id: purokId,
        p_search: nullable(search.trim()),
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      if (error) throw mapError(error, "Households could not be searched.");
      return resultPage(data, page, pageSize);
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
            "id, household_number, barangay_id, purok_id, address_line, head_resident_id, status, created_at, updated_at, archived_at, barangay:barangays(id,name,city_or_municipality,province), purok:puroks(id,name,code)",
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

    async findResidentDuplicates(values, excludeId = null) {
      const { data, error } = await client().rpc(
        "registry_find_resident_duplicates",
        {
          p_first_name: values.first_name,
          p_middle_name: nullable(values.middle_name),
          p_last_name: values.last_name,
          p_suffix: nullable(values.suffix),
          p_date_of_birth: values.date_of_birth,
          p_sex: values.sex,
          p_phone_number: nullable(values.phone_number),
          p_exclude_id: nullable(excludeId),
        },
      );
      if (error) {
        throw mapError(
          error,
          "Potential duplicate residents could not be checked.",
        );
      }
      return data ?? [];
    },

    async createResidentPhotoUrl(photoPath) {
      if (!photoPath) return null;
      const { data, error } = await client()
        .storage.from(RESIDENT_PHOTO_BUCKET)
        .createSignedUrl(photoPath, 300);
      if (error || !data?.signedUrl) {
        throw photoError(
          "photo_url_failed",
          "The resident photo could not be displayed.",
          error,
        );
      }
      return data.signedUrl;
    },

    async uploadResidentPhoto(
      residentId,
      file,
      oldPhotoPath = null,
      onProgress,
    ) {
      if (!UUID_PATTERN.test(residentId ?? "")) {
        throw photoError(
          "invalid_resident_id",
          "The resident reference is invalid.",
        );
      }
      const validated = await validateResidentPhoto(file);
      const objectPath = `${residentId}/${crypto.randomUUID()}.${validated.extension}`;
      onProgress?.({ stage: "uploading", percent: 20 });
      const storage = client().storage.from(RESIDENT_PHOTO_BUCKET);
      const { error: uploadError } = await storage.upload(objectPath, file, {
        cacheControl: "3600",
        contentType: validated.mimeType,
        upsert: false,
      });
      if (uploadError) {
        throw photoError(
          "photo_upload_failed",
          "The resident photo could not be uploaded. The existing photo relationship was not changed.",
          uploadError,
        );
      }

      onProgress?.({ stage: "saving", percent: 70 });
      const { data, error: updateError } = await client()
        .from("residents")
        .update({ photo_path: objectPath })
        .eq("id", residentId)
        .select("id, photo_path")
        .single();
      if (updateError || !data) {
        await storage.remove([objectPath]).catch(() => undefined);
        throw mapError(
          updateError,
          "The uploaded photo could not be attached to the resident record.",
        );
      }

      let cleanupWarning = null;
      if (oldPhotoPath && oldPhotoPath !== objectPath) {
        onProgress?.({ stage: "cleaning", percent: 90 });
        const { error: cleanupError } = await storage.remove([oldPhotoPath]);
        if (cleanupError) {
          cleanupWarning =
            "The new photo was saved, but the previous private object could not be cleaned up automatically.";
          reportDeveloperDiagnostic(
            "resident_photo_cleanup",
            cleanupError,
            "cleanup_failed",
          );
        }
      }
      onProgress?.({ stage: "complete", percent: 100 });
      return { ...data, cleanupWarning };
    },

    async removeResidentPhoto(residentId, photoPath) {
      if (!photoPath) return { id: residentId, photo_path: null };
      const { data, error: updateError } = await client()
        .from("residents")
        .update({ photo_path: null })
        .eq("id", residentId)
        .select("id, photo_path")
        .single();
      if (updateError || !data) {
        throw mapError(updateError, "The resident photo could not be removed.");
      }
      const { error: removeError } = await client()
        .storage.from(RESIDENT_PHOTO_BUCKET)
        .remove([photoPath]);
      return {
        ...data,
        cleanupWarning: removeError
          ? "The photo was detached, but its private object requires administrator cleanup."
          : null,
      };
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

    async createResident(values, options = {}) {
      const purok = await resolvePurok(values.purok_id);
      const payload = pick(values, RESIDENT_WRITE_FIELDS);
      payload.barangay_id = purok.barangay_id;
      const saved = await singleResult(
        client()
          .from("residents")
          .insert(payload)
          .select("id, resident_number")
          .single(),
        "The resident could not be created.",
      );
      if (options.duplicateMatchCount) {
        const { error } = await client().rpc(
          "registry_record_duplicate_override",
          {
            p_resident_id: saved.id,
            p_match_count: options.duplicateMatchCount,
            p_operation: "create",
          },
        );
        if (error) {
          throw new RegistryServiceError(
            "duplicate_audit_failed_after_save",
            "The resident was created, but the duplicate-review audit could not be recorded. Contact an administrator before retrying.",
            { cause: error },
          );
        }
      }
      return saved;
    },

    async updateResident(id, values, options = {}) {
      const purok = await resolvePurok(values.purok_id);
      const payload = pick(values, RESIDENT_WRITE_FIELDS);
      payload.barangay_id = purok.barangay_id;
      const saved = await singleResult(
        client()
          .from("residents")
          .update(payload)
          .eq("id", id)
          .select("id, resident_number")
          .single(),
        "The resident changes could not be saved.",
      );
      if (options.duplicateMatchCount) {
        const { error } = await client().rpc(
          "registry_record_duplicate_override",
          {
            p_resident_id: saved.id,
            p_match_count: options.duplicateMatchCount,
            p_operation: "update",
          },
        );
        if (error) {
          throw new RegistryServiceError(
            "duplicate_audit_failed_after_save",
            "The resident was updated, but the duplicate-review audit could not be recorded. Contact an administrator before retrying.",
            { cause: error },
          );
        }
      }
      return saved;
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
