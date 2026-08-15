import fs from "node:fs";

import { describe, expect, it } from "vitest";

const householdPage = fs.readFileSync(
  "src/features/registry/HouseholdRegistryPage.jsx",
  "utf8",
);
const residentPage = fs.readFileSync(
  "src/features/registry/ResidentRegistryPage.jsx",
  "utf8",
);
const router = fs.readFileSync("src/app/router.jsx", "utf8");
const householdForm = fs.readFileSync(
  "src/features/registry/HouseholdFormDialog.jsx",
  "utf8",
);
const residentForm = fs.readFileSync(
  "src/features/registry/ResidentFormDialog.jsx",
  "utf8",
);
const householdSearch = fs.readFileSync(
  "src/features/registry/HouseholdSearchField.jsx",
  "utf8",
);
const accountDialog = fs.readFileSync(
  "src/features/registry/ResidentAccountDialog.jsx",
  "utf8",
);
const householdDetail = fs.readFileSync(
  "src/features/registry/HouseholdDetailDialog.jsx",
  "utf8",
);
const registryService = fs.readFileSync(
  "src/services/registryService.js",
  "utf8",
);

describe("registry UI boundaries", () => {
  it.each([
    ["household", householdPage],
    ["resident", residentPage],
  ])(
    "renders loading, error, empty, and no-result states for %s lists",
    (_, source) => {
      expect(source).toMatch(/RegistrySkeleton/);
      expect(source).toMatch(/ErrorState/);
      expect(source).toMatch(/EmptyState/);
      expect(source).toMatch(/No .* match/i);
    },
  );

  it("keeps all page data access behind the registry service hooks", () => {
    expect(householdPage).not.toMatch(/supabase/i);
    expect(residentPage).not.toMatch(/supabase/i);
    expect(householdPage).toMatch(/useHouseholds/);
    expect(residentPage).toMatch(/useResidents/);
  });

  it("guards Residents and disables the standalone Households route", () => {
    expect(router).not.toMatch(/HouseholdRegistryPage/);
    expect(router).toMatch(/HIDDEN_FINAL_SCOPE_ROUTES\.map/);
    expect(router).toMatch(
      /ROUTES\.residents[\s\S]*PERMISSIONS\.VIEW_RESIDENTS/,
    );
  });

  it("does not expose permanent deletion or future healthcare tabs", () => {
    const source = `${householdPage}\n${residentPage}`;
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/vaccine|health[- ]record|medicine tab/i);
  });

  it("does not render an editable barangay selector in registry forms or filters", () => {
    const source = `${householdPage}\n${residentPage}\n${householdForm}\n${residentForm}`;
    expect(source).not.toMatch(
      /Select barangay|All barangays|resident-barangay|household-barangay|Filter .* by barangay/i,
    );
    expect(source).toMatch(/DeploymentBarangayContext/);
  });

  it("does not collect, display, select, or submit household coordinates", () => {
    expect(householdForm).not.toMatch(/latitude|longitude|coordinates/i);
    expect(householdDetail).not.toMatch(/latitude|longitude|coordinates/i);
    expect(registryService).not.toMatch(
      /HOUSEHOLD_WRITE_FIELDS[\s\S]*latitude|HOUSEHOLD_WRITE_FIELDS[\s\S]*longitude/i,
    );
    expect(registryService).not.toMatch(
      /from\("households"\)[\s\S]{0,180}\.select\([^)]*latitude/i,
    );
  });

  it("passes the resident UUID rather than resident_number to the detail dialog", () => {
    expect(residentPage.match(/setDetailId\(item\.id\)/g)).toHaveLength(2);
    expect(residentPage).toMatch(/residentId=\{detailId\}/);
    expect(residentPage).not.toMatch(/setDetailId\(item\.resident_number\)/);
  });

  it("hides household controls from the Resident form while retaining shared search support", () => {
    expect(residentForm).not.toMatch(/HouseholdSearchField/);
    expect(residentForm).not.toMatch(
      /Locality and household|label="Household"|No household|optional household relationships/i,
    );
    expect(residentForm).toMatch(/SectionHeading title="Locality"/);
    expect(residentForm).toMatch(/label="Purok"/);
    expect(residentForm).toMatch(/label="Address \(optional\)"/);
    expect(householdSearch).toMatch(/useHouseholdSearch/);
    expect(householdSearch).toMatch(/useDebouncedValue/);
    expect(residentForm).not.toMatch(/listHouseholdOptions/);
    expect(residentForm).not.toMatch(/households\.data/);
  });

  it("keeps photo and account actions behind service boundaries", () => {
    expect(residentForm).toMatch(/validateResidentPhoto/);
    expect(residentForm).toMatch(/uploadResidentPhoto/);
    expect(accountDialog).toMatch(/userManagementService/);
    expect(accountDialog).not.toMatch(/getSupabaseClient|service[_-]?role/i);
    expect(accountDialog).toMatch(/Confirm unlink/);
  });

  it("requires explicit confirmation before overriding a duplicate warning", () => {
    expect(residentForm).toMatch(/findResidentDuplicates/);
    expect(residentForm).toMatch(/Possible duplicate resident found/);
    expect(residentForm).toMatch(/Save anyway and record override/);
    expect(residentForm).toMatch(/duplicateMatchCount/);
  });
});
