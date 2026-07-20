import { useState } from "react";
import { Outlet } from "react-router-dom";

import { ContentContainer } from "@/components/common/ContentContainer";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <div
        className={cn(
          "min-h-dvh transition-[padding] duration-200",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <Header />
        <main className="bg-dashboard-pattern min-h-[calc(100dvh-72px)] p-4 sm:p-6 lg:p-8">
          <ContentContainer>
            <Outlet />
          </ContentContainer>
        </main>
      </div>
    </div>
  );
}
