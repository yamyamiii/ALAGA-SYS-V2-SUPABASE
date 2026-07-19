import { ChevronLeft, ChevronRight } from "lucide-react";

import { Brand } from "@/components/layout/Brand";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden border-r bg-card transition-[width] duration-200 lg:flex lg:flex-col",
        collapsed ? "w-[76px]" : "w-[264px]",
      )}
    >
      <div
        className={cn(
          "flex h-[72px] items-center",
          collapsed ? "justify-center px-3" : "px-5",
        )}
      >
        <Brand compact={collapsed} />
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {!collapsed ? (
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
        ) : null}
        <Navigation collapsed={collapsed} />
      </div>
      <div className="border-t p-3">
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={cn(
            "text-muted-foreground",
            !collapsed && "w-full justify-start",
          )}
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
          {!collapsed ? <span>Collapse sidebar</span> : null}
        </Button>
      </div>
    </aside>
  );
}
