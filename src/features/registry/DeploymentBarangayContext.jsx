import { MapPin } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { DEPLOYMENT_BARANGAY } from "@/config/deployment";

export function DeploymentBarangayContext({ query, compact = false }) {
  if (query?.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{query.error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      className={
        compact
          ? "flex items-center gap-2 text-xs text-muted-foreground"
          : "flex items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm"
      }
    >
      <MapPin className="h-4 w-4 shrink-0 text-primary" />
      <span>
        Barangay: <strong>{DEPLOYMENT_BARANGAY.displayName}</strong>
        {query?.isLoading ? " (validating…)" : ""}
      </span>
    </div>
  );
}
