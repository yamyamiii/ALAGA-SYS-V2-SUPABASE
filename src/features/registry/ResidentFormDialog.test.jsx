import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { residentValuesForWrite } from "@/features/registry/residentFormValues";

const residentFormSource = fs.readFileSync(
  "src/features/registry/ResidentFormDialog.jsx",
  "utf8",
);
const registryServiceSource = fs.readFileSync(
  "src/services/registryService.js",
  "utf8",
);

describe("Resident form household scope", () => {
  it("shows only locality controls in the visible section", () => {
    expect(residentFormSource).toMatch(/SectionHeading title="Locality"/);
    expect(residentFormSource).toMatch(/label="Purok"/);
    expect(residentFormSource).toMatch(/label="Address \(optional\)"/);
    expect(residentFormSource).not.toMatch(/HouseholdSearchField/);
    expect(residentFormSource).not.toMatch(
      /Locality and household|label="Household"|No household|optional household relationships/i,
    );
  });

  it("uses SQL null for a new Resident regardless of browser form values", () => {
    expect(
      residentValuesForWrite(
        { first_name: "Maria", household_id: "browser-supplied-household" },
        null,
      ),
    ).toMatchObject({ first_name: "Maria", household_id: null });
  });

  it("forwards the stored household unchanged when editing", () => {
    const householdId = "33333333-3333-4333-8333-333333333333";
    expect(
      residentValuesForWrite(
        { first_name: "Maria", household_id: null },
        { id: "resident-id", household_id: householdId },
      ),
    ).toMatchObject({ first_name: "Maria", household_id: householdId });
  });

  it("retains backend household write compatibility", () => {
    expect(registryServiceSource).toMatch(
      /RESIDENT_WRITE_FIELDS[\s\S]*"household_id"/,
    );
    expect(registryServiceSource).toMatch(
      /async updateResident[\s\S]*pick\(values, RESIDENT_WRITE_FIELDS\)/,
    );
  });
});
