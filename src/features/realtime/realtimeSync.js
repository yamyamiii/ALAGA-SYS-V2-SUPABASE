import { appointmentKeys } from "@/features/appointments/hooks";
import { assistanceKeys } from "@/features/assistance/hooks";
import { registryKeys } from "@/features/registry/hooks";
import { reportKeys } from "@/features/reports/hooks";
import { residentHealthHistoryKeys } from "@/features/resident-health-history/hooks";

export const REALTIME_TOPICS = Object.freeze({
  PROFILE: "profile",
  REGISTRATION: "registration",
  REGISTRY: "registry",
  APPOINTMENT: "appointment",
  NOTIFICATION: "notification",
  ANNOUNCEMENT: "announcement",
  HEALTH_HISTORY: "health_history",
});

const TOPIC_QUERY_KEYS = Object.freeze({
  [REALTIME_TOPICS.PROFILE]: [
    ["managed-users"],
    ["managed-user"],
    registryKeys.all,
    residentHealthHistoryKeys.all,
  ],
  [REALTIME_TOPICS.REGISTRATION]: [
    ["resident-registration-requests"],
    ["managed-users"],
    registryKeys.all,
  ],
  [REALTIME_TOPICS.REGISTRY]: [
    registryKeys.all,
    residentHealthHistoryKeys.all,
    ["resident-registration-requests"],
    appointmentKeys.all,
    reportKeys.all,
    ["managed-users"],
  ],
  [REALTIME_TOPICS.APPOINTMENT]: [
    appointmentKeys.all,
    reportKeys.all,
    residentHealthHistoryKeys.all,
  ],
  [REALTIME_TOPICS.HEALTH_HISTORY]: [residentHealthHistoryKeys.all],
  [REALTIME_TOPICS.NOTIFICATION]: [["assistance", "notifications"]],
  [REALTIME_TOPICS.ANNOUNCEMENT]: [["assistance", "announcements"]],
});

export function invalidateRealtimeTopic(queryClient, topic) {
  const keys = TOPIC_QUERY_KEYS[topic] ?? [];
  return Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
        exact: false,
        refetchType: "active",
      }),
    ),
  );
}

export function reconcileCriticalQueries(queryClient) {
  return Promise.all(
    [
      ["managed-users"],
      ["resident-registration-requests"],
      registryKeys.all,
      appointmentKeys.all,
      assistanceKeys.all,
      reportKeys.all,
      residentHealthHistoryKeys.all,
    ].map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
        exact: false,
        refetchType: "active",
      }),
    ),
  );
}

export function rememberRealtimeEvent(seenIds, eventId, limit = 256) {
  if (eventId == null || seenIds.has(eventId)) return false;
  seenIds.add(eventId);
  while (seenIds.size > limit) {
    seenIds.delete(seenIds.values().next().value);
  }
  return true;
}
