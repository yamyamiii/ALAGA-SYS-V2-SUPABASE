import { ArrowRight, Bot, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveAiNavigationAction } from "@/features/ai-assistant/navigation";
import { cn } from "@/lib/utils";

export function AiMessage({
  message,
  profileRole,
  onAction,
  actionsDisabled = false,
}) {
  const assistant = message.role === "assistant";
  const Icon = assistant ? Bot : UserRound;
  const sources =
    assistant && Array.isArray(message.sources) ? message.sources : [];
  const actions =
    assistant && Array.isArray(message.actions)
      ? message.actions.flatMap((action) => {
          const target = resolveAiNavigationAction(action, profileRole);
          return target ? [{ action, target }] : [];
        })
      : [];
  return (
    <li
      className={cn(
        "flex items-start gap-2",
        assistant ? "justify-start" : "flex-row-reverse justify-start",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          assistant
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-secondary-foreground",
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm",
          assistant
            ? "rounded-tl-md border bg-card"
            : "rounded-tr-md bg-primary text-primary-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {sources.length ? (
          <ul className="mt-2 space-y-1.5 border-t pt-2" aria-label="Sources">
            {sources.map((source, index) => (
              <li
                key={`${source.type}-${source.title}-${index}`}
                className="flex min-w-0 items-center gap-1.5"
              >
                <Badge
                  variant="outline"
                  className="shrink-0 bg-background px-2 py-0 text-[10px]"
                  aria-label={`Source: ${source.label}`}
                >
                  {source.label}
                </Badge>
                <span className="truncate text-[11px] text-muted-foreground">
                  {source.title}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {actions.length ? (
          <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
            {actions.map(({ action, target }) => (
              <Button
                key={target.actionId}
                type="button"
                size="sm"
                variant="outline"
                className="h-auto min-h-9 whitespace-normal text-left"
                onClick={() => onAction?.(action)}
                disabled={actionsDisabled}
                title={
                  actionsDisabled
                    ? "Reconnect to open this destination."
                    : undefined
                }
              >
                {target.requiresConfirmation ? "Confirm: " : ""}
                {target.label}
                <ArrowRight />
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}
