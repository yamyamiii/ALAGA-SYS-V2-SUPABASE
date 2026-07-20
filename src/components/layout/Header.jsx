import { Bell, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { Button } from "@/components/ui/button";
import { navigationItems } from "@/config/navigation";
import { ROUTES } from "@/config/routes";
import { UserMenu } from "@/features/auth/UserMenu";

export function Header() {
  const location = useLocation();
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          title="Notifications preview"
        >
          <Bell />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
