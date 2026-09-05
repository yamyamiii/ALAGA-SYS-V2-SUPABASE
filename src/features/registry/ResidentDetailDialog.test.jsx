import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResidentDetailDialog } from "@/features/registry/ResidentDetailDialog";
import { useHouseholdMembers, useResident } from "@/features/registry/hooks";

vi.mock("@/features/registry/hooks", () => ({
  useResident: vi.fn(),
  useHouseholdMembers: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
  useResidentPhoto: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
}));

vi.mock("@/features/health-records/ResidentClinicalSummary", () => ({
  ResidentClinicalSummary: () => null,
}));

vi.mock("@/features/appointments/ResidentAppointmentHistory", () => ({
  ResidentAppointmentHistory: () => null,
}));

const residentId = "33333333-3333-4333-8333-333333333333";

function renderDialog(overrides = {}) {
  const props = {
    residentId,
    open: true,
    onOpenChange: vi.fn(),
    canManage: false,
    canRestore: false,
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onHousehold: vi.fn(),
    onChangeHouseholdHead: vi.fn(),
    ...overrides,
  };
  return render(<ResidentDetailDialog {...props} />);
}

describe("ResidentDetailDialog error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHouseholdMembers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  it("shows the specific not-found state and preserves the selected UUID", () => {
    useResident.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: {
        code: "resident_not_found",
        message:
          "The resident record was not found or is not available to your account.",
      },
      refetch: vi.fn(),
    });

    renderDialog();

    expect(useResident).toHaveBeenCalledWith(residentId, true);
    expect(screen.getByText("Resident not found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The resident record was not found or is not available to your account.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a retryable service error without hiding it", () => {
    const refetch = vi.fn();
    useResident.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: {
        code: "registry_request_failed",
        message: "The resident could not be loaded.",
      },
      refetch,
    });

    renderDialog();
    expect(screen.getByText("Resident unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows the refreshed unassigned household state clearly", () => {
    useResident.mockReturnValue({
      data: {
        id: residentId,
        resident_number: "RES-2026-000001",
        first_name: "Ana",
        last_name: "Reyes",
        sex: "female",
        status: "active",
        archived_at: null,
        household_id: null,
        household: null,
        barangay: { name: "Brgy. Bagongpook" },
        purok: { name: "Purok 1" },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderDialog();

    expect(screen.getByText("No household")).toBeInTheDocument();
  });

  it("shows household-head status and the explicit management action", () => {
    const onChangeHouseholdHead = vi.fn();
    const record = {
      id: residentId,
      resident_number: "RES-2026-000001",
      first_name: "Ana",
      last_name: "Reyes",
      sex: "female",
      status: "active",
      archived_at: null,
      household_id: "11111111-1111-4111-8111-111111111111",
      household: {
        household_number: "HH-2026-000001",
        head_resident_id: residentId,
      },
      barangay: { name: "Brgy. Bagongpook" },
      purok: { name: "Purok 1" },
    };
    useResident.mockReturnValue({
      data: record,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useHouseholdMembers.mockReturnValue({
      data: [record],
      isLoading: false,
      isError: false,
    });

    renderDialog({ canManage: true, onChangeHouseholdHead });

    expect(screen.getByText("Household Head")).toBeInTheDocument();
    expect(screen.getByText("Members").nextElementSibling).toHaveTextContent(
      "1",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Change household head" }),
    );
    expect(onChangeHouseholdHead).toHaveBeenCalledWith(record);
  });

  it("does not expose household-head management to view-only roles", () => {
    useResident.mockReturnValue({
      data: {
        id: residentId,
        resident_number: "RES-2026-000001",
        first_name: "Ana",
        last_name: "Reyes",
        sex: "female",
        status: "active",
        archived_at: null,
        household_id: "11111111-1111-4111-8111-111111111111",
        household: {
          household_number: "HH-2026-000001",
          head_resident_id: residentId,
        },
        barangay: { name: "Brgy. Bagongpook" },
        purok: { name: "Purok 1" },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderDialog({ canManage: false });

    expect(
      screen.queryByRole("button", { name: "Change household head" }),
    ).not.toBeInTheDocument();
  });
});
