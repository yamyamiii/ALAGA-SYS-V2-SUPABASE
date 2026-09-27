import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { assistanceService } from "@/services/assistanceService";

export const assistanceKeys = Object.freeze({
  all: ["assistance"],
  announcements: (filters) => ["assistance", "announcements", filters],
  notifications: (filters) => ["assistance", "notifications", filters],
  activity: (filters) => ["assistance", "activity", filters],
  healthCenter: ["assistance", "health-center"],
  faqs: (filters) => ["assistance", "faqs", filters],
  inquiries: (filters) => ["assistance", "inquiries", filters],
});

function query(key, queryFn, enabled = true) {
  return {
    queryKey: key,
    queryFn,
    enabled,
    placeholderData: (previous) => previous,
  };
}

export function useAnnouncements(filters) {
  return useQuery(
    query(assistanceKeys.announcements(filters), ({ signal }) =>
      assistanceService.listAnnouncements(filters, signal),
    ),
  );
}
export function useNotifications(filters, enabled = true) {
  return useQuery(
    query(
      assistanceKeys.notifications(filters),
      ({ signal }) => assistanceService.listNotifications(filters, signal),
      enabled,
    ),
  );
}
export function useActivity(filters) {
  return useQuery(
    query(assistanceKeys.activity(filters), ({ signal }) =>
      assistanceService.listActivity(filters, signal),
    ),
  );
}
export function useHealthCenter() {
  return useQuery(
    query(assistanceKeys.healthCenter, ({ signal }) =>
      assistanceService.getHealthCenter(signal),
    ),
  );
}
export function useFaqs(filters) {
  return useQuery(
    query(assistanceKeys.faqs(filters), ({ signal }) =>
      assistanceService.listFaqs(filters, signal),
    ),
  );
}
export function useInquiries(filters) {
  return useQuery(
    query(assistanceKeys.inquiries(filters), ({ signal }) =>
      assistanceService.listInquiries(filters, signal),
    ),
  );
}
export function useAssistanceMutation(mutationFn) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: assistanceKeys.all }),
  });
}
