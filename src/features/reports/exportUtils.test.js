import { describe, expect, it } from "vitest";

import {
  reportFilename,
  rowsToCsv,
  safeSpreadsheetCell,
} from "@/features/reports/exportUtils";

describe("privacy-safe report export utilities", () => {
  it("neutralizes spreadsheet formulas", () => {
    for (const value of ["=SUM(A1:A2)", "+cmd", "-2+3", "@IMPORT"]) {
      expect(safeSpreadsheetCell(value)).toBe(`'${value}`);
    }
    expect(safeSpreadsheetCell("Normal value")).toBe("Normal value");
  });

  it("quotes headers, commas, quotes, and formula-like cells", () => {
    expect(rowsToCsv([{ metric: 'A, "quoted"', value: "=2+2" }])).toBe(
      '"metric","value"\r\n"A, ""quoted""","\'=2+2"',
    );
  });

  it("creates a sanitized deterministic filename", () => {
    expect(
      reportFilename("Child care/summary", "2026-07-01", "2026-07-27", "csv"),
    ).toBe("alaga-sys-child-care-summary-2026-07-01-to-2026-07-27.csv");
  });
});
