import process from "node:process";

import { describe, expect, it } from "vitest";

import {
  formatManilaDate,
  formatManilaClock,
  formatManilaDateTime,
  formatManilaDateTimeInput,
  MANILA_TIME_ZONE,
  manilaDateTimeInputToIso,
} from "@/lib/dateTime";

describe("Manila date and time formatting", () => {
  const instant = new Date("2026-07-27T11:45:12.000Z");

  it("formats the live clock explicitly in Asia/Manila", () => {
    expect(MANILA_TIME_ZONE).toBe("Asia/Manila");
    expect(formatManilaClock(instant)).toEqual({
      date: "Monday • July 27, 2026",
      time: "7:45:12 PM • Asia/Manila",
      dateTime: "2026-07-27T11:45:12.000Z",
    });
  });

  it("reuses Manila formatting for operational timestamps", () => {
    expect(formatManilaDateTime(instant)).toMatch(/Jul 27, 2026,? 7:45 PM/i);
    expect(formatManilaDate(instant)).toMatch(/Jul 27, 2026/i);
  });

  it("fails safely for invalid timestamps", () => {
    expect(formatManilaDateTime("not-a-date")).toBe("Not available");
    expect(formatManilaDateTime(null)).toBe("Not available");
    expect(formatManilaDate("not-a-date")).toBe("Date unavailable");
    expect(formatManilaDateTimeInput(null)).toBe("");
    expect(formatManilaClock("not-a-date")).toEqual({
      date: "Date unavailable",
      time: "Time unavailable • Asia/Manila",
      dateTime: undefined,
    });
  });

  it("round-trips scheduling fields through Asia/Manila independently of device time", () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(formatManilaDateTimeInput("2026-08-15T00:30:00.000Z")).toBe(
        "2026-08-15T08:30",
      );
      expect(manilaDateTimeInputToIso("2026-08-15T08:30")).toBe(
        "2026-08-15T00:30:00.000Z",
      );
      expect(manilaDateTimeInputToIso("invalid")).toBeNull();
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });
});
