import { Bell, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { Button } from "@/components/ui/button";
import { navigationItems } from "@/config/navigation";
import { ROUTES } from "@/config/routes";
import { useNotifications } from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { UserMenu } from "@/features/auth/UserMenu";

export function Header() {
  const { can } = useAuth();
  const location = useLocation();
  const canViewNotifications = can(PERMISSIONS.VIEW_NOTIFICATIONS);
  const notifications = useNotifications(
    { unread_only: false, page: 1, page_size: 1 },
    canViewNotifications,
  );
  const currentItem = navigationItems.find(
    (item) => item.path === location.pathname,
  );
  const pageTitle =
    currentItem?.label ??
    (location.pathname === ROUTES.account ? "Account settings" : "ALAGA-SYS");

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-6">
      <div className="flex w-full items-center gap-3">
        <MobileNavigation>
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
        </MobileNavigation>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to={ROUTES.dashboard}
              className="transition-colors hover:text-primary"
            >
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">{pageTitle}</span>
          </div>
        </div>
        {canViewNotifications ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`${notifications.data?.unread ?? 0} unread notifications`}
          >
            <Link to={ROUTES.notifications}>
              <Bell />
              {(notifications.data?.unread ?? 0) > 0 ? (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {Math.min(notifications.data.unread, 99)}
                </span>
              ) : null}
            </Link>
          </Button>
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
