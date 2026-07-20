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

  it("protects both registry routes with centralized read permissions", () => {
    expect(router).toMatch(
      /ROUTES\.households[\s\S]*PERMISSIONS\.VIEW_HOUSEHOLDS/,
    );
    expect(router).toMatch(
      /ROUTES\.residents[\s\S]*PERMISSIONS\.VIEW_RESIDENTS/,
    );
  });

  it("does not expose permanent deletion or future healthcare tabs", () => {
    const source = `${householdPage}\n${residentPage}`;
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/vaccine|health[- ]record|medicine tab/i);
  });
});
