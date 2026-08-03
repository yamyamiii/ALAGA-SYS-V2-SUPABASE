import { describe, expect, it } from "vitest";

import { DOCUMENT_TYPES } from "@/features/documents/constants";
import {
  buildDocumentModel,
  calculateDocumentAge,
  sanitizeDocumentFilename,
} from "@/features/documents/documentModels";

const generatedAt = new Date("2026-07-26T22:30:00.000Z");

describe("printable document models", () => {
  it("uses deterministic sanitized filenames and an explicit Manila timestamp", () => {
    expect(sanitizeDocumentFilename("ALAGA/Appointment:APT-1")).toBe(
      "ALAGA-Appointment-APT-1.pdf",
    );
    const model = buildDocumentModel(
      DOCUMENT_TYPES.APPOINTMENT_SLIP,
      {
        document_type: DOCUMENT_TYPES.APPOINTMENT_SLIP,
        appointment_number: "APT-2026-000001",
        resident_name: "Maria Santos",
        service_type: "General Consultation",
        appointment_type: "scheduled",
        scheduled_date: "2026-07-27",
        start_time: "09:00:00",
        assigned_staff_name: "Nurse Reyes",
        status: "confirmed",
      },
      generatedAt,
    );
    expect(model.filename).toBe("ALAGA-Appointment-APT-2026-000001.pdf");
    expect(model.generatedLabel).toContain("Asia/Manila");
  });

  it("excludes appointment reason, notes, contacts, and raw identifiers", () => {
    const model = buildDocumentModel(
      DOCUMENT_TYPES.APPOINTMENT_SLIP,
      {
        document_type: DOCUMENT_TYPES.APPOINTMENT_SLIP,
        appointment_number: "APT-2026-000001",
        resident_name: "Maria Santos",
        service_type: "General Consultation",
        appointment_type: "scheduled",
        scheduled_date: "2026-07-27",
        start_time: "09:00:00",
        assigned_staff_name: "Nurse Reyes",
        status: "confirmed",
        reason: "must stay hidden",
        operational_notes: "must stay hidden",
        resident_id: "11111111-1111-4111-8111-111111111111",
        contact_number: "09000000000",
      },
      generatedAt,
    );
    const rendered = JSON.stringify(model);
    expect(rendered).not.toContain("must stay hidden");
    expect(rendered).not.toContain("11111111");
    expect(rendered).not.toContain("09000000000");
  });

  it("labels amended consultation content without adding unrelated history", () => {
    const model = buildDocumentModel(
      DOCUMENT_TYPES.CONSULTATION_SUMMARY,
      {
        document_type: DOCUMENT_TYPES.CONSULTATION_SUMMARY,
        encounter_number: "ENC-2026-000001",
        resident_name: "Maria Santos",
        encounter_date: "2026-07-27",
        encounter_type: "general_consultation",
        attending_staff_name: "Nurse Reyes",
        chief_complaint: "Headache",
        assessment: "Clinician-authored assessment",
        plan: "Clinician-authored plan",
        follow_up_date: "2026-08-03",
        status: "amended",
        is_amended: true,
        amends_encounter_number: "ENC-2026-000000",
        allergies: "must stay hidden",
        medical_history: "must stay hidden",
      },
      generatedAt,
    );
    expect(model.title).toContain("Amended Record");
    expect(JSON.stringify(model)).toContain("ENC-2026-000000");
    expect(JSON.stringify(model)).not.toContain("must stay hidden");
  });

  it("includes only approved prenatal visit facts in chronological order", () => {
    const model = buildDocumentModel(
      DOCUMENT_TYPES.PRENATAL_SUMMARY,
      {
        document_type: DOCUMENT_TYPES.PRENATAL_SUMMARY,
        pregnancy_number: "MAT-2026-000001",
        resident_name: "Maria Santos",
        last_menstrual_period: "2026-01-01",
        estimated_delivery_date: "2026-10-08",
        gravida: 2,
        para: 1,
        term_births: 1,
        preterm_births: 0,
        pregnancy_losses: 0,
        living_children: 1,
        risk_level: "low",
        status: "active",
        attending_midwife_name: "Midwife Cruz",
        clinical_fields_visible: true,
        prenatal_visits: [
          {
            visit_date: "2026-02-01",
            gestational_age_weeks: 5,
            attending_staff_name: "Midwife Cruz",
            findings: "must stay hidden",
          },
        ],
        risk_notes: "must stay hidden",
      },
      generatedAt,
    );
    const rendered = JSON.stringify(model);
    expect(rendered).toContain("5 weeks");
    expect(rendered).not.toContain("must stay hidden");
  });

  it("calculates child age at the Manila generation date without interpretation", () => {
    expect(calculateDocumentAge("2020-07-27", generatedAt)).toBe(6);
    const model = buildDocumentModel(
      DOCUMENT_TYPES.CHILD_HEALTH_SUMMARY,
      {
        document_type: DOCUMENT_TYPES.CHILD_HEALTH_SUMMARY,
        child_number: "CHD-2026-000001",
        child_name: "Ana Santos",
        birth_date: "2020-07-27",
        mother_name: "Maria Santos",
        guardian_name: null,
        clinical_fields_visible: true,
        growth_measurements: [
          {
            measured_at: "2026-07-27T01:00:00Z",
            weight_kg: 20,
            height_cm: 110,
            head_circumference_cm: 50,
            mid_upper_arm_circumference_cm: 18,
            notes: "must stay hidden",
            classification: "must stay hidden",
          },
        ],
        immunizations: [
          {
            vaccine_name: "MMR",
            dose_number: 1,
            administered_date: "2026-07-20",
            recommendation: "must stay hidden",
          },
        ],
        latest_child_visit: null,
      },
      generatedAt,
    );
    const rendered = JSON.stringify(model);
    expect(rendered).toContain("6 years");
    expect(rendered).toContain("MMR");
    expect(rendered).not.toContain("must stay hidden");
  });

  it("rejects mismatched payload types", () => {
    expect(() =>
      buildDocumentModel(
        DOCUMENT_TYPES.REFERRAL_FORM,
        { document_type: DOCUMENT_TYPES.APPOINTMENT_SLIP },
        generatedAt,
      ),
    ).toThrow(/does not match/i);
  });
});
