import { HeartPulse } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export const OFFICIAL_LOGO_PATH = "/alaga-logo.png";
export const OFFICIAL_LOGO_ALT = "ALAGA-SYS official logo";

export function OfficialLogo({ className }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={OFFICIAL_LOGO_ALT}
        className={cn(
          "inline-flex items-center justify-center rounded-xl border bg-white text-primary",
          className,
        )}
        data-logo-fallback
      >
        <HeartPulse className="h-1/2 w-1/2" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={OFFICIAL_LOGO_PATH}
      alt={OFFICIAL_LOGO_ALT}
      className={cn("block object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
