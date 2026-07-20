import { LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
import { useAuth } from "@/features/auth/authContext";
import { getRoleLabel } from "@/features/auth/permissions";
import { LogoutDialog } from "@/features/auth/LogoutDialog";
import { ROUTES } from "@/config/routes";

function initials(profile) {
  return (
    `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() ||
    "AS"
  );
}

export function UserMenu() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 gap-3 px-2"
            aria-label="Open user menu"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initials(profile)}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-44 text-left sm:block">
              <span className="block truncate text-sm font-semibold leading-4">
                {fullName}
              </span>
              <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                {getRoleLabel(profile.role)}
              </span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block truncate">{fullName}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {getRoleLabel(profile.role)}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate(ROUTES.account)}>
            <UserRound /> Account settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLogoutOpen(true)}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </>
  );
}
