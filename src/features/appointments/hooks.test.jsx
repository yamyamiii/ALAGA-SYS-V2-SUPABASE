import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  appointmentKeys,
  useAppointmentDashboard,
  useAppointmentMutation,
  useResidentAppointmentAvailability,
  useResidentBookingServices,
} from "@/features/appointments/hooks";
import { appointmentService } from "@/services/appointmentService";

describe("appointment mutation cache propagation", () => {
  it("loads the authoritative Resident booking catalog and availability", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const services = [
      {
        service_type: "General Consultation",
        booking_mode: "AUTO_SLOT",
        slot_duration_minutes: 30,
      },
    ];
    const slots = [
      {
        scheduled_date: "2026-10-01",
        start_time: "08:00",
        end_time: "08:30",
      },
    ];
    const listServices = vi
      .spyOn(appointmentService, "listResidentBookingServices")
      .mockResolvedValue(services);
    const listSlots = vi
      .spyOn(appointmentService, "listResidentAvailableSlots")
      .mockResolvedValue(slots);
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const servicesHook = renderHook(() => useResidentBookingServices(true), {
      wrapper,
    });
    const availabilityHook = renderHook(
      () =>
        useResidentAppointmentAvailability(
          {
            serviceType: "General Consultation",
            dateFrom: "2026-10-01",
            dateTo: "2026-10-31",
          },
          true,
        ),
      { wrapper },
    );

    await waitFor(() =>
      expect(servicesHook.result.current.data).toEqual(services),
    );
    await waitFor(() =>
      expect(availabilityHook.result.current.data).toEqual(slots),
    );
    expect(listServices).toHaveBeenCalledOnce();
    expect(listSlots).toHaveBeenCalledWith({
      serviceType: "General Consultation",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });

    servicesHook.unmount();
    availabilityHook.unmount();
    listServices.mockRestore();
    listSlots.mockRestore();
  });

  it("invalidates every appointment result family after rescheduling", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const affectedKeys = [
      appointmentKeys.list({ assigned_staff_id: "nurse-id" }),
      appointmentKeys.detail("appointment-id", "staff"),
      appointmentKeys.detail("appointment-id", "resident"),
      appointmentKeys.calendar({ month: "2026-08" }),
      appointmentKeys.queue({ date: "2026-08-15" }),
      appointmentKeys.history("resident-id", 1),
      appointmentKeys.dashboard,
      appointmentKeys.residentRequests,
      appointmentKeys.residentServices,
      appointmentKeys.residentAvailability({
        serviceType: "General Consultation",
        dateFrom: "2026-10-01",
        dateTo: "2026-11-30",
      }),
    ];
    for (const key of affectedKeys) client.setQueryData(key, { stale: true });

    const mutationFn = vi.fn().mockResolvedValue({
      replacement_id: "appointment-id",
      replacement_number: "APT-2026-000001",
      replacement_version: 2,
    });
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAppointmentMutation(mutationFn), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ scheduled_date: "2026-08-15" });
    });

    for (const key of affectedKeys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("refreshes the appointment dashboard on revisit and window focus", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(appointmentKeys.dashboard, { appointments_today: 1 });
    const getDashboardSummary = vi
      .spyOn(appointmentService, "getDashboardSummary")
      .mockResolvedValueOnce({ appointments_today: 2 })
      .mockResolvedValueOnce({ appointments_today: 3 });
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useAppointmentDashboard(), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({ appointments_today: 2 }),
    );

    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));

    await waitFor(() =>
      expect(result.current.data).toEqual({ appointments_today: 3 }),
    );
    expect(getDashboardSummary).toHaveBeenCalledTimes(2);

    unmount();
    focusManager.setFocused(undefined);
    getDashboardSummary.mockRestore();
  });
});
