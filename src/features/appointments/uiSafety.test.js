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
const residentPage = fs.readFileSync(
  "src/features/appointments/ResidentAppointmentsPage.jsx",
  "utf8",
);
const residentDialog = fs.readFileSync(
  "src/features/appointments/ResidentAppointmentRequestDialog.jsx",
  "utf8",
);
const detailDialog = fs.readFileSync(
  "src/features/appointments/AppointmentDetailDialog.jsx",
  "utf8",
);
const permissions = fs.readFileSync(
  "src/features/appointments/permissions.js",
  "utf8",
);
const constants = fs.readFileSync(
  "src/features/appointments/constants.js",
  "utf8",
);
const tabs = fs.readFileSync(
  "src/features/appointments/AppointmentTabs.jsx",
  "utf8",
);
const aiUiActions = fs.readFileSync(
  "src/features/ai-assistant/uiActions.js",
  "utf8",
);

describe("appointment UI boundaries", () => {
  it("uses separate route permissions for resident-safe and staff-only views", () => {
    expect(router).toMatch(
      /ROUTES\.appointments[\s\S]*PERMISSIONS\.VIEW_APPOINTMENTS/i,
    );
    expect(router).toMatch(
      /ROUTES\.appointmentCalendar[\s\S]*PERMISSIONS\.VIEW_APPOINTMENT_CALENDAR/i,
    );
    expect(router).toMatch(
      /ROUTES\.appointmentQueue[\s\S]*PERMISSIONS\.VIEW_APPOINTMENT_QUEUE/i,
    );
    expect(tabs).toMatch(/visibleTabs[\s\S]*can\(permission\)/i);
  });

  it("keeps the resident request form free of staff-controlled fields", () => {
    expect(residentDialog).toMatch(/Request appointment/i);
    expect(residentDialog).not.toMatch(
      /AppointmentResidentField|AppointmentStaffField|resident-request-end|register\("end_time"\)|priority|operational_notes|resident_id/i,
    );
    expect(residentDialog).toMatch(/preferred start time/i);
    expect(residentDialog).toMatch(/provisional 30-minute duration/i);
    expect(residentPage).toMatch(/Pending = awaiting confirmation/i);
    expect(residentPage).toMatch(/ErrorState[\s\S]*refetch/i);
    expect(residentPage).not.toMatch(/Register walk-in|Daily queue/i);
  });

  it("opens the existing blank request dialog through a one-time AI token", () => {
    expect(residentPage).toMatch(/consumeAiUiAction/);
    expect(residentPage).toMatch(/alagaAiUiActionToken/);
    expect(residentPage).toMatch(/replace: true, state: null/);
    expect(aiUiActions).toMatch(/pendingActions\.delete\(token\)/);
    expect(aiUiActions).not.toMatch(
      /localStorage|sessionStorage|URLSearchParams|querySelector|dispatchEvent/,
    );
    expect(residentPage + aiUiActions).not.toMatch(
      /resident_id|reason:|scheduled_date:|start_time:|service_type:/,
    );
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

  it("keeps check-in and completion while removing the manual start action", () => {
    expect(permissions).toMatch(/APPOINTMENT_ACTIONS\.CHECK_IN/);
    expect(permissions).toMatch(/APPOINTMENT_ACTIONS\.COMPLETE/);
    expect(permissions).not.toMatch(/APPOINTMENT_ACTIONS\.START/);
    expect(queue).not.toMatch(/APPOINTMENT_ACTIONS\.START/);
    expect(constants).not.toMatch(/START:\s*["']start["']/);
    expect(constants).toMatch(/in_progress:\s*["']In consultation["']/);
    expect(detailDialog).not.toMatch(
      /AppointmentEncounterAction|Create Clinical Encounter|Add Clinical Encounter/i,
    );
  });

  it("uses the current schedule on Resident cards and details while preserving request metadata", () => {
    for (const source of [residentPage, detailDialog]) {
      expect(source).toMatch(/formatManilaDate\(appointment\.scheduled_date\)/);
      expect(source).toMatch(/formatManilaTime\(appointment\.start_time\)/);
      expect(source).toMatch(/formatManilaTime\(appointment\.end_time\)/);
    }
    expect(residentPage).not.toMatch(
      /appointment\.requested_(?:date|start_time|end_time)/,
    );
    expect(detailDialog).toMatch(/Original appointment request/);
    expect(detailDialog).toMatch(/appointment\.requested_date/);
    expect(detailDialog).toMatch(/appointment\.requested_start_time/);
    expect(detailDialog).toMatch(/appointment\.requested_end_time/);
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
