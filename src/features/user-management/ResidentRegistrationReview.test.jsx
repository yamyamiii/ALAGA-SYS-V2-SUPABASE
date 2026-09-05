import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResidentRegistrationReview } from "@/features/user-management/ResidentRegistrationReview";
import { userManagementService } from "@/services/userManagementService";

vi.mock("@/services/userManagementService", () => ({
  userManagementService: {
    listResidentRegistrations: vi.fn(),
    approveResidentRegistration: vi.fn(),
    rejectResidentRegistration: vi.fn(),
  },
}));

const registration = {
  id: "10000000-0000-4000-8000-000000000001",
  profile_id: "10000000-0000-4000-8000-000000000002",
  email: "ana@example.com",
  first_name: "Ana",
  middle_name: "Maria",
  last_name: "Reyes",
  date_of_birth: "1995-04-10",
  sex: "female",
  purok_id: "20000000-0000-4000-8000-000000000001",
  purok_name: "Purok 1",
  address_line: null,
  phone_number: null,
  status: "pending",
  submitted_at: "2026-08-16T00:00:00Z",
  version: 1,
  permanent_delete_eligible: true,
  permanent_delete_kind: "registration",
  possible_matches: [],
};

function renderReview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResidentRegistrationReview />
    </QueryClientProvider>,
  );
}

describe("Administrator Resident registration review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userManagementService.listResidentRegistrations.mockResolvedValue({
      items: [registration],
      total: 1,
      page: 1,
      page_size: 50,
    });
    userManagementService.approveResidentRegistration.mockResolvedValue({
      approved: true,
      resident: {
        id: "30000000-0000-4000-8000-000000000001",
        resident_number: "RES-2026-000001",
        linked_existing: false,
      },
    });
  });

  it("reviews and approves a new Resident through the trusted service", async () => {
    const user = userEvent.setup();
    renderReview();

    expect(
      await screen.findByRole("heading", {
        name: "Pending Resident registrations",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Ana Maria Reyes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(
      screen.getByRole("button", { name: "Approve and create Resident" }),
    );

    await waitFor(() =>
      expect(
        userManagementService.approveResidentRegistration,
      ).toHaveBeenCalledWith(registration.id, 1, null),
    );
  });

  it("requires explicit selection when an existing match is returned", async () => {
    const existingResident = {
      id: "30000000-0000-4000-8000-000000000002",
      resident_number: "RES-2026-000002",
      first_name: "Ana",
      middle_name: "Maria",
      last_name: "Reyes",
      date_of_birth: "1995-04-10",
      sex: "female",
      status: "active",
      archived_at: null,
      linked_profile_id: null,
      purok_name: "Purok 1",
    };
    userManagementService.listResidentRegistrations.mockResolvedValue({
      items: [{ ...registration, possible_matches: [existingResident] }],
      total: 1,
      page: 1,
      page_size: 50,
    });
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: "Review" }));
    const approve = screen.getByRole("button", { name: "Approve and link" });
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
    expect(approve).toBeDisabled();
    await user.click(
      screen.getByRole("radio", {
        name: /RES-2026-000002 · Ana Maria Reyes/i,
      }),
    );
    expect(approve).toBeEnabled();
    await user.click(approve);
    await waitFor(() =>
      expect(
        userManagementService.approveResidentRegistration,
      ).toHaveBeenCalledWith(registration.id, 1, existingResident.id),
    );
  });

  it("requires a second explicit action before rejection", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(await screen.findByRole("button", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(
      userManagementService.rejectResidentRegistration,
    ).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Reject registration" }),
    );
    await waitFor(() =>
      expect(
        userManagementService.rejectResidentRegistration,
      ).toHaveBeenCalledWith(registration.id, 1),
    );
  });

  it("keeps pending registration review limited to Cancel, Reject, and Approve", async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve and create Resident" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
  });

  it("does not expose permanent deletion for a rejected registration", async () => {
    userManagementService.listResidentRegistrations.mockResolvedValue({
      items: [{ ...registration, status: "rejected" }],
      total: 1,
      page: 1,
      page_size: 50,
    });
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("button", { name: "Review" }));
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
  });
});
