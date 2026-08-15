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
} from "@/features/appointments/hooks";
import { appointmentService } from "@/services/appointmentService";

describe("appointment mutation cache propagation", () => {
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
