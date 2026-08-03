import fs from "node:fs";

import { describe, expect, it } from "vitest";

const routes = fs.readFileSync("src/config/routes.js", "utf8");
const reportsPage = fs.readFileSync(
  "src/features/reports/ReportsPage.jsx",
  "utf8",
);

describe("ALAGA AI nested destination safety", () => {
  it("registers only fixed child destinations", () => {
    for (const route of [
      "/appointments/calendar",
      "/appointments/queue",
      "/health-records?section=encounters",
      "/health-records?section=vital-signs",
      "/maternal-child-care?section=pregnancies",
      "/maternal-child-care?section=children",
      "/reports?category=appointments",
      "/reports?category=overview&period=month",
    ]) {
      expect(routes).toContain(route);
    }
  });

  it("allowlists report categories and preset periods at the page boundary", () => {
    expect(reportsPage).toMatch(/categories\.some/);
    expect(reportsPage).toMatch(
      /\["today", "week", "month", "quarter", "year"\]\.includes/,
    );
    expect(reportsPage).toMatch(/quickRange\(period\)/);
  });
});
