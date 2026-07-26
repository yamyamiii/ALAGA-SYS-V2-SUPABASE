import { describe, expect, it } from "vitest";

import {
  calculateBmi,
  encounterClinicalSchema,
  getVitalWarnings,
  vitalSignsSchema,
} from "@/features/health-records/schemas";

describe("health-record validation", () => {
  it("accepts bounded clinical sections and rejects oversized narratives", () => {
    expect(
      encounterClinicalSchema.safeParse({
        chief_complaint: "Persistent cough",
        subjective_notes: "",
        objective_notes: "",
        assessment: "Clinical assessment",
        plan: "Follow up",
        diagnosis_text: "",
        treatment_notes: "",
        follow_up_date: "",
      }).success,
    ).toBe(true);
    expect(
      encounterClinicalSchema.safeParse({
        chief_complaint: "x".repeat(2001),
        subjective_notes: "",
        objective_notes: "",
        assessment: "",
        plan: "",
        diagnosis_text: "",
        treatment_notes: "",
        follow_up_date: "",
      }).success,
    ).toBe(false);
  });

  it("requires a measurement and enforces only broad physical bounds", () => {
    expect(vitalSignsSchema.safeParse({ temperature_c: "36.8" }).success).toBe(
      true,
    );
    expect(vitalSignsSchema.safeParse({ temperature_c: "19" }).success).toBe(
      false,
    );
    expect(vitalSignsSchema.safeParse({}).success).toBe(false);
  });

  it("calculates BMI consistently without diagnosing", () => {
    expect(calculateBmi(170, 65)).toBe(22.5);
    expect(calculateBmi("", 65)).toBeNull();
  });

  it("warns about unusual plausible readings instead of rejecting them", () => {
    expect(
      getVitalWarnings({ temperature_c: 39, systolic_bp: 190 }),
    ).toHaveLength(2);
    expect(
      vitalSignsSchema.safeParse({ temperature_c: 39, systolic_bp: 190 })
        .success,
    ).toBe(true);
  });
});
