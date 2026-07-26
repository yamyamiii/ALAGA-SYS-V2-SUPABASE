import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { healthRecordService } from "@/services/healthRecordService";

export const healthRecordKeys = Object.freeze({
  all: ["health-records"],
  list: (filters) => ["health-records", "list", filters],
  detail: (id) => ["health-records", "detail", id],
  appointment: (id) => ["health-records", "appointment", id],
  allergies: (residentId) => ["health-records", "allergies", residentId],
  history: (residentId) => ["health-records", "medical-history", residentId],
});

export function useHealthRecords(filters) {
  return useQuery({
    queryKey: healthRecordKeys.list(filters),
    queryFn: () => healthRecordService.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useHealthRecord(id, enabled = true) {
  return useQuery({
    queryKey: healthRecordKeys.detail(id),
    queryFn: () => healthRecordService.get(id),
    enabled: enabled && Boolean(id),
  });
}

export function useAppointmentHealthRecord(id, enabled = true) {
  return useQuery({
    queryKey: healthRecordKeys.appointment(id),
    queryFn: () => healthRecordService.forAppointment(id),
    enabled: enabled && Boolean(id),
  });
}

export function useResidentAllergies(residentId, enabled = true) {
  return useQuery({
    queryKey: healthRecordKeys.allergies(residentId),
    queryFn: () => healthRecordService.listAllergies(residentId),
    enabled: enabled && Boolean(residentId),
  });
}

export function useResidentMedicalHistory(residentId, enabled = true) {
  return useQuery({
    queryKey: healthRecordKeys.history(residentId),
    queryFn: () => healthRecordService.listMedicalHistory(residentId),
    enabled: enabled && Boolean(residentId),
  });
}

export function useHealthRecordMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: healthRecordKeys.all }),
  });
}
