import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppointmentStaffSearch } from "@/features/appointments/hooks";
import { useHealthEventMutation } from "./hooks";
import { healthEventService } from "@/services/healthEventService";
import { HealthEventFormDialog } from "./HealthEventFormDialog";
vi.mock("@/features/appointments/hooks", () => ({
  useAppointmentStaffSearch: vi.fn(),
}));
vi.mock("./hooks", () => ({ useHealthEventMutation: vi.fn() }));
vi.mock("@/services/healthEventService", () => ({
  healthEventService: { save: vi.fn() },
}));
const staff = [
  {
    id: "10000000-0000-4000-8000-000000000003",
    first_name: "BHW",
    last_name: "A",
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    first_name: "Nurse",
    last_name: "B",
  },
];
describe("event setup and memory-only drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppointmentStaffSearch.mockReturnValue({
      data: { items: staff, total: 2 },
    });
    useHealthEventMutation.mockImplementation((fn) => ({
      mutateAsync: vi.fn(fn),
      reset: vi.fn(),
    }));
    healthEventService.save.mockResolvedValue({ id: "event", version: 1 });
  });
  it("60 capacity and two participants preview 30/30; no custom or Resident assignment inputs", async () => {
    render(<HealthEventFormDialog open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("BHW A"));
    await user.click(screen.getByLabelText("Nurse B"));
    expect(screen.getByText("BHW A: 30")).toBeInTheDocument();
    expect(screen.getByText("Nurse B: 30")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Resident", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("publishes configuration once with notification and idempotency key", async () => {
    const close = vi.fn();
    render(<HealthEventFormDialog open onOpenChange={close} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Title"), "Free Immunization Day");
    await user.click(screen.getByLabelText("BHW A"));
    await user.click(screen.getByLabelText("Nurse B"));
    await user.click(screen.getByRole("button", { name: "Publish event" }));
    await waitFor(() =>
      expect(healthEventService.save).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          capacity: 60,
          staff_ids: staff.map((s) => s.id),
          publish: true,
          notify: true,
        }),
        expect.any(String),
      ),
    );
    expect(close).toHaveBeenCalledWith(false);
  });
  it("refetch and window focus do not reset an active draft", async () => {
    const record = {
      id: "e",
      title: "Existing",
      service_type: "Immunization",
      event_date: "2099-01-01",
      start_time: "08:00:00",
      end_time: "12:00:00",
      capacity: 60,
      staff: [],
      status: "published",
    };
    const props = { open: true, onOpenChange: vi.fn(), record };
    const view = render(<HealthEventFormDialog {...props} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Unsaved edit");
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    view.rerender(
      <HealthEventFormDialog
        {...props}
        record={{ ...record, title: "Refetched", version: 2 }}
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Unsaved edit");
  });
  it("explicit close/reopen clears a new draft", async () => {
    const props = { open: true, onOpenChange: vi.fn() };
    const view = render(<HealthEventFormDialog {...props} />);
    await userEvent.setup().type(screen.getByLabelText("Title"), "Discard me");
    view.rerender(<HealthEventFormDialog {...props} open={false} />);
    view.rerender(<HealthEventFormDialog {...props} />);
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
  it("capacity and selected team validation prevent invalid submission", async () => {
    render(<HealthEventFormDialog open onOpenChange={vi.fn()} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Publish event" }));
    await waitFor(() =>
      expect(
        screen.getByText("Select participating staff"),
      ).toBeInTheDocument(),
    );
    expect(healthEventService.save).not.toHaveBeenCalled();
  });
});
