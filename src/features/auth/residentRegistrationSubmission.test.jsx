import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/authContext";
import ResidentRegistrationPage from "@/pages/ResidentRegistrationPage";

const mocks = vi.hoisted(() => ({
  listPuroks: vi.fn(),
  register: vi.fn(),
  resendConfirmation: vi.fn(),
}));

vi.mock("@/services/residentRegistrationService", () => ({
  residentRegistrationService: {
    listPuroks: mocks.listPuroks,
    register: mocks.register,
  },
}));

vi.mock("@/services/authService", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    authService: {
      ...original.authService,
      resendConfirmation: mocks.resendConfirmation,
    },
  };
});

const auth = {
  status: "unauthenticated",
  profile: null,
  error: null,
  isAuthenticated: false,
  retry: vi.fn(),
};

function renderPage() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <ResidentRegistrationPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function completeRequiredFields(user) {
  await user.type(screen.getByLabelText("Email"), "resident@example.com");
  await user.type(screen.getByLabelText("Password"), "Secure123");
  await user.type(screen.getByLabelText("Confirm password"), "Secure123");
  await user.type(screen.getByLabelText("First name"), "Ana");
  await user.type(screen.getByLabelText("Last name"), "Reyes");
  await user.type(screen.getByLabelText("Date of birth"), "1995-04-10");
  await user.selectOptions(screen.getByLabelText("Sex"), "female");
  await user.selectOptions(
    await screen.findByLabelText("Purok"),
    "20000000-0000-4000-8000-000000000001",
  );
}

describe("Resident registration submission safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPuroks.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        id: `20000000-0000-4000-8000-00000000000${index + 1}`,
        name: `Purok ${index + 1}`,
      })),
    );
    mocks.resendConfirmation.mockResolvedValue(undefined);
  });

  it("blocks simultaneous form submissions and disables the action immediately", async () => {
    const user = userEvent.setup();
    let resolveRegistration;
    mocks.register.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    renderPage();
    await completeRequiredFields(user);
    const form = screen
      .getByRole("button", { name: "Create resident account" })
      .closest("form");

    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.register).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();

    resolveRegistration({
      status: "pending",
      emailConfirmationRequired: true,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create resident account" }),
      ).toBeEnabled(),
    );
  });

  it("shows partial-success guidance and a confirmation resend path", async () => {
    const user = userEvent.setup();
    mocks.register.mockRejectedValue({
      code: "email_send_rate_limited",
      message:
        "Email sending is temporarily limited. Please wait a few minutes and try again. Your registration information was not lost if the account was already created.",
    });
    renderPage();
    await completeRequiredFields(user);

    await user.click(
      screen.getByRole("button", { name: "Create resident account" }),
    );

    expect(
      await screen.findByText(/Email sending is temporarily limited/i),
    ).toBeInTheDocument();
    expect(mocks.register).toHaveBeenCalledOnce();
    const resend = screen.getByRole("button", {
      name: "Resend confirmation email",
    });
    await user.click(resend);
    expect(mocks.resendConfirmation).toHaveBeenCalledWith(
      "resident@example.com",
    );
    expect(
      await screen.findByText(/if confirmation is still required/i),
    ).toBeInTheDocument();
  });
});
