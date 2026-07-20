import { getSupabaseClient } from "@/lib/supabase/client";

const FALLBACK_MESSAGE =
  "The user-management request could not be completed. Please try again.";

export class UserManagementServiceError extends Error {
  constructor(code, message = FALLBACK_MESSAGE, options = {}) {
    super(message, { cause: options.cause });
    this.name = "UserManagementServiceError";
    this.code = code;
  }
}

async function functionError(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error?.code && body?.error?.message) {
      return new UserManagementServiceError(
        body.error.code,
        body.error.message,
        { cause: error },
      );
    }
  } catch {
    // The safe fallback below covers unavailable or non-JSON function errors.
  }
  return new UserManagementServiceError(
    "function_unavailable",
    FALLBACK_MESSAGE,
    { cause: error },
  );
}

export function createUserManagementService(
  clientProvider = getSupabaseClient,
) {
  async function invoke(action, payload) {
    const client = clientProvider();
    const { data, error } = await client.functions.invoke("manage-user", {
      body: { action, payload },
    });
    if (error) throw await functionError(error);
    if (!data || typeof data !== "object" || !("data" in data)) {
      throw new UserManagementServiceError(
        "invalid_response",
        "The user-management service returned an invalid response.",
      );
    }
    return data.data;
  }

  return {
    listUsers(filters) {
      return invoke("list_users", filters);
    },
    getUser(userId) {
      return invoke("get_user", { user_id: userId }).then(
        (result) => result.user,
      );
    },
    inviteUser(values) {
      return invoke("invite_user", values).then((result) => result.user);
    },
    createUser(values) {
      return invoke("create_user", values);
    },
    resendInvitation(userId) {
      return invoke("resend_invitation", { user_id: userId }).then(
        (result) => result.user,
      );
    },
    updateRole(userId, role) {
      return invoke("update_role", { user_id: userId, role }).then(
        (result) => result.user,
      );
    },
    updateAccountStatus(userId, accountStatus) {
      return invoke("update_account_status", {
        user_id: userId,
        account_status: accountStatus,
      }).then((result) => result.user);
    },
    updateProfile(userId, values) {
      return invoke("update_profile", { user_id: userId, ...values }).then(
        (result) => result.user,
      );
    },
    listResidentLinkCandidates(filters) {
      return invoke("list_resident_link_candidates", filters);
    },
    getResidentAccount(residentId) {
      return invoke("get_resident_account", {
        resident_id: residentId,
      }).then((result) => result.account);
    },
    linkResidentAccount(residentId, profileId) {
      return invoke("link_resident_account", {
        resident_id: residentId,
        profile_id: profileId,
      });
    },
    unlinkResidentAccount(residentId) {
      return invoke("unlink_resident_account", { resident_id: residentId });
    },
    inviteResidentAccount(residentId, values) {
      return invoke("invite_resident_account", {
        resident_id: residentId,
        ...values,
      }).then((result) => result.account);
    },
  };
}

export const userManagementService = createUserManagementService();
