import { describe, expect, it } from "vitest";

import {
  calculateAge,
  formatPersonName,
  normalizeWhitespace,
} from "@/features/registry/formatters";

describe("registry formatters", () => {
  it("normalizes names without requiring a middle name", () => {
    expect(normalizeWhitespace("  Ana   Marie ")).toBe("Ana Marie");
    expect(
      formatPersonName({ first_name: " Ana ", last_name: " Santos " }),
    ).toBe("Ana Santos");
  });

  it("calculates age against a stable reference date", () => {
    const today = new Date(2026, 6, 20);
    expect(calculateAge("2000-07-20", today)).toBe(26);
    expect(calculateAge("2000-07-21", today)).toBe(25);
    expect(calculateAge("invalid", today)).toBeNull();
  });
});
