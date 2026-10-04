import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/authContext";
import { USER_ROLES } from "@/features/auth/permissions";
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

function isAuthorized(auth) {
  // Account status is validated upstream; raw DB fields are not in this profile.
  return auth.isAuthenticated && auth.profile?.role === USER_ROLES.RESIDENT;
}

export function useResidentHealthHistory(filters) {
  const auth = useAuth();
  return useQuery({
    queryKey: residentHealthHistoryKeys.list(auth.profile?.id, filters),
    queryFn: () => residentHealthHistoryService.list(filters),
    enabled: isAuthorized(auth),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useResidentHealthHistoryEntry(id) {
  const auth = useAuth();
  return useQuery({
    queryKey: residentHealthHistoryKeys.detail(auth.profile?.id, id),
    queryFn: () => residentHealthHistoryService.get(id),
    enabled: isAuthorized(auth) && Boolean(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}
