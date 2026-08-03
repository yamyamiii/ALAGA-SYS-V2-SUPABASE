import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadPdfButton } from "@/features/documents/DownloadPdfButton";
import { downloadDocumentPdf } from "@/features/documents/pdf";

vi.mock("@/features/documents/pdf", () => ({
  downloadDocumentPdf: vi.fn(),
}));

describe("DownloadPdfButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prevents duplicate PDF generation while a download is in progress", () => {
    downloadDocumentPdf.mockReturnValue(new Promise(() => {}));
    render(<DownloadPdfButton model={{ filename: "document.pdf" }} />);

    const button = screen.getByRole("button", { name: /download pdf/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(downloadDocumentPdf).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });
});
