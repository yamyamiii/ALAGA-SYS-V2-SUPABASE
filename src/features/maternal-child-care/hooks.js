import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { maternalChildService } from "@/services/maternalChildService";

export const maternalChildKeys = Object.freeze({
  all: ["maternal-child-care"],
  list: (kind, filters) => ["maternal-child-care", kind, "list", filters],
  detail: (kind, id) => ["maternal-child-care", kind, "detail", id],
  dashboard: ["maternal-child-care", "dashboard"],
});

export function useMaternalChildList(kind, filters) {
  return useQuery({
    queryKey: maternalChildKeys.list(kind, filters),
    queryFn: () =>
      kind === "pregnancy"
        ? maternalChildService.listPregnancies(filters)
        : maternalChildService.listChildren(filters),
    placeholderData: (previous) => previous,
  });
}

export function useMaternalChildDetail(kind, id, enabled = true) {
  return useQuery({
    queryKey: maternalChildKeys.detail(kind, id),
    queryFn: () => maternalChildService.get(kind, id),
    enabled: enabled && Boolean(id),
  });
}

export function useMaternalChildDashboard(enabled = true) {
  return useQuery({
    queryKey: maternalChildKeys.dashboard,
    queryFn: () => maternalChildService.dashboard(),
    enabled,
    staleTime: 60_000,
  });
}

export function useMaternalChildMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: maternalChildKeys.all }),
  });
}
