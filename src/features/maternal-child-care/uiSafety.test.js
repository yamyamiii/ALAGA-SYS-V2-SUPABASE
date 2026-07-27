import fs from "node:fs";

import { describe, expect, it } from "vitest";

const page = fs.readFileSync(
  "src/features/maternal-child-care/MaternalChildCarePage.jsx",
  "utf8",
);
const form = fs.readFileSync(
  "src/features/maternal-child-care/MaternalChildFormDialog.jsx",
  "utf8",
);
const detail = fs.readFileSync(
  "src/features/maternal-child-care/MaternalChildDetailDialog.jsx",
  "utf8",
);
const eventForm = fs.readFileSync(
  "src/features/maternal-child-care/MaternalChildEventDialog.jsx",
  "utf8",
);
const service = fs.readFileSync("src/services/maternalChildService.js", "utf8");

describe("maternal-child UI safety", () => {
  it("exposes all required workflow sections with responsive list views", () => {
    for (const label of [
      "Pregnancies",
      "Prenatal Visits",
      "Deliveries",
      "Postnatal Care",
      "Child Profiles",
      "Growth Monitoring",
      "Immunizations",
    ]) {
      expect(
        fs.readFileSync(
          "src/features/maternal-child-care/constants.js",
          "utf8",
        ),
      ).toContain(label);
    }
    expect(page).toMatch(/lg:hidden/);
    expect(page).toMatch(/hidden overflow-x-auto lg:block/);
  });

  it("uses the trusted resident search and service boundary", () => {
    expect(form).toMatch(/AppointmentResidentField/);
    expect(page).toMatch(/useMaternalChildList/);
    expect(service).toMatch(/client\(\)\.rpc/);
    expect(page + form + detail + eventForm).not.toMatch(
      /getSupabaseClient|\.from\(/,
    );
  });

  it("provides authorized event forms for every longitudinal timeline", () => {
    for (const event of [
      "prenatal",
      "delivery",
      "postnatal",
      "growth",
      "immunization",
      "visit",
    ]) {
      expect(eventForm).toContain(event);
    }
    expect(detail).toMatch(/Mark delivered/);
    expect(detail).toMatch(/Mark completed/);
  });

  it("has explicit loading, empty, retry, and error states", () => {
    expect(page).toMatch(/LoadingState/);
    expect(page).toMatch(/EmptyState/);
    expect(page).toMatch(/ErrorState/);
    expect(page).toMatch(/query\.refetch/);
    expect(detail).toMatch(/Record not found/);
  });

  it("does not render clinical names or narratives on dashboard integration", () => {
    const dashboard = fs.readFileSync("src/pages/DashboardPage.jsx", "utf8");
    const careSection = dashboard.slice(
      dashboard.indexOf('aria-label="Maternal and child care overview"'),
      dashboard.indexOf('<section className="grid gap-6 xl:grid-cols-5">'),
    );
    expect(careSection).not.toMatch(
      /resident_name|child_name|risk_notes|findings|developmental_notes/,
    );
  });
});
