import { describe, expect, it } from "vitest";

import {
  childProfileSchema,
  pregnancySchema,
} from "@/features/maternal-child-care/schemas";

const residentId = "11111111-1111-4111-8111-111111111111";

describe("maternal-child form schemas", () => {
  it("accepts a valid pregnancy profile and rejects reversed dates", () => {
    const valid = {
      resident_id: residentId,
      last_menstrual_period: "2026-06-01",
      estimated_delivery_date: "2027-03-08",
      gravida: 1,
      para: 0,
      term_births: 0,
      preterm_births: 0,
      abortions: 0,
      living_children: 0,
      pregnancy_risk_level: "unassessed",
      risk_notes: "",
    };
    expect(pregnancySchema.safeParse(valid).success).toBe(true);
    expect(
      pregnancySchema.safeParse({
        ...valid,
        estimated_delivery_date: "2026-05-01",
      }).success,
    ).toBe(false);
  });

  it("accepts optional child links and rejects invalid identifiers", () => {
    const child = {
      child_resident_id: residentId,
      mother_resident_id: "",
      guardian_resident_id: "",
      birth_date: "2025-01-01",
      birth_weight_kg: "3.2",
      birth_length_cm: "49",
      gestational_age_weeks: "39",
      birth_place: "Lipa City",
      delivery_type: "Vaginal",
      newborn_screening_status: "Completed",
      blood_type: "unknown",
    };
    expect(childProfileSchema.safeParse(child).success).toBe(true);
    expect(
      childProfileSchema.safeParse({
        ...child,
        child_resident_id: "CHD-1",
      }).success,
    ).toBe(false);
  });
});
