import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "node:fs";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/authContext";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import { AUTH_ERROR_CODES, AuthServiceError } from "@/services/authService";

const authServiceMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resendConfirmation: vi.fn(),
  establishPasswordRecovery: vi.fn(),
  completePasswordRecovery: vi.fn(),
}));

vi.mock("@/services/authService", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    authService: {
      ...original.authService,
      ...authServiceMocks,
    },
  };
});

const unauthenticated = {
  status: "unauthenticated",
  profile: null,
  error: null,
  isAuthenticated: false,
  signIn: vi.fn(),
  retry: vi.fn(),
  can: vi.fn(() => false),
  hasRole: vi.fn(() => false),
};

function renderLogin(auth = unauthenticated) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("account recovery UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    authServiceMocks.requestPasswordReset.mockResolvedValue(undefined);
    authServiceMocks.resendConfirmation.mockResolvedValue(undefined);
    authServiceMocks.establishPasswordRecovery.mockResolvedValue({
      userId: "user-1",
    });
    authServiceMocks.completePasswordRecovery.mockResolvedValue(undefined);
  });

  it("shows a Forgot password link on Login", () => {
    renderLogin();
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("shows email confirmation guidance and resends safely", async () => {
    const user = userEvent.setup();
    const auth = {
      ...unauthenticated,
      signIn: vi
        .fn()
        .mockRejectedValue(
          new AuthServiceError(AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED),
        ),
    };
    renderLogin(auth);

    await user.type(screen.getByLabelText("Email"), "resident@example.com");
    await user.type(screen.getByLabelText("Password"), "Secure123");
    await user.click(screen.getByRole("button", { name: "Sign in securely" }));

    expect(
      await screen.findByText(
        "Please confirm your email address before signing in.",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Resend confirmation email" }),
    );
    expect(authServiceMocks.resendConfirmation).toHaveBeenCalledWith(
      "resident@example.com",
    );
    expect(
      await screen.findByText(/if confirmation is still required/i),
    ).toBeInTheDocument();
  });

  it("blocks a confirmation-resend double click while pending", async () => {
    const user = userEvent.setup();
    let resolveResend;
    authServiceMocks.resendConfirmation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResend = resolve;
        }),
    );
    const auth = {
      ...unauthenticated,
      signIn: vi
        .fn()
        .mockRejectedValue(
          new AuthServiceError(AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED),
        ),
    };
    renderLogin(auth);
    await user.type(screen.getByLabelText("Email"), "resident@example.com");
    await user.type(screen.getByLabelText("Password"), "Secure123");
    await user.click(screen.getByRole("button", { name: "Sign in securely" }));
    const resend = await screen.findByRole("button", {
      name: "Resend confirmation email",
    });

    fireEvent.click(resend);
    fireEvent.click(resend);
    expect(authServiceMocks.resendConfirmation).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    resolveResend();
    expect(
      await screen.findByText(/if confirmation is still required/i),
    ).toBeInTheDocument();
  });

  it("uses a privacy-safe success message for reset requests", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(authServiceMocks.requestPasswordReset).toHaveBeenCalledWith(
      "unknown@example.com",
    );
    expect(
      await screen.findByText(
        "If an account exists for that email, a password reset link has been sent.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send reset link again" }),
    ).toBeInTheDocument();
  });

  it("blocks duplicate forgot-password submissions while the first is pending", async () => {
    const user = userEvent.setup();
    let resolveRequest;
    authServiceMocks.requestPasswordReset.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Email"), "resident@example.com");
    const form = screen
      .getByRole("button", { name: "Send reset link" })
      .closest("form");

    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(authServiceMocks.requestPasswordReset).toHaveBeenCalledOnce(),
    );
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    resolveRequest();
    expect(
      await screen.findByRole("button", { name: "Send reset link again" }),
    ).toBeEnabled();
  });

  it("shows the explicit Supabase request-limit message", async () => {
    const user = userEvent.setup();
    authServiceMocks.requestPasswordReset.mockRejectedValue(
      new AuthServiceError(AUTH_ERROR_CODES.REQUEST_RATE_LIMITED),
    );
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Email"), "resident@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "Too many requests were made in a short period. Please wait a few minutes and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("allows a verified recovery session to set a policy-compliant password", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/reset-password#type=recovery");
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText("New password"), "NewPass123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "NewPass123",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(authServiceMocks.completePasswordRecovery).toHaveBeenCalledWith(
      "NewPass123",
    );
    expect(
      await screen.findByText(/Password updated successfully/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Login destination", {}, { timeout: 2_500 }),
    ).toBeInTheDocument();
  });

  it("blocks an invalid or expired recovery session", async () => {
    authServiceMocks.establishPasswordRecovery.mockRejectedValue(
      new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID),
    );
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/reset link is invalid or has expired/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update password" }),
    ).not.toBeInTheDocument();
    expect(authServiceMocks.completePasswordRecovery).not.toHaveBeenCalled();
  });

  it("keeps recovery routes public and covered by the Vercel SPA rewrite", () => {
    const router = fs.readFileSync("src/app/router.jsx", "utf8");
    const publicRoutes = router.slice(
      0,
      router.indexOf("<Route element={<ProtectedRoute />}>"),
    );
    const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

    expect(publicRoutes).toContain("ROUTES.forgotPassword");
    expect(publicRoutes).toContain("ROUTES.resetPassword");
    expect(vercel.rewrites).toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
  });

  it("does not replace the unknown-question-style privacy response with account lookup details", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Email"), "missing@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(screen.queryByText(/not registered|account found/i)).toBeNull(),
    );
  });
});
