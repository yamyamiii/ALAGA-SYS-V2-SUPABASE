import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { registryService } from "@/services/registryService";

export const registryKeys = Object.freeze({
  all: ["registry"],
  households: (filters) => ["registry", "households", filters],
  household: (id) => ["registry", "household", id],
  members: (id) => ["registry", "household-members", id],
  residents: (filters) => ["registry", "residents", filters],
  resident: (id) => ["registry", "resident", id],
  barangays: ["registry", "barangays"],
  puroks: (barangayId) => ["registry", "puroks", barangayId],
  householdOptions: (barangayId, purokId) => [
    "registry",
    "household-options",
    barangayId,
    purokId,
  ],
});

export function useHouseholds(filters) {
  return useQuery({
    queryKey: registryKeys.households(filters),
    queryFn: () => registryService.listHouseholds(filters),
    placeholderData: (previous) => previous,
  });
}

export function useResidents(filters) {
  return useQuery({
    queryKey: registryKeys.residents(filters),
    queryFn: () => registryService.listResidents(filters),
    placeholderData: (previous) => previous,
  });
}

export function useBarangays() {
  return useQuery({
    queryKey: registryKeys.barangays,
    queryFn: () => registryService.listBarangays(),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePuroks(barangayId) {
  return useQuery({
    queryKey: registryKeys.puroks(barangayId),
    queryFn: () => registryService.listPuroks(barangayId),
    enabled: Boolean(barangayId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHouseholdOptions(barangayId, purokId) {
  return useQuery({
    queryKey: registryKeys.householdOptions(barangayId, purokId),
    queryFn: () => registryService.listHouseholdOptions(barangayId, purokId),
    enabled: Boolean(barangayId && purokId),
  });
}

export function useHousehold(id, enabled = true) {
  return useQuery({
    queryKey: registryKeys.household(id),
    queryFn: () => registryService.getHousehold(id),
    enabled: enabled && Boolean(id),
  });
}

export function useHouseholdMembers(id, enabled = true) {
  return useQuery({
    queryKey: registryKeys.members(id),
    queryFn: () => registryService.listHouseholdMembers(id),
    enabled: enabled && Boolean(id),
  });
}

export function useResident(id, enabled = true) {
  return useQuery({
    queryKey: registryKeys.resident(id),
    queryFn: () => registryService.getResident(id),
    enabled: enabled && Boolean(id),
  });
}

export function useRegistryMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: registryKeys.all }),
  });
}
