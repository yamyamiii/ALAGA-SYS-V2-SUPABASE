import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { PrintableDocumentLayout } from "@/features/documents/PrintableDocumentLayout";

const model = {
  type: "appointment_slip",
  title: "Appointment Slip",
  identifier: "APT-2026-000001",
  filename: "ALAGA-Appointment-APT-2026-000001.pdf",
  generatedAt: "2026-07-26T22:30:00.000Z",
  generatedLabel: "Jul 27, 2026, 6:30 AM · Asia/Manila",
  privacyNotice: "Private scheduling document.",
  fields: [{ label: "Resident", value: "Maria Santos" }],
  sections: [{ title: "Reminder", note: "Arrive early." }],
  signature: null,
};

describe("printable document framework", () => {
  it("renders official branding, semantic generation time, and no live clock", () => {
    render(<PrintableDocumentLayout model={model} />);
    expect(
      screen.getByRole("img", { name: "ALAGA-SYS official logo" }),
    ).toHaveAttribute("src", "/alaga-logo.png");
    expect(screen.getAllByText("ALAGA-SYS").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("Barangay Bagongpook Health Center"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Asia\/Manila/).closest("time")).toHaveAttribute(
      "datetime",
      model.generatedAt,
    );
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  it("defines A4, repeated table headers, page-break safety, and protected print scope", () => {
    const css = fs.readFileSync("src/styles/globals.css", "utf8");
    expect(css).toMatch(/size:\s*A4 portrait/);
    expect(css).toMatch(/\.document-table thead[\s\S]*table-header-group/);
    expect(css).toMatch(/page-break-inside:\s*avoid/);
    expect(css).toContain("printing-protected-document");
    expect(css).toContain("[data-print-document]");
  });

  it("renders document values as text instead of executable markup", () => {
    render(
      <PrintableDocumentLayout
        model={{
          ...model,
          fields: [
            {
              label: "Resident",
              value: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
            },
          ],
        }}
      />,
    );

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(
      screen.getByText(/<script>alert\(2\)<\/script>/),
    ).toBeInTheDocument();
  });
});
