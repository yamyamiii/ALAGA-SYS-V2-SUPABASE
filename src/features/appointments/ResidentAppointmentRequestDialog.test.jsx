import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppointmentMutation } from "@/features/appointments/hooks";
import { ResidentAppointmentRequestDialog } from "@/features/appointments/ResidentAppointmentRequestDialog";

const mutateAsync = vi.fn();
const resetMutation = vi.fn();

vi.mock("@/features/appointments/hooks", () => ({
  useAppointmentMutation: vi.fn(),
}));

describe("ResidentAppointmentRequestDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppointmentMutation.mockReturnValue({
      mutateAsync,
      reset: resetMutation,
      isPending: false,
      error: null,
    });
    mutateAsync.mockResolvedValue({
      appointment_number: "APT-2026-000001",
      status: "pending",
    });
  });

  it("shows only resident-safe request fields", () => {
    render(<ResidentAppointmentRequestDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText("Service")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred date")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred start time")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred end time")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason for visit")).toBeInTheDocument();
    expect(screen.queryByText("Resident", { selector: "label" })).toBeNull();
    expect(screen.queryByText(/assigned staff/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument();
  });

  it("submits a preferred schedule and reason", async () => {
    const user = userEvent.setup();
    render(<ResidentAppointmentRequestDialog open onOpenChange={vi.fn()} />);

    await user.clear(screen.getByLabelText("Reason for visit"));
    await user.type(screen.getByLabelText("Reason for visit"), "Routine visit");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          service_type: "General Consultation",
          start_time: "08:00",
          end_time: "08:30",
          reason: "Routine visit",
        }),
      ),
    );
  });
});
