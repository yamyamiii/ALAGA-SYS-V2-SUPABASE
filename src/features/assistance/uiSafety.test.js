import fs from "node:fs";

import { describe, expect, it } from "vitest";

const pageFiles = [
  "AnnouncementsPage.jsx",
  "NotificationsPage.jsx",
  "ActivityPage.jsx",
  "HealthCenterPage.jsx",
  "FaqPage.jsx",
  "ContactPage.jsx",
];
const pages = pageFiles.map((file) =>
  fs.readFileSync(`src/features/assistance/${file}`, "utf8"),
);
const combined = pages.join("\n");
const router = fs.readFileSync("src/app/router.jsx", "utf8");

describe("general assistance UI boundaries", () => {
  it("keeps all page data access behind assistance hooks and services", () => {
    expect(combined).not.toMatch(/getSupabaseClient|\.from\(|\.rpc\(/i);
    expect(combined).toMatch(/useAnnouncements/);
    expect(combined).toMatch(/useNotifications/);
    expect(combined).toMatch(/useInquiries/);
  });

  it("provides loading, empty, error, and retry states", () => {
    expect(combined).toMatch(/LoadingState/);
    expect(combined).toMatch(/EmptyState/);
    expect(combined).toMatch(/ErrorState/);
    expect(combined).toMatch(/query\.refetch\(\)/);
  });

  it("guards all six routes with centralized permissions", () => {
    for (const [route, permission] of [
      ["announcements", "VIEW_ANNOUNCEMENTS"],
      ["notifications", "VIEW_NOTIFICATIONS"],
      ["activity", "VIEW_ACTIVITY"],
      ["healthCenter", "VIEW_HEALTH_CENTER"],
      ["faq", "VIEW_FAQ"],
      ["contact", "VIEW_INQUIRIES"],
    ]) {
      expect(router).toMatch(
        new RegExp(
          `ROUTES\\.${route}[\\s\\S]*PERMISSIONS\\.${permission}`,
          "i",
        ),
      );
    }
  });

  it("uses associated labels for search, filters, and form fields", () => {
    expect(combined).toMatch(/aria-label="Search announcements"/);
    expect(combined).toMatch(/aria-label="Search FAQs"/);
    expect(combined).toMatch(/aria-label="Inquiry status"/);
    expect(combined).toMatch(/<Label htmlFor=/);
  });
});
