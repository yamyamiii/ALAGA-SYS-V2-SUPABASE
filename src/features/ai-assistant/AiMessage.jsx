import { ArrowRight, Bot, Check, Copy, UserRound } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveAiAction } from "@/features/ai-assistant/navigation";
import { formatManilaDate } from "@/lib/dateTime";
import { cn } from "@/lib/utils";

export function AiMessage({
  message,
  profileRole,
  onAction,
  actionsDisabled = false,
}) {
  const [copied, setCopied] = useState(false);
  const assistant = message.role === "assistant";
  const Icon = assistant ? Bot : UserRound;
  const sources =
    assistant && Array.isArray(message.sources) ? message.sources : [];
  const actions =
    assistant && Array.isArray(message.actions)
      ? message.actions.flatMap((action) => {
          const target = resolveAiAction(action, profileRole);
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
          "min-w-0 max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm sm:max-w-[82%]",
          assistant
            ? "rounded-tl-md border bg-card"
            : "rounded-tr-md bg-primary text-primary-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {assistant && !message.local ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1 h-7 px-2 text-xs text-muted-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.content);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1_500);
              } catch {
                setCopied(false);
              }
            }}
            aria-label={copied ? "Response copied" : "Copy response"}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
        {sources.length ? (
          <ul
            className="mt-2 space-y-1.5 border-t pt-2"
            aria-label="Verified sources used"
          >
            {sources.map((source, index) => (
              <li
                key={`${source.type}-${source.title}-${index}`}
                className="min-w-0 rounded-lg border bg-background/80 px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                tabIndex={0}
                aria-label={`${source.label}: ${source.title}${source.updatedAt ? `, updated ${formatManilaDate(source.updatedAt)}` : ""}`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="shrink-0 bg-background px-2 py-0 text-[10px]"
                  >
                    {source.label}
                  </Badge>
                  <span className="truncate text-[11px] font-medium">
                    {source.title}
                  </span>
                </div>
                {source.updatedAt ? (
                  <time
                    className="mt-0.5 block text-[10px] text-muted-foreground"
                    dateTime={source.updatedAt}
                  >
                    Updated {formatManilaDate(source.updatedAt)}
                  </time>
                ) : null}
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
