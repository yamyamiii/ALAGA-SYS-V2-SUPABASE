import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthContext } from "@/features/auth/authContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { RoleGuard } from "@/features/auth/RoleGuard";

function LoginProbe() {
  const location = useLocation();
  return <div>Login from {location.state?.from}</div>;
}

function renderWithAuth(auth, initialPath = "/residents") {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/residents"
              element={
                <RoleGuard permission={PERMISSIONS.MANAGE_RESIDENTS}>
                  <div>Residents route</div>
                </RoleGuard>
              }
            />
            <Route path="/access-denied" element={<div>Access denied</div>} />
            <Route
              path="/user-management"
              element={
                <RoleGuard permission={PERMISSIONS.MANAGE_USERS}>
                  <div>User Management route</div>
                </RoleGuard>
              }
            />
            <Route
              path="/appointments/queue"
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENT_QUEUE}>
                  <div>Daily queue route</div>
                </RoleGuard>
              }
            />
            <Route
              path="/appointments/calendar"
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENT_CALENDAR}>
                  <div>Appointment calendar route</div>
                </RoleGuard>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const baseAuth = {
  status: "unauthenticated",
  profile: null,
  error: null,
  isAuthenticated: false,
  retry: vi.fn(),
  can: vi.fn(() => false),
  hasRole: vi.fn(() => false),
};

describe("authentication route guards", () => {
  it("redirects guests to login and preserves their intended path", () => {
    renderWithAuth(baseAuth);
    expect(screen.getByText("Login from /residents")).toBeInTheDocument();
  });

  it("renders an authorized protected route", () => {
    renderWithAuth({
      ...baseAuth,
      status: "authenticated",
      isAuthenticated: true,
      profile: { role: "barangay_health_worker" },
      can: vi.fn(() => true),
    });
    expect(screen.getByText("Residents route")).toBeInTheDocument();
  });

  it("redirects authenticated but unauthorized users to access denied", () => {
    renderWithAuth({
      ...baseAuth,
      status: "authenticated",
      isAuthenticated: true,
      profile: { role: "resident" },
    });
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("protects the User Management route with the admin permission", () => {
    renderWithAuth(
      {
        ...baseAuth,
        status: "authenticated",
        isAuthenticated: true,
        profile: { role: "resident" },
      },
      "/user-management",
    );
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("allows an administrator into User Management", () => {
    renderWithAuth(
      {
        ...baseAuth,
        status: "authenticated",
        isAuthenticated: true,
        profile: { role: "admin" },
        can: vi.fn((permission) => permission === PERMISSIONS.MANAGE_USERS),
      },
      "/user-management",
    );
    expect(screen.getByText("User Management route")).toBeInTheDocument();
  });

  it("denies residents direct queue and calendar navigation", () => {
    const residentAuth = {
      ...baseAuth,
      status: "authenticated",
      isAuthenticated: true,
      profile: { role: "resident" },
    };
    const queue = renderWithAuth(residentAuth, "/appointments/queue");
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    queue.unmount();

    renderWithAuth(residentAuth, "/appointments/calendar");
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
});
