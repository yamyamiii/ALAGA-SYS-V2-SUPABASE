import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { zipSync } from "npm:fflate@0.8.3";

import {
  BackupPackageError,
  MAX_ARCHIVE_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  sha256,
  validateBackupPackage,
} from "./backup-domain.ts";

const filename = "ALAGA_BACKUP_20260805_190000.zip";
const signingKey = "test-only-backup-signing-key-32-characters";
const abcHash =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

Deno.test("backup SHA-256 preserves the existing digest format", async () => {
  assertEquals(await sha256(new TextEncoder().encode("abc")), abcHash);
});

Deno.test("backup SHA-256 hashes only the selected byte view", async () => {
  const bytes = new TextEncoder().encode("prefixabc suffix");
  assertEquals(await sha256(bytes.subarray(6, 9)), abcHash);
});

Deno.test(
  "backup SHA-256 accepts a shared backing without unsafe casts",
  async () => {
    const bytes = new Uint8Array(new SharedArrayBuffer(3));
    bytes.set(new TextEncoder().encode("abc"));
    assertEquals(await sha256(bytes), abcHash);
  },
);

for (const size of [0, MAX_ARCHIVE_BYTES + 1]) {
  Deno.test(
    `backup rejects archive byte length ${size} before extraction`,
    async () => {
      const error = await assertRejects(
        () => validateBackupPackage(new Uint8Array(size), filename, signingKey),
        BackupPackageError,
      );
      assertEquals(error.code, "archive_size_invalid");
      assertEquals(error.status, 413);
    },
  );
}

Deno.test(
  "backup rejects a truncated ordinary synthetic ZIP safely",
  async () => {
    const archive = zipSync({ "test.json": new TextEncoder().encode("[]") });
    // This is a small normal ZIP with its end record removed, not a ZIP64
    // exploit or a decompression bomb.
    const truncated = archive.subarray(0, archive.length - 22);
    const error = await assertRejects(
      () => validateBackupPackage(truncated, filename, signingKey),
      BackupPackageError,
    );
    assertEquals(error.code, "invalid_archive");
  },
);

Deno.test(
  "backup rejects an oversized declared entry before inflating it",
  async () => {
    const archive = zipSync({ "test.json": Uint8Array.of(1) }, { level: 0 });
    const view = new DataView(archive.buffer);
    let centralDirectory = -1;
    for (let offset = 0; offset <= archive.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        centralDirectory = offset;
        break;
      }
    }
    if (centralDirectory < 0)
      throw new Error("Synthetic ZIP directory missing");
    // A bounded non-ZIP64 size exercises the application's extraction filter.
    // No large decompressed buffer or hostile ZIP64 sentinel is supplied.
    view.setUint32(centralDirectory + 24, MAX_UNCOMPRESSED_BYTES + 1, true);
    const error = await assertRejects(
      () => validateBackupPackage(archive, filename, signingKey),
      BackupPackageError,
    );
    assertEquals(error.code, "archive_expansion_limit");
    assertEquals(error.status, 413);
  },
);
