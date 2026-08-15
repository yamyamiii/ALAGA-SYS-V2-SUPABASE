import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
    expect(
      screen.queryByLabelText("Preferred end time"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Reason for visit (optional)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/provisional 30-minute duration/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Resident", { selector: "label" })).toBeNull();
    expect(screen.queryByText(/assigned staff/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument();
  });

  it("submits a preferred schedule and reason", async () => {
    const user = userEvent.setup();
    render(<ResidentAppointmentRequestDialog open onOpenChange={vi.fn()} />);

    await user.clear(screen.getByLabelText("Reason for visit (optional)"));
    await user.type(
      screen.getByLabelText("Reason for visit (optional)"),
      "Routine visit",
    );
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          service_type: "General Consultation",
          start_time: "08:00",
          reason: "Routine visit",
        }),
      ),
    );
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("end_time");
  });

  it("submits a request without a reason", async () => {
    const user = userEvent.setup();
    render(<ResidentAppointmentRequestDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          service_type: "General Consultation",
          start_time: "08:00",
          reason: "",
        }),
      ),
    );
  });

  it("preserves an open request through blur and focus", async () => {
    const user = userEvent.setup();
    render(<ResidentAppointmentRequestDialog open onOpenChange={vi.fn()} />);
    const reason = screen.getByLabelText("Reason for visit (optional)");
    await user.type(reason, "Keep this unsaved request");

    fireEvent.blur(window);
    fireEvent.focus(window);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(reason).toHaveValue("Keep this unsaved request");
  });

  it.each([
    ["successful save", "Submit request"],
    ["explicit cancel", "Back"],
  ])("closes and clears after %s", async (_, actionName) => {
    const user = userEvent.setup();

    function ControlledDialog() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen
          </button>
          <ResidentAppointmentRequestDialog
            open={open}
            onOpenChange={setOpen}
          />
        </>
      );
    }

    render(<ControlledDialog />);
    await user.type(
      screen.getByLabelText("Reason for visit (optional)"),
      "Discard this draft",
    );
    await user.click(screen.getByRole("button", { name: actionName }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(
      await screen.findByLabelText("Reason for visit (optional)"),
    ).toHaveValue("");
  });
});
