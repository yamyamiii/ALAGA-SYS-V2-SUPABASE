import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResidentDetailDialog } from "@/features/registry/ResidentDetailDialog";
import { useResident } from "@/features/registry/hooks";

vi.mock("@/features/registry/hooks", () => ({
  useResident: vi.fn(),
}));

const residentId = "33333333-3333-4333-8333-333333333333";

function renderDialog() {
  return render(
    <ResidentDetailDialog
      residentId={residentId}
      open
      onOpenChange={vi.fn()}
      canManage={false}
      canRestore={false}
      onEdit={vi.fn()}
      onArchive={vi.fn()}
      onHousehold={vi.fn()}
    />,
  );
}

describe("ResidentDetailDialog error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
