import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResidentHouseholdDialog } from "@/features/registry/ResidentHouseholdDialog";
import { registryService } from "@/services/registryService";

const replacementHousehold = {
  id: "22222222-2222-4222-8222-222222222222",
  household_number: "HH-2026-000002",
  address_line: "Purok 1, Sampaguita",
  barangay_id: "10000000-0000-4000-8000-000000000001",
  purok_id: "20000000-0000-4000-8000-000000000001",
};

vi.mock("@/features/registry/HouseholdSearchField", () => ({
  HouseholdSearchField: ({ onChange }) => (
    <div data-testid="household-search">
      <button type="button" onClick={() => onChange(replacementHousehold)}>
        Choose replacement household
      </button>
      <button type="button" onClick={() => onChange(null)}>
        Keep no household
      </button>
    </div>
  ),
}));

vi.mock("@/services/registryService", () => ({
  registryService: {
    assignResidentToHousehold: vi.fn(),
    removeResidentFromHousehold: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

const resident = {
  id: "33333333-3333-4333-8333-333333333333",
  household_id: "11111111-1111-4111-8111-111111111111",
  barangay_id: "10000000-0000-4000-8000-000000000001",
  purok_id: "20000000-0000-4000-8000-000000000001",
  household: {
    id: "11111111-1111-4111-8111-111111111111",
    household_number: "HH-2026-000001",
    address_line: "Purok 1, Anahaw",
  },
};

function renderDialog(overrides = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    resident,
    onSaved: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={client}>
      <ResidentHouseholdDialog {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("Resident household assignment dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registryService.removeResidentFromHousehold.mockResolvedValue({
      id: resident.id,
      household_id: null,
    });
    registryService.assignResidentToHousehold.mockResolvedValue({
      id: resident.id,
      household_id: replacementHousehold.id,
    });
  });

  it("keeps explicit unassignment separate from household search", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    expect(screen.getByText("HH-2026-000001")).toBeInTheDocument();
    expect(screen.queryByTestId("household-search")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Clear household assignment" }),
    );

    expect(screen.getByText("No household")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Save this assignment to remove the Resident from the current household.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("household-search")).not.toBeInTheDocument();
    expect(registryService.removeResidentFromHousehold).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save assignment" }));

    await waitFor(() =>
      expect(registryService.removeResidentFromHousehold).toHaveBeenCalledWith(
        resident.id,
      ),
    );
    expect(registryService.assignResidentToHousehold).not.toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onSaved).toHaveBeenCalledOnce();
  });

  it("still supports an intentional replacement household search", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole("button", { name: "Clear household assignment" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Search for a household" }),
    );
    expect(screen.getByTestId("household-search")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Choose replacement household" }),
    );
    expect(screen.getByText("HH-2026-000002")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save assignment" }));
    await waitFor(() =>
      expect(registryService.assignResidentToHousehold).toHaveBeenCalledWith(
        resident.id,
        replacementHousehold,
      ),
    );
    expect(registryService.removeResidentFromHousehold).not.toHaveBeenCalled();
  });

  it("keeps the current household when saved unchanged", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save assignment" }));

    await waitFor(() =>
      expect(registryService.assignResidentToHousehold).toHaveBeenCalledWith(
        resident.id,
        expect.objectContaining({ id: resident.household_id }),
      ),
    );
    expect(registryService.removeResidentFromHousehold).not.toHaveBeenCalled();
  });

  it("does not mutate data when cancelled", async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(
      screen.getByRole("button", { name: "Clear household assignment" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(registryService.removeResidentFromHousehold).not.toHaveBeenCalled();
    expect(registryService.assignResidentToHousehold).not.toHaveBeenCalled();
  });
});
