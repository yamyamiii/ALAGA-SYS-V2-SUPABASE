import { getSupabaseClient } from "@/lib/supabase/client";

async function withTimeout(request) {
  let timer;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("request_timeout")), 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class ResidentHealthHistoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ResidentHealthHistoryError";
    this.code = code;
  }
}

export function createResidentHealthHistoryService(
  clientProvider = getSupabaseClient,
) {
  async function read(name, parameters) {
    try {
      const { data, error } = await withTimeout(
        clientProvider().rpc(name, parameters),
      );
      if (error) throw error;
      return data;
    } catch (error) {
      throw new ResidentHealthHistoryError(
        error?.code === "42501" ? "permission_denied" : "history_unavailable",
        error?.code === "42501"
          ? "Health history is available only to an active, linked Resident account."
          : "Your health history could not be loaded. Please try again.",
      );
    }
  }

  return {
    async list({ page = 1, page_size = 20 } = {}) {
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isInteger(page_size) ||
        page_size < 1 ||
        page_size > 100 ||
        (page - 1) * page_size > 2147483647
      ) {
        throw new ResidentHealthHistoryError(
          "invalid_pagination",
          "The requested history page is invalid.",
        );
      }
      // No browser-supplied Resident/profile identifier is ever transmitted.
      const data = await read("resident_health_history_list", {
        p_limit: page_size,
        p_offset: (page - 1) * page_size,
      });
      if (
        !Array.isArray(data?.items) ||
        !Number.isSafeInteger(Number(data.total))
      ) {
        throw new ResidentHealthHistoryError(
          "invalid_response",
          "Your health history could not be loaded.",
        );
      }
      return { items: data.items, total: Number(data.total) };
    },
    async get(encounterId) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          encounterId ?? "",
        )
      ) {
        throw new ResidentHealthHistoryError(
          "history_not_found",
          "This finalized record is unavailable to your account.",
        );
      }
      const data = await read("resident_health_history_get", {
        p_encounter_id: encounterId,
      });
      if (!data) {
        throw new ResidentHealthHistoryError(
          "history_not_found",
          "This finalized record is unavailable to your account.",
        );
      }
      return data;
    },
  };
}

export const residentHealthHistoryService =
  createResidentHealthHistoryService();
