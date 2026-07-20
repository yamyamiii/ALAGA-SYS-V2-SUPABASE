import { getSupabaseClient } from "@/lib/supabase/client";

const safeProfileFields = [
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "phone_number",
];

export class ProfileServiceError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ProfileServiceError";
  }
}

function safeValues(values) {
  return Object.fromEntries(
    safeProfileFields.map((field) => [field, values[field] || null]),
  );
}

export function createProfileService(clientProvider = getSupabaseClient) {
  async function currentUser(client) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      throw new ProfileServiceError(
        "Your session could not be verified. Please sign in again.",
        { cause: error },
      );
    }
    return data.user;
  }

  return {
    async getOwnProfile() {
      const client = clientProvider();
      const user = await currentUser(client);
      const { data, error } = await client
        .from("profiles")
        .select(
          "id, first_name, middle_name, last_name, suffix, phone_number, role, account_status",
        )
        .eq("id", user.id)
        .single();
      if (error || !data) {
        throw new ProfileServiceError(
          "Your profile could not be loaded. Please try again.",
          { cause: error },
        );
      }
      return data;
    },

    async updateOwnProfile(values) {
      const client = clientProvider();
      const user = await currentUser(client);
      const { data, error } = await client
        .from("profiles")
        .update(safeValues(values))
        .eq("id", user.id)
        .select(
          "id, first_name, middle_name, last_name, suffix, phone_number, role, account_status",
        )
        .single();
      if (error || !data) {
        throw new ProfileServiceError(
          "Your profile changes could not be saved.",
          { cause: error },
        );
      }
      return data;
    },
  };
}

export const profileService = createProfileService();
