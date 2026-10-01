import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/authContext";
import { hasPermission } from "@/features/auth/permissions";
import { useHealthEvents, useHealthEventMutation } from "./hooks";
import { healthEventService } from "@/services/healthEventService";
import HealthEventsPage from "./HealthEventsPage";
vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("./hooks", () => ({
  useHealthEvents: vi.fn(),
  useHealthEventMutation: vi.fn(),
  useHealthEventQueue: vi.fn(() => ({ data: [] })),
  useHealthEventHistory: vi.fn(() => ({ data: [] })),
}));
vi.mock("./HealthEventFormDialog", () => ({
  HealthEventFormDialog: () => null,
}));
vi.mock("@/services/healthEventService", () => ({
  healthEventService: {
    book: vi.fn(),
    cancelBooking: vi.fn(),
    setStatus: vi.fn(),
  },
}));
const event = {
  id: "10000000-0000-4000-8000-000000000001",
  reference: "HEV-2099-000001",
  title: "Free Immunization Day",
  service_type: "Immunization",
  event_date: "2099-10-07",
  start_time: "08:00:00",
  end_time: "12:00:00",
  status: "published",
  capacity: 60,
  booked: 42,
  remaining: 18,
  booking_opens_at: "2000-01-01T00:00:00Z",
  booking_closes_at: "2099-10-07T04:00:00Z",
  version: 1,
  staff: [{ id: "s", name: "Nurse B", quota: 30, assigned: 21 }],
  waitlisted: 0,
};
describe("health service event UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHealthEvents.mockReturnValue({ data: { items: [event], total: 1 } });
    useHealthEventMutation.mockImplementation((operation) => ({
      mutateAsync: vi.fn((v) => operation(v)),
      reset: vi.fn(),
      isPending: false,
    }));
    healthEventService.book.mockResolvedValue({ state: "confirmed" });
  });
  const mount = (role) => {
    useAuth.mockReturnValue({
      profile: { id: "actor", role },
      can: (p) => hasPermission(role, p),
    });
    return render(
      <MemoryRouter>
        <HealthEventsPage />
      </MemoryRouter>,
    );
  };
  it("Resident sees fixed window and capacity, not participant identities or team quotas", () => {
    mount("resident");
    expect(screen.getByText(/42 of 60 booked/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Book appointment" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nurse B: 21 / 30")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create health service event" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View event queue" }),
    ).not.toBeInTheDocument();
  });
  it("booking requires confirmation and sends no resident/staff/date input", async () => {
    mount("resident");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Book appointment" }));
    expect(healthEventService.book).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    await waitFor(() =>
      expect(healthEventService.book).toHaveBeenCalledWith(
        event.id,
        expect.any(String),
        false,
      ),
    );
  });
  it("full event offers waitlist and never claims an extra place locally", () => {
    useHealthEvents.mockReturnValue({
      data: { items: [{ ...event, booked: 60, remaining: 0 }], total: 1 },
    });
    mount("resident");
    expect(
      screen.getByRole("button", { name: "Join waitlist" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Book appointment" }),
    ).not.toBeInTheDocument();
  });
  it("own booking displays reference, status and queue with optional cancellation", () => {
    useHealthEvents.mockReturnValue({
      data: {
        items: [
          {
            ...event,
            own_booking: {
              reference: "EVB-2099-000001",
              state: "confirmed",
              queue_order: 4,
            },
          },
        ],
        total: 1,
      },
    });
    mount("resident");
    expect(screen.getByText(/Your booking: confirmed/)).toBeInTheDocument();
    expect(screen.getByText("Queue/order: 4")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel event booking" }),
    ).toBeInTheDocument();
  });
  it.each(["admin", "barangay_health_worker"])(
    "%s has once-per-event setup, quotas and queue",
    (role) => {
      mount(role);
      expect(
        screen.getByRole("button", { name: "Create health service event" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Nurse B: 21 / 30")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "View event queue" }),
      ).toBeInTheDocument();
    },
  );
  it.each(["nurse", "midwife"])(
    "%s has authorized queue but no manager controls",
    (role) => {
      mount(role);
      expect(
        screen.getByRole("button", { name: "View event queue" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit event" }),
      ).not.toBeInTheDocument();
    },
  );
  it("cancelled and archived events cannot be booked", () => {
    useHealthEvents.mockReturnValue({
      data: {
        items: [{ ...event, status: "cancelled", archived_at: "2099-01-01" }],
        total: 1,
      },
    });
    mount("resident");
    expect(
      screen.queryByRole("button", { name: "Book appointment" }),
    ).not.toBeInTheDocument();
  });
  it("trusted closed-window flag disables booking even if local clock is behind", () => {
    useHealthEvents.mockReturnValue({
      data: { items: [{ ...event, booking_open: false }], total: 1 },
    });
    mount("resident");
    expect(
      screen.queryByRole("button", { name: "Book appointment" }),
    ).not.toBeInTheDocument();
  });
  it("server errors remain visible with retry", () => {
    useHealthEvents.mockReturnValue({
      isError: true,
      error: { message: "permission denied" },
      refetch: vi.fn(),
    });
    mount("resident");
    expect(screen.getByRole("alert")).toHaveTextContent("permission denied");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
