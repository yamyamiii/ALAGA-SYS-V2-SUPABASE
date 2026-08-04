import { getSupabaseClient } from "@/lib/supabase/client";

const TIMEOUT_MS = 120_000;

export class BackupServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "BackupServiceError";
    this.code = code;
  }
}

function mapError(error, fallback) {
  const message = error?.context?.body?.error?.message ?? error?.message ?? "";
  if (
    error?.code === "42501" ||
    /administrator|permission|session/i.test(message)
  )
    return new BackupServiceError(
      "permission_denied",
      "Only an active administrator can manage backups.",
      { cause: error },
    );
  if (/checksum|integrity|signature|corrupt/i.test(message))
    return new BackupServiceError(
      "integrity_failed",
      "The backup failed integrity verification and was rejected.",
      { cause: error },
    );
  if (/version|compatible/i.test(message))
    return new BackupServiceError(
      "version_mismatch",
      "This backup is not compatible with the current ALAGA-SYS schema.",
      { cause: error },
    );
  if (/already in progress|backup (?:is )?in progress/i.test(message))
    return new BackupServiceError(
      "backup_in_progress",
      "Another backup is already in progress. Follow its status in history.",
      { cause: error },
    );
  if (/conflict|40001/i.test(message))
    return new BackupServiceError(
      "restore_conflict",
      "Restore stopped because existing data conflicts with the backup. No changes were committed.",
      { cause: error },
    );
  if (/timeout|abort/i.test(message))
    return new BackupServiceError(
      "timeout",
      "The backup operation took too long. Check history before retrying.",
      { cause: error },
    );
  if (/fetch|network|connection/i.test(message))
    return new BackupServiceError(
      "network_error",
      "The backup service could not be reached. Check your connection.",
      { cause: error },
    );
  return new BackupServiceError("request_failed", fallback, { cause: error });
}

function online() {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new BackupServiceError(
      "offline",
      "Reconnect to the internet before managing backups.",
    );
}

async function timed(operation, fallback) {
  online();
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Backup request timeout")),
        TIMEOUT_MS,
      );
    });
    const result = await Promise.race([operation, timeout]);
    if (result?.error) throw result.error;
    return result?.data;
  } catch (error) {
    if (import.meta.env.DEV && import.meta.env.MODE !== "test")
      console.warn("[ALAGA-SYS backup diagnostic]", {
        code: error?.code ?? "none",
      });
    throw mapError(error, fallback);
  } finally {
    clearTimeout(timer);
  }
}

export function createBackupService(clientProvider = getSupabaseClient) {
  const client = () => clientProvider();
  return {
    getDashboard() {
      return timed(
        client().rpc("backup_admin_dashboard", { p_limit: 50 }),
        "Backup history could not be loaded.",
      );
    },
    createBackup() {
      return timed(
        client().rpc("backup_enqueue_manual"),
        "The backup could not be queued.",
      );
    },
    retryBackup(id) {
      return timed(
        client().rpc("backup_retry", { p_backup_id: id }),
        "The backup could not be retried.",
      );
    },
    updateSchedule(values) {
      return timed(
        client().rpc("backup_schedule_update", {
          p_frequency: values.frequency,
          p_retention_count: Number(values.retention_count),
          p_expected_version: values.version,
        }),
        "The automatic backup settings could not be saved.",
      );
    },
    async downloadBackup(id) {
      const envelope = await timed(
        client().functions.invoke("backup-admin", {
          body: { action: "download", backup_id: id },
        }),
        "The secure backup download could not be prepared.",
      );
      return envelope?.data ?? envelope;
    },
    async validateRestore(file) {
      const form = new FormData();
      form.append("action", "validate");
      form.append("file", file);
      const envelope = await timed(
        client().functions.invoke("backup-admin", { body: form }),
        "The backup could not be validated.",
      );
      return envelope?.data ?? envelope;
    },
    async restore(id, token) {
      const envelope = await timed(
        client().functions.invoke("backup-admin", {
          body: {
            action: "restore",
            restore_id: id,
            confirmation_token: token,
          },
        }),
        "The restore failed and was rolled back.",
      );
      return envelope?.data ?? envelope;
    },
  };
}

export const backupService = createBackupService();
