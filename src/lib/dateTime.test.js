import { describe, expect, it } from "vitest";

import {
  formatManilaClock,
  formatManilaDateTime,
  MANILA_TIME_ZONE,
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
  });

  it("fails safely for invalid timestamps", () => {
    expect(formatManilaDateTime("not-a-date")).toBe("Not available");
    expect(formatManilaClock("not-a-date")).toEqual({
      date: "Date unavailable",
      time: "Time unavailable • Asia/Manila",
      dateTime: undefined,
    });
  });
});
