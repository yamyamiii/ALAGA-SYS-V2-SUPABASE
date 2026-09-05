import { createClient } from "npm:@supabase/supabase-js@2";

import { auditFailure } from "./audit.ts";
import {
  accountDeletionBlockerMessage,
  assertNotSelf,
  authorizeAdministrator,
  ManageUserError,
  mapAuthAdminError,
  mapDatabaseError,
  sanitizeUser,
  validateManageUserRequest,
} from "./domain.ts";
import {
  corsHeaders,
  corsPreflightResponse,
  parseAllowedOrigins,
} from "./cors.ts";
import {
  databaseDiagnostic,
  DatabaseActionError,
} from "./databaseDiagnostics.ts";

type SupabaseClient = ReturnType<typeof createClient>;
type SafeRecord = Record<string, unknown>;

const MAX_BODY_BYTES = 32_768;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function firstNamedKey(variableName: string): string | null {
  const raw = Deno.env.get(variableName);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (
      (Object.values(parsed).find((value) => typeof value === "string") as
        string | undefined) ?? null
    );
  } catch {
    return null;
  }
}

function configuredAllowedOrigins() {
  const allowedOrigins = parseAllowedOrigins(
    Deno.env.get("ALLOWED_ORIGINS") ?? "",
  );
  if (allowedOrigins.size === 0) {
    throw new ManageUserError(
      "server_configuration_error",
      "Trusted application origins are not configured.",
      500,
    );
  }
  return allowedOrigins;
}

function environment(allowedOrigins: Set<string>) {
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    firstNamedKey("SUPABASE_PUBLISHABLE_KEYS");
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    firstNamedKey("SUPABASE_SECRET_KEYS");
  const invitationRedirectUrl = Deno.env.get("INVITATION_REDIRECT_URL");

  if (!url || !publishableKey || !secretKey) {
    throw new ManageUserError(
      "server_configuration_error",
      "The user-management service is not configured.",
      500,
    );
  }
  if (!invitationRedirectUrl) {
    throw new ManageUserError(
      "server_configuration_error",
      "Trusted origins and invitation redirects are not configured.",
      500,
    );
  }
  let invitationRedirect: URL;
  try {
    invitationRedirect = new URL(invitationRedirectUrl);
  } catch {
    throw new ManageUserError(
      "server_configuration_error",
      "INVITATION_REDIRECT_URL is invalid.",
      500,
    );
  }
  if (
    !allowedOrigins.has(invitationRedirect.origin) ||
    invitationRedirect.username ||
    invitationRedirect.password
  ) {
    throw new ManageUserError(
      "server_configuration_error",
      "INVITATION_REDIRECT_URL must use a trusted application origin.",
      500,
    );
  }

  return {
    url,
    publishableKey,
    secretKey,
    invitationRedirectUrl,
    allowedOrigins,
  };
}

function jsonResponse(
  body: SafeRecord,
  status: number,
  headers: Record<string, string>,
) {
  return Response.json(body, {
    status,
    headers: { ...headers, ...SECURITY_HEADERS },
  });
}

async function authenticatedCaller(
  request: Request,
  url: string,
  publishableKey: string,
) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ManageUserError(
      "authentication_required",
      "A valid signed-in session is required.",
      401,
    );
  }

  const client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) {
    throw new ManageUserError(
      "invalid_session",
      "The administrator session is invalid or expired.",
      401,
    );
  }
  return data.user;
}

async function callerProfile(admin: SupabaseClient, callerId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", callerId)
    .maybeSingle();
  if (error) {
    throw new ManageUserError(
      "authorization_unavailable",
      "Administrator authorization could not be verified.",
      503,
    );
  }
  return authorizeAdministrator(data);
}

async function rpc(
  admin: SupabaseClient,
  functionName: string,
  parameters: SafeRecord,
) {
  const { data, error } = await admin.rpc(functionName, parameters);
  if (error) throw new DatabaseActionError(error, functionName);
  return data;
}

async function deletionAssessmentByProfile(
  admin: SupabaseClient,
  actorId: string,
  profileIds: string[],
) {
  if (!profileIds.length) return new Map<string, SafeRecord>();
  const rows = (await rpc(admin, "admin_account_deletion_assessment", {
    p_actor_id: actorId,
    p_profile_ids: profileIds,
  })) as SafeRecord[];
  return new Map(
    rows.map((row) => [
      row.profile_id as string,
      {
        eligible: Boolean(row.eligible),
        kind: row.deletion_kind ?? null,
        blocker: row.blocker_code ?? null,
      },
    ]),
  );
}

async function safeUser(
  admin: SupabaseClient,
  actorId: string,
  targetId: string,
) {
  const rows = (await rpc(admin, "admin_get_user", {
    p_actor_id: actorId,
    p_target_id: targetId,
  })) as unknown[];
  const user = sanitizeUser(rows?.[0]);
  if (!user) {
    throw new ManageUserError(
      "user_not_found",
      "The requested user was not found.",
      404,
    );
  }
  const { data: registration, error: registrationError } = await admin
    .from("resident_registration_requests")
    .select("status, version")
    .eq("profile_id", targetId)
    .maybeSingle();
  if (registrationError) throw mapDatabaseError(registrationError);
  const assessment = (
    await deletionAssessmentByProfile(admin, actorId, [targetId])
  ).get(targetId);
  return {
    ...user,
    registration_status: registration?.status ?? null,
    registration_version: registration?.version ?? null,
    permanent_delete_eligible: Boolean(assessment?.eligible),
    permanent_delete_kind: assessment?.kind ?? null,
    permanent_delete_blocker: assessment?.blocker ?? null,
  };
}

function metadata(payload: SafeRecord) {
  return {
    first_name: payload.first_name,
    middle_name: payload.middle_name,
    last_name: payload.last_name,
    suffix: payload.suffix,
    phone_number: payload.phone_number,
  };
}

function sanitizeResidentAccount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as SafeRecord;
  return {
    id: row.id ?? null,
    email: row.email ?? null,
    first_name: row.first_name ?? null,
    middle_name: row.middle_name ?? null,
    last_name: row.last_name ?? null,
    suffix: row.suffix ?? null,
    account_status: row.account_status ?? null,
  };
}

function sanitizeResidentRegistration(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as SafeRecord;
  const possibleMatches = Array.isArray(row.possible_matches)
    ? row.possible_matches
    : [];
  return {
    id: row.id ?? null,
    profile_id: row.profile_id ?? null,
    email: row.email ?? null,
    first_name: row.first_name ?? null,
    middle_name: row.middle_name ?? null,
    last_name: row.last_name ?? null,
    date_of_birth: row.date_of_birth ?? null,
    sex: row.sex ?? null,
    purok_id: row.purok_id ?? null,
    purok_name: row.purok_name ?? null,
    address_line: row.address_line ?? null,
    phone_number: row.phone_number ?? null,
    status: row.registration_status ?? null,
    resident_id: row.resident_id ?? null,
    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    version: row.version ?? null,
    permanent_delete_eligible: Boolean(row.permanent_delete_eligible),
    permanent_delete_kind: row.permanent_delete_kind ?? null,
    possible_matches: possibleMatches
      .map((match) => {
        if (!match || typeof match !== "object" || Array.isArray(match)) {
          return null;
        }
        const candidate = match as SafeRecord;
        return {
          id: candidate.id ?? null,
          resident_number: candidate.resident_number ?? null,
          first_name: candidate.first_name ?? null,
          middle_name: candidate.middle_name ?? null,
          last_name: candidate.last_name ?? null,
          date_of_birth: candidate.date_of_birth ?? null,
          sex: candidate.sex ?? null,
          status: candidate.status ?? null,
          archived_at: candidate.archived_at ?? null,
          linked_profile_id: candidate.linked_profile_id ?? null,
          purok_name: candidate.purok_name ?? null,
        };
      })
      .filter(Boolean),
  };
}

async function finalizeProvisioning(
  admin: SupabaseClient,
  actorId: string,
  targetId: string,
  payload: SafeRecord,
  wasInvited: boolean,
) {
  await rpc(admin, "admin_finalize_user_provisioning", {
    p_actor_id: actorId,
    p_target_id: targetId,
    p_role: payload.role,
    p_account_status: wasInvited ? "invited" : "active",
    p_first_name: payload.first_name,
    p_middle_name: payload.middle_name,
    p_last_name: payload.last_name,
    p_suffix: payload.suffix,
    p_phone_number: payload.phone_number,
    p_was_invited: wasInvited,
  });
}

async function provisionUser(
  admin: SupabaseClient,
  actorId: string,
  payload: SafeRecord,
  invitationRedirectUrl: string,
  invited: boolean,
) {
  const authResult = invited
    ? await admin.auth.admin.inviteUserByEmail(payload.email as string, {
        data: metadata(payload),
        redirectTo: invitationRedirectUrl,
      })
    : await admin.auth.admin.createUser({
        email: payload.email as string,
        password: payload.temporary_password as string,
        email_confirm: true,
        user_metadata: metadata(payload),
        app_metadata: { requires_password_change: true },
      });

  if (authResult.error || !authResult.data.user) {
    throw mapAuthAdminError(authResult.error);
  }

  const targetId = authResult.data.user.id;
  try {
    await finalizeProvisioning(admin, actorId, targetId, payload, invited);
  } catch (error) {
    const compensation = await admin.auth.admin.deleteUser(targetId);
    if (compensation.error) {
      throw new ManageUserError(
        "provisioning_incomplete",
        "Auth creation succeeded but profile setup failed. An operator must reconcile this account.",
        500,
      );
    }
    throw error;
  }

  return safeUser(admin, actorId, targetId);
}

async function inviteAndLinkResident(
  admin: SupabaseClient,
  actorId: string,
  payload: SafeRecord,
  invitationRedirectUrl: string,
) {
  const authResult = await admin.auth.admin.inviteUserByEmail(
    payload.email as string,
    {
      data: metadata(payload),
      redirectTo: invitationRedirectUrl,
    },
  );
  if (authResult.error || !authResult.data.user) {
    throw mapAuthAdminError(authResult.error);
  }

  const targetId = authResult.data.user.id;
  try {
    await finalizeProvisioning(admin, actorId, targetId, payload, true);
    await rpc(admin, "admin_link_resident_profile", {
      p_actor_id: actorId,
      p_resident_id: payload.resident_id,
      p_profile_id: targetId,
    });
  } catch (error) {
    const compensation = await admin.auth.admin.deleteUser(targetId);
    if (compensation.error) {
      throw new ManageUserError(
        "provisioning_incomplete",
        "Account invitation succeeded but resident linking failed. An operator must reconcile this account.",
        500,
      );
    }
    throw error;
  }

  const rows = (await rpc(admin, "admin_get_resident_account", {
    p_actor_id: actorId,
    p_resident_id: payload.resident_id,
  })) as SafeRecord[];
  return sanitizeResidentAccount(rows?.[0]);
}

async function permanentlyDeleteAccount(
  admin: SupabaseClient,
  actorId: string,
  targetId: string,
  expectedVersion: number | null,
) {
  const assessment = (
    await deletionAssessmentByProfile(admin, actorId, [targetId])
  ).get(targetId);
  if (!assessment?.eligible) {
    const blocker = assessment?.blocker ?? "protected_dependency";
    const notEligible = [
      "self_account",
      "administrator_account",
      "unsupported_account",
    ].includes(blocker as string);
    throw new ManageUserError(
      notEligible
        ? "account_delete_not_eligible"
        : "account_delete_has_dependencies",
      accountDeletionBlockerMessage(blocker, assessment?.kind),
      notEligible ? 403 : 409,
    );
  }

  const rows = (await rpc(admin, "admin_prepare_account_deletion", {
    p_actor_id: actorId,
    p_target_profile_id: targetId,
    p_expected_registration_version: expectedVersion,
  })) as SafeRecord[];
  const prepared = rows?.[0];
  const previousStatus = prepared?.previous_account_status;
  if (!prepared || typeof previousStatus !== "string") {
    throw new ManageUserError(
      "account_delete_not_eligible",
      "This account is not eligible for permanent deletion.",
      409,
    );
  }

  const { error } = await admin.auth.admin.deleteUser(targetId, false);
  if (!error) return { deleted: true, user_id: targetId };

  const { error: recoveryError } = await admin.rpc(
    "admin_restore_account_deletion",
    {
      p_actor_id: actorId,
      p_target_profile_id: targetId,
      p_previous_account_status: previousStatus,
      p_expected_registration_version: expectedVersion,
    },
  );
  if (recoveryError) {
    console.error("manage-user account deletion recovery failed", {
      operation: "delete_user_account",
      ...databaseDiagnostic(recoveryError, "admin_restore_account_deletion"),
    });
  }

  throw new ManageUserError(
    "account_delete_failed",
    "The login account could not be permanently deleted. No protected records were removed; try again or deactivate the account.",
    502,
  );
}

function retiredAuthEmail(targetId: string) {
  return `retired-${targetId}@retired.invalid`;
}

async function permanentlyRetireAccount(
  admin: SupabaseClient,
  actorId: string,
  targetId: string,
) {
  const rows = (await rpc(admin, "admin_prepare_account_retirement", {
    p_actor_id: actorId,
    p_target_profile_id: targetId,
  })) as SafeRecord[];
  const prepared = rows?.[0];
  const previousStatus = prepared?.previous_account_status;
  if (!prepared || typeof previousStatus !== "string") {
    throw new ManageUserError(
      "account_retirement_not_eligible",
      "This account cannot be safely retired in its current state.",
      409,
    );
  }

  const { error } = await admin.auth.admin.updateUserById(targetId, {
    email: retiredAuthEmail(targetId),
    email_confirm: true,
    ban_duration: "876000h",
  });
  if (!error) {
    return {
      retired: true,
      user_id: targetId,
      history_retained: true,
      email_reusable: true,
    };
  }

  const { error: recoveryError } = await admin.rpc(
    "admin_restore_account_retirement",
    {
      p_actor_id: actorId,
      p_target_profile_id: targetId,
      p_previous_account_status: previousStatus,
    },
  );
  if (recoveryError) {
    console.error("manage-user account retirement recovery failed", {
      operation: "retire_user_account",
      ...databaseDiagnostic(recoveryError, "admin_restore_account_retirement"),
    });
  }

  throw new ManageUserError(
    recoveryError
      ? "account_retirement_incomplete"
      : "account_retirement_failed",
    recoveryError
      ? "Account access removal could not be completed automatically. The account remains blocked and requires Administrator reconciliation."
      : "Account access could not be permanently removed. The account state was restored; try again.",
    502,
  );
}

async function performAction(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  payload: SafeRecord,
  invitationRedirectUrl: string,
) {
  switch (action) {
    case "list_users": {
      const page = payload.page as number;
      const pageSize = payload.page_size as number;
      const rows = (await rpc(admin, "admin_list_users", {
        p_actor_id: actorId,
        p_search: payload.search,
        p_role: payload.role,
        p_status: payload.account_status,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })) as SafeRecord[];
      const total = Number(rows?.[0]?.total_count ?? 0);
      const users = rows.map(sanitizeUser).filter(Boolean);
      const profileIds = users
        .map((user) => user?.id)
        .filter((id): id is string => typeof id === "string");
      const { data: registrations, error: registrationError } =
        profileIds.length
          ? await admin
              .from("resident_registration_requests")
              .select("profile_id, status, version")
              .in("profile_id", profileIds)
          : { data: [], error: null };
      if (registrationError) throw mapDatabaseError(registrationError);
      const registrationByProfile = new Map(
        (registrations ?? []).map((registration) => [
          registration.profile_id,
          {
            status: registration.status,
            version: registration.version,
          },
        ]),
      );
      const deletionAssessment = await deletionAssessmentByProfile(
        admin,
        actorId,
        profileIds,
      );
      return {
        items: users.map((user) => ({
          ...user,
          registration_status:
            registrationByProfile.get(user?.id as string)?.status ?? null,
          registration_version:
            registrationByProfile.get(user?.id as string)?.version ?? null,
          permanent_delete_eligible: Boolean(
            deletionAssessment.get(user?.id as string)?.eligible,
          ),
          permanent_delete_kind:
            deletionAssessment.get(user?.id as string)?.kind ?? null,
          permanent_delete_blocker:
            deletionAssessment.get(user?.id as string)?.blocker ?? null,
        })),
        page,
        page_size: pageSize,
        total,
      };
    }
    case "get_user":
      return {
        user: await safeUser(admin, actorId, payload.user_id as string),
      };
    case "list_resident_link_candidates": {
      const page = payload.page as number;
      const pageSize = payload.page_size as number;
      const rows = (await rpc(admin, "admin_list_resident_link_candidates", {
        p_actor_id: actorId,
        p_search: payload.search,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })) as SafeRecord[];
      return {
        items: rows.map(sanitizeResidentAccount).filter(Boolean),
        page,
        page_size: pageSize,
        total: Number(rows?.[0]?.total_count ?? 0),
      };
    }
    case "get_resident_account": {
      const rows = (await rpc(admin, "admin_get_resident_account", {
        p_actor_id: actorId,
        p_resident_id: payload.resident_id,
      })) as SafeRecord[];
      return { account: sanitizeResidentAccount(rows?.[0]) };
    }
    case "list_resident_registrations": {
      const page = payload.page as number;
      const pageSize = payload.page_size as number;
      const rows = (await rpc(admin, "admin_list_resident_registrations", {
        p_actor_id: actorId,
        p_status: payload.status,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })) as SafeRecord[];
      const registrations = rows
        .map(sanitizeResidentRegistration)
        .filter(Boolean);
      const profileIds = registrations
        .map((registration) => registration?.profile_id)
        .filter((id): id is string => typeof id === "string");
      const deletionAssessment = await deletionAssessmentByProfile(
        admin,
        actorId,
        profileIds,
      );
      return {
        items: registrations.map((registration) => ({
          ...registration,
          permanent_delete_eligible: Boolean(
            deletionAssessment.get(registration?.profile_id as string)
              ?.eligible,
          ),
          permanent_delete_kind:
            deletionAssessment.get(registration?.profile_id as string)?.kind ??
            null,
          permanent_delete_blocker:
            deletionAssessment.get(registration?.profile_id as string)
              ?.blocker ?? null,
        })),
        page,
        page_size: pageSize,
        total: Number(rows?.[0]?.total_count ?? 0),
      };
    }
    case "approve_resident_registration": {
      const rows = (await rpc(admin, "admin_approve_resident_registration", {
        p_actor_id: actorId,
        p_registration_id: payload.registration_id,
        p_existing_resident_id: payload.resident_id,
        p_expected_version: payload.version,
      })) as SafeRecord[];
      return {
        approved: true,
        resident: {
          id: rows?.[0]?.resident_id ?? null,
          resident_number: rows?.[0]?.resident_number ?? null,
          linked_existing: Boolean(rows?.[0]?.linked_existing),
        },
      };
    }
    case "reject_resident_registration":
      await rpc(admin, "admin_reject_resident_registration", {
        p_actor_id: actorId,
        p_registration_id: payload.registration_id,
        p_expected_version: payload.version,
      });
      return { rejected: true };
    case "delete_resident_registration_account":
    case "delete_user_account":
      return permanentlyDeleteAccount(
        admin,
        actorId,
        payload.user_id as string,
        payload.version as number | null,
      );
    case "retire_user_account":
      return permanentlyRetireAccount(
        admin,
        actorId,
        payload.user_id as string,
      );
    case "link_resident_account":
      await rpc(admin, "admin_link_resident_profile", {
        p_actor_id: actorId,
        p_resident_id: payload.resident_id,
        p_profile_id: payload.profile_id,
      });
      return { linked: true };
    case "unlink_resident_account":
      await rpc(admin, "admin_unlink_resident_profile", {
        p_actor_id: actorId,
        p_resident_id: payload.resident_id,
      });
      return { linked: false };
    case "invite_resident_account":
      return {
        account: await inviteAndLinkResident(
          admin,
          actorId,
          payload,
          invitationRedirectUrl,
        ),
      };
    case "invite_user":
      return {
        user: await provisionUser(
          admin,
          actorId,
          payload,
          invitationRedirectUrl,
          true,
        ),
      };
    case "create_user":
      return {
        user: await provisionUser(
          admin,
          actorId,
          payload,
          invitationRedirectUrl,
          false,
        ),
        requires_password_change: true,
      };
    case "resend_invitation": {
      const user = await safeUser(admin, actorId, payload.user_id as string);
      if (user.account_status !== "invited" || !user.email) {
        throw new ManageUserError(
          "invitation_not_available",
          "Only invited email accounts can receive another invitation.",
          409,
        );
      }
      const { error } = await admin.auth.admin.inviteUserByEmail(
        user.email as string,
        { redirectTo: invitationRedirectUrl },
      );
      if (error) throw mapAuthAdminError(error);
      await rpc(admin, "admin_record_invitation_resent", {
        p_actor_id: actorId,
        p_target_id: payload.user_id,
      });
      return {
        user: await safeUser(admin, actorId, payload.user_id as string),
      };
    }
    case "update_role":
      assertNotSelf(actorId, payload.user_id as string, "role");
      await rpc(admin, "admin_update_user_role", {
        p_actor_id: actorId,
        p_target_id: payload.user_id,
        p_new_role: payload.role,
      });
      return {
        user: await safeUser(admin, actorId, payload.user_id as string),
      };
    case "update_account_status":
      assertNotSelf(actorId, payload.user_id as string, "account status");
      await rpc(admin, "admin_update_user_status", {
        p_actor_id: actorId,
        p_target_id: payload.user_id,
        p_new_status: payload.account_status,
      });
      return {
        user: await safeUser(admin, actorId, payload.user_id as string),
      };
    case "update_profile":
      await rpc(admin, "admin_update_user_profile", {
        p_actor_id: actorId,
        p_target_id: payload.user_id,
        p_first_name: payload.first_name,
        p_middle_name: payload.middle_name,
        p_last_name: payload.last_name,
        p_suffix: payload.suffix,
        p_phone_number: payload.phone_number,
      });
      return {
        user: await safeUser(admin, actorId, payload.user_id as string),
      };
    default:
      throw new ManageUserError(
        "invalid_action",
        "The requested user-management action is not supported.",
      );
  }
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  let admin: SupabaseClient | null = null;
  let actorId: string | null = null;
  let targetId: string | null = null;
  let operation = "unvalidated_request";
  const requestId = crypto.randomUUID();

  try {
    const allowedOrigins = configuredAllowedOrigins();
    if (request.method === "OPTIONS") {
      return corsPreflightResponse(request, allowedOrigins);
    }
    headers = corsHeaders(request, allowedOrigins);
    if (request.method !== "POST") {
      throw new ManageUserError(
        "method_not_allowed",
        "Only POST requests are supported.",
        405,
      );
    }

    const env = environment(allowedOrigins);

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      throw new ManageUserError(
        "request_too_large",
        "The request body is too large.",
        413,
      );
    }

    const caller = await authenticatedCaller(
      request,
      env.url,
      env.publishableKey,
    );
    actorId = caller.id;
    admin = createClient(env.url, env.secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    await callerProfile(admin, actorId);
    const allowed = await rpc(admin, "consume_admin_action_rate_limit", {
      p_actor_id: actorId,
      p_max_requests: 60,
      p_window_seconds: 60,
    });
    if (!allowed) {
      throw new ManageUserError(
        "rate_limited",
        "Too many user-management requests. Try again shortly.",
        429,
      );
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new ManageUserError(
        "request_too_large",
        "The request body is too large.",
        413,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new ManageUserError(
        "invalid_json",
        "Request body must contain valid JSON.",
      );
    }
    const validated = validateManageUserRequest(parsed);
    operation = validated.action;
    targetId =
      typeof validated.payload.user_id === "string"
        ? validated.payload.user_id
        : typeof validated.payload.resident_id === "string"
          ? validated.payload.resident_id
          : typeof validated.payload.registration_id === "string"
            ? validated.payload.registration_id
            : null;
    const data = await performAction(
      admin,
      actorId,
      validated.action,
      validated.payload,
      env.invitationRedirectUrl,
    );

    return jsonResponse({ data, request_id: requestId }, 200, headers);
  } catch (error) {
    const safeError =
      error instanceof ManageUserError
        ? error
        : new ManageUserError(
            "internal_error",
            "The user-management request could not be completed.",
            500,
          );
    const denied = [
      "administrator_required",
      "administrator_inactive",
      "profile_missing",
    ].includes(safeError.code);
    const databaseDiagnostic =
      error instanceof DatabaseActionError ? error.diagnostic : null;
    await auditFailure(
      admin,
      actorId,
      denied ? "user_management.denied" : "user_management.failed",
      targetId,
      safeError.code,
    );

    // No request body, token, email, password, invitation link, or stack trace
    // is written to logs or returned to the caller.
    console.error("manage-user request rejected", {
      requestId,
      operation,
      code: safeError.code,
      status: safeError.status,
      ...(databaseDiagnostic ?? {}),
    });
    return jsonResponse(
      {
        error: { code: safeError.code, message: safeError.message },
        request_id: requestId,
      },
      safeError.status,
      headers,
    );
  }
});
