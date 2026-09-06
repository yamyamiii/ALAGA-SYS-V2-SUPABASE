import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/authContext";
import AccountSettingsPage from "@/pages/AccountSettingsPage";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  getOwnProfile: vi.fn(),
  updateOwnProfile: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/services/authService", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    authService: {
      ...original.authService,
      changePassword: mocks.changePassword,
    },
  };
});

vi.mock("@/services/profileService", () => ({
  profileService: {
    getOwnProfile: mocks.getOwnProfile,
    updateOwnProfile: mocks.updateOwnProfile,
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}));

const profile = {
  id: "user-1",
  first_name: "Maria",
  middle_name: null,
  last_name: "Santos",
  suffix: null,
  phone_number: null,
  role: "nurse",
  account_status: "active",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          profile: { id: "user-1", role: "nurse" },
          refreshProfile: vi.fn(),
        }}
      >
        <AccountSettingsPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("Account Settings password management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnProfile.mockResolvedValue(profile);
    mocks.changePassword.mockResolvedValue(undefined);
  });

  it("requires the current password and updates through the auth service", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      await screen.findByLabelText("Current password"),
      "Current123",
    );
    await user.type(screen.getByLabelText("New password"), "Replacement123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "Replacement123",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(mocks.changePassword).toHaveBeenCalledWith({
      currentPassword: "Current123",
      newPassword: "Replacement123",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Password updated successfully",
    );
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("does not submit when confirmation does not match", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      await screen.findByLabelText("Current password"),
      "Current123",
    );
    await user.type(screen.getByLabelText("New password"), "Replacement123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "Different123",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByText("Passwords do not match."),
    ).toBeInTheDocument();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });
});
