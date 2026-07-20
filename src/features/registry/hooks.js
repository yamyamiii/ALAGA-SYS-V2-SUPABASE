import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { registryService } from "@/services/registryService";

export const registryKeys = Object.freeze({
  all: ["registry"],
  households: (filters) => ["registry", "households", filters],
  household: (id) => ["registry", "household", id],
  members: (id) => ["registry", "household-members", id],
  residents: (filters) => ["registry", "residents", filters],
  resident: (id) => ["registry", "resident", id],
  deploymentContext: ["registry", "deployment-context"],
  puroks: ["registry", "puroks"],
  householdOptions: (purokId) => ["registry", "household-options", purokId],
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

export function useDeploymentContext() {
  return useQuery({
    queryKey: registryKeys.deploymentContext,
    queryFn: () => registryService.resolveDeploymentContext(),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePuroks() {
  return useQuery({
    queryKey: registryKeys.puroks,
    queryFn: () => registryService.listPuroks(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHouseholdOptions(purokId) {
  return useQuery({
    queryKey: registryKeys.householdOptions(purokId),
    queryFn: () => registryService.listHouseholdOptions(purokId),
    enabled: Boolean(purokId),
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
