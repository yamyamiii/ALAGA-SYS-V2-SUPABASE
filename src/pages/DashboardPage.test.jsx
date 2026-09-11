import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROUTES } from "@/config/routes";
import { USER_ROLES } from "@/features/auth/permissions";
import DashboardPage from "@/pages/DashboardPage";

const useDashboardSummary = vi.fn();
const useAppointmentDashboard = vi.fn();
const authState = vi.hoisted(() => ({
  role: "barangay_health_worker",
}));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

vi.mock("@/features/auth/authContext", () => ({
  useAuth: () => ({
    profile: {
      id: "11111111-1111-4111-8111-111111111111",
      role: authState.role,
    },
  }),
}));

vi.mock("@/features/reports/hooks", () => ({
  useDashboardSummary: (...args) => useDashboardSummary(...args),
}));

vi.mock("@/features/appointments/hooks", () => ({
  useAppointmentDashboard: (...args) => useAppointmentDashboard(...args),
  useAppointmentQueue: () => ({
    data: { items: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/assistance/hooks", () => ({
  useAnnouncements: () => ({
    data: { items: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useNotifications: () => ({
    data: { items: [], unread: 0 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe("role-safe dashboard aggregates", () => {
  beforeEach(() => {
    authState.role = USER_ROLES.BARANGAY_HEALTH_WORKER;
    useDashboardSummary.mockReturnValue({
      data: {
        active_residents: 2,
        total_appointments: 3,
        pending_requests: 1,
        appointments_today: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useAppointmentDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("renders authorized resident, appointment, request, and Manila-day totals", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const statistics = screen.getByRole("region", {
      name: "Appointment statistics",
    });
    expect(
      within(statistics).getByText("Active residents"),
    ).toBeInTheDocument();
    expect(
      within(statistics).getByText("Total appointments"),
    ).toBeInTheDocument();
    expect(
      within(statistics).getByText("Pending requests"),
    ).toBeInTheDocument();
    expect(
      within(statistics).getByText("Today's schedule"),
    ).toBeInTheDocument();
    for (const value of ["2", "3", "1"]) {
      expect(within(statistics).getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(useDashboardSummary).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      true,
    );
    expect(screen.getByRole("link", { name: "Open queue" })).toHaveAttribute(
      "href",
      ROUTES.appointmentQueue,
    );
  });

  it.each([
    ["Active residents", ROUTES.residents],
    ["Total appointments", ROUTES.appointments],
    ["Pending requests", ROUTES.appointments],
    ["Today's schedule", ROUTES.appointments],
  ])("navigates the %s summary card to %s", async (label, destination) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const statistics = screen.getByRole("region", {
      name: "Appointment statistics",
    });
    await user.click(
      within(statistics).getByRole("link", { name: `Open ${label}` }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(destination);
  });

  it("shows an error instead of converting authorization failure to zero", () => {
    useDashboardSummary.mockReturnValue({
      data: undefined,
      error: { message: "You do not have permission to view this report." },
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Appointment totals unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to view this report."),
    ).toBeInTheDocument();
  });

  it("shows Nurse-authorized appointment totals separately from Manila-today work", () => {
    authState.role = USER_ROLES.NURSE;
    useAppointmentDashboard.mockReturnValue({
      data: {
        assigned_appointments: 1,
        appointments_today: 0,
        pending_appointments: 0,
        upcoming_appointments: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const statistics = screen.getByRole("region", {
      name: "Appointment statistics",
    });
    expect(
      within(statistics).getByText("Total appointments"),
    ).toBeInTheDocument();
    expect(
      within(statistics).getByText("Upcoming assigned"),
    ).toBeInTheDocument();
    expect(
      within(statistics).queryByText("Pending requests"),
    ).not.toBeInTheDocument();
    expect(
      within(statistics).getByText("Today's schedule"),
    ).toBeInTheDocument();
    expect(useAppointmentDashboard).toHaveBeenCalledWith(false);
    expect(useDashboardSummary).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      true,
    );
    expect(
      within(statistics).queryByRole("link", {
        name: "Open Active residents",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the exact Resident appointment metric scopes without treating checked-in as completed", () => {
    authState.role = USER_ROLES.RESIDENT;
    useAppointmentDashboard.mockReturnValue({
      data: {
        appointments_today: 0,
        pending_appointments: 0,
        upcoming_appointments: 0,
        completed_today: 0,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const statistics = screen.getByRole("region", {
      name: "Appointment statistics",
    });
    for (const label of [
      "My appointments today",
      "Pending requests",
      "Upcoming appointments",
      "Completed visits today",
    ]) {
      expect(within(statistics).getByText(label)).toBeInTheDocument();
    }
    expect(
      within(statistics).getByText("Pending or confirmed future schedule"),
    ).toBeInTheDocument();
    expect(
      within(statistics).getByText(
        "Completed on the Asia/Manila business date",
      ),
    ).toBeInTheDocument();
    expect(within(statistics).getAllByText("0")).toHaveLength(4);
    expect(useAppointmentDashboard).toHaveBeenCalledWith(true);
  });
});
