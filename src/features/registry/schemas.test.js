import { describe, expect, it } from "vitest";

import {
  householdSchema,
  residentSchema,
  validateLocalityConsistency,
} from "@/features/registry/schemas";

const barangayId = "11111111-1111-4111-8111-111111111111";
const purokId = "22222222-2222-4222-8222-222222222222";

const resident = {
  first_name: "  Maria  ",
  middle_name: "",
  last_name: " Santos ",
  suffix: "",
  date_of_birth: "1990-02-01",
  sex: "female",
  civil_status: "single",
  blood_type: "O+",
  nationality: "Filipino",
  religion: "",
  phone_number: "+63 912 345 6789",
  email: "",
  occupation: "",
  purok_id: purokId,
  household_id: "",
  address_line: "",
  philhealth_number: "",
  emergency_contact_name: "",
  emergency_contact_number: "",
  emergency_contact_relationship: "",
  is_senior_citizen: false,
  is_pwd: false,
  pregnancy_status: "not_pregnant",
  status: "active",
};

describe("registry schemas", () => {
  it("accepts and normalizes valid resident demographic data", () => {
    const result = residentSchema.parse(resident);
    expect(result.first_name).toBe("Maria");
    expect(result.last_name).toBe("Santos");
    expect(result.address_line).toBe("");
  });

  it("rejects future dates and inapplicable pregnancy values", () => {
    expect(
      residentSchema.safeParse({ ...resident, date_of_birth: "2999-01-01" })
        .success,
    ).toBe(false);
    expect(residentSchema.safeParse({ ...resident, sex: "male" }).success).toBe(
      false,
    );
  });

  it("validates household coordinates and required address", () => {
    expect(
      householdSchema.safeParse({
        purok_id: purokId,
        address_line: "Sitio Mabuhay",
        latitude: "14.6",
        longitude: "121.0",
        status: "active",
      }).success,
    ).toBe(true);
    expect(
      householdSchema.safeParse({
        purok_id: purokId,
        address_line: "",
        latitude: "",
        longitude: "",
        status: "active",
      }).success,
    ).toBe(false);
  });

  it("detects mismatched locality references before submission", () => {
    expect(
      validateLocalityConsistency(
        {
          purok_id: purokId,
          household_id: "33333333-3333-4333-8333-333333333333",
        },
        {
          puroks: [{ id: purokId, barangay_id: barangayId }],
          households: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              barangay_id: "different-barangay",
              purok_id: purokId,
            },
          ],
        },
      ),
    ).toMatch(/does not match/i);
  });

  it("rejects a purok outside the resolved deployment options", () => {
    expect(
      validateLocalityConsistency(
        { purok_id: purokId, household_id: "" },
        { puroks: [], households: [] },
      ),
    ).toMatch(/Purok 1 through Purok 7/i);
  });
});
