import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/authContext";
import { healthEventService } from "@/services/healthEventService";

// Reuse Migration 102's existing appointment/report invalidation prefixes.
export const eventKeys = {
  all: ["appointments", "health-events"],
  list: (actor, filters) => [
    "appointments",
    "health-events",
    "list",
    actor,
    filters,
  ],
  queue: (actor, id) => ["appointments", "health-events", "queue", actor, id],
};
export function useHealthEvents(filters = {}) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: eventKeys.list(profile?.id, filters),
    queryFn: () => healthEventService.list(filters),
    // Timed opening/closure has no business write; reconcile its safe read model.
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    enabled: Boolean(profile?.id),
  });
}
export function useHealthEventQueue(id) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: eventKeys.queue(profile?.id, id),
    queryFn: () => healthEventService.queue(id),
    enabled: Boolean(id && profile?.id),
  });
}
export function useHealthEventReport(from, to) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["reports", "health-events", profile?.id, from, to],
    queryFn: () => healthEventService.report(from, to),
    enabled: Boolean(profile?.id && from && to && profile.role !== "resident"),
  });
}
export function useHealthEventAnnouncementLinks(ids) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: [
      "appointments",
      "health-events",
      "announcement-links",
      profile?.id,
      ids,
    ],
    queryFn: () => healthEventService.announcementLinks(ids),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    enabled: Boolean(profile?.id && ids.length),
  });
}
export function useHealthEventHistory(id) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["appointments", "health-events", "history", profile?.id, id],
    queryFn: () => healthEventService.history(id),
    enabled: Boolean(id && profile?.id),
  });
}
export function useHealthEventMutation(operation) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: operation,
    retry: false,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["appointments"] }),
        client.invalidateQueries({ queryKey: ["reports"] }),
        client.invalidateQueries({ queryKey: ["assistance", "notifications"] }),
        client.invalidateQueries({ queryKey: ["assistance", "announcements"] }),
      ]),
  });
}
