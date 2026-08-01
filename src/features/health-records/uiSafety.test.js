import fs from "node:fs";

import { describe, expect, it } from "vitest";

const router = fs.readFileSync("src/app/router.jsx", "utf8");
const pages = ["HealthRecordsPage.jsx", "HealthRecordDetailPage.jsx"].map(
  (name) => fs.readFileSync(`src/features/health-records/${name}`, "utf8"),
);
const service = fs.readFileSync("src/services/healthRecordService.js", "utf8");
const appointmentIntegration = fs.readFileSync(
  "src/features/health-records/AppointmentEncounterAction.jsx",
  "utf8",
);
const residentIntegration = fs.readFileSync(
  "src/features/health-records/ResidentClinicalSummary.jsx",
  "utf8",
);
const encounterCreate = fs.readFileSync(
  "src/features/health-records/EncounterCreateDialog.jsx",
  "utf8",
);
const appointmentConstants = fs.readFileSync(
  "src/features/appointments/constants.js",
  "utf8",
);
const clinicalForm = fs.readFileSync(
  "src/features/health-records/EncounterClinicalFormDialog.jsx",
  "utf8",
);
const detailPage = pages[1];

describe("health-record UI boundaries", () => {
  it("protects list and detail routes with the centralized permission", () => {
    expect(router).toMatch(
      /ROUTES\.healthRecords[\s\S]*PERMISSIONS\.VIEW_HEALTH_RECORDS/i,
    );
    expect(router).toMatch(
      /health-records\/:encounterId[\s\S]*PERMISSIONS\.VIEW_HEALTH_RECORDS/i,
    );
  });

  it("keeps Supabase calls outside route pages", () => {
    for (const page of pages) {
      expect(page).not.toMatch(/getSupabaseClient|\.from\(|\.rpc\(/i);
    }
    expect(service).toMatch(/health_record_list/);
    expect(service).toMatch(/health_record_get/);
    expect(service).toMatch(/health_encounter_sign/);
  });

  it("provides responsive cards, desktop tables, and retry states", () => {
    expect(pages[0]).toMatch(/lg:hidden/);
    expect(pages[0]).toMatch(/hidden overflow-x-auto lg:block/);
    expect(pages[0]).toMatch(/useDebouncedValue/);
    for (const page of pages) {
      expect(page).toMatch(/ErrorState/);
      expect(page).toMatch(/refetch/);
    }
  });

  it("does not log or place clinical narratives in overview rows", () => {
    expect(pages[0]).not.toMatch(
      /chief_complaint|subjective_notes|objective_notes|diagnosis_text|treatment_notes/i,
    );
    expect(service).not.toMatch(/console\.(?:log|info|error)\(/i);
    expect(service).toMatch(/providerCode/);
  });

  it("integrates appointments and residents without exposing appointment notes", () => {
    expect(appointmentIntegration).toMatch(/Start Clinical Encounter/);
    expect(appointmentIntegration).toMatch(/Open Health Record/);
    expect(appointmentIntegration).toMatch(/Maternal Care/);
    expect(encounterCreate).toMatch(/profile\.role === "midwife"/);
    expect(appointmentIntegration).not.toMatch(/operational_notes|reason/);
    expect(residentIntegration).toMatch(/Clinical Timeline/);
    expect(residentIntegration).toMatch(/Allergies/);
    expect(residentIntegration).toMatch(/Medical History/);
    expect(residentIntegration).toMatch(/Recent Encounters/);
  });

  it("loads health-record staff within the deployed search pagination contract", () => {
    expect(pages[0]).toMatch(/pageSize: STAFF_SEARCH_MAX_PAGE_SIZE/);
    expect(pages[0]).not.toMatch(/pageSize:\s*100/);
    expect(appointmentConstants).toMatch(/STAFF_SEARCH_MAX_PAGE_SIZE\s*=\s*25/);
  });

  it("explains and enforces the required signing fields in the UI", () => {
    expect(clinicalForm).toMatch(
      /Chief complaint[\s\S]*required before signing/i,
    );
    expect(clinicalForm).toMatch(/Assessment[\s\S]*required before signing/i);
    expect(clinicalForm).toMatch(/Plan[\s\S]*required before signing/i);
    expect(clinicalForm).toMatch(/incomplete drafts may still be saved/i);
    expect(detailPage).toContain("disabled={!signReady}");
    expect(detailPage).toMatch(
      /Complete required documentation before signing/i,
    );
  });
});
