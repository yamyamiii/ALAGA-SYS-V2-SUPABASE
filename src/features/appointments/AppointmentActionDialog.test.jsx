import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentActionDialog } from "@/features/appointments/AppointmentActionDialog";
import { APPOINTMENT_ACTIONS } from "@/features/appointments/constants";
import { useAppointmentMutation } from "@/features/appointments/hooks";
import { useAuth } from "@/features/auth/authContext";
import { USER_ROLES } from "@/features/auth/permissions";
import { appointmentService } from "@/services/appointmentService";

const mutateAsync = vi.fn();
const resetMutation = vi.fn();

vi.mock("@/features/appointments/hooks", () => ({
  useAppointmentMutation: vi.fn(),
}));

vi.mock("@/features/auth/authContext", () => ({
  useAuth: vi.fn(),
}));

const appointment = {
  id: "44444444-4444-4444-8444-444444444444",
  appointment_number: "APT-2026-000004",
  resident_id: "22222222-2222-4222-8222-222222222222",
  assigned_staff_id: null,
  appointment_type: "scheduled",
  service_type: "General Consultation",
  scheduled_date: "2026-08-15",
  start_time: "08:00:00",
  end_time: "08:30:00",
  status: "pending",
  request_source: "resident",
  version: 1,
  staff: null,
};

function renderCancellation(role, appointmentOverrides = {}) {
  useAuth.mockReturnValue({ profile: { id: "profile-id", role } });
  return render(
    <AppointmentActionDialog
      open
      action={APPOINTMENT_ACTIONS.CANCEL}
      appointment={{ ...appointment, ...appointmentOverrides }}
      onOpenChange={vi.fn()}
    />,
  );
}

describe("AppointmentActionDialog cancellation accountability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppointmentMutation.mockReturnValue({
      mutateAsync,
      reset: resetMutation,
      isPending: false,
      error: null,
    });
    mutateAsync.mockResolvedValue({
      appointment_number: appointment.appointment_number,
      status: "cancelled",
      version: 2,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("allows a Resident to submit a blank cancellation reason", async () => {
    const user = userEvent.setup();
    renderCancellation(USER_ROLES.RESIDENT);

    expect(screen.getByLabelText("Cancellation reason (optional)")).toHaveValue(
      "",
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel appointment" }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ cancellation_reason: "" }),
    );
  });

  it("trims a Resident-provided cancellation reason", async () => {
    const user = userEvent.setup();
    renderCancellation(USER_ROLES.RESIDENT);

    await user.type(
      screen.getByLabelText("Cancellation reason (optional)"),
      " Change of plans ",
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel appointment" }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        cancellation_reason: "Change of plans",
      }),
    );
  });

  it("rejects an overlength Resident cancellation reason", async () => {
    const user = userEvent.setup();
    renderCancellation(USER_ROLES.RESIDENT);

    fireEvent.change(screen.getByLabelText("Cancellation reason (optional)"), {
      target: { value: "x".repeat(1001) },
    });
    await user.click(
      screen.getByRole("button", { name: "Cancel appointment" }),
    );

    expect(
      await screen.findByText(
        "Cancellation reason must be 1,000 characters or fewer.",
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it.each([USER_ROLES.ADMINISTRATOR, USER_ROLES.BARANGAY_HEALTH_WORKER])(
    "allows %s to cancel an authorized appointment without a reason",
    async (role) => {
      const user = userEvent.setup();
      renderCancellation(role, { status: "confirmed" });

      expect(
        screen.getByLabelText("Cancellation reason (optional)"),
      ).toHaveValue("");
      await user.click(
        screen.getByRole("button", { name: "Cancel appointment" }),
      );

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          cancellation_reason: "",
        }),
      );
    },
  );

  it.each([USER_ROLES.ADMINISTRATOR, USER_ROLES.BARANGAY_HEALTH_WORKER])(
    "keeps %s Resident-request rejection justification required",
    async (role) => {
      const user = userEvent.setup();
      renderCancellation(role);

      expect(screen.getByLabelText("Rejection reason")).toHaveValue("");
      await user.click(screen.getByRole("button", { name: "Reject request" }));

      expect(
        await screen.findByText("Rejection reason is required."),
      ).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    },
  );

  it("routes a bounded staff rejection justification through the cancellation transition field", async () => {
    let capturedMutation;
    const transition = vi
      .spyOn(appointmentService, "transition")
      .mockResolvedValue({
        appointment_number: appointment.appointment_number,
        status: "cancelled",
        version: 2,
      });
    useAppointmentMutation.mockImplementationOnce((mutationFunction) => {
      capturedMutation = mutationFunction;
      return {
        mutateAsync: vi.fn(),
        reset: resetMutation,
        isPending: false,
        error: null,
      };
    });

    renderCancellation(USER_ROLES.ADMINISTRATOR);
    await capturedMutation({
      rejection_reason: "Schedule cannot be accommodated",
    });

    expect(transition).toHaveBeenCalledWith(appointment, "cancelled", {
      cancellation_reason: "Schedule cannot be accommodated",
    });
  });

  it("trims an Administrator-provided cancellation reason", async () => {
    const user = userEvent.setup();
    renderCancellation(USER_ROLES.ADMINISTRATOR, { status: "confirmed" });

    await user.type(
      screen.getByLabelText("Cancellation reason (optional)"),
      " Clinic closing early ",
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel appointment" }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        cancellation_reason: "Clinic closing early",
      }),
    );
  });

  it("routes the Reschedule action only to the in-place reschedule service", async () => {
    let capturedMutation;
    const reschedule = vi
      .spyOn(appointmentService, "reschedule")
      .mockResolvedValue({
        original_id: appointment.id,
        replacement_id: appointment.id,
        replacement_number: appointment.appointment_number,
        replacement_version: 2,
      });
    const createAppointment = vi.spyOn(appointmentService, "createAppointment");
    const requestResidentAppointment = vi.spyOn(
      appointmentService,
      "requestResidentAppointment",
    );
    useAuth.mockReturnValue({
      profile: { id: "admin-id", role: USER_ROLES.ADMINISTRATOR },
    });
    useAppointmentMutation.mockImplementationOnce((mutationFunction) => {
      capturedMutation = mutationFunction;
      return {
        mutateAsync: vi.fn(),
        reset: resetMutation,
        isPending: false,
        error: null,
      };
    });

    render(
      <AppointmentActionDialog
        open
        action={APPOINTMENT_ACTIONS.RESCHEDULE}
        appointment={appointment}
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Assigned staff (optional)"),
    ).not.toBeInTheDocument();
    const startTime = screen.getByLabelText("Start");
    expect(startTime).toBeInstanceOf(HTMLSelectElement);
    expect(Array.from(startTime.options, (option) => option.value).at(0)).toBe(
      "08:00",
    );
    expect(Array.from(startTime.options, (option) => option.value).at(-1)).toBe(
      "16:00",
    );
    await capturedMutation({
      scheduled_date: "2026-08-20",
      start_time: "09:00",
      end_time: "09:30",
    });

    expect(reschedule).toHaveBeenCalledWith(
      appointment,
      {
        scheduled_date: "2026-08-20",
        start_time: "09:00",
        end_time: "09:30",
      },
      expect.any(String),
    );
    expect(createAppointment).not.toHaveBeenCalled();
    expect(requestResidentAppointment).not.toHaveBeenCalled();
  });
});
