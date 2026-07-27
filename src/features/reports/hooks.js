import { useQuery } from "@tanstack/react-query";

import { reportService } from "@/services/reportService";

export const reportKeys = Object.freeze({
  all: ["reports"],
  category: (category, filters) => ["reports", category, filters],
});

export function useReport(category, filters, enabled = true) {
  return useQuery({
    queryKey: reportKeys.category(category, filters),
    queryFn: ({ signal }) => reportService.load(category, filters, signal),
    enabled: enabled && Boolean(category),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}
