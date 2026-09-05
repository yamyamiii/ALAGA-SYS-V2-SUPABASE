type AuditRpcResult = {
  error: unknown;
};

export type AuditRpcClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<AuditRpcResult>;
};

type AuditLogger = (message: string, context: { code: string }) => void;

function safeAuditErrorCode(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    const code = error.code.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);
    return code || fallback;
  }
  return fallback;
}

/**
 * Records a minimized failure audit event without replacing the business
 * error that caused it. Supabase PostgREST builders are awaitable, but they
 * are not native Promises and cannot safely be chained with `.catch()`.
 */
export async function auditFailure(
  admin: AuditRpcClient | null,
  actorId: string | null,
  action: string,
  targetId: string | null,
  code: string,
  logError: AuditLogger = console.error,
) {
  if (!admin || !actorId) return;

  try {
    const { error } = await admin.rpc("record_admin_action_failure", {
      p_actor_id: actorId,
      p_action: action,
      p_target_id: targetId,
      p_error_code: code.replace(/[^a-z0-9_]/g, "_").slice(0, 64),
    });
    if (error) {
      logError("manage-user audit write failed", {
        code: safeAuditErrorCode(error, "audit_rpc_error"),
      });
    }
  } catch (error) {
    logError("manage-user audit write failed", {
      code: safeAuditErrorCode(error, "audit_rpc_exception"),
    });
  }
}
