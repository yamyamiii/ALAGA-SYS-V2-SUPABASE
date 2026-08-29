import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

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
    "Reports",
    "User Management",
  ],
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: [
    "Dashboard",
    "Appointments",
    "Residents",
    "Health Records",
    "Announcements",
    "Reports",
  ],
  [USER_ROLES.NURSE]: [
    "Dashboard",
    "Appointments",
    "Health Records",
    "Announcements",
    "Reports",
  ],
  [USER_ROLES.MIDWIFE]: [
    "Dashboard",
    "Appointments",
    "Health Records",
    "Announcements",
    "Reports",
  ],
  [USER_ROLES.RESIDENT]: [
    "Dashboard",
    "My Appointments",
    "Announcements",
    "Notifications",
  ],
};

function renderNavigation(role, props = {}) {
  return render(
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
      ).toEqual(labels);
      expect(screen.queryByText("ALAGA AI")).not.toBeInTheDocument();
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

  it("keeps ALAGA AI out of every role's primary navigation", () => {
    for (const role of Object.values(USER_ROLES)) {
      const { unmount } = renderNavigation(role);
      expect(screen.queryByText("ALAGA AI")).not.toBeInTheDocument();
      unmount();
    }
  });
});
