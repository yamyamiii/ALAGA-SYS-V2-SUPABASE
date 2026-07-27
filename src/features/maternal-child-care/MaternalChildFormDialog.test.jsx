import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMaternalChildMutation } from "@/features/maternal-child-care/hooks";
import { MaternalChildFormDialog } from "@/features/maternal-child-care/MaternalChildFormDialog";

const mutateAsync = vi.fn();
const resetMutation = vi.fn();

vi.mock("@/features/maternal-child-care/hooks", () => ({
  useMaternalChildMutation: vi.fn(),
}));

vi.mock("@/features/appointments/AppointmentResidentField", () => ({
  AppointmentResidentField: ({ onChange }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          id: "11111111-1111-4111-8111-111111111111",
          first_name: "Maria",
          last_name: "Santos",
          resident_number: "RES-2026-000001",
        })
      }
    >
      Select resident
    </button>
  ),
}));

describe("MaternalChildFormDialog pregnancy dates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMaternalChildMutation.mockReturnValue({
      mutateAsync,
      reset: resetMutation,
      isPending: false,
    });
    mutateAsync.mockResolvedValue({
      pregnancy_number: "MAT-2026-000001",
    });
  });

  it("keeps LMP and EDD independent and submits their visible values", async () => {
    const user = userEvent.setup();
    render(
      <MaternalChildFormDialog open onOpenChange={vi.fn()} kind="pregnancy" />,
    );
    await user.click(screen.getByRole("button", { name: "Select resident" }));
    const lmp = screen.getByLabelText("Last menstrual period");
    const edd = screen.getByLabelText("Estimated delivery date");

    fireEvent.change(lmp, { target: { value: "2026-07-27" } });
    fireEvent.change(edd, { target: { value: "2027-05-03" } });
    expect(lmp).toHaveValue("2026-07-27");
    expect(edd).toHaveValue("2027-05-03");

    fireEvent.change(lmp, { target: { value: "2026-07-20" } });
    expect(lmp).toHaveValue("2026-07-20");
    expect(edd).toHaveValue("2027-05-03");

    await user.click(screen.getByRole("button", { name: "Create record" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          last_menstrual_period: "2026-07-20",
          estimated_delivery_date: "2027-05-03",
        }),
      ),
    );
  });

  it("resets stale create values whenever the dialog reopens", async () => {
    const { rerender } = render(
      <MaternalChildFormDialog open onOpenChange={vi.fn()} kind="pregnancy" />,
    );
    fireEvent.change(screen.getByLabelText("Last menstrual period"), {
      target: { value: "2026-07-27" },
    });

    rerender(
      <MaternalChildFormDialog
        open={false}
        onOpenChange={vi.fn()}
        kind="pregnancy"
      />,
    );
    rerender(
      <MaternalChildFormDialog open onOpenChange={vi.fn()} kind="pregnancy" />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Last menstrual period")).toHaveValue("");
      expect(screen.getByLabelText("Estimated delivery date")).toHaveValue("");
    });
  });

  it("restores persisted edit values instead of stale edits on reopen", async () => {
    const record = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 3,
      resident_id: "11111111-1111-4111-8111-111111111111",
      last_menstrual_period: "2026-06-15",
      estimated_delivery_date: "2027-03-22",
      gravida: 2,
      para: 1,
      term_births: 1,
      preterm_births: 0,
      abortions: 0,
      living_children: 1,
      pregnancy_risk_level: "low",
      risk_notes: "",
    };
    const { rerender } = render(
      <MaternalChildFormDialog
        open
        onOpenChange={vi.fn()}
        kind="pregnancy"
        record={record}
      />,
    );
    expect(screen.getByLabelText("Last menstrual period")).toHaveValue(
      "2026-06-15",
    );
    expect(screen.getByLabelText("Estimated delivery date")).toHaveValue(
      "2027-03-22",
    );
    fireEvent.change(screen.getByLabelText("Estimated delivery date"), {
      target: { value: "2027-04-01" },
    });

    rerender(
      <MaternalChildFormDialog
        open={false}
        onOpenChange={vi.fn()}
        kind="pregnancy"
        record={record}
      />,
    );
    rerender(
      <MaternalChildFormDialog
        open
        onOpenChange={vi.fn()}
        kind="pregnancy"
        record={record}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Estimated delivery date")).toHaveValue(
        "2027-03-22",
      ),
    );
  });

  it("rejects same-day LMP and EDD before invoking the mutation", async () => {
    const user = userEvent.setup();
    render(
      <MaternalChildFormDialog open onOpenChange={vi.fn()} kind="pregnancy" />,
    );
    await user.click(screen.getByRole("button", { name: "Select resident" }));
    fireEvent.change(screen.getByLabelText("Last menstrual period"), {
      target: { value: "2026-07-27" },
    });
    fireEvent.change(screen.getByLabelText("Estimated delivery date"), {
      target: { value: "2026-07-27" },
    });
    await user.click(screen.getByRole("button", { name: "Create record" }));

    expect(
      await screen.findByText(
        "Estimated delivery date must be after the last menstrual period.",
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
