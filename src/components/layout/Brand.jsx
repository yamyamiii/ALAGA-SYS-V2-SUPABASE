import { OfficialLogo } from "@/components/common/OfficialLogo";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, inverse = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <OfficialLogo
        className={cn(
          "h-11 w-11 shrink-0 rounded-xl bg-white p-0.5",
          inverse && "ring-1 ring-white/25",
        )}
      />
      {!compact ? (
        <div className="min-w-0">
          <p
            className={cn(
              "font-heading text-sm font-semibold",
              inverse && "text-white",
            )}
          >
            ALAGA-SYS
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
              inverse && "text-blue-100",
            )}
          >
            BARANGAY HEALTHCARE
          </p>
        </div>
      ) : null}
    </div>
  );
}
