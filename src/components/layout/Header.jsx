import { Bell, LogOut, Menu, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navigationItems } from "@/config/navigation";
import { ROUTES } from "@/config/routes";

export function Header() {
  const location = useLocation();
  const currentItem = navigationItems.find(
    (item) => item.path === location.pathname,
  );
  const pageTitle = currentItem?.label ?? "ALAGA-SYS";

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-11 gap-3 px-2"
              aria-label="Open user menu"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback>BH</AvatarFallback>
              </Avatar>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-4">
                  Barangay Staff
                </span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Account preview
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Account placeholder</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserRound /> Profile coming in Phase 2
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <LogOut /> Log out (not connected)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
