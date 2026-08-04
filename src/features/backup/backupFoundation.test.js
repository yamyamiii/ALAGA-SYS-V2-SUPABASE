// @vitest-environment node

import fs from "node:fs";
import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { transform } from "esbuild";
import { unzipSync, zipSync } from "fflate";

import { describe, expect, it, vi } from "vitest";

import {
  hasPermission,
  PERMISSIONS,
  USER_ROLES,
} from "@/features/auth/permissions";
import { createBackupService } from "@/services/backupService";

const migration = fs.readFileSync(
  "supabase/migrations/20260720003300_backup_restore_foundation.sql",
  "utf8",
);
const domain = fs.readFileSync(
  "supabase/functions/_shared/backup-domain.ts",
  "utf8",
);
const adminEdge = fs.readFileSync(
  "supabase/functions/backup-admin/index.ts",
  "utf8",
);
const worker = fs.readFileSync(
  "supabase/functions/process-backups/index.ts",
  "utf8",
);
const executableDomain = transform(
  domain.replace(
    'from "npm:fflate@0.8.2"',
    `from "${import.meta.resolve("fflate")}"`,
  ),
  { loader: "ts", format: "esm", target: "es2022" },
).then(
  ({ code }) =>
    import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    ),
);
const signingKey = "test-only-backup-signing-key-32-characters";

function snapshot(overrides = {}) {
  return {
    profiles: [],
    barangays: [],
    puroks: [],
    households: [],
    residents: [],
    appointments: [],
    health_encounters: [],
    vital_signs: [],
    resident_allergies: [],
    resident_medical_history: [],
    maternal_pregnancies: [],
    maternal_prenatal_visits: [],
    maternal_delivery_outcomes: [],
    maternal_postnatal_visits: [],
    child_health_profiles: [],
    child_growth_measurements: [],
    child_immunizations: [],
    child_health_visits: [],
    clinical_referrals: [],
    announcements: [],
    faq_entries: [],
    health_center_information: [],
    resident_inquiries: [],
    notification_preferences: [],
    ...overrides,
  };
}

function rpcClient(responses = {}) {
  const rpc = vi.fn((name, payload) =>
    Promise.resolve(
      responses[name] ?? { data: { name, payload }, error: null },
    ),
  );
  const invoke = vi.fn(() =>
    Promise.resolve({ data: { data: { status: "ok" } }, error: null }),
  );
  return { rpc, functions: { invoke } };
}

describe("backup and restore authorization", () => {
  it("grants backup administration only to administrators", () => {
    expect(
      hasPermission(USER_ROLES.ADMINISTRATOR, PERMISSIONS.MANAGE_BACKUPS),
    ).toBe(true);
    for (const role of [
      USER_ROLES.RESIDENT,
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.NURSE,
      USER_ROLES.MIDWIFE,
    ])
      expect(hasPermission(role, PERMISSIONS.MANAGE_BACKUPS)).toBe(false);
    expect(migration).toMatch(
      /backup_assert_admin[\s\S]*role is distinct from 'admin'/i,
    );
    expect(adminEdge).toMatch(/profile\.role !== "admin"/);
  });

  it("never grants browser roles direct backup tables or worker functions", () => {
    expect(migration).toMatch(
      /revoke all on table public\.backup_configuration[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /backup_restore_apply\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.backup_restore_apply\(uuid, jsonb\) to service_role/i,
    );
  });
});

describe("backup package safety", () => {
  it("uses sanitized Manila filenames", async () => {
    const module = await executableDomain;
    expect(module.backupFilename(new Date("2026-08-05T11:00:00.000Z"))).toBe(
      "ALAGA_BACKUP_20260805_190000.zip",
    );
    expect(
      module.sanitizeBackupFilename("../../ALAGA_BACKUP_20260805_190000.zip"),
    ).toBe("ALAGA_BACKUP_20260805_190000.zip");
    expect(() => module.sanitizeBackupFilename("backup.zip")).toThrow();
    expect(domain).toMatch(/ALAGA_BACKUP_\$\{get\("year"\)\}/);
    expect(domain).toMatch(/SAFE_NAME = \/\^ALAGA_BACKUP_/);
    expect(domain).toMatch(/split\(\/\[\\\\\/\]\//);
  });

  it("hashes every approved exported file and rejects corrupted content", () => {
    expect(domain).toMatch(
      /for \(const name of Object\.keys\(files\)\.sort\(\)\)\s+hashes\[name\] = await sha256/,
    );
    expect(domain).toMatch(
      /hashes\[name\] !== \(await sha256\(entries\[name\]\)\)/,
    );
    expect(domain).toMatch(/checksum_mismatch/);
    expect(domain).toMatch(/signature_mismatch/);
  });

  it("round-trips an integrity-verified package and rejects a changed file", async () => {
    const module = await executableDomain;
    const result = await module.createBackupPackage(
      snapshot({ residents: [{ id: "one", first_name: "Test" }] }),
      signingKey,
      new Date("2026-08-04T11:00:00.000Z"),
    );
    await expect(
      module.validateBackupPackage(
        result.archive,
        "ALAGA_BACKUP_20260804_190000.zip",
        signingKey,
      ),
    ).resolves.toMatchObject({ previewCounts: { residents: 1 } });

    const entries = unzipSync(result.archive);
    entries["residents.json"] = new TextEncoder().encode("[]\n");
    await expect(
      module.validateBackupPackage(
        zipSync(entries),
        "ALAGA_BACKUP_20260804_190000.zip",
        signingKey,
      ),
    ).rejects.toMatchObject({ code: "checksum_mismatch" });
  });

  it("rejects an authentically signed incompatible schema version", async () => {
    const module = await executableDomain;
    const result = await module.createBackupPackage(snapshot(), signingKey);
    const entries = unzipSync(result.archive);
    const metadata = JSON.parse(
      new TextDecoder().decode(entries["metadata.json"]),
    );
    metadata.schema_version = 999;
    entries["metadata.json"] = new TextEncoder().encode(
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const manifest = JSON.parse(
      new TextDecoder().decode(entries["checksums.json"]),
    );
    manifest.files["metadata.json"] = createHash("sha256")
      .update(entries["metadata.json"])
      .digest("hex");
    manifest.signature = createHmac("sha256", signingKey)
      .update(JSON.stringify(manifest.files))
      .digest("hex");
    entries["checksums.json"] = new TextEncoder().encode(
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await expect(
      module.validateBackupPackage(
        zipSync(entries),
        "ALAGA_BACKUP_20260805_190000.zip",
        signingKey,
      ),
    ).rejects.toMatchObject({ code: "version_mismatch" });
  });

  it("rejects version mismatch and archive expansion abuse", () => {
    expect(domain).toMatch(/metadata\.schema_version !== SCHEMA_VERSION/);
    expect(domain).toMatch(/version_mismatch/);
    expect(domain).toMatch(/MAX_UNCOMPRESSED_BYTES/);
    expect(domain).toMatch(/archive_expansion_limit/);
  });

  it("exports no auth internals, JWT, API keys, secrets, AI conversations, or delivery logs", () => {
    const packageSection = domain.slice(
      domain.indexOf("export const DATA_FILES"),
      domain.indexOf("export const PACKAGE_FILES"),
    );
    for (const forbidden of [
      "auth.users",
      "storage.objects",
      "jwt",
      "api_key",
      "service_role",
      "ai_request",
      "conversation",
      "notification_delivery_attempts",
      "outbound_notification_jobs",
    ])
      expect(packageSection.toLowerCase()).not.toContain(forbidden);
    expect(worker).toMatch(
      /excluded_domains:\s*\[[\s\S]*?"auth"[\s\S]*?"storage"[\s\S]*?"audit"[\s\S]*?"ai"[\s\S]*?"delivery_logs"[\s\S]*?"runtime"[\s\S]*?\]/,
    );
  });

  it("refuses credential-like content even inside an approved narrative field", async () => {
    const module = await executableDomain;
    await expect(
      module.createBackupPackage(
        snapshot({
          health_encounters: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              subjective_notes: [
                "eyJhbGciOiJIUzI1NiJ9",
                "eyJzdWIiOiJ1c2VyIn0",
                "signaturevalue",
              ].join("."),
            },
          ],
        }),
        signingKey,
      ),
    ).rejects.toMatchObject({ code: "forbidden_content" });
  });

  it("creates and validates a large dataset package", async () => {
    const module = await executableDomain;
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      value: `resident-${index}`,
    }));
    const result = await module.createBackupPackage(
      snapshot({ residents: rows }),
      signingKey,
    );
    await expect(
      module.validateBackupPackage(
        result.archive,
        "ALAGA_BACKUP_20260805_190000.zip",
        signingKey,
      ),
    ).resolves.toMatchObject({ previewCounts: { residents: 10_000 } });
  });
});

describe("restore and retention contracts", () => {
  it("previews counts and requires an expiring explicit confirmation", () => {
    expect(adminEdge).toMatch(/previewCounts/);
    expect(migration).toMatch(
      /confirmation_expires_at[\s\S]*interval '10 minutes'/i,
    );
    expect(migration).toMatch(
      /confirmation_hash <> encode\(digest\(p_confirmation_token, 'sha256'\)/i,
    );
  });

  it("rolls conflicts back in one trusted transaction", () => {
    expect(migration).toMatch(/restore conflict in %[\s\S]*errcode = '40001'/i);
    expect(migration).toMatch(/The whole function call[\s\S]*rolls back/i);
    expect(migration).toMatch(
      /alter table public\.appointments disable trigger user[\s\S]*alter table public\.appointments enable trigger user/i,
    );
  });

  it("retains only the configured number of automatic backups", () => {
    expect(migration).toMatch(/default 7/);
    expect(migration).toMatch(
      /row_number\(\) over \(order by b\.completed_at desc/,
    );
    expect(migration).toMatch(/ranked\.position > ranked\.retention_count/);
  });

  it("recovers abandoned worker locks without unbounded retries", () => {
    expect(migration).toMatch(
      /status = 'processing'[\s\S]*locked_at < statement_timestamp\(\) - interval '15 minutes'/i,
    );
    expect(migration).toMatch(
      /case when attempt_count >= 3[\s\S]*then 'failed'::public\.backup_status else 'queued'::public\.backup_status end/i,
    );
    expect(worker).toMatch(/upsert: true/);
  });

  it("loads history and normalizes service calls", async () => {
    const client = rpcClient({
      backup_admin_dashboard: {
        data: { backups: [{ id: "one" }] },
        error: null,
      },
    });
    const service = createBackupService(() => client);
    await expect(service.getDashboard()).resolves.toEqual({
      backups: [{ id: "one" }],
    });
    expect(client.rpc).toHaveBeenCalledWith("backup_admin_dashboard", {
      p_limit: 50,
    });
  });
});
