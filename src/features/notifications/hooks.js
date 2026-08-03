import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notificationService } from "@/services/notificationService";

export const notificationSettingsKeys = Object.freeze({
  all: ["notification-settings"],
  preferences: ["notification-settings", "preferences"],
  delivery: ["notification-settings", "delivery"],
});

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationSettingsKeys.preferences,
    queryFn: ({ signal }) => notificationService.getPreferences(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useNotificationDeliverySummary(enabled) {
  return useQuery({
    queryKey: notificationSettingsKeys.delivery,
    queryFn: ({ signal }) => notificationService.getDeliverySummary(signal),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    refetchOnWindowFocus: false,
  });
}

export function useNotificationSettingsMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationSettingsKeys.all }),
  });
}
