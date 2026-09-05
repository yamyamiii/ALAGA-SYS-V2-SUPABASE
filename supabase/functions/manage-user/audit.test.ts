import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { auditFailure } from "./audit.ts";

const indexSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/manage-user/index.ts"),
  "utf8",
);

function awaitableResult(result: { error: unknown }) {
  return {
    then(
      resolveResult: (value: { error: unknown }) => unknown,
      _rejectResult?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(resolveResult(result));
    },
  };
}

describe("manage-user failure auditing", () => {
  it("awaits the PostgREST result without assuming the builder has catch or then chains", async () => {
    const rpc = vi.fn(() => awaitableResult({ error: null }));

    await expect(
      auditFailure(
        { rpc },
        "10000000-0000-4000-8000-000000000001",
        "user_management.failed",
        "20000000-0000-4000-8000-000000000001",
        "registration_conflict",
      ),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("record_admin_action_failure", {
      p_actor_id: "10000000-0000-4000-8000-000000000001",
      p_action: "user_management.failed",
      p_target_id: "20000000-0000-4000-8000-000000000001",
      p_error_code: "registration_conflict",
    });
    expect(indexSource).not.toMatch(/\.rpc\([^;]+\)\s*\.(?:catch|then)\(/s);
  });

  it("logs a returned audit RPC error without throwing", async () => {
    const logError = vi.fn();
    const rpc = vi.fn(() =>
      awaitableResult({ error: { code: "42501", message: "private detail" } }),
    );

    await expect(
      auditFailure(
        { rpc },
        "10000000-0000-4000-8000-000000000001",
        "user_management.failed",
        null,
        "database_action_failed",
        logError,
      ),
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith("manage-user audit write failed", {
      code: "42501",
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain("private detail");
  });

  it("logs a thrown audit exception without masking the original safe response path", async () => {
    const logError = vi.fn();
    const rpc = vi.fn(() => {
      throw new Error("private audit exception");
    });

    await expect(
      auditFailure(
        { rpc },
        "10000000-0000-4000-8000-000000000001",
        "user_management.failed",
        null,
        "registration_conflict",
        logError,
      ),
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith("manage-user audit write failed", {
      code: "audit_rpc_exception",
    });
    const handlerCatch = indexSource.slice(
      indexSource.lastIndexOf("} catch (error)"),
    );
    expect(handlerCatch.indexOf("const safeError")).toBeLessThan(
      handlerCatch.indexOf("await auditFailure("),
    );
    expect(handlerCatch).toMatch(
      /error: \{ code: safeError\.code, message: safeError\.message \}/,
    );
    expect(handlerCatch).toMatch(/safeError\.status,\s*headers,/);
  });
});
