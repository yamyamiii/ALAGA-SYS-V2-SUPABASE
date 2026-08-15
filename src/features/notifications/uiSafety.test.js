import fs from "node:fs";

import { describe, expect, it } from "vitest";

const navigation = fs.readFileSync("src/config/navigation.js", "utf8");
const router = fs.readFileSync("src/app/router.jsx", "utf8");
const healthRecords = fs.readFileSync(
  "src/features/health-records/HealthRecordsPage.jsx",
  "utf8",
);
const maternalChild = fs.readFileSync(
  "src/features/maternal-child-care/MaternalChildCarePage.jsx",
  "utf8",
);
const preferences = fs.readFileSync(
  "src/features/notifications/NotificationPreferencesCard.jsx",
  "utf8",
);
const notificationsPage = fs.readFileSync(
  "src/features/assistance/NotificationsPage.jsx",
  "utf8",
);
const notificationNavigation = fs.readFileSync(
  "src/features/notifications/navigation.js",
  "utf8",
);
const notificationHooks = fs.readFileSync(
  "src/features/notifications/hooks.js",
  "utf8",
);
const notificationService = fs.readFileSync(
  "src/services/notificationService.js",
  "utf8",
);
const aiButton = fs.readFileSync(
  "src/features/ai-assistant/FloatingAiAssistant.jsx",
  "utf8",
);

describe("release-candidate role-aware UI", () => {
  it("hides Settings and sends its legacy route through the scope guard", () => {
    expect(navigation).not.toMatch(/label:\s*"Settings"/i);
    expect(router).toMatch(/HIDDEN_FINAL_SCOPE_ROUTES\.map/);
    expect(router).not.toMatch(/ComingSoonPage/);
  });

  it("keeps broad clinical search staff-only and resident headings centered", () => {
    expect(healthRecords).toMatch(/!residentView\s*\?/i);
    expect(healthRecords).toMatch(/My Health Records/i);
    expect(maternalChild).toMatch(/!residentView\s*\?/i);
    expect(maternalChild).toMatch(/My Maternal and Child Care/i);
    expect(maternalChild).toMatch(/My Child Health Records/i);
    expect(healthRecords).toMatch(
      /Search encounter number, resident number, or resident name/i,
    );
    expect(maternalChild).toMatch(
      /Search record number, resident number, or name/i,
    );
  });

  it("offers accessible own-preference controls and unavailable explanations", () => {
    expect(preferences).toMatch(/role="switch"/i);
    expect(preferences).toMatch(/No verified account email is available/i);
    expect(preferences).toMatch(/SMS is disabled or unconfigured/i);
    expect(preferences).toMatch(/sm:flex-row/i);
  });

  it("keeps the Notifications page focused on in-app updates and preferences", () => {
    expect(notificationsPage).toMatch(/NotificationPreferencesCard/);
    expect(notificationsPage).toMatch(/Unread only/);
    expect(notificationsPage).toMatch(/Mark all as read/);
    expect(notificationsPage).toMatch(/query\.data\.items\.map/);
    expect(notificationsPage).not.toMatch(/NotificationDeliveryDashboard/);
    expect(notificationsPage).not.toMatch(
      /External delivery status|Recent delivery jobs|destination_hint/i,
    );
    expect(notificationsPage).not.toMatch(/>Open<|>Mark as read</i);
    expect(notificationsPage).toMatch(
      /<button[\s\S]*onClick=\{\(\) => activate\(item\)\}/i,
    );
    expect(notificationNavigation).toMatch(
      /notification\.action_path !== target\.path/i,
    );
  });

  it("retains hidden external-delivery service and hook infrastructure", () => {
    expect(notificationHooks).toMatch(/useNotificationDeliverySummary/);
    expect(notificationService).toMatch(/notification_delivery_summary/);
    expect(notificationService).toMatch(/notification_retry_failed_job/);
  });

  it("keeps the AI launcher below dialogs and above mobile navigation", () => {
    expect(aiButton).toMatch(/z-40/i);
    expect(aiButton).toMatch(/bottom-20/i);
  });
});
