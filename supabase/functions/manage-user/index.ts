import { createClient } from "npm:@supabase/supabase-js@2";

import {
  assertNotSelf,
  authorizeAdministrator,
  ManageUserError,
  mapAuthAdminError,
  mapDatabaseError,
  sanitizeUser,
  validateManageUserRequest,
} from "./domain.ts";

type SupabaseClient = ReturnType<typeof createClient>;
type SafeRecord = Record<string, unknown>;

const MAX_BODY_BYTES = 32_768;

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

function environment() {
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
  const allowedOrigins = new Set(
    (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (!url || !publishableKey || !secretKey) {
    throw new ManageUserError(
      "server_configuration_error",
      "The user-management service is not configured.",
      500,
    );
  }
  if (!invitationRedirectUrl || allowedOrigins.size === 0) {
    throw new ManageUserError(
      "server_configuration_error",
      "Trusted origins and invitation redirects are not configured.",
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

function corsHeaders(request: Request, allowedOrigins: Set<string>) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    throw new ManageUserError(
      "origin_not_allowed",
      "This application origin is not allowed.",
      403,
    );
  }
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function jsonResponse(
  body: SafeRecord,
  status: number,
  headers: Record<string, string>,
) {
  return Response.json(body, {
    status,
    headers: { ...headers, "Cache-Control": "no-store" },
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
  if (error) throw mapDatabaseError(error);
  return data;
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
  return user;
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
      return {
        items: rows.map(sanitizeUser).filter(Boolean),
        page,
        page_size: pageSize,
        total,
      };
    }
    case "get_user":
      return {
        user: await safeUser(admin, actorId, payload.user_id as string),
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

async function auditFailure(
  admin: SupabaseClient | null,
  actorId: string | null,
  action: string,
  targetId: string | null,
  code: string,
) {
  if (!admin || !actorId) return;
  await admin
    .rpc("record_admin_action_failure", {
      p_actor_id: actorId,
      p_action: action,
      p_target_id: targetId,
      p_error_code: code.replace(/[^a-z0-9_]/g, "_").slice(0, 64),
    })
    .catch(() => undefined);
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  let admin: SupabaseClient | null = null;
  let actorId: string | null = null;
  let targetId: string | null = null;
  const requestId = crypto.randomUUID();

  try {
    const env = environment();
    headers = corsHeaders(request, env.allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      throw new ManageUserError(
        "method_not_allowed",
        "Only POST requests are supported.",
        405,
      );
    }

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
    targetId =
      typeof validated.payload.user_id === "string"
        ? validated.payload.user_id
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
      code: safeError.code,
      status: safeError.status,
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
