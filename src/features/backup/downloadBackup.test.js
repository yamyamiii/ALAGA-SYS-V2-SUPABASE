import { describe, expect, it, vi } from "vitest";

import { downloadBackupFile } from "@/features/backup/downloadBackup";

describe("mobile-compatible backup downloads", () => {
  it("uses a native HTTPS download link with the server filename", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadBackupFile(
      "https://example.supabase.co/storage/v1/object/sign/alaga-backups/file.zip?token=test",
      "ALAGA_BACKUP_20260805_190000.zip",
    );

    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.instances[0];
    expect(link.download).toBe("ALAGA_BACKUP_20260805_190000.zip");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.href).toMatch(/^https:\/\/example\.supabase\.co\//);
    expect(document.body).not.toContainElement(link);
    click.mockRestore();
  });

  it("rejects non-web download protocols", () => {
    expect(() =>
      downloadBackupFile("javascript:alert(1)", "ALAGA_BACKUP.zip"),
    ).toThrow("Unsupported backup download URL");
  });
});
