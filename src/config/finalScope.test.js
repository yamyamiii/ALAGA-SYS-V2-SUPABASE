import fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FINAL_SCOPE_FEATURES,
  FINAL_SCOPE_REPORT_CATEGORIES,
  FINAL_SCOPE_REPORT_ROLES,
  HIDDEN_FINAL_SCOPE_ROUTES,
} from "@/config/finalScope";
import { ROUTES } from "@/config/routes";
import { USER_ROLES } from "@/features/auth/permissions";

describe("approved final thesis scope", () => {
  it("keeps inactive extensions disabled in one visibility contract", () => {
    expect(FINAL_SCOPE_FEATURES).toMatchObject({
      maternalChildCare: false,
      referrals: false,
      advancedClinicalReports: false,
      clinicalExtendedDocuments: false,
      medicineInventory: false,
      standaloneHouseholds: false,
      settings: false,
    });
    expect(FINAL_SCOPE_REPORT_CATEGORIES).toEqual([
      "overview",
      "residents",
      "appointments",
      "staff_workload",
    ]);
    expect(FINAL_SCOPE_REPORT_ROLES).toEqual([
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.NURSE,
      USER_ROLES.MIDWIFE,
    ]);
  });

  it("routes hidden top-level modules to access denied without loading pages", () => {
    expect(HIDDEN_FINAL_SCOPE_ROUTES).toEqual(
      expect.arrayContaining([
        ROUTES.households,
        ROUTES.maternalChildCare,
        ROUTES.medicineInventory,
        ROUTES.activity,
        ROUTES.auditLogs,
        ROUTES.backupRestore,
        ROUTES.settings,
      ]),
    );
    expect(HIDDEN_FINAL_SCOPE_ROUTES).not.toContain(ROUTES.accessDenied);

    const router = fs.readFileSync("src/app/router.jsx", "utf8");
    expect(router).toContain("HIDDEN_FINAL_SCOPE_ROUTES.map");
    expect(router).toContain("to={ROUTES.accessDenied}");
    expect(router).not.toMatch(/import\("@\/features\/maternal-child-care/);
    expect(router).not.toMatch(/import\("@\/features\/backup/);
    expect(router).not.toMatch(/import\("@\/features\/registry\/Household/);
  });

  it("uses one touch-safe navigation registry for desktop and mobile", () => {
    const desktop = fs.readFileSync(
      "src/components/layout/Sidebar.jsx",
      "utf8",
    );
    const mobile = fs.readFileSync(
      "src/components/layout/MobileNavigation.jsx",
      "utf8",
    );
    const navigation = fs.readFileSync(
      "src/components/layout/Navigation.jsx",
      "utf8",
    );
    expect(desktop).toMatch(/<Navigation/);
    expect(mobile).toMatch(/<Navigation onNavigate=/);
    expect(navigation).toMatch(/min-h-11/);
    expect(mobile).toMatch(/overflow-y-auto/);
  });
});
