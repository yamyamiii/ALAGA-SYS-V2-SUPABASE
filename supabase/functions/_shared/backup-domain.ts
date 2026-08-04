import { unzipSync, zipSync } from "npm:fflate@0.8.2";

export const BACKUP_VERSION = "1.0";
export const APPLICATION_VERSION = "0.1.0";
export const SCHEMA_VERSION = 33;
export const CHECKSUM_VERSION = "sha256-v1+hmac-sha256-v1";
export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

export const DATA_FILES = Object.freeze([
  "application_metadata.json",
  "households.json",
  "residents.json",
  "appointments.json",
  "health_records.json",
  "maternal.json",
  "children.json",
  "announcements.json",
  "faq.json",
  "health_center.json",
  "notification_preferences.json",
  "referrals.json",
  "reports_configuration.json",
  "inquiries.json",
]);

export const PACKAGE_FILES = Object.freeze([
  "metadata.json",
  ...DATA_FILES,
  "checksums.json",
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_NAME = /^ALAGA_BACKUP_[0-9]{8}_[0-9]{6}\.zip$/;
const FORBIDDEN_KEY =
  /^(?:secret|secrets|password|password_hash|jwt|api[_-]?key|service[_-]?role(?:_key)?|refresh[_-]?token|access[_-]?token|environment|env|ai[_-]?conversation|ai[_-]?prompt|ai[_-]?response)$/i;

export class BackupPackageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "BackupPackageError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackupPackageError(
      "invalid_package",
      "The backup package has an invalid structure.",
    );
  }
  return value as Record<string, unknown>;
}

export function sanitizeBackupFilename(value: unknown): string {
  if (typeof value !== "string")
    throw new BackupPackageError(
      "invalid_filename",
      "The backup filename is invalid.",
    );
  const name = value.split(/[\\/]/).at(-1) ?? "";
  if (!SAFE_NAME.test(name))
    throw new BackupPackageError(
      "invalid_filename",
      "The backup filename is invalid.",
    );
  return name;
}

export function backupFilename(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `ALAGA_BACKUP_${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}.zip`;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(value: string, signingKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function stableJson(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function makeFiles(snapshot: Record<string, unknown>, now: Date) {
  const utc = now.toISOString();
  const manila = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
  const files: Record<string, Uint8Array> = {
    "metadata.json": stableJson({
      backup_version: BACKUP_VERSION,
      application_version: APPLICATION_VERSION,
      schema_version: SCHEMA_VERSION,
      created_at: utc,
      utc_timestamp: utc,
      asia_manila_timestamp: manila,
      generator: "ALAGA-SYS application backup worker",
      checksum_version: CHECKSUM_VERSION,
    }),
    "application_metadata.json": stableJson({
      profiles: snapshot.profiles,
      barangays: snapshot.barangays,
      puroks: snapshot.puroks,
    }),
    "households.json": stableJson(snapshot.households ?? []),
    "residents.json": stableJson(snapshot.residents ?? []),
    "appointments.json": stableJson(snapshot.appointments ?? []),
    "health_records.json": stableJson({
      encounters: snapshot.health_encounters,
      vital_signs: snapshot.vital_signs,
      allergies: snapshot.resident_allergies,
      medical_history: snapshot.resident_medical_history,
    }),
    "maternal.json": stableJson({
      pregnancies: snapshot.maternal_pregnancies,
      prenatal_visits: snapshot.maternal_prenatal_visits,
      delivery_outcomes: snapshot.maternal_delivery_outcomes,
      postnatal_visits: snapshot.maternal_postnatal_visits,
    }),
    "children.json": stableJson({
      profiles: snapshot.child_health_profiles,
      growth_measurements: snapshot.child_growth_measurements,
      immunizations: snapshot.child_immunizations,
      health_visits: snapshot.child_health_visits,
    }),
    "announcements.json": stableJson(snapshot.announcements ?? []),
    "faq.json": stableJson(snapshot.faq_entries ?? []),
    "health_center.json": stableJson(snapshot.health_center_information ?? []),
    "notification_preferences.json": stableJson(
      snapshot.notification_preferences ?? [],
    ),
    "referrals.json": stableJson(snapshot.clinical_referrals ?? []),
    "reports_configuration.json": stableJson({
      version: 1,
      persistent_configuration: [],
    }),
    "inquiries.json": stableJson(snapshot.resident_inquiries ?? []),
  };
  return files;
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export async function createBackupPackage(
  snapshotValue: unknown,
  signingKey: string,
  now = new Date(),
) {
  if (signingKey.length < 32)
    throw new BackupPackageError(
      "server_configuration_error",
      "Backup signing is not configured.",
      500,
    );
  const snapshot = record(snapshotValue);
  inspectForbiddenKeys(snapshot, "snapshot");
  const files = makeFiles(snapshot, now);
  const hashes: Record<string, string> = {};
  for (const name of Object.keys(files).sort())
    hashes[name] = await sha256(files[name]);
  const signature = await hmac(JSON.stringify(hashes), signingKey);
  files["checksums.json"] = stableJson({
    version: CHECKSUM_VERSION,
    algorithm: "SHA-256",
    files: hashes,
    signature,
  });
  const archive = zipSync(files, { level: 6 });
  if (archive.byteLength > MAX_ARCHIVE_BYTES)
    throw new BackupPackageError(
      "backup_too_large",
      "The application backup exceeds the configured archive limit.",
      413,
    );
  const recordCounts = {
    residents: count(snapshot.residents),
    households: count(snapshot.households),
    appointments: count(snapshot.appointments),
    health_records:
      count(snapshot.health_encounters) +
      count(snapshot.vital_signs) +
      count(snapshot.resident_allergies) +
      count(snapshot.resident_medical_history),
    maternal:
      count(snapshot.maternal_pregnancies) +
      count(snapshot.maternal_prenatal_visits) +
      count(snapshot.maternal_delivery_outcomes) +
      count(snapshot.maternal_postnatal_visits),
    children:
      count(snapshot.child_health_profiles) +
      count(snapshot.child_growth_measurements) +
      count(snapshot.child_immunizations) +
      count(snapshot.child_health_visits),
  };
  return {
    archive,
    fileCount: Object.keys(files).length,
    recordCounts,
    packageSha256: await sha256(archive),
  };
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new BackupPackageError(
      "invalid_json",
      `${name} is not valid UTF-8 JSON.`,
    );
  }
}

function inspectForbiddenKeys(value: unknown, path = "root"): void {
  if (
    typeof value === "string" &&
    (/(?:^|\s)eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|\s)/.test(
      value,
    ) ||
      /(?:sb_secret_|AIza[0-9A-Za-z_-]{25,}|sk-[0-9A-Za-z_-]{20,})/.test(value))
  ) {
    throw new BackupPackageError(
      "forbidden_content",
      `The backup contains credential-like content at ${path}.`,
    );
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1)
      inspectForbiddenKeys(value[index], `${path}[${index}]`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key))
      throw new BackupPackageError(
        "forbidden_content",
        `The backup contains a forbidden field at ${path}.`,
      );
    inspectForbiddenKeys(item, `${path}.${key}`);
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (
    let index = 0;
    index < Math.max(leftBytes.length, rightBytes.length);
    index += 1
  ) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function validateBackupPackage(
  bytes: Uint8Array,
  filename: string,
  signingKey: string,
) {
  sanitizeBackupFilename(filename);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new BackupPackageError(
      "archive_size_invalid",
      "The backup archive size is invalid.",
      413,
    );
  let expanded = 0;
  let unsafeSize = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        expanded += file.originalSize;
        if (
          file.originalSize > MAX_UNCOMPRESSED_BYTES ||
          expanded > MAX_UNCOMPRESSED_BYTES
        ) {
          unsafeSize = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new BackupPackageError(
      "invalid_archive",
      "The backup archive cannot be read.",
    );
  }
  if (unsafeSize)
    throw new BackupPackageError(
      "archive_expansion_limit",
      "The backup archive exceeds the safe expansion limit.",
      413,
    );
  const actual = Object.keys(entries).sort();
  const expected = [...PACKAGE_FILES].sort();
  if (
    actual.length !== expected.length ||
    expected.some((name, index) => actual[index] !== name)
  ) {
    throw new BackupPackageError(
      "unexpected_files",
      "The backup archive file manifest is invalid.",
    );
  }
  const checksumDocument = record(
    parseJson(entries["checksums.json"], "checksums.json"),
  );
  const hashes = record(checksumDocument.files);
  if (
    checksumDocument.version !== CHECKSUM_VERSION ||
    checksumDocument.algorithm !== "SHA-256" ||
    typeof checksumDocument.signature !== "string"
  ) {
    throw new BackupPackageError(
      "checksum_manifest_invalid",
      "The checksum manifest is invalid.",
    );
  }
  const expectedHashed = expected
    .filter((name) => name !== "checksums.json")
    .sort();
  const actualHashed = Object.keys(hashes).sort();
  if (
    actualHashed.length !== expectedHashed.length ||
    expectedHashed.some((name, index) => actualHashed[index] !== name)
  ) {
    throw new BackupPackageError(
      "checksum_manifest_invalid",
      "The checksum manifest does not cover every exported file.",
    );
  }
  for (const name of expectedHashed) {
    if (hashes[name] !== (await sha256(entries[name])))
      throw new BackupPackageError(
        "checksum_mismatch",
        `Integrity verification failed for ${name}.`,
      );
  }
  const expectedSignature = await hmac(JSON.stringify(hashes), signingKey);
  if (!constantTimeEqual(expectedSignature, checksumDocument.signature))
    throw new BackupPackageError(
      "signature_mismatch",
      "The backup authenticity signature is invalid.",
    );

  const parsed: Record<string, unknown> = {};
  for (const name of expectedHashed)
    parsed[name] = parseJson(entries[name], name);
  for (const [name, value] of Object.entries(parsed))
    if (name !== "metadata.json") inspectForbiddenKeys(value, name);
  const metadata = record(parsed["metadata.json"]);
  if (
    metadata.backup_version !== BACKUP_VERSION ||
    metadata.application_version !== APPLICATION_VERSION ||
    metadata.schema_version !== SCHEMA_VERSION ||
    metadata.checksum_version !== CHECKSUM_VERSION ||
    metadata.generator !== "ALAGA-SYS application backup worker" ||
    typeof metadata.created_at !== "string" ||
    typeof metadata.utc_timestamp !== "string" ||
    metadata.created_at !== metadata.utc_timestamp ||
    typeof metadata.asia_manila_timestamp !== "string" ||
    metadata.asia_manila_timestamp.length > 200 ||
    !Number.isFinite(Date.parse(metadata.utc_timestamp)) ||
    Date.parse(metadata.utc_timestamp) > Date.now() + 5 * 60_000
  ) {
    throw new BackupPackageError(
      "version_mismatch",
      "The backup version is not compatible with this ALAGA-SYS release.",
    );
  }
  const app = record(parsed["application_metadata.json"]);
  const health = record(parsed["health_records.json"]);
  const maternal = record(parsed["maternal.json"]);
  const children = record(parsed["children.json"]);
  const payload = {
    profiles: app.profiles,
    barangays: app.barangays,
    puroks: app.puroks,
    households: parsed["households.json"],
    residents: parsed["residents.json"],
    appointments: parsed["appointments.json"],
    health_encounters: health.encounters,
    vital_signs: health.vital_signs,
    resident_allergies: health.allergies,
    resident_medical_history: health.medical_history,
    maternal_pregnancies: maternal.pregnancies,
    maternal_prenatal_visits: maternal.prenatal_visits,
    maternal_delivery_outcomes: maternal.delivery_outcomes,
    maternal_postnatal_visits: maternal.postnatal_visits,
    child_health_profiles: children.profiles,
    child_growth_measurements: children.growth_measurements,
    child_immunizations: children.immunizations,
    child_health_visits: children.health_visits,
    clinical_referrals: parsed["referrals.json"],
    announcements: parsed["announcements.json"],
    faq_entries: parsed["faq.json"],
    health_center_information: parsed["health_center.json"],
    resident_inquiries: parsed["inquiries.json"],
    notification_preferences: parsed["notification_preferences.json"],
  };
  for (const [name, value] of Object.entries(payload))
    if (!Array.isArray(value))
      throw new BackupPackageError(
        "invalid_table_payload",
        `${name} is not an array.`,
      );
  const previewCounts = {
    residents: count(payload.residents),
    appointments: count(payload.appointments),
    health_records:
      count(payload.health_encounters) +
      count(payload.vital_signs) +
      count(payload.resident_allergies) +
      count(payload.resident_medical_history),
    maternal:
      count(payload.maternal_pregnancies) +
      count(payload.maternal_prenatal_visits) +
      count(payload.maternal_delivery_outcomes) +
      count(payload.maternal_postnatal_visits),
    children:
      count(payload.child_health_profiles) +
      count(payload.child_growth_measurements) +
      count(payload.child_immunizations) +
      count(payload.child_health_visits),
  };
  return {
    metadata,
    payload,
    previewCounts,
    files: actual,
    packageSha256: await sha256(bytes),
    warnings: [
      "Supabase Auth users and Storage objects are not included and must exist before restore.",
      "Restore is merge-missing; any differing primary-key row aborts the transaction.",
    ],
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
