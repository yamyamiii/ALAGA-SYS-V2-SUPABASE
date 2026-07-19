import { HeartPulse } from "lucide-react";

import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          inverse
            ? "bg-white text-primary"
            : "bg-primary text-primary-foreground",
        )}
      >
        <HeartPulse className="h-5 w-5" aria-hidden="true" />
      </div>
      {!compact ? (
        <div className="min-w-0">
          <p
            className={cn(
              "font-heading text-sm font-semibold",
              inverse && "text-white",
            )}
          >
            ALAGA-SYS V2
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
              inverse && "text-blue-100",
            )}
          >
            Barangay Healthcare
          </p>
        </div>
      ) : null}
    </div>
  );
}
