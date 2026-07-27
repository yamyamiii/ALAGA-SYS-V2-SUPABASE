import { useEffect, useState } from "react";

import { formatManilaClock } from "@/lib/dateTime";
import { cn } from "@/lib/utils";

export function LiveManilaClock({ className }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const formatted = formatManilaClock(now);

  return (
    <div
      className={cn(
        "min-w-0 max-w-full rounded-xl border bg-card px-3 py-2 shadow-sm sm:px-4",
        className,
      )}
      data-testid="live-manila-clock"
    >
      <time
        dateTime={formatted.dateTime}
        className="block min-w-0 text-left tabular-nums sm:text-right"
      >
        <span className="block truncate text-xs font-semibold text-foreground sm:text-sm">
          {formatted.date}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:text-xs">
          {formatted.time}
        </span>
      </time>
    </div>
  );
}
