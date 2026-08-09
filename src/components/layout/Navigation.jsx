import { NavLink } from "react-router-dom";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { primaryNavigationForRole } from "@/config/navigation";
import { useAuth } from "@/features/auth/authContext";
import { openAiAssistant } from "@/features/ai-assistant/launcher";
import { cn } from "@/lib/utils";

export function Navigation({ collapsed = false, onNavigate, className }) {
  const { can, profile } = useAuth();
  const visibleItems = primaryNavigationForRole(profile.role, can);

  return (
    <nav className={cn("space-y-1", className)} aria-label="Main navigation">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const itemKey = item.path ?? item.action;
        const commonClasses = cn(
          "group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center px-2",
        );
        const link = item.action ? (
          <button
            key={itemKey}
            type="button"
            onClick={() => {
              onNavigate?.();
              openAiAssistant();
            }}
            className={commonClasses}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </button>
        ) : (
          <NavLink
            key={itemKey}
            to={item.path}
            end={item.path === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                commonClasses,
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
          <Tooltip key={itemKey}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
