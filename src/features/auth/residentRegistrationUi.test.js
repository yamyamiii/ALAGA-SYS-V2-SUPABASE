import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = globalThis.process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Resident registration UI and routing", () => {
  it("uses the approved login wording and Resident registration action", () => {
    const login = read("src/pages/LoginPage.jsx");
    expect(login).toContain("Create resident account");
    expect(login).toContain(
      "Residents may create an account to access ALAGA-SYS. Staff accounts",
    );
    expect(login).toContain("are issued by the Barangay Health Center.");
    expect(login).not.toContain("does not offer public staff registration");
  });

  it("renders only the approved public Resident fields", () => {
    const page = read("src/pages/ResidentRegistrationPage.jsx");
    for (const label of [
      "Email",
      "Password",
      "Confirm password",
      "First name",
      "Middle name (optional)",
      "Last name",
      "Date of birth",
      "Sex",
      "Purok",
      "Address (optional)",
      "Phone number (optional)",
    ]) {
      expect(page).toContain(label);
    }
    expect(page).not.toMatch(/register\("role"\)/);
    expect(page).not.toMatch(/register\("account_status"\)/);
    expect(page).not.toMatch(/register\("household_id"\)/);
  });

  it("keeps registration and pending status outside protected application routes", () => {
    const router = read("src/app/router.jsx");
    const publicRoutes = router.slice(
      0,
      router.indexOf("<Route element={<ProtectedRoute />}>"),
    );
    expect(publicRoutes).toContain("ROUTES.residentRegistration");
    expect(publicRoutes).toContain("ROUTES.registrationStatus");
  });

  it("explains that pending accounts cannot access protected data", () => {
    const statusPage = read("src/pages/ResidentRegistrationStatusPage.jsx");
    expect(statusPage).toContain("Registration pending verification");
    expect(statusPage).toContain(
      "Account created. Please check your email and confirm your email",
    );
    expect(statusPage).toContain(
      "remain pending until approved by the Barangay Health Center.",
    );
    expect(statusPage).toContain(
      "Pending accounts cannot view other Residents, appointments, or",
    );
  });
});
