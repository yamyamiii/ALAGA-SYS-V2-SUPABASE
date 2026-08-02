import { Bot, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

export function AiMessage({ message }) {
  const assistant = message.role === "assistant";
  const Icon = assistant ? Bot : UserRound;
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
      </div>
    </li>
  );
}
