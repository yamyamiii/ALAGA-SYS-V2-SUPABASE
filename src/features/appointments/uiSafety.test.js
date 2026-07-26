import fs from "node:fs";

import { describe, expect, it } from "vitest";

const router = fs.readFileSync("src/app/router.jsx", "utf8");
const service = fs.readFileSync("src/services/appointmentService.js", "utf8");
const pages = [
  "AppointmentListPage.jsx",
  "AppointmentCalendarPage.jsx",
  "AppointmentQueuePage.jsx",
].map((name) => fs.readFileSync(`src/features/appointments/${name}`, "utf8"));
const calendar = pages[1];
const queue = pages[2];

describe("appointment UI boundaries", () => {
  it("protects all appointment routes with one centralized permission", () => {
    for (const route of [
      "appointments",
      "appointmentCalendar",
      "appointmentQueue",
    ]) {
      expect(router).toMatch(
        new RegExp(
          `ROUTES\\.${route}[\\s\\S]*PERMISSIONS\\.VIEW_APPOINTMENTS`,
          "i",
        ),
      );
    }
  });

  it("keeps Supabase calls outside route pages", () => {
    for (const page of pages) {
      expect(page).not.toMatch(/getSupabaseClient|\.from\(|\.rpc\(/i);
    }
    expect(service).toMatch(/appointment_list/);
    expect(service).toMatch(/appointment_daily_queue/);
    expect(service).toMatch(/appointment_calendar/);
  });

  it("does not expose sensitive appointment text in calendar or queue cards", () => {
    expect(calendar).not.toMatch(/item\.reason|item\.operational_notes/i);
    expect(queue).not.toMatch(/item\.reason|item\.operational_notes/i);
    expect(queue).toMatch(/not a clinical triage assessment/i);
  });

  it("provides responsive cards, desktop tables/calendar, and retry states", () => {
    expect(pages[0]).toMatch(/lg:hidden/);
    expect(pages[0]).toMatch(/hidden overflow-x-auto lg:block/);
    expect(calendar).toMatch(/hidden lg:block/);
    expect(calendar).toMatch(/lg:hidden/);
    expect(queue).toMatch(/hidden overflow-x-auto lg:block/);
    expect(queue).toMatch(/lg:hidden/);
    for (const page of pages) {
      expect(page).toMatch(/ErrorState/);
      expect(page).toMatch(/refetch/);
    }
  });
});
