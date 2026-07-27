import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { appointmentService } from "@/services/appointmentService";

export const appointmentKeys = Object.freeze({
  all: ["appointments"],
  list: (filters) => ["appointments", "list", filters],
  detail: (id, audience = "staff") => ["appointments", "detail", audience, id],
  queue: (parameters) => ["appointments", "queue", parameters],
  calendar: (parameters) => ["appointments", "calendar", parameters],
  residents: (parameters) => ["appointments", "resident-search", parameters],
  staff: (parameters) => ["appointments", "staff-search", parameters],
  history: (residentId, page) => ["appointments", "history", residentId, page],
  dashboard: ["appointments", "dashboard"],
  residentRequests: ["appointments", "resident-requests"],
});

export function useAppointments(filters) {
  return useQuery({
    queryKey: appointmentKeys.list(filters),
    queryFn: () => appointmentService.listAppointments(filters),
    placeholderData: (previous) => previous,
  });
}

export function useAppointment(id, enabled = true, options = {}) {
  const audience = options.resident ? "resident" : "staff";
  return useQuery({
    queryKey: appointmentKeys.detail(id, audience),
    queryFn: () =>
      appointmentService.getAppointment(id, {
        resident: options.resident,
      }),
    enabled: enabled && Boolean(id),
  });
}

export function useAppointmentQueue(parameters, options = {}) {
  return useQuery({
    queryKey: appointmentKeys.queue(parameters),
    queryFn: () => appointmentService.listQueue(parameters),
    placeholderData: (previous) => previous,
    refetchInterval: options.poll ? 30_000 : false,
  });
}

export function useAppointmentCalendar(parameters) {
  return useQuery({
    queryKey: appointmentKeys.calendar(parameters),
    queryFn: () => appointmentService.listCalendar(parameters),
  });
}

export function useAppointmentResidentSearch(parameters, enabled = true) {
  return useQuery({
    queryKey: appointmentKeys.residents(parameters),
    queryFn: () => appointmentService.searchResidents(parameters),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useAppointmentStaffSearch(parameters, enabled = true) {
  return useQuery({
    queryKey: appointmentKeys.staff(parameters),
    queryFn: () => appointmentService.searchStaff(parameters),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useResidentAppointmentHistory(
  residentId,
  page,
  enabled = true,
) {
  return useQuery({
    queryKey: appointmentKeys.history(residentId, page),
    queryFn: () => appointmentService.listResidentHistory(residentId, page),
    enabled: enabled && Boolean(residentId),
  });
}

export function useAppointmentDashboard() {
  return useQuery({
    queryKey: appointmentKeys.dashboard,
    queryFn: () => appointmentService.getDashboardSummary(),
    staleTime: 60_000,
  });
}

export function useIncomingResidentAppointmentRequests(enabled = true) {
  return useQuery({
    queryKey: appointmentKeys.residentRequests,
    queryFn: () => appointmentService.listResidentAppointmentRequests(),
    enabled,
    staleTime: 30_000,
  });
}

export function useAppointmentMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
