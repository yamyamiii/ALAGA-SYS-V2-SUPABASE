import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { documentService } from "@/services/documentService";

export const documentKeys = Object.freeze({
  all: ["protected-documents"],
  detail: (type, id) => ["protected-documents", type, id],
  referral: (encounterId) => ["protected-documents", "referral", encounterId],
});

export function useProtectedDocument(type, recordId, enabled = true) {
  return useQuery({
    queryKey: documentKeys.detail(type, recordId),
    queryFn: () => documentService.getDocument(type, recordId),
    enabled: enabled && Boolean(type && recordId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}

export function useReferralForEncounter(encounterId, enabled = true) {
  return useQuery({
    queryKey: documentKeys.referral(encounterId),
    queryFn: () => documentService.getReferralForEncounter(encounterId),
    enabled: enabled && Boolean(encounterId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useDocumentMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentKeys.all }),
  });
}
