import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/authContext";
import { residentHealthHistoryService } from "@/services/residentHealthHistoryService";

export const residentHealthHistoryKeys = Object.freeze({
  all: ["resident-health-history"],
  list: (profileId, filters) => [
    "resident-health-history",
    profileId,
    "list",
    filters,
  ],
  detail: (profileId, id) => [
    "resident-health-history",
    profileId,
    "detail",
    id,
  ],
});

function isAuthorized(profile) {
  return (
    profile?.role === "resident" &&
    profile.account_status === "active" &&
    !profile.retired_at
  );
}

export function useResidentHealthHistory(filters) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: residentHealthHistoryKeys.list(profile?.id, filters),
    queryFn: () => residentHealthHistoryService.list(filters),
    enabled: isAuthorized(profile),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useResidentHealthHistoryEntry(id) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: residentHealthHistoryKeys.detail(profile?.id, id),
    queryFn: () => residentHealthHistoryService.get(id),
    enabled: isAuthorized(profile) && Boolean(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}
