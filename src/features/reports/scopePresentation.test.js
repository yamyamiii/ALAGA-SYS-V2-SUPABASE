import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import {
  categoriesForRole,
  reportSummaryEntries,
} from "@/features/reports/constants";

describe("final-scope report presentation", () => {
  it("keeps full and operational categories role-scoped", () => {
    expect(
      categoriesForRole(USER_ROLES.ADMINISTRATOR).map(({ id }) => id),
    ).toEqual(["overview", "residents", "appointments", "staff_workload"]);
    expect(
      categoriesForRole(USER_ROLES.BARANGAY_HEALTH_WORKER).map(({ id }) => id),
    ).toEqual(["overview", "residents", "appointments"]);
    expect(categoriesForRole(USER_ROLES.NURSE).map(({ id }) => id)).toEqual([
      "appointments",
    ]);
    expect(categoriesForRole(USER_ROLES.MIDWIFE).map(({ id }) => id)).toEqual([
      "appointments",
    ]);
    expect(categoriesForRole(USER_ROLES.RESIDENT)).toEqual([]);
  });

  it("shows only appointment and resident operations in the overview", () => {
    const entries = reportSummaryEntries("overview", {
      active_residents: 120,
      total_appointments: 40,
      pending_requests: 3,
      confirmed_appointments: 8,
      completed_appointments: 20,
      cancelled_appointments: 2,
      appointments_today: 5,
      checked_in_queue: 1,
      households: 31,
      signed_encounters: 12,
      active_pregnancies: 6,
      active_child_profiles: 9,
      immunizations_due: 4,
    });

    expect(entries.map(({ key }) => key)).toEqual([
      "active_residents",
      "total_appointments",
      "pending_requests",
      "confirmed_appointments",
      "completed_appointments",
      "cancelled_appointments",
      "appointments_today",
      "checked_in_queue",
    ]);
    expect(entries.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining([
        "households",
        "signed_encounters",
        "active_pregnancies",
        "active_child_profiles",
        "immunizations_due",
      ]),
    );
  });

  it("keeps resident summaries while hiding broad household totals", () => {
    const entries = reportSummaryEntries("residents", {
      active_residents: 120,
      senior_citizens: 22,
      households: 31,
      average_household_size: 3.87,
    });

    expect(entries.find(({ key }) => key === "active_residents")?.value).toBe(
      120,
    );
    expect(entries.find(({ key }) => key === "senior_citizens")?.value).toBe(
      22,
    );
    expect(entries.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(["households", "average_household_size"]),
    );
  });
});
