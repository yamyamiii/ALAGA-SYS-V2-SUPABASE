import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermanentRetireAccountDialog } from "@/features/user-management/PermanentRetireAccountDialog";
import { userManagementService } from "@/services/userManagementService";

vi.mock("@/services/userManagementService", () => ({
  userManagementService: {
    retireAccountPermanently: vi.fn(),
  },
}));

describe("permanent account-access removal dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userManagementService.retireAccountPermanently.mockResolvedValue({
      retired: true,
    });
  });

  it("requires REMOVE and preserves the historical-record explanation", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(
      <PermanentRetireAccountDialog
        account={{ id: "10000000-0000-4000-8000-000000000002" }}
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    expect(
      screen.getByText(/Historical records will remain for data integrity/i),
    ).toBeInTheDocument();
    const submit = screen.getByRole("button", {
      name: "Remove account access permanently",
    });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Type REMOVE to confirm"), "REMOVE");
    await user.click(submit);

    await waitFor(() => {
      expect(
        userManagementService.retireAccountPermanently,
      ).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000002");
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not treat DELETE as retirement confirmation", async () => {
    const user = userEvent.setup();
    render(
      <PermanentRetireAccountDialog
        account={{ id: "10000000-0000-4000-8000-000000000002" }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Type REMOVE to confirm"), "DELETE");
    expect(
      screen.getByRole("button", {
        name: "Remove account access permanently",
      }),
    ).toBeDisabled();
    expect(
      userManagementService.retireAccountPermanently,
    ).not.toHaveBeenCalled();
  });
});
