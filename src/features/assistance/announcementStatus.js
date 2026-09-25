import { formatManilaDateTime } from "@/lib/dateTime";

export const ANNOUNCEMENT_STATUSES = Object.freeze({
  PUBLISHED: "Published",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
});

function timestamp(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function getAnnouncementStatus(announcement, now = new Date()) {
  if (announcement.archived_at) return ANNOUNCEMENT_STATUSES.ARCHIVED;
  const nowTime = timestamp(now);
  const publishTime = timestamp(announcement.publish_at);
  const expiryTime = announcement.expires_at
    ? timestamp(announcement.expires_at)
    : null;

  if (publishTime !== null && nowTime !== null && publishTime > nowTime) {
    return ANNOUNCEMENT_STATUSES.SCHEDULED;
  }
  if (expiryTime !== null && nowTime !== null && expiryTime <= nowTime) {
    return ANNOUNCEMENT_STATUSES.EXPIRED;
  }
  return ANNOUNCEMENT_STATUSES.PUBLISHED;
}

export function announcementCreationMessage(
  publishAt,
  { now = new Date(), publishNow = false } = {},
) {
  if (publishNow) return "Announcement published";
  const publishTime = timestamp(publishAt);
  const nowTime = timestamp(now);
  return publishTime !== null && nowTime !== null && publishTime > nowTime
    ? `Announcement scheduled for ${formatManilaDateTime(publishAt)}`
    : "Announcement published";
}

export function formatAnnouncementEventSchedule(eventStartAt, eventEndAt) {
  if (!eventStartAt) return null;
  const start = formatManilaDateTime(eventStartAt);
  return eventEndAt
    ? `${start} â€“ ${formatManilaDateTime(eventEndAt)}`
    : start;
}
