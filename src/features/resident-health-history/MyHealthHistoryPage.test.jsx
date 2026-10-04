import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/authContext";
import { hasPermission } from "@/features/auth/permissions";
import { AppRouter } from "@/app/router";
import { Navigation } from "@/components/layout/Navigation";
import MyHealthHistoryPage from "@/features/resident-health-history/MyHealthHistoryPage";
import {
  useResidentHealthHistory,
  useResidentHealthHistoryEntry,
} from "@/features/resident-health-history/hooks";

vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({ AppShell: () => <Outlet /> }));
vi.mock("@/features/health-records/HealthRecordsPage", () => ({
  default: () => <p>Staff documentation list</p>,
}));
vi.mock("@/features/health-records/HealthRecordDetailPage", () => ({
  default: () => <p>Staff documentation detail</p>,
}));
vi.mock("@/pages/AccessDeniedPage", () => ({
  default: () => <p>Access denied</p>,
}));
vi.mock("@/pages/LoginPage", () => ({
  default: () => <p>Login required</p>,
}));
vi.mock("@/features/resident-health-history/hooks", () => ({
  useResidentHealthHistory: vi.fn(),
  useResidentHealthHistoryEntry: vi.fn(),
}));
const id = "30000000-0000-4000-8000-000000000001";
const entry = {
  id,
  kind: "encounter",
  visit_date: "2026-10-03",
  service_type: "Immunization",
  status: "finalized",
  staff_name: "Nurse Test",
};
const detail = {
  encounter_date: "2026-10-03",
  service_type: "Immunization",
  staff_name: "Nurse Test",
  status: "finalized",
  summary: {
    assessment: "Official finalized assessment",
    plan: "Recorded follow-up instructions",
    follow_up_date: "2026-10-15",
  },
  vital_signs: {
    temperature_c: 36.7,
    systolic_bp: 120,
    diastolic_bp: 80,
    pulse_bpm: 78,
    pain_score: 0,
  },
};
function show() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<MyHealthHistoryPage />} />
        <Route path="/access-denied" element={<p>Access denied</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    isAuthenticated: true,
    profile: { id: "own-profile", role: "resident" },
  });
  useResidentHealthHistory.mockReturnValue({
    data: { items: [entry], total: 1 },
    refetch: vi.fn(),
  });
  useResidentHealthHistoryEntry.mockReturnValue({
    data: detail,
    refetch: vi.fn(),
  });
});
describe("My Health History Resident viewer", () => {
  it("shows cards and opens finalized summary/vitals without staff actions or raw IDs", async () => {
    show();
    expect(
      screen.getByRole("heading", { name: "My Health History" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /View finalized Immunization/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Official finalized assessment"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("36.7 °C")).toBeInTheDocument();
    expect(within(dialog).getByText("0 /10")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(id);
    for (const name of [
      /Edit/,
      /Sign$/,
      /Delete/,
      /Create encounter/,
      /Record vitals/,
      /Print/,
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(useResidentHealthHistoryEntry).toHaveBeenCalledWith(id);
  });
  it("omits missing summary/vital sections instead of inventing measurements", async () => {
    useResidentHealthHistoryEntry.mockReturnValue({
      data: { ...detail, summary: {}, vital_signs: null },
    });
    show();
    await userEvent.click(
      screen.getByRole("button", { name: /View finalized/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByText("Recorded vitals"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Finalized health summary"),
    ).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/undefined|null|Not documented|BMI/);
  });
  it("renders completed services as history only, not clinical or appointment management", () => {
    useResidentHealthHistory.mockReturnValue({
      data: {
        items: [
          { ...entry, kind: "appointment", status: "completed" },
          { ...entry, id: "event", kind: "event", status: "completed" },
        ],
        total: 2,
      },
    });
    show();
    expect(
      screen.getByText("Completed health-center visit"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Completed health service event"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /View finalized/ }),
    ).not.toBeInTheDocument();
    expect(useResidentHealthHistoryEntry).not.toHaveBeenCalled();
  });
  it("shows the explicit finalized empty state", () => {
    useResidentHealthHistory.mockReturnValue({ data: { items: [], total: 0 } });
    show();
    expect(
      screen.getByText("No finalized health records yet."),
    ).toBeInTheDocument();
  });
  it("shows loading and a safe retryable error", async () => {
    useResidentHealthHistory.mockReturnValue({ isLoading: true });
    const view = show();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your health history",
    );
    view.unmount();
    const refetch = vi.fn();
    useResidentHealthHistory.mockReturnValue({
      isError: true,
      error: new Error("Please try again."),
      refetch,
    });
    show();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it("an unavailable/foreign detail never renders cached clinical content", async () => {
    useResidentHealthHistoryEntry.mockReturnValue({
      data: detail,
      isError: true,
      error: new Error("This finalized record is unavailable to your account."),
      refetch: vi.fn(),
    });
    show();
    await userEvent.click(
      screen.getByRole("button", { name: /View finalized/ }),
    );
    expect(
      screen.queryByText("Official finalized assessment"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Finalized record unavailable"),
    ).toBeInTheDocument();
  });
  it.each(["admin", "barangay_health_worker", "nurse", "midwife"])(
    "does not mount personal-history hooks for %s",
    (role) => {
      useAuth.mockReturnValue({ isAuthenticated: true, profile: { role } });
      show();
      expect(screen.getByText("Access denied")).toBeInTheDocument();
      expect(useResidentHealthHistory).not.toHaveBeenCalled();
    },
  );
  it.each(["inactive", "suspended", "invited"])("denies a %s Resident", () => {
    // AuthProvider does not authenticate these accounts or expose a profile.
    useAuth.mockReturnValue({
      isAuthenticated: false,
      profile: null,
    });
    show();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
  it("does not mount history for retired accounts", () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      profile: null,
    });
    show();
    expect(useResidentHealthHistory).not.toHaveBeenCalled();
  });
  it("supports keyboard activation, Escape and card-width responsive layout", async () => {
    show();
    const button = screen.getByRole("button", { name: /View finalized/ });
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(button).toHaveClass("min-h-11", "w-full", "sm:w-auto");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
  });
  it("focus refresh does not close an open read-only entry", async () => {
    show();
    await userEvent.click(
      screen.getByRole("button", { name: /View finalized/ }),
    );
    fireEvent(window, new Event("blur"));
    fireEvent(window, new Event("focus"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it.each([360, 768, 1366])(
    "keeps the card/detail structure responsive at %spx",
    async (width) => {
      const originalWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      try {
        const { container } = show();
        expect(container.querySelector("article")).toHaveClass("min-w-0");
        await userEvent.click(
          screen.getByRole("button", { name: /View finalized/ }),
        );
        expect(screen.getByRole("dialog")).toHaveClass(
          "viewport-dialog",
          "overflow-y-auto",
          "max-w-2xl",
        );
      } finally {
        Object.defineProperty(window, "innerWidth", {
          configurable: true,
          value: originalWidth,
        });
      }
    },
  );
});

describe("actual application health-history route integration", () => {
  function route(
    role,
    path,
    { withNavigation = false, authenticated = true } = {},
  ) {
    useAuth.mockReturnValue({
      profile: authenticated
        ? Object.freeze({ id: "own-profile", role })
        : null,
      status: authenticated ? "authenticated" : "unauthenticated",
      isAuthenticated: authenticated,
      can: (permission) => hasPermission(role, permission),
      hasRole: (roles) => roles.includes(role),
    });
    return render(
      <MemoryRouter initialEntries={[path]}>
        {withNavigation ? <Navigation /> : null}
        <AppRouter />
      </MemoryRouter>,
    );
  }
  it("opens the Resident sidebar destination with the actual normalized profile shape", async () => {
    route("resident", "/access-denied", { withNavigation: true });
    const link = screen.getByRole("link", { name: "My Health History" });
    expect(link).toHaveAttribute("href", "/my-health-history");
    expect(useAuth().profile).not.toHaveProperty("account_status");
    expect(useAuth().profile).not.toHaveProperty("retired_at");
    await userEvent.click(link);
    expect(
      await screen.findByRole("heading", { name: "My Health History" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
    expect(screen.queryByText(/Staff documentation/)).not.toBeInTheDocument();
  });
  it("renders a direct Resident URL and a fresh mount after browser refresh", async () => {
    const view = route("resident", "/my-health-history");
    expect(
      await screen.findByRole("heading", { name: "My Health History" }),
    ).toBeInTheDocument();
    view.unmount();
    route("resident", "/my-health-history");
    expect(
      await screen.findByRole("heading", { name: "My Health History" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
  });
  it.each(["guest", "inactive", "suspended", "retired", "invited"])(
    "keeps %s accounts behind the existing ProtectedRoute authentication boundary",
    async () => {
      route("resident", "/my-health-history", { authenticated: false });
      expect(await screen.findByText("Login required")).toBeInTheDocument();
      expect(useResidentHealthHistory).not.toHaveBeenCalled();
    },
  );
  it.each(["/health-records", `/health-records/${id}`])(
    "redirects Resident legacy link %s without mounting staff documentation",
    async (path) => {
      route("resident", path);
      expect(
        await screen.findByRole("heading", { name: "My Health History" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Staff documentation/)).not.toBeInTheDocument();
    },
  );
  it.each(["admin", "barangay_health_worker", "nurse", "midwife"])(
    "keeps %s staff list and detail routes intact",
    async (role) => {
      const view = route(role, "/health-records");
      expect(
        await screen.findByText("Staff documentation list"),
      ).toBeInTheDocument();
      view.unmount();
      route(role, `/health-records/${id}`);
      expect(
        await screen.findByText("Staff documentation detail"),
      ).toBeInTheDocument();
      expect(useResidentHealthHistory).not.toHaveBeenCalled();
    },
  );
  it.each(["admin", "barangay_health_worker", "nurse", "midwife"])(
    "guards the Resident-only route from %s",
    async (role) => {
      route(role, "/my-health-history");
      expect(await screen.findByText("Access denied")).toBeInTheDocument();
      expect(useResidentHealthHistory).not.toHaveBeenCalled();
    },
  );
});
