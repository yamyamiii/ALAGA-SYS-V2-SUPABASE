import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_STATUSES,
  announcementCreationMessage,
  formatAnnouncementEventSchedule,
  getAnnouncementStatus,
} from "@/features/assistance/announcementStatus";

const now = new Date("2026-08-15T00:00:00.000Z");

describe("announcement presentation status", () => {
  it.each([
    [
      "published",
      { publish_at: "2026-08-14T00:00:00Z", expires_at: null },
      ANNOUNCEMENT_STATUSES.PUBLISHED,
    ],
    [
      "scheduled",
      { publish_at: "2026-08-16T00:00:00Z", expires_at: null },
      ANNOUNCEMENT_STATUSES.SCHEDULED,
    ],
    [
      "expired",
      {
        publish_at: "2026-08-13T00:00:00Z",
        expires_at: "2026-08-14T00:00:00Z",
      },
      ANNOUNCEMENT_STATUSES.EXPIRED,
    ],
    [
      "archived",
      {
        publish_at: "2026-08-16T00:00:00Z",
        expires_at: null,
        archived_at: "2026-08-14T00:00:00Z",
      },
      ANNOUNCEMENT_STATUSES.ARCHIVED,
    ],
  ])("classifies %s announcements", (_label, announcement, expected) => {
    expect(getAnnouncementStatus(announcement, now)).toBe(expected);
  });

  it("uses distinct immediate and Manila-formatted scheduled creation messages", () => {
    expect(announcementCreationMessage("2026-08-14T00:00:00Z", { now })).toBe(
      "Announcement published",
    );
    expect(
      announcementCreationMessage("2026-08-16T01:30:00Z", { now }),
    ).toMatch(/^Announcement scheduled for Aug 16, 2026,? 9:30 AM$/i);
    expect(
      announcementCreationMessage("2026-08-16T01:30:00Z", {
        now,
        publishNow: true,
      }),
    ).toBe("Announcement published");
  });

  it("formats optional event start and end independently of publication", () => {
    expect(
      formatAnnouncementEventSchedule("2026-09-26T05:45:00Z", null),
    ).toMatch(/Sep 26, 2026,? 1:45 PM/i);
    expect(
      formatAnnouncementEventSchedule(
        "2026-09-26T05:45:00Z",
        "2026-09-26T09:00:00Z",
      ),
    ).toMatch(/1:45 PM.*5:00 PM/i);
    expect(formatAnnouncementEventSchedule(null, null)).toBeNull();
  });
});
