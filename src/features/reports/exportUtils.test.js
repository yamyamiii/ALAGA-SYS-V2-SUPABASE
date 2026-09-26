import { describe, expect, it, vi } from "vitest";

import {
  downloadPdfReport,
  reportFilename,
} from "@/features/reports/exportUtils";

function createPdfDouble({ height = 297 } = {}) {
  const textCalls = [];
  return {
    textCalls,
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => height,
      },
    },
    setProperties: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    save: vi.fn(),
    splitTextToSize: vi.fn((value, width) => {
      const size = Math.max(Math.floor(width / 2), 1);
      return String(value).match(new RegExp(`.{1,${size}}`, "g")) ?? [""];
    }),
    text: vi.fn((value) => {
      textCalls.push(Array.isArray(value) ? value.join(" ") : value);
    }),
  };
}

const metadata = {
  category: "overview",
  categoryLabel: "Overview",
  startDate: "2026-09-01",
  endDate: "2026-09-27",
};

describe("privacy-safe PDF report export utilities", () => {
  it("creates a sanitized deterministic PDF filename", () => {
    expect(
      reportFilename("Appointment reports", "2026-09-01", "2026-09-27", "pdf"),
    ).toBe("alaga-sys-appointment-reports-2026-09-01-to-2026-09-27.pdf");
  });

  it("downloads a real PDF with the report header, period, and authorized rows", () => {
    const document = createPdfDouble();
    const filename = downloadPdfReport(
      [
        { metric: "Active residents", value: 18 },
        { metric: "Total appointments", value: 7 },
      ],
      metadata,
      {
        createDocument: () => document,
        generatedAt: new Date("2026-09-27T11:45:12.000Z"),
      },
    );

    expect(filename).toBe("alaga-sys-overview-2026-09-01-to-2026-09-27.pdf");
    expect(document.save).toHaveBeenCalledWith(filename);
    expect(document.textCalls).toEqual(
      expect.arrayContaining([
        "ALAGA-SYS",
        "Barangay Healthcare",
        "Brgy. Bagongpook",
        "Report: Overview",
        "Reporting period: 2026-09-01 to 2026-09-27",
        expect.stringContaining("Asia/Manila"),
        "Active residents",
        "Total appointments",
      ]),
    );
  });

  it("adds pages and repeats table context before rows reach the page bottom", () => {
    const document = createPdfDouble({ height: 75 });
    const rows = Array.from({ length: 20 }, (_, index) => ({
      metric: `Metric ${index + 1}`,
      value: `A safely wrapped value for report row ${index + 1}`,
    }));

    downloadPdfReport(rows, metadata, {
      createDocument: () => document,
      generatedAt: new Date("2026-09-27T11:45:12.000Z"),
    });

    expect(document.addPage).toHaveBeenCalled();
    expect(
      document.textCalls.filter((value) => /^Metric \d+$/.test(value)),
    ).toHaveLength(20);
    expect(
      document.textCalls.some((value) =>
        value.includes("ALAGA-SYS · Overview · 2026-09-01 to 2026-09-27"),
      ),
    ).toBe(true);
  });

  it("rejects empty data without creating or saving a PDF", () => {
    const createDocument = vi.fn();

    expect(() => downloadPdfReport([], metadata, { createDocument })).toThrow(
      "No report data is available for PDF export.",
    );
    expect(createDocument).not.toHaveBeenCalled();
  });
});
