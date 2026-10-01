import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useAppointmentMutation,
  useResidentAppointmentAvailability,
  useResidentBookingServices,
} from "@/features/appointments/hooks";
import { ResidentAppointmentRequestDialog } from "@/features/appointments/ResidentAppointmentRequestDialog";

const mutateAsync = vi.fn();
const resetMutation = vi.fn();
const refetchAvailability = vi.fn();

const services = [
  ["General Consultation", "AUTO_SLOT", 30],
  ["Buntis / Prenatal Care", "AUTO_SLOT", 30],
  ["Maternal Care", "AUTO_SLOT", 30],
  ["Immunization", "AUTO_SLOT", 30],
  ["Family Planning", "AUTO_SLOT", 30],
  ["Postpartum Home Visit", "COORDINATION_REQUIRED", null],
].map(([service_type, booking_mode, slot_duration_minutes]) => ({
  service_type,
  booking_mode,
  slot_duration_minutes,
}));

const slots = [
  {
    scheduled_date: "2026-10-01",
    start_time: "08:00",
    end_time: "08:30",
  },
  {
    scheduled_date: "2026-10-01",
    start_time: "09:30",
    end_time: "10:00",
  },
  {
    scheduled_date: "2026-10-02",
    start_time: "10:00",
    end_time: "10:30",
  },
];

vi.mock("@/features/appointments/hooks", () => ({
  useAppointmentMutation: vi.fn(),
  useResidentAppointmentAvailability: vi.fn(),
  useResidentBookingServices: vi.fn(),
}));

function renderDialog(properties = {}) {
  return render(
    <ResidentAppointmentRequestDialog
      open
      onOpenChange={vi.fn()}
      {...properties}
    />,
  );
}

async function chooseFirstSlot(user) {
  await user.selectOptions(
    screen.getByLabelText("Available date"),
    "2026-10-01",
  );
  await user.selectOptions(screen.getByLabelText("Available time"), "08:00");
}

describe("ResidentAppointmentRequestDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppointmentMutation.mockReturnValue({
      mutateAsync,
      reset: resetMutation,
      isPending: false,
      error: null,
    });
    useResidentBookingServices.mockReturnValue({
      data: services,
      isLoading: false,
      isError: false,
      error: null,
    });
    useResidentAppointmentAvailability.mockReturnValue({
      data: slots,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchAvailability,
    });
    refetchAvailability.mockResolvedValue({ data: slots });
    mutateAsync.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      appointment_number: "APT-2026-000001",
      status: "confirmed",
      version: 1,
    });
  });

  it("shows the four-step Resident-safe automatic booking workflow", () => {
    renderDialog();

    expect(screen.getByText(/Step 1.*Choose service/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Step 2.*Choose available date/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Step 3.*Choose available time/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Step 4.*Review and book/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/awaiting.*confirmation/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/assigned staff/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument();
  });

  it("renders exactly the six authoritative service choices", () => {
    renderDialog();

    expect(
      Array.from(
        screen.getByLabelText("Service").options,
        (option) => option.textContent,
      ),
    ).toEqual(services.map((service) => service.service_type));
  });

  it("keeps the multi-step booking controls usable in a mobile viewport", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "overflow-y-auto",
    );
    expect(screen.getByLabelText("Service")).toHaveClass("w-full");
    expect(screen.getByLabelText("Available date")).toHaveClass("w-full");
    expect(screen.getByLabelText("Available time")).toHaveClass("w-full");
  });

  it("shows only server-returned dates and slots", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(
      Array.from(
        screen.getByLabelText("Available date").options,
        (option) => option.value,
      ),
    ).toEqual(["", "2026-10-01", "2026-10-02"]);

    await user.selectOptions(
      screen.getByLabelText("Available date"),
      "2026-10-01",
    );
    expect(
      Array.from(
        screen.getByLabelText("Available time").options,
        (option) => option.value,
      ),
    ).toEqual(["", "08:00", "09:30"]);
  });

  it("books without browser-supplied staff, status, or end time", async () => {
    const user = userEvent.setup();
    renderDialog();
    await chooseFirstSlot(user);
    await user.type(
      screen.getByLabelText("Reason for visit (optional)"),
      "Routine visit",
    );
    await user.click(screen.getByRole("button", { name: "Book appointment" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        service_type: "General Consultation",
        scheduled_date: "2026-10-01",
        start_time: "08:00",
        reason: "Routine visit",
      }),
    );
    const values = mutateAsync.mock.calls[0][0];
    expect(values).not.toHaveProperty("resident_id");
    expect(values).not.toHaveProperty("assigned_staff_id");
    expect(values).not.toHaveProperty("status");
    expect(values).not.toHaveProperty("end_time");
  });

  it("shows a complete confirmed result after successful booking", async () => {
    const user = userEvent.setup();
    renderDialog();
    await chooseFirstSlot(user);
    await user.click(screen.getByRole("button", { name: "Book appointment" }));

    expect(
      await screen.findByRole("heading", { name: "Appointment confirmed" }),
    ).toBeInTheDocument();
    expect(screen.getByText("APT-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("General Consultation")).toBeInTheDocument();
    expect(screen.getByText(/assigned eligible staff/i)).toBeInTheDocument();
    expect(screen.queryByText(/awaiting/i)).not.toBeInTheDocument();
  });

  it("refreshes availability after an atomic stale-slot conflict", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce({
      code: "slot_unavailable",
      message: "That appointment slot is no longer available.",
    });
    renderDialog();
    await chooseFirstSlot(user);
    await user.click(screen.getByRole("button", { name: "Book appointment" }));

    await waitFor(() => expect(refetchAvailability).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Available time")).toHaveValue("");
  });

  it("distinguishes coordination-required service from instant booking", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(
      screen.getByLabelText("Service"),
      "Postpartum Home Visit",
    );

    expect(
      screen.getByText(/requires coordination after childbirth/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Book appointment" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Available date")).not.toBeInTheDocument();
  });

  it("renders loading, empty, and error availability states", () => {
    useResidentAppointmentAvailability.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchAvailability,
    });
    const loading = renderDialog();
    expect(
      screen.getByText(/checking service dates and staff capacity/i),
    ).toBeInTheDocument();
    loading.unmount();

    useResidentAppointmentAvailability.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchAvailability,
    });
    const empty = renderDialog();
    expect(
      screen.getByText(/no appointment dates currently have/i),
    ).toBeInTheDocument();
    empty.unmount();

    useResidentAppointmentAvailability.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: { message: "Availability unavailable" },
      refetch: refetchAvailability,
    });
    renderDialog();
    expect(screen.getByText("Availability unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("preserves an open booking through blur and focus", async () => {
    const user = userEvent.setup();
    renderDialog();
    const reason = screen.getByLabelText("Reason for visit (optional)");
    await user.type(reason, "Keep this unsaved booking");

    fireEvent.blur(window);
    fireEvent.focus(window);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(reason).toHaveValue("Keep this unsaved booking");
  });

  it("closes and clears after Done or explicit Back", async () => {
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
    await chooseFirstSlot(user);
    await user.click(screen.getByRole("button", { name: "Book appointment" }));
    await screen.findByRole("button", { name: "Done" });
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByLabelText("Available date")).toHaveValue("");
    expect(screen.getByLabelText("Reason for visit (optional)")).toHaveValue(
      "",
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
