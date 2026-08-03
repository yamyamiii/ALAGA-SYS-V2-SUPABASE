import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Navigation } from "@/components/layout/Navigation";
import { AuthContext } from "@/features/auth/authContext";
import {
  hasPermission,
  PERMISSIONS,
  USER_ROLES,
} from "@/features/auth/permissions";

function renderNavigation(can) {
  render(
    <AuthContext.Provider value={{ can }}>
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("permission-based navigation", () => {
  it("shows User Management only when the permission is present", () => {
    renderNavigation(vi.fn(() => true));
    expect(screen.getByText("User Management")).toBeInTheDocument();
  });

  it("hides User Management from non-administrators", () => {
    renderNavigation(
      vi.fn((permission) => permission === PERMISSIONS.VIEW_DASHBOARD),
    );
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();
  });

  it("shows residents only the approved release-candidate destinations", () => {
    renderNavigation((permission) =>
      hasPermission(USER_ROLES.RESIDENT, permission),
    );
    for (const label of [
      "Dashboard",
      "Appointments",
      "Health Records",
      "Maternal and Child Care",
      "Announcements",
      "Notifications",
      "Activity",
      "Health Center",
      "FAQ",
      "Contact",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of [
      "Households",
      "Residents",
      "Medicine Inventory",
      "Reports",
      "Audit Logs",
      "User Management",
      "Settings",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
