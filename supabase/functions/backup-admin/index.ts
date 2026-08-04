import { createClient } from "npm:@supabase/supabase-js@2";

import {
  BackupPackageError,
  isUuid,
  MAX_ARCHIVE_BYTES,
  sanitizeBackupFilename,
  sha256,
  validateBackupPackage,
} from "../_shared/backup-domain.ts";

type Json = Record<string, unknown>;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function parseAllowedOrigins(value: string) {
  const origins = new Set<string>();
  for (const candidate of value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new BackupPackageError(
        "server_configuration_error",
        "ALLOWED_ORIGINS contains an invalid origin.",
        500,
      );
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== candidate ||
      parsed.username ||
      parsed.password
    ) {
      throw new BackupPackageError(
        "server_configuration_error",
        "ALLOWED_ORIGINS must contain exact origins without paths or credentials.",
        500,
      );
    }
    origins.add(parsed.origin);
  }
  return origins;
}

function env() {
  const url = Deno.env.get("SUPABASE_URL");
  const publishable =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  const secret =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signingKey = Deno.env.get("BACKUP_SIGNING_KEY") ?? "";
  const origins = parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS") ?? "");
  if (
    !url ||
    !publishable ||
    !secret ||
    signingKey.length < 32 ||
    origins.size === 0
  ) {
    throw new BackupPackageError(
      "server_configuration_error",
      "The backup service is not configured.",
      500,
    );
  }
  return { url, publishable, secret, signingKey, origins };
}

function cors(request: Request, origins: Set<string>) {
  const origin = request.headers.get("origin");
  if (!origin || !origins.has(origin))
    throw new BackupPackageError(
      "origin_not_allowed",
      "This application origin is not allowed.",
      403,
    );
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    ...SECURITY_HEADERS,
  };
}

async function adminContext(request: Request, config: ReturnType<typeof env>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    throw new BackupPackageError(
      "authentication_required",
      "A valid administrator session is required.",
      401,
    );
  const caller = createClient(config.url, config.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user)
    throw new BackupPackageError(
      "invalid_session",
      "The administrator session is invalid or expired.",
      401,
    );
  const service = createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError)
    throw new BackupPackageError(
      "authorization_unavailable",
      "Administrator authorization could not be verified.",
      503,
    );
  if (
    !profile ||
    profile.role !== "admin" ||
    profile.account_status !== "active"
  )
    throw new BackupPackageError(
      "permission_denied",
      "Backup administration requires an active administrator.",
      403,
    );
  return { caller, service, actorId: userData.user.id };
}

async function parseJson(request: Request): Promise<Json> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_768)
    throw new BackupPackageError(
      "request_too_large",
      "The backup request is too large.",
      413,
    );
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 32_768) {
      throw new BackupPackageError(
        "request_too_large",
        "The backup request is too large.",
        413,
      );
    }
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Json;
  } catch (error) {
    if (error instanceof BackupPackageError) throw error;
    throw new BackupPackageError(
      "invalid_request",
      "The backup request is invalid.",
    );
  }
}

async function validateUpload(
  request: Request,
  context: Awaited<ReturnType<typeof adminContext>>,
  signingKey: string,
) {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_ARCHIVE_BYTES + 65_536) {
    throw new BackupPackageError(
      "archive_size_invalid",
      "The backup archive size is invalid.",
      413,
    );
  }
  const form = await request.formData();
  if (form.get("action") !== "validate")
    throw new BackupPackageError(
      "invalid_request",
      "The backup request is invalid.",
    );
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_ARCHIVE_BYTES
  )
    throw new BackupPackageError(
      "archive_size_invalid",
      "Select a valid ALAGA-SYS backup archive.",
      413,
    );
  const name = sanitizeBackupFilename(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = await validateBackupPackage(bytes, name, signingKey);
  const restoreId = crypto.randomUUID();
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(new TextEncoder().encode(token));
  const path = `restore-staging/${restoreId}/${name}`;
  const { error: uploadError } = await context.service.storage
    .from("alaga-backups")
    .upload(path, bytes, { contentType: "application/zip", upsert: false });
  if (uploadError)
    throw new BackupPackageError(
      "storage_unavailable",
      "The validated backup could not be staged.",
      503,
    );
  const metadata = validated.metadata;
  const { data: dryRun, error: dryRunError } = await context.service.rpc(
    "backup_restore_dry_run",
    { p_payload: validated.payload },
  );
  if (dryRunError) {
    await context.service.storage.from("alaga-backups").remove([path]);
    throw new BackupPackageError(
      "preview_unavailable",
      "The database conflict preview could not be completed.",
      503,
    );
  }
  const dryRunRecord = (dryRun ?? {}) as Record<string, unknown>;
  const warnings = [...validated.warnings];
  if (Number(dryRunRecord.conflicts ?? 0) > 0) {
    warnings.push(
      `${dryRunRecord.conflicts} existing row conflict(s) must be resolved before restore.`,
    );
  }
  if (Number(dryRunRecord.missing_auth_users ?? 0) > 0) {
    warnings.push(
      `${dryRunRecord.missing_auth_users} required Supabase Auth user(s) are missing.`,
    );
  }
  const previewCounts = {
    ...validated.previewCounts,
    new_rows: Number(dryRunRecord.new_rows ?? 0),
    identical_rows: Number(dryRunRecord.identical_rows ?? 0),
    conflicts: Number(dryRunRecord.conflicts ?? 0),
    missing_auth_users: Number(dryRunRecord.missing_auth_users ?? 0),
  };
  const { data, error } = await context.service.rpc(
    "backup_restore_stage_register",
    {
      p_actor_id: context.actorId,
      p_restore_id: restoreId,
      p_backup_name: name,
      p_storage_path: path,
      p_package_sha256: validated.packageSha256,
      p_backup_version: metadata.backup_version,
      p_application_version: metadata.application_version,
      p_schema_version: metadata.schema_version,
      p_backup_created_at: metadata.utc_timestamp,
      p_files: validated.files,
      p_preview_counts: previewCounts,
      p_warnings: warnings,
      p_confirmation_hash: tokenHash,
    },
  );
  if (error) {
    await context.service.storage.from("alaga-backups").remove([path]);
    throw new BackupPackageError(
      "preview_unavailable",
      "The restore preview could not be registered.",
      503,
    );
  }
  return { restore: data, confirmation_token: token };
}

async function download(
  body: Json,
  context: Awaited<ReturnType<typeof adminContext>>,
) {
  if (!isUuid(body.backup_id))
    throw new BackupPackageError(
      "validation_error",
      "The backup identifier is invalid.",
    );
  const { data, error } = await context.service
    .from("backup_jobs")
    .select("backup_name, storage_path, status")
    .eq("id", body.backup_id)
    .maybeSingle();
  if (error || !data || data.status !== "completed" || !data.storage_path)
    throw new BackupPackageError(
      "backup_unavailable",
      "The completed backup is unavailable.",
      404,
    );
  const { data: signed, error: signedError } = await context.service.storage
    .from("alaga-backups")
    .createSignedUrl(data.storage_path, 60, { download: data.backup_name });
  if (signedError)
    throw new BackupPackageError(
      "download_unavailable",
      "A secure download link could not be created.",
      503,
    );
  return {
    download_url: signed.signedUrl,
    expires_in: 60,
    backup_name: data.backup_name,
  };
}

async function restore(
  body: Json,
  context: Awaited<ReturnType<typeof adminContext>>,
  signingKey: string,
) {
  if (
    !isUuid(body.restore_id) ||
    typeof body.confirmation_token !== "string" ||
    body.confirmation_token.length > 128
  )
    throw new BackupPackageError(
      "validation_error",
      "The restore confirmation is invalid.",
    );
  const { error: confirmError } = await context.caller.rpc(
    "backup_restore_confirm",
    {
      p_restore_id: body.restore_id,
      p_confirmation_token: body.confirmation_token,
    },
  );
  if (confirmError && /backup is in progress/i.test(confirmError.message ?? ""))
    throw new BackupPackageError(
      "backup_in_progress",
      "Wait for the active backup to finish before confirming a restore.",
      409,
    );
  if (confirmError)
    throw new BackupPackageError(
      "confirmation_failed",
      "The restore confirmation is invalid or expired.",
      403,
    );
  const { data: restoreRow, error: rowError } = await context.service
    .from("restore_jobs")
    .select("backup_name, storage_path, package_sha256, status")
    .eq("id", body.restore_id)
    .eq("requested_by", context.actorId)
    .maybeSingle();
  if (rowError || !restoreRow || restoreRow.status !== "approved")
    throw new BackupPackageError(
      "restore_unavailable",
      "The approved restore is unavailable.",
      409,
    );
  try {
    const { data: blob, error: downloadError } = await context.service.storage
      .from("alaga-backups")
      .download(restoreRow.storage_path);
    if (downloadError || !blob)
      throw new BackupPackageError(
        "storage_unavailable",
        "The staged backup could not be read.",
        503,
      );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const validated = await validateBackupPackage(
      bytes,
      restoreRow.backup_name,
      signingKey,
    );
    if (validated.packageSha256 !== restoreRow.package_sha256)
      throw new BackupPackageError(
        "package_changed",
        "The staged backup changed after validation.",
      );
    const { data, error } = await context.service.rpc("backup_restore_apply", {
      p_restore_id: body.restore_id,
      p_payload: validated.payload,
    });
    if (error)
      throw new BackupPackageError(
        error.code === "40001" ? "restore_conflict" : "restore_failed",
        error.code === "40001"
          ? "Restore stopped because existing application data conflicts with the backup."
          : "The restore transaction failed and was rolled back.",
        409,
      );
    const { error: cleanupError } = await context.service.storage
      .from("alaga-backups")
      .remove([restoreRow.storage_path]);
    if (!cleanupError) {
      await context.service.rpc("backup_restore_mark_staging_deleted", {
        p_restore_id: body.restore_id,
      });
    }
    return { restore_id: body.restore_id, status: "completed", report: data };
  } catch (error) {
    const category =
      error instanceof BackupPackageError
        ? error.code.replace(/[^a-z0-9_]/g, "_").slice(0, 50)
        : "restore_failed";
    await context.service.rpc("backup_restore_fail", {
      p_restore_id: body.restore_id,
      p_failure_category: category,
    });
    throw error;
  }
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = { ...SECURITY_HEADERS };
  try {
    const config = env();
    headers = cors(request, config.origins);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      throw new BackupPackageError(
        "method_not_allowed",
        "Only POST is supported.",
        405,
      );
    const context = await adminContext(request, config);
    const contentType = request.headers.get("content-type") ?? "";
    const result = contentType.startsWith("multipart/form-data")
      ? await validateUpload(request, context, config.signingKey)
      : await (async () => {
          const body = await parseJson(request);
          if (body.action === "download") return download(body, context);
          if (body.action === "restore")
            return restore(body, context, config.signingKey);
          throw new BackupPackageError(
            "invalid_action",
            "The backup action is invalid.",
          );
        })();
    return Response.json({ data: result }, { status: 200, headers });
  } catch (error) {
    const safe =
      error instanceof BackupPackageError
        ? error
        : new BackupPackageError(
            "internal_error",
            "The backup service could not complete the request.",
            500,
          );
    return Response.json(
      { error: { code: safe.code, message: safe.message } },
      { status: safe.status, headers },
    );
  }
});
