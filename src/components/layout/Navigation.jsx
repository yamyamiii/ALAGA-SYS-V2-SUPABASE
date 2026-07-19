import { NavLink } from "react-router-dom";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navigationItems } from "@/config/navigation";
import { cn } from "@/lib/utils";

export function Navigation({ collapsed = false, onNavigate, className }) {
  return (
    <nav className={cn("space-y-1", className)} aria-label="Main navigation">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        const link = (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive &&
                  "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
                collapsed && "justify-center px-2",
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </NavLink>
        );

        if (!collapsed) return link;

        return (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
