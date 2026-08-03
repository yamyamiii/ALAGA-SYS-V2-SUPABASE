import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DOCUMENT_TYPES } from "@/features/documents/constants";
import { DocumentPreviewDialog } from "@/features/documents/DocumentPreviewDialog";
import {
  documentService,
  DocumentServiceError,
} from "@/services/documentService";

vi.mock("@/services/documentService", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    documentService: {
      ...original.documentService,
      getDocument: vi.fn(),
    },
  };
});

const recordId = "11111111-1111-4111-8111-111111111111";
const payload = {
  document_type: DOCUMENT_TYPES.APPOINTMENT_SLIP,
  appointment_number: "APT-2026-000001",
  resident_name: "Maria Santos",
  service_type: "General Consultation",
  appointment_type: "scheduled",
  scheduled_date: "2026-07-27",
  start_time: "09:00:00",
  assigned_staff_name: "Nurse Reyes",
  status: "confirmed",
};

function renderDialog(onOpenChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={client}>
        <DocumentPreviewDialog
          documentType={DOCUMENT_TYPES.APPOINTMENT_SLIP}
          recordId={recordId}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("DocumentPreviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    documentService.getDocument.mockReset().mockResolvedValue(payload);
  });

  it("renders an accessible protected preview with print and PDF controls", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    renderDialog();
    expect(
      screen.getByRole("dialog", { name: "Document preview" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("APT-2026-000001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    expect(document.querySelector("[aria-live]")).toBeNull();
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it("closes explicitly and returns control through the dialog callback", async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await screen.findByText("APT-2026-000001");
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a retryable offline state", async () => {
    documentService.getDocument
      .mockReset()
      .mockRejectedValue(
        new DocumentServiceError(
          "offline",
          "You are offline. Reconnect before loading a protected document.",
        ),
      );
    renderDialog();
    expect(
      await screen.findByText("Document unavailable offline"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    await waitFor(() =>
      expect(documentService.getDocument).toHaveBeenCalledTimes(1),
    );
  });
});
