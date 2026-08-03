import { DOCUMENT_RPC } from "@/features/documents/constants";
import { getSupabaseClient } from "@/lib/supabase/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 20_000;

export class DocumentServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "DocumentServiceError";
    this.code = code;
  }
}

function validateId(id, label = "document") {
  if (!UUID_PATTERN.test(id ?? "")) {
    throw new DocumentServiceError(
      "invalid_document_id",
      `The ${label} reference is invalid.`,
    );
  }
}

function mapError(error, fallback) {
  const message = error?.message ?? "";
  if (/changed by another user|could not serialize/i.test(message)) {
    return new DocumentServiceError(
      "stale_referral",
      "This referral changed in another session. Reload it before continuing.",
      { cause: error },
    );
  }
  if (/request key was reused|already exists|duplicate/i.test(message)) {
    return new DocumentServiceError(
      "duplicate_referral",
      "A referral already exists for this encounter.",
      { cause: error },
    );
  }
  if (/not found|unavailable/i.test(message) || error?.code === "P0002") {
    return new DocumentServiceError(
      "document_unavailable",
      "The document is unavailable or the record no longer qualifies.",
      { cause: error },
    );
  }
  if (
    /permission|access denied|requires|outside your clinical scope/i.test(
      message,
    )
  ) {
    return new DocumentServiceError(
      "permission_denied",
      "You do not have permission to generate this document.",
      { cause: error },
    );
  }
  if (/immutable|only your referral draft/i.test(message)) {
    return new DocumentServiceError(
      "referral_immutable",
      "This referral is finalized and can no longer be edited.",
      { cause: error },
    );
  }
  if (/timeout/i.test(message)) {
    return new DocumentServiceError(
      "timeout",
      "The document service took too long to respond. Please try again.",
      { cause: error },
    );
  }
  if (/fetch|network|connection|offline|aborted/i.test(message)) {
    return new DocumentServiceError(
      "network_error",
      "The document service could not be reached. Check your connection and try again.",
      { cause: error },
    );
  }
  return new DocumentServiceError("document_request_failed", fallback, {
    cause: error,
  });
}

function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new DocumentServiceError(
      "offline",
      "You are offline. Reconnect before loading a protected document.",
    );
  }
}

function diagnostic(operation, error, code) {
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    console.warn("[ALAGA-SYS document diagnostic]", {
      operation,
      providerCode: error?.code ?? "none",
      mappedCode: code,
    });
  }
}

async function run(client, operation, parameters, fallback) {
  ensureOnline();
  let timeoutId;
  try {
    const result = await Promise.race([
      client.rpc(operation, parameters),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Document request timeout")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    const mapped = mapError(error, fallback);
    diagnostic(operation, error, mapped.code);
    throw mapped;
  } finally {
    clearTimeout(timeoutId);
  }
}

function firstRow(data, fallback) {
  if (!Array.isArray(data) || !data[0]) {
    throw new DocumentServiceError("invalid_response", fallback);
  }
  return data[0];
}

export function createDocumentService(clientProvider = getSupabaseClient) {
  const client = () => clientProvider();

  return {
    async getDocument(type, recordId) {
      const contract = DOCUMENT_RPC[type];
      if (!contract) {
        throw new DocumentServiceError(
          "invalid_document_type",
          "The requested document type is not supported.",
        );
      }
      validateId(recordId);
      const data = await run(
        client(),
        contract.name,
        { [contract.parameter]: recordId },
        "The protected document could not be loaded.",
      );
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new DocumentServiceError(
          "invalid_response",
          "The document response was invalid.",
        );
      }
      return data;
    },

    async getReferralForEncounter(encounterId) {
      validateId(encounterId, "encounter");
      const data = await run(
        client(),
        "referral_for_encounter",
        { p_encounter_id: encounterId },
        "The referral status could not be loaded.",
      );
      return data ?? null;
    },

    async saveReferral(
      encounterId,
      values,
      current = null,
      requestKey = crypto.randomUUID(),
    ) {
      validateId(encounterId, "encounter");
      if (current?.id) validateId(current.id, "referral");
      const data = await run(
        client(),
        "referral_save",
        {
          p_id: current?.id ?? null,
          p_expected_version: current?.version ?? null,
          p_encounter_id: encounterId,
          p_receiving_facility: values.receiving_facility.trim(),
          p_reason_for_referral: values.reason_for_referral.trim(),
          p_clinical_summary: values.clinical_summary.trim(),
          p_request_key: current ? null : requestKey,
        },
        "The referral draft could not be saved.",
      );
      return firstRow(data, "The referral response was invalid.");
    },

    async finalizeReferral(referral) {
      validateId(referral?.id, "referral");
      const data = await run(
        client(),
        "referral_finalize",
        {
          p_referral_id: referral.id,
          p_expected_version: referral.version,
        },
        "The referral could not be finalized.",
      );
      return firstRow(data, "The referral response was invalid.");
    },

    async archiveReferral(referral) {
      validateId(referral?.id, "referral");
      const data = await run(
        client(),
        "referral_archive",
        {
          p_referral_id: referral.id,
          p_expected_version: referral.version,
        },
        "The referral could not be archived.",
      );
      return firstRow(data, "The referral response was invalid.");
    },
  };
}

export const documentService = createDocumentService();
