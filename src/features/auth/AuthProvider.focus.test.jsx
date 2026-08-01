import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { useAuth } from "@/features/auth/authContext";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { AUTH_ERROR_CODES, AuthServiceError } from "@/services/authService";

const authMocks = vi.hoisted(() => ({
  callback: null,
  recoverSession: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/services/authService", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    authService: {
      recoverSession: authMocks.recoverSession,
      signIn: vi.fn(),
      signOut: authMocks.signOut,
      onAuthStateChange: vi.fn((callback) => {
        authMocks.callback = callback;
        return { unsubscribe: authMocks.unsubscribe };
      }),
    },
  };
});

const profile = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  role: "admin",
  first_name: "Ada",
  last_name: "Admin",
  avatar: null,
});

function DraftRoute({ onMount }) {
  const auth = useAuth();
  useEffect(onMount, [onMount]);
  return (
    <>
      <label>
        Unsaved draft
        <input aria-label="Unsaved draft" />
      </label>
      <button type="button" onClick={auth.signOut}>
        Log out
      </button>
    </>
  );
}

function TestRoutes({ onMount }) {
  return (
    <MemoryRouter initialEntries={["/protected"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Outlet />}>
              <Route
                path="/protected"
                element={<DraftRoute onMount={onMount} />}
              />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("AuthProvider focus recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.callback = null;
    authMocks.recoverSession.mockResolvedValue(profile);
    authMocks.signOut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the protected route mounted through focus and token revalidation", async () => {
    const user = userEvent.setup();
    const onMount = vi.fn();
    render(<TestRoutes onMount={onMount} />);
    const draft = await screen.findByLabelText("Unsaved draft");
    await user.type(draft, "Clinical draft stays in memory");

    fireEvent.blur(window);
    fireEvent.focus(window);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    authMocks.callback("TOKEN_REFRESHED");

    await waitFor(() =>
      expect(authMocks.recoverSession.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      ),
    );
    expect(screen.getByLabelText("Unsaved draft")).toHaveValue(
      "Clinical draft stays in memory",
    );
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it("keeps the route and draft during a temporary focus network failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    const onMount = vi.fn();
    render(<TestRoutes onMount={onMount} />);
    const draft = await screen.findByLabelText("Unsaved draft");
    await user.type(draft, "Keep during offline recovery");
    authMocks.recoverSession.mockRejectedValueOnce(
      new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
        recoverable: true,
      }),
    );

    fireEvent.focus(window);

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(screen.getByLabelText("Unsaved draft")).toHaveValue(
      "Keep during offline recovery",
    );
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it("treats duplicate multi-tab SIGNED_IN events as silent revalidation", async () => {
    const user = userEvent.setup();
    const onMount = vi.fn();
    render(<TestRoutes onMount={onMount} />);
    const draft = await screen.findByLabelText("Unsaved draft");
    await user.type(draft, "Multi-tab draft");

    authMocks.callback("SIGNED_IN");

    await waitFor(() =>
      expect(authMocks.recoverSession.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      ),
    );
    expect(screen.getByLabelText("Unsaved draft")).toHaveValue(
      "Multi-tab draft",
    );
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it("confirms a SIGNED_OUT event before clearing another tab", async () => {
    const onMount = vi.fn();
    render(<TestRoutes onMount={onMount} />);
    await screen.findByLabelText("Unsaved draft");
    authMocks.recoverSession.mockResolvedValueOnce(profile);

    authMocks.callback("SIGNED_OUT");

    await waitFor(() =>
      expect(authMocks.recoverSession.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      ),
    );
    expect(screen.getByLabelText("Unsaved draft")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it("clears the protected route when SIGNED_OUT is confirmed", async () => {
    render(<TestRoutes onMount={vi.fn()} />);
    await screen.findByLabelText("Unsaved draft");
    authMocks.recoverSession.mockResolvedValueOnce(null);

    authMocks.callback("SIGNED_OUT");

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unsaved draft")).not.toBeInTheDocument();
  });

  it("clears authentication when an active account becomes suspended", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TestRoutes onMount={vi.fn()} />);
    await screen.findByLabelText("Unsaved draft");
    authMocks.recoverSession.mockRejectedValueOnce(
      new AuthServiceError(AUTH_ERROR_CODES.PROFILE_SUSPENDED),
    );

    fireEvent.focus(window);

    expect(
      await screen.findByText("Session verification unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText(/account has been suspended/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Unsaved draft")).not.toBeInTheDocument();
  });

  it("unmounts and clears the protected draft on logout", async () => {
    const user = userEvent.setup();
    render(<TestRoutes onMount={vi.fn()} />);
    const draft = await screen.findByLabelText("Unsaved draft");
    await user.type(draft, "Discard on logout");
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Unsaved draft")).not.toBeInTheDocument();
  });
});
