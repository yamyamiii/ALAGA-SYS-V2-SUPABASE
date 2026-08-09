import fs from "node:fs";
import { describe, expect, it } from "vitest";

const appointment = fs.readFileSync(
  "src/features/appointments/AppointmentDetailDialog.jsx",
  "utf8",
);
const encounter = fs.readFileSync(
  "src/features/health-records/HealthRecordDetailPage.jsx",
  "utf8",
);
const maternal = fs.readFileSync(
  "src/features/maternal-child-care/MaternalChildDetailDialog.jsx",
  "utf8",
);
const service = fs.readFileSync("src/services/documentService.js", "utf8");
const pdf = fs.readFileSync("src/features/documents/pdf.js", "utf8");

describe("printable document UI integration", () => {
  it("adds only authorized detail-level document actions", () => {
    expect(appointment).toContain("Print Appointment Slip");
    expect(appointment).toMatch(/canPrintAppointmentSlip/);
    expect(encounter).toContain("Print Consultation Summary");
    expect(encounter).toMatch(/canPrintConsultationSummary/);
    expect(encounter).not.toMatch(/ReferralDialog|Referral Form/);
    expect(maternal).not.toMatch(
      /Print Prenatal Summary|Print Child Health Summary|DocumentPreviewDialog/,
    );
  });

  it("uses centralized RPC services instead of broad page queries", () => {
    expect(service).toMatch(/client\.rpc\(operation, parameters\)/);
    expect(service).not.toMatch(/\.from\(/);
    expect(appointment + encounter + maternal).not.toMatch(
      /getSupabaseClient|\.from\(/,
    );
  });

  it("keeps PDF generation local, text-based, branded, and deterministic", () => {
    expect(pdf).toMatch(/import\("jspdf"\)/);
    expect(pdf).toMatch(/pdf\.text\(/);
    expect(pdf).toContain("/alaga-logo.png");
    expect(pdf).toMatch(/pdf\.save\(model\.filename\)/);
    expect(pdf).not.toMatch(/html2canvas|Gemini|fetch\(["']https?:/i);
  });

  it("does not persist or transmit protected document content", () => {
    const files = [
      service,
      pdf,
      fs.readFileSync(
        "src/features/documents/DocumentPreviewDialog.jsx",
        "utf8",
      ),
    ].join("\n");
    expect(files).not.toMatch(/localStorage|sessionStorage/);
    expect(files).not.toMatch(/alaga-ai|gemini|analytics/i);
  });
});
