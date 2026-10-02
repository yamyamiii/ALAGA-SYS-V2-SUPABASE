import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/authContext";
import ResidentRegistryPage from "@/features/registry/ResidentRegistryPage";
import { registryService } from "@/services/registryService";

vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/services/registryService", () => ({
  registryService: {
    listResidents: vi.fn(),
    resolveDeploymentContext: vi.fn(),
    listPuroks: vi.fn(),
    setResidentStatus: vi.fn(),
  },
}));
vi.mock("@/features/registry/ResidentFormDialog", () => ({
  ResidentFormDialog: () => null,
}));
vi.mock("@/features/registry/ResidentDetailDialog", () => ({
  ResidentDetailDialog: () => null,
}));
vi.mock("@/features/registry/ResidentAccountDialog", () => ({
  ResidentAccountDialog: () => null,
}));
vi.mock("@/features/registry/ResidentHouseholdDialog", () => ({
  ResidentHouseholdDialog: () => null,
}));
vi.mock("@/features/registry/ResidentHouseholdHeadDialog", () => ({
  ResidentHouseholdHeadDialog: () => null,
}));

const record = {
  id: "30000000-0000-4000-8000-000000000006",
  resident_number: "RES-2026-000006",
  first_name: "Test",
  last_name: "Resident",
  status: "archived",
  sex: "female",
  archived_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  portal_account_status: "inactive",
  purok_name: "Purok 1",
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return {
    invalidate,
    ...render(
      <QueryClientProvider client={client}>
        <ResidentRegistryPage />
      </QueryClientProvider>,
    ),
  };
}

describe("archived Resident registry recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ profile: { role: "admin" } });
    registryService.listResidents.mockImplementation(async (filters) => ({
      items: filters.archive_filter === "archived" ? [record] : [],
      total: filters.archive_filter === "archived" ? 1 : 0,
    }));
    registryService.resolveDeploymentContext.mockResolvedValue({
      barangay: { name: "Brgy. Bagongpook" },
      puroks: [],
    });
    registryService.listPuroks.mockResolvedValue([]);
    registryService.setResidentStatus.mockResolvedValue({
      ...record,
      status: "active",
      archived_at: null,
    });
  });

  it("shows desktop and mobile Restore Resident controls and refreshes registry/review after confirmation", async () => {
    const user = userEvent.setup();
    const { invalidate } = setup();
    await user.selectOptions(
      screen.getByLabelText("Filter archived residents"),
      "archived",
    );
    const actions = await screen.findAllByRole("button", {
      name: "Restore Resident",
    });
    expect(actions).toHaveLength(2);
    await user.click(actions[0]);
    expect(
      screen.getByText(/This does not restore the old portal account/),
    ).toBeInTheDocument();
    expect(registryService.setResidentStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(registryService.setResidentStatus).toHaveBeenCalledWith(
        record.id,
        "active",
        record.updated_at,
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["registry"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["resident-registration-requests"],
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it.each(["barangay_health_worker", "nurse", "midwife", "resident"])(
    "does not offer restoration to %s",
    async (role) => {
      useAuth.mockReturnValue({ profile: { role } });
      registryService.listResidents.mockResolvedValue({
        items: [record],
        total: 1,
      });
      setup();
      await screen.findAllByText(record.resident_number);
      expect(
        screen.queryByLabelText("Filter archived residents"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Restore Resident" }),
      ).not.toBeInTheDocument();
      expect(registryService.setResidentStatus).not.toHaveBeenCalled();
    },
  );

  it("keeps a trusted restore failure visible without closing the confirmation", async () => {
    registryService.setResidentStatus.mockRejectedValue(
      new Error("Existing portal account conflict"),
    );
    const user = userEvent.setup();
    setup();
    await user.selectOptions(
      screen.getByLabelText("Filter archived residents"),
      "archived",
    );
    await user.click(
      (await screen.findAllByRole("button", { name: "Restore Resident" }))[0],
    );
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText("Existing portal account conflict"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
