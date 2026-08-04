import { createClient } from "npm:@supabase/supabase-js@2";

import {
  BackupPackageError,
  createBackupPackage,
} from "../_shared/backup-domain.ts";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function configuration() {
  const url = Deno.env.get("SUPABASE_URL");
  const secret =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const schedulerToken = Deno.env.get("BACKUP_SCHEDULER_TOKEN") ?? "";
  const signingKey = Deno.env.get("BACKUP_SIGNING_KEY") ?? "";
  if (!url || !secret || schedulerToken.length < 32 || signingKey.length < 32)
    throw new BackupPackageError(
      "server_configuration_error",
      "Backup processing is not configured.",
      500,
    );
  return { url, secret, schedulerToken, signingKey };
}

Deno.serve(async (request) => {
  try {
    if (request.headers.has("origin"))
      throw new BackupPackageError(
        "origin_not_allowed",
        "Browser requests are not accepted by the backup processor.",
        403,
      );
    if (request.method !== "POST")
      throw new BackupPackageError(
        "method_not_allowed",
        "Only POST is supported.",
        405,
      );
    const config = configuration();
    const supplied = request.headers.get("x-backup-scheduler-token") ?? "";
    if (!constantTimeEqual(supplied, config.schedulerToken))
      throw new BackupPackageError(
        "authentication_required",
        "Backup processor authentication failed.",
        401,
      );
    const service = createClient(config.url, config.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await service.rpc("backup_enqueue_due_automatic");
    const workerId = crypto.randomUUID();
    const { data: jobs, error: claimError } = await service.rpc(
      "backup_claim_jobs",
      { p_worker_id: workerId, p_limit: 2 },
    );
    if (claimError) throw claimError;
    const outcomes: Array<Record<string, unknown>> = [];
    for (const job of jobs ?? []) {
      const started = performance.now();
      try {
        const { data: snapshot, error: exportError } = await service.rpc(
          "backup_export_snapshot",
          { p_backup_id: job.id, p_worker_id: workerId },
        );
        if (exportError) throw exportError;
        const packageResult = await createBackupPackage(
          snapshot,
          config.signingKey,
        );
        const path = `packages/${job.id}/${job.backup_name}`;
        const { error: uploadError } = await service.storage
          .from("alaga-backups")
          .upload(path, packageResult.archive, {
            contentType: "application/zip",
            upsert: true,
          });
        if (uploadError) throw uploadError;
        const report = {
          duration_ms: Math.round(performance.now() - started),
          files_exported: packageResult.fileCount,
          integrity: "verified",
          excluded_domains: [
            "auth",
            "storage",
            "audit",
            "ai",
            "delivery_logs",
            "runtime",
          ],
        };
        const { error: completeError } = await service.rpc(
          "backup_complete_job",
          {
            p_backup_id: job.id,
            p_worker_id: workerId,
            p_storage_path: path,
            p_package_sha256: packageResult.packageSha256,
            p_size_bytes: packageResult.archive.byteLength,
            p_file_count: packageResult.fileCount,
            p_record_counts: packageResult.recordCounts,
            p_report: report,
          },
        );
        if (completeError) {
          await service.storage.from("alaga-backups").remove([path]);
          throw completeError;
        }
        outcomes.push({ id: job.id, status: "completed" });
      } catch {
        await service.rpc("backup_fail_job", {
          p_backup_id: job.id,
          p_worker_id: workerId,
          p_failure_category: "generation_failed",
        });
        outcomes.push({ id: job.id, status: "failed" });
      }
    }
    const { data: expired } = await service.rpc("backup_retention_candidates");
    for (const item of expired ?? []) {
      if (!item.storage_path) continue;
      const { error } = await service.storage
        .from("alaga-backups")
        .remove([item.storage_path]);
      if (!error)
        await service.rpc("backup_mark_deleted", { p_backup_id: item.id });
    }
    const { data: staged } = await service.rpc(
      "backup_restore_staging_candidates",
    );
    for (const item of staged ?? []) {
      const { error } = await service.storage
        .from("alaga-backups")
        .remove([item.storage_path]);
      if (!error)
        await service.rpc("backup_restore_mark_staging_deleted", {
          p_restore_id: item.id,
        });
    }
    return Response.json(
      { processed: outcomes },
      { headers: SECURITY_HEADERS },
    );
  } catch (error) {
    const safe =
      error instanceof BackupPackageError
        ? error
        : new BackupPackageError(
            "processor_failed",
            "Backup processing failed.",
            500,
          );
    return Response.json(
      { error: { code: safe.code, message: safe.message } },
      { status: safe.status, headers: SECURITY_HEADERS },
    );
  }
});
