import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppointmentListPage from "@/features/appointments/AppointmentListPage";
import { AppointmentFormDialog } from "@/features/appointments/AppointmentFormDialog";
import {
  useAppointments,
  useIncomingResidentAppointmentRequests,
} from "@/features/appointments/hooks";
import { useAuth } from "@/features/auth/authContext";
import { hasPermission } from "@/features/auth/permissions";

vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/features/appointments/hooks", () => ({
  useAppointments: vi.fn(),
  useIncomingResidentAppointmentRequests: vi.fn(),
}));
vi.mock("@/features/appointments/AppointmentFormDialog", () => ({
  AppointmentFormDialog: vi.fn(({ open, walkIn }) =>
    open ? (
      <div role="dialog">
        {walkIn ? "Walk-in form" : "Assisted booking form"}
      </div>
    ) : null,
  ),
}));
vi.mock("@/features/appointments/AppointmentDetailDialog", () => ({
  AppointmentDetailDialog: () => null,
}));
vi.mock("@/features/appointments/AppointmentStaffField", () => ({
  AppointmentStaffField: () => null,
}));
vi.mock("@/features/appointments/ResidentAppointmentRequestDialog", () => ({
  ResidentAppointmentRequestDialog: ({ open }) =>
    open ? <div role="dialog">Resident automated booking</div> : null,
}));

function setup(role, width = 1366) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  useAuth.mockReturnValue({
    profile: { id: "test-profile", role },
    can: (permission) => hasPermission(role, permission),
  });
  return render(
    <MemoryRouter initialEntries={["/appointments"]}>
      <AppointmentListPage />
    </MemoryRouter>,
  );
}

describe("role-safe automated appointment action UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppointments.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });
    useIncomingResidentAppointmentRequests.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });
  });

  it.each(["admin", "barangay_health_worker"])(
    "shows primary walk-in and secondary assisted booking for %s",
    async (role) => {
      const user = userEvent.setup();
      setup(role);
      expect(
        screen.queryByRole("button", { name: "Create appointment" }),
      ).not.toBeInTheDocument();
      const walkIn = screen.getByRole("button", { name: "Register walk-in" });
      const assisted = screen.getByRole("button", {
        name: "Staff-assisted booking",
      });
      expect(walkIn).toHaveClass("bg-primary");
      expect(assisted).toHaveClass("border", "bg-background");
      expect(
        screen.getByText(
          /Routine Resident self-bookings are assigned and confirmed/,
        ),
      ).toBeInTheDocument();
      expect(useIncomingResidentAppointmentRequests).toHaveBeenCalledWith(true);
      await user.click(walkIn);
      expect(screen.getByRole("dialog")).toHaveTextContent("Walk-in form");
      expect(AppointmentFormDialog.mock.calls.at(-1)[0]).toMatchObject({
        open: true,
        walkIn: true,
      });
      await user.click(assisted);
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Assisted booking form",
      );
      expect(AppointmentFormDialog.mock.calls.at(-1)[0]).toMatchObject({
        open: true,
        walkIn: false,
      });
    },
  );

  it.each(["nurse", "midwife"])(
    "keeps %s on assigned work without creation actions",
    (role) => {
      setup(role);
      expect(
        screen.getByText(
          /Only appointments assigned to your active staff profile/,
        ),
      ).toBeInTheDocument();
      for (const name of [
        "Create appointment",
        "Register walk-in",
        "Staff-assisted booking",
      ]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
      expect(
        screen.getByRole("link", { name: "Daily queue" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Health service events" }),
      ).toBeInTheDocument();
      expect(useIncomingResidentAppointmentRequests).toHaveBeenCalledWith(
        false,
      );
    },
  );

  it("retains Resident self-booking and only Resident-safe appointment views", async () => {
    const user = userEvent.setup();
    setup("resident");
    expect(
      screen.getByRole("heading", { name: "My appointments" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: "Book appointment" })[0],
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Resident automated booking",
    );
    for (const name of [
      "Register walk-in",
      "Staff-assisted booking",
      "Create appointment",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("link", { name: "Daily queue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Calendar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Health service events" }),
    ).toBeInTheDocument();
  });

  it.each([360, 768, 1366])(
    "keeps actions operable in the responsive action layout at %spx",
    async (width) => {
      const user = userEvent.setup();
      setup("admin", width);
      const walkIn = screen.getByRole("button", { name: "Register walk-in" });
      expect(walkIn.parentElement).toHaveClass(
        "flex-col",
        "sm:flex-row",
        "sm:flex-wrap",
      );
      await user.tab();
      expect(walkIn).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog")).toHaveTextContent("Walk-in form");
    },
  );
});
