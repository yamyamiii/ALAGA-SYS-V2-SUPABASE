import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Navigation } from "@/components/layout/Navigation";
import { AuthContext } from "@/features/auth/authContext";
import { hasPermission, USER_ROLES } from "@/features/auth/permissions";

const expectedByRole = {
  [USER_ROLES.ADMINISTRATOR]: [
    "Dashboard",
    "Appointments",
    "Residents",
    "Health Records",
    "Announcements",
    "ALAGA AI",
    "Reports",
    "User Management",
  ],
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: [
    "Dashboard",
    "Appointments",
    "Residents",
    "Health Records",
    "Announcements",
    "ALAGA AI",
    "Reports",
  ],
  [USER_ROLES.NURSE]: [
    "Dashboard",
    "Appointments",
    "Health Records",
    "Announcements",
    "ALAGA AI",
  ],
  [USER_ROLES.MIDWIFE]: [
    "Dashboard",
    "Appointments",
    "Health Records",
    "Announcements",
    "ALAGA AI",
  ],
  [USER_ROLES.RESIDENT]: [
    "Dashboard",
    "My Appointments",
    "Announcements",
    "Notifications",
    "ALAGA AI",
  ],
};

function renderNavigation(role, props = {}) {
  render(
    <AuthContext.Provider
      value={{
        can: (permission) => hasPermission(role, permission),
        profile: { id: "profile-id", role },
      }}
    >
      <MemoryRouter>
        <Navigation {...props} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("final-scope primary navigation", () => {
  it.each(Object.entries(expectedByRole))(
    "shows the exact primary destinations for %s",
    (role, labels) => {
      renderNavigation(role);
      expect(
        screen.getByRole("navigation", { name: "Main navigation" }),
      ).toHaveTextContent(labels.join(""));
      expect(
        screen.getAllByRole("link").map((link) => link.textContent),
      ).toEqual(labels.filter((label) => label !== "ALAGA AI"));
      expect(
        screen.getByRole("button", { name: "ALAGA AI" }),
      ).toBeInTheDocument();
    },
  );

  it("does not expose out-of-scope modules in desktop or mobile navigation", () => {
    renderNavigation(USER_ROLES.ADMINISTRATOR);
    for (const label of [
      "Households",
      "Maternal and Child Care",
      "Medicine Inventory",
      "Activity",
      "Health Center",
      "FAQ",
      "Contact",
      "Audit Logs",
      "Backup & Restore",
      "Notification Delivery",
      "Settings",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("closes the mobile drawer before opening the in-memory AI assistant", () => {
    const onNavigate = vi.fn();
    const dispatch = vi.spyOn(globalThis, "dispatchEvent");
    renderNavigation(USER_ROLES.RESIDENT, { onNavigate });
    screen.getByRole("button", { name: "ALAGA AI" }).click();
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alaga:open-ai-assistant" }),
    );
    dispatch.mockRestore();
  });
});
