import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const stateIcons = {
  empty: Inbox,
  loading: LoaderCircle,
  error: AlertCircle,
};

export function StateDisplay({
  state = "empty",
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}) {
  const Icon = stateIcons[state] ?? Inbox;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/25 px-5 text-center",
        compact ? "min-h-40 py-7" : "min-h-64 py-10",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-sm ring-1 ring-border">
        <Icon
          className={cn("h-5 w-5", state === "loading" && "animate-spin")}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {actionLabel ? (
        <Button className="mt-4" size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState(props) {
  return <StateDisplay state="empty" {...props} />;
}

export function LoadingState(props) {
  return <StateDisplay state="loading" {...props} />;
}

export function ErrorState(props) {
  return <StateDisplay state="error" {...props} />;
}
