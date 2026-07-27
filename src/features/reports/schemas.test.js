import { describe, expect, it } from "vitest";

import {
  initialReportFilters,
  manilaDateKey,
  quickRange,
  validateReportFilters,
} from "@/features/reports/schemas";

describe("report filter dates", () => {
  it("uses the Manila business date deterministically", () => {
    const utcEvening = new Date("2026-07-26T22:30:00.000Z");
    expect(manilaDateKey(utcEvening)).toBe("2026-07-27");
    expect(initialReportFilters(utcEvening).end_date).toBe("2026-07-27");
  });

  it("builds useful quick ranges", () => {
    const now = new Date("2026-07-27T03:00:00.000Z");
    expect(quickRange("today", now)).toEqual({
      start_date: "2026-07-27",
      end_date: "2026-07-27",
    });
    expect(quickRange("month", now).start_date).toBe("2026-07-01");
    expect(quickRange("quarter", now).start_date).toBe("2026-07-01");
    expect(quickRange("year", now).start_date).toBe("2026-01-01");
  });

  it("rejects reversed and overlong ranges before an RPC", () => {
    const base = {
      purok_id: "",
      service_type: "",
      status: "",
      staff_id: "",
    };
    expect(
      validateReportFilters({
        ...base,
        start_date: "2026-07-28",
        end_date: "2026-07-27",
      }).error,
    ).toMatch(/on or after/i);
    expect(
      validateReportFilters({
        ...base,
        start_date: "2020-01-01",
        end_date: "2026-07-27",
      }).error,
    ).toMatch(/five years/i);
  });
});
