import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BackupRestorePage from "@/features/backup/BackupRestorePage";
import { backupService } from "@/services/backupService";

vi.mock("@/services/backupService", () => ({
  backupService: {
    getDashboard: vi.fn(),
    createBackup: vi.fn(),
    retryBackup: vi.fn(),
    downloadBackup: vi.fn(),
    validateRestore: vi.fn(),
    restore: vi.fn(),
    updateSchedule: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BackupRestorePage />
    </QueryClientProvider>,
  );
}

describe("BackupRestorePage", () => {
  beforeEach(() => {
    backupService.getDashboard.mockResolvedValue({
      configuration: { frequency: "disabled", retention_count: 7, version: 1 },
      backups: [],
      restores: [],
    });
  });

  it("renders all recovery cards accessibly", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Backup & Restore" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Create backup")).toBeInTheDocument();
    expect(screen.getByText("Restore backup")).toBeInTheDocument();
    expect(screen.getByText("Automatic backup")).toBeInTheDocument();
    expect(screen.getByText("Backup history")).toBeInTheDocument();
    expect(screen.getByText("Recovery report")).toBeInTheDocument();
    expect(screen.getByLabelText("Frequency")).toBeInTheDocument();
    expect(screen.getByLabelText("Retention (1–30)")).toBeInTheDocument();
  });

  it("shows the checksum-verified dry-run preview before restore", async () => {
    const user = userEvent.setup();
    backupService.validateRestore.mockResolvedValue({
      confirmation_token: "memory-only-token",
      restore: {
        id: "restore-1",
        backup_name: "ALAGA_BACKUP_20260805_190000.zip",
        backup_version: "1.0",
        application_version: "0.1.0",
        schema_version: 33,
        backup_created_at: "2026-08-05T11:00:00.000Z",
        files: ["metadata.json", "residents.json", "checksums.json"],
        preview_counts: { residents: 10, conflicts: 0 },
        warnings: ["Supabase Auth users must exist before restore."],
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Backup & Restore" });
    const input = document.querySelector('input[type="file"]');
    await user.upload(
      input,
      new File(["package"], "ALAGA_BACKUP_20260805_190000.zip", {
        type: "application/zip",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Confirm application restore",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("residents.json")).toBeInTheDocument();
    expect(screen.getByText(/Auth users must exist/)).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore backup" }),
    ).toBeDisabled();
  });
});
