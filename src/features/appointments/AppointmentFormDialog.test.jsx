import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentFormDialog } from "@/features/appointments/AppointmentFormDialog";
import { useAppointmentMutation } from "@/features/appointments/hooks";

const mutateAsync = vi.fn();
const resetMutation = vi.fn();
const nurseId = "33333333-3333-4333-8333-333333333333";

vi.mock("@/features/appointments/hooks", () => ({
  useAppointmentMutation: vi.fn(),
}));

vi.mock("@/features/appointments/AppointmentResidentField", () => ({
  AppointmentResidentField: ({ selected }) => (
    <p>{selected?.resident_number ?? "Selected resident"}</p>
  ),
}));

vi.mock("@/features/appointments/AppointmentStaffField", () => ({
  AppointmentStaffField: ({ value, onChange }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          id: nurseId,
          first_name: "Nora",
          last_name: "Nurse",
          role: "nurse",
        })
      }
    >
      {value ? "Nurse assigned" : "Assign Nurse"}
    </button>
  ),
}));

function appointment(overrides = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    appointment_number: "APT-2026-000004",
    resident_id: "22222222-2222-4222-8222-222222222222",
    assigned_staff_id: null,
    appointment_type: "scheduled",
    service_type: "General Consultation",
    scheduled_date: "2026-08-15",
    start_time: "08:00:00",
    end_time: "08:30:00",
    priority: "normal",
    status: "pending",
    reason: null,
    operational_notes: null,
    request_source: "resident",
    version: 1,
    resident: { resident_number: "RES-2026-000001" },
    staff: null,
    ...overrides,
  };
}

describe("AppointmentFormDialog Resident-request editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppointmentMutation.mockReturnValue({
      mutateAsync,
      reset: resetMutation,
      isPending: false,
      error: null,
    });
    mutateAsync.mockResolvedValue({
      appointment_number: "APT-2026-000004",
      version: 2,
    });
  });

  it("assigns a Nurse and saves a Resident request with an empty reason", async () => {
    const user = userEvent.setup();
    render(
      <AppointmentFormDialog
        open
        appointment={appointment()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Reason (optional)")).toHaveValue("");
    const startTime = screen.getByLabelText("Start time");
    expect(startTime).toBeInstanceOf(HTMLSelectElement);
    expect(Array.from(startTime.options, (option) => option.value)).toEqual(
      expect.arrayContaining(["08:00", "11:30", "16:00"]),
    );
    expect(Array.from(startTime.options, (option) => option.value)).not.toEqual(
      expect.arrayContaining(["07:30", "16:30"]),
    );
    expect(
      screen.queryByLabelText(/operational notes/i),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Assign Nurse" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          assigned_staff_id: nurseId,
          reason: "",
        }),
      ),
    );
    expect(mutateAsync.mock.calls.at(-1)[0]).not.toHaveProperty(
      "operational_notes",
    );
  });

  it("preserves an existing Resident-request reason", async () => {
    const user = userEvent.setup();
    render(
      <AppointmentFormDialog
        open
        appointment={appointment({ reason: "Routine visit" })}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Reason (optional)")).toHaveValue(
      "Routine visit",
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "Routine visit" }),
      ),
    );
  });

  it("still rejects an overlength Resident-request reason", async () => {
    const user = userEvent.setup();
    render(
      <AppointmentFormDialog
        open
        appointment={appointment()}
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "x".repeat(1001) },
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Reason must be 1,000 characters or fewer."),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps a staff-origin scheduled appointment reason required", async () => {
    const user = userEvent.setup();
    render(
      <AppointmentFormDialog
        open
        appointment={appointment({ request_source: "staff" })}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Reason")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Reason is required for this appointment type."),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
