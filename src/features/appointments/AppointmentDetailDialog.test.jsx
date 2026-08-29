import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentDetailDialog } from "@/features/appointments/AppointmentDetailDialog";
import { useAppointment } from "@/features/appointments/hooks";
import { useAuth } from "@/features/auth/authContext";

vi.mock("@/features/appointments/hooks", () => ({
  useAppointment: vi.fn(),
}));

vi.mock("@/features/auth/authContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/appointments/AppointmentActionDialog", () => ({
  AppointmentActionDialog: () => null,
}));

const appointmentId = "11111111-1111-4111-8111-111111111111";
const originalAppointmentId = "44444444-4444-4444-8444-444444444444";

function appointment(overrides = {}) {
  return {
    id: appointmentId,
    appointment_number: "APT-2026-000001",
    assigned_staff_id: null,
    appointment_type: "scheduled",
    service_type: "General Consultation",
    scheduled_date: "2026-08-01",
    start_time: "08:00",
    end_time: "08:30",
    priority: "normal",
    status: "confirmed",
    reason: "Routine visit",
    operational_notes: null,
    cancellation_reason: null,
    rescheduled_from_id: null,
    rescheduled_from: null,
    checked_in_at: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    created_at: "2026-07-26T00:00:00Z",
    updated_at: "2026-07-26T00:00:00Z",
    resident: {
      resident_number: "RES-000001",
      first_name: "Juan",
      last_name: "Dela Cruz",
      purok: { name: "Purok 1" },
    },
    staff: null,
    ...overrides,
  };
}

function renderDialog() {
  return render(
    <AppointmentDetailDialog
      appointmentId={appointmentId}
      open
      onOpenChange={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
}

describe("AppointmentDetailDialog rescheduling lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      profile: { id: "55555555-5555-4555-8555-555555555555", role: "resident" },
    });
  });

  it("opens an original appointment detail record", () => {
    useAppointment.mockReturnValue({
      data: appointment(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    expect(useAppointment).toHaveBeenCalledWith(appointmentId, true, {
      resident: true,
    });
    expect(
      screen.getByRole("heading", { name: "Appointment details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("APT-2026-000001")).toBeInTheDocument();
    expect(screen.queryByText("Rescheduled from")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clinical encounter/i }),
    ).not.toBeInTheDocument();
  });

  it("separates the current confirmed schedule from the original Resident request", () => {
    useAppointment.mockReturnValue({
      data: appointment({
        service_type: "Blood Pressure Monitoring",
        scheduled_date: "2026-08-15",
        start_time: "15:00:00",
        end_time: "15:30:00",
        request_source: "resident",
        requested_date: "2026-08-16",
        requested_start_time: "08:00:00",
        requested_end_time: "08:30:00",
        resident_requested_at: "2026-08-10T01:00:00Z",
        staff: {
          first_name: "Nora",
          last_name: "Nurse",
          role: "nurse",
        },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    const current = screen
      .getByRole("heading", { name: "Current appointment" })
      .closest("section");
    expect(within(current).getByText("Confirmed")).toBeInTheDocument();
    expect(within(current).getByText("Aug 15, 2026")).toBeInTheDocument();
    expect(within(current).getByText("3:00 PM–3:30 PM")).toBeInTheDocument();
    expect(
      within(current).getByText("Blood Pressure Monitoring"),
    ).toBeInTheDocument();
    expect(within(current).getByText("Nora Nurse")).toBeInTheDocument();

    const original = screen
      .getByRole("heading", { name: "Original appointment request" })
      .closest("section");
    expect(within(original).getByText("Aug 16, 2026")).toBeInTheDocument();
    expect(within(original).getByText("8:00 AM")).toBeInTheDocument();
    expect(within(original).getByText("8:30 AM")).toBeInTheDocument();
    expect(
      within(original).getByText(
        "The health center adjusted your preferred schedule. Your current appointment schedule is shown above.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps an unchanged preferred schedule as historical request metadata", () => {
    useAppointment.mockReturnValue({
      data: appointment({
        request_source: "resident",
        requested_date: "2026-08-01",
        requested_start_time: "08:00:00",
        requested_end_time: "08:30:00",
        resident_requested_at: "2026-07-26T00:00:00Z",
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    expect(
      screen.getByRole("heading", { name: "Original appointment request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is the schedule you originally requested. The health center may adjust the final appointment schedule.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/adjusted your preferred schedule/i),
    ).not.toBeInTheDocument();
  });

  it("opens a replacement appointment and shows its original appointment", () => {
    useAppointment.mockReturnValue({
      data: appointment({
        appointment_number: "APT-2026-000002",
        status: "pending",
        rescheduled_from_id: originalAppointmentId,
        rescheduled_from: {
          id: originalAppointmentId,
          appointment_number: "APT-2026-000001",
        },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    expect(screen.getByText("APT-2026-000002")).toBeInTheDocument();
    expect(screen.getByText("Rescheduled from")).toBeInTheDocument();
    expect(screen.getByText("APT-2026-000001")).toBeInTheDocument();
  });

  it("renders a missing reason cleanly for staff-facing details", () => {
    useAuth.mockReturnValue({
      profile: { id: "55555555-5555-4555-8555-555555555555", role: "admin" },
    });
    useAppointment.mockReturnValue({
      data: appointment({
        reason: null,
        operational_notes: "Legacy scheduling note",
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    const reasonLabel = screen.getByText("Reason");
    expect(reasonLabel.nextElementSibling).toHaveTextContent("Not provided");
    expect(screen.queryByText("Operational notes")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Legacy scheduling note"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined|null$/i)).not.toBeInTheDocument();
  });

  it.each([
    ["admin", null, "General Consultation"],
    ["barangay_health_worker", null, "General Consultation"],
    ["resident", null, "General Consultation"],
    ["nurse", "55555555-5555-4555-8555-555555555555", "General Consultation"],
    ["midwife", "55555555-5555-4555-8555-555555555555", "Maternal Care"],
  ])(
    "shows the appointment-slip action for an authorized %s appointment",
    (role, assignedStaffId, serviceType) => {
      useAuth.mockReturnValue({
        profile: {
          id: "55555555-5555-4555-8555-555555555555",
          role,
        },
      });
      useAppointment.mockReturnValue({
        data: appointment({
          assigned_staff_id: assignedStaffId,
          service_type: serviceType,
        }),
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      renderDialog();

      expect(
        screen.getByRole("button", { name: "Print Appointment Slip" }),
      ).toBeInTheDocument();
    },
  );

  it("hides the appointment-slip action outside assigned clinical scope", () => {
    useAuth.mockReturnValue({
      profile: {
        id: "55555555-5555-4555-8555-555555555555",
        role: "midwife",
      },
    });
    useAppointment.mockReturnValue({
      data: appointment({
        assigned_staff_id: "another-staff-id",
        service_type: "General Consultation",
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Print Appointment Slip" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a missing Resident cancellation reason out of the detail layout", () => {
    useAuth.mockReturnValue({
      profile: { id: "55555555-5555-4555-8555-555555555555", role: "resident" },
    });
    useAppointment.mockReturnValue({
      data: appointment({ status: "cancelled", cancellation_reason: null }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDialog();

    expect(screen.queryByText("Cancellation reason")).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined|null$/i)).not.toBeInTheDocument();
  });
});
