import { QueryClientProvider } from "@tanstack/react-query";

import { ConnectivityBanner } from "@/components/common/ConnectivityBanner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { RealtimeSyncProvider } from "@/features/realtime/RealtimeSyncProvider";
import { queryClient } from "@/lib/query/client";

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSyncProvider>
          <ConnectivityBanner />
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </RealtimeSyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
