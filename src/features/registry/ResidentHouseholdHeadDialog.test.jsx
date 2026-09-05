import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResidentHouseholdHeadDialog } from "@/features/registry/ResidentHouseholdHeadDialog";
import { registryService } from "@/services/registryService";

vi.mock("@/services/registryService", () => ({
  registryService: {
    archiveSoleMemberHousehold: vi.fn(),
    listHouseholdMembers: vi.fn(),
    reassignHouseholdHead: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

const householdId = "11111111-1111-4111-8111-111111111111";
const resident = {
  id: "33333333-3333-4333-8333-333333333333",
  resident_number: "RES-2026-000001",
  first_name: "Januar",
  last_name: "Ledenio",
  household_id: householdId,
  household: {
    id: householdId,
    household_number: "HH-2026-000001",
    head_resident_id: "33333333-3333-4333-8333-333333333333",
    updated_at: "2026-08-21T01:00:00.000Z",
  },
  updated_at: "2026-08-21T01:00:00.000Z",
};
const activeMember = {
  id: "44444444-4444-4444-8444-444444444444",
  resident_number: "RES-2026-000002",
  first_name: "Ana",
  last_name: "Reyes",
  household_id: householdId,
  status: "active",
  archived_at: null,
};
const inactiveMember = {
  id: "55555555-5555-4555-8555-555555555555",
  resident_number: "RES-2026-000003",
  first_name: "Inactive",
  last_name: "Member",
  household_id: householdId,
  status: "inactive",
  archived_at: null,
};
const outsider = {
  id: "66666666-6666-4666-8666-666666666666",
  resident_number: "RES-2026-000004",
  first_name: "Other",
  last_name: "Household",
  household_id: "22222222-2222-4222-8222-222222222222",
  status: "active",
  archived_at: null,
};

function renderDialog(overrides = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    resident,
    continueToArchive: true,
    canArchiveSoleHousehold: true,
    onResolved: vi.fn(),
    onSoleArchived: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={queryClient}>
      <ResidentHouseholdHeadDialog {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("Resident household-head resolution dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registryService.listHouseholdMembers.mockResolvedValue([
      { ...resident, status: "active", archived_at: null },
      activeMember,
      inactiveMember,
      outsider,
    ]);
    registryService.reassignHouseholdHead.mockResolvedValue({
      id: householdId,
      head_resident_id: activeMember.id,
    });
    registryService.archiveSoleMemberHousehold.mockResolvedValue({
      resident_id: resident.id,
      resident_status: "archived",
      household_id: householdId,
      household_status: "archived",
    });
  });

  it("offers only active replacement members from the same household", async () => {
    renderDialog();

    const select = await screen.findByLabelText("New household head");
    expect(select).toHaveTextContent("Ana Reyes");
    expect(select).not.toHaveTextContent("Januar Ledenio");
    expect(select).not.toHaveTextContent("Inactive Member");
    expect(select).not.toHaveTextContent("Other Household");
  });

  it("changes the expected current head before continuing to archive", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.selectOptions(
      await screen.findByLabelText("New household head"),
      activeMember.id,
    );
    await user.click(
      screen.getByRole("button", { name: "Change head and continue" }),
    );

    await waitFor(() =>
      expect(registryService.reassignHouseholdHead).toHaveBeenCalledWith(
        householdId,
        resident.id,
        activeMember.id,
      ),
    );
    expect(props.onResolved).toHaveBeenCalledWith({
      newHeadId: activeMember.id,
    });
  });

  it("allows an Administrator to explicitly archive a sole-member head and household", async () => {
    const user = userEvent.setup();
    registryService.listHouseholdMembers.mockResolvedValue([
      { ...resident, status: "active", archived_at: null },
    ]);
    const props = renderDialog();

    expect(
      await screen.findByText(
        "No replacement is required because no other eligible active household member exists. Both records will be archived together in one protected transaction.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Archive resident and household?"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Archive Resident and Household",
      }),
    );

    await waitFor(() =>
      expect(registryService.archiveSoleMemberHousehold).toHaveBeenCalledWith({
        residentId: resident.id,
        householdId,
        residentUpdatedAt: resident.updated_at,
        householdUpdatedAt: resident.household.updated_at,
      }),
    );
    expect(props.onSoleArchived).toHaveBeenCalledOnce();
    expect(registryService.reassignHouseholdHead).not.toHaveBeenCalled();
  });

  it("does not widen the sole-member archive action to BHW", async () => {
    registryService.listHouseholdMembers.mockResolvedValue([
      { ...resident, status: "active", archived_at: null },
      inactiveMember,
    ]);
    renderDialog({ canArchiveSoleHousehold: false });

    expect(
      await screen.findByText(
        "No eligible household member is available to become the new household head.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Archive Resident and Household",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps concurrent-change errors visible and does not advance", async () => {
    const user = userEvent.setup();
    registryService.reassignHouseholdHead.mockRejectedValue(
      new Error(
        "The household changed while you were editing it. Refresh and try again.",
      ),
    );
    const props = renderDialog();

    await user.selectOptions(
      await screen.findByLabelText("New household head"),
      activeMember.id,
    );
    await user.click(
      screen.getByRole("button", { name: "Change head and continue" }),
    );

    expect(
      await screen.findByText(
        "The household changed while you were editing it. Refresh and try again.",
      ),
    ).toBeInTheDocument();
    expect(props.onResolved).not.toHaveBeenCalled();
  });
});
