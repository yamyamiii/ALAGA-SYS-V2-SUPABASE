import {
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { OfficialLogo } from "@/components/common/OfficialLogo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AiMessage } from "@/features/ai-assistant/AiMessage";
import {
  AI_ASSISTANT_NAME,
  AI_ASSISTANT_SUBTITLE,
  AI_MAX_MESSAGE_CHARACTERS,
  getAiStarterPrompts,
} from "@/features/ai-assistant/constants";

export function AiChatPanel({
  messages,
  draft,
  onDraftChange,
  onSend,
  onRetry,
  onClear,
  onNewConversation,
  onStarter,
  pending,
  error,
  turnLimitReached,
  profileRole,
  onAction,
}) {
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [resetIntent, setResetIntent] = useState(null);
  const starters = getAiStarterPrompts(profileRole);
  const showStarters = messages.every((message) => message.local);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, pending, error]);

  const submit = (event) => {
    event.preventDefault();
    onSend();
  };

  return (
    <DialogContent
      className="bottom-2 left-2 right-2 top-auto flex h-[min(42rem,calc(100dvh-1rem))] w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden overscroll-contain p-0 motion-reduce:transition-none sm:bottom-6 sm:left-auto sm:right-6 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-[26rem] sm:max-w-[calc(100vw-3rem)]"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }}
    >
      <DialogHeader className="border-b bg-card px-4 py-3 pr-14">
        <div className="flex items-center gap-3">
          <OfficialLogo className="h-10 w-10 shrink-0 rounded-xl bg-white" />
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">
              {AI_ASSISTANT_NAME}
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {AI_ASSISTANT_SUBTITLE}
            </DialogDescription>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto shrink-0"
            onClick={() => setResetIntent("new")}
            disabled={pending || showStarters}
            aria-label="Start a new conversation"
            title="New conversation"
          >
            <MessageSquarePlus />
          </Button>
        </div>
      </DialogHeader>

      <div className="border-b bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-950">
        Do not enter names, record numbers, contact details, appointment
        reasons, or clinical information. For emergencies, contact local
        emergency services or the Barangay Health Center immediately.
      </div>

      {!online ? (
        <Alert className="mx-4 mt-3" aria-live="polite">
          <ShieldAlert />
          <AlertDescription>
            You are offline. Reconnect to send a message or open a suggested
            destination.
          </AlertDescription>
        </Alert>
      ) : null}

      <ol
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/35 p-4"
        role="log"
        aria-live="polite"
        aria-label="ALAGA AI conversation"
      >
        {messages.map((message) => (
          <AiMessage
            key={message.id}
            message={message}
            profileRole={profileRole}
            onAction={onAction}
            actionsDisabled={!online}
          />
        ))}
        {showStarters ? (
          <li className="ml-10" aria-label="Suggested questions">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Try asking
            </p>
            <ul className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <li key={starter}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-9 whitespace-normal text-left text-xs"
                    onClick={() => onStarter(starter)}
                    disabled={pending || !online}
                  >
                    {starter}
                  </Button>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {pending ? (
          <li
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <OfficialLogo className="h-6 w-6 rounded-md bg-white" />
            </span>
            ALAGA AI is typing…
          </li>
        ) : null}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {error ? (
        <Alert className="mx-4 mt-3" aria-live="polite">
          <ShieldAlert />
          <AlertDescription className="space-y-2">
            <p>{error.message}</p>
            {error.retryable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRetry}
                disabled={pending}
              >
                <RotateCcw /> Retry
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {turnLimitReached ? (
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          This session reached its conversation limit. Clear it to start again.
        </p>
      ) : null}

      <Dialog
        open={Boolean(resetIntent)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setResetIntent(null);
        }}
      >
        <DialogContent
          className="max-w-sm p-4 sm:p-5"
          role="alertdialog"
          aria-labelledby="alaga-ai-reset-title"
          aria-describedby="alaga-ai-reset-description"
        >
          <DialogHeader>
            <DialogTitle id="alaga-ai-reset-title" className="text-base">
              {resetIntent === "new"
                ? "Start a new conversation?"
                : "Clear this conversation?"}
            </DialogTitle>
            <DialogDescription id="alaga-ai-reset-description">
              The current in-memory conversation will be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setResetIntent(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (resetIntent === "new") onNewConversation();
                else onClear();
                setResetIntent(null);
              }}
            >
              {resetIntent === "new" ? "Start new" : "Clear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <form className="border-t bg-card p-3" onSubmit={submit}>
        <label htmlFor="alaga-ai-message" className="sr-only">
          Message ALAGA AI Assistant
        </label>
        <textarea
          ref={inputRef}
          id="alaga-ai-message"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          maxLength={AI_MAX_MESSAGE_CHARACTERS}
          enterKeyHint="send"
          rows={3}
          disabled={pending || Boolean(error) || turnLimitReached || !online}
          placeholder="Ask how to use ALAGA-SYS…"
          className="min-h-20 w-full resize-none rounded-xl border bg-background px-3 py-2 text-base leading-5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className="text-xs text-muted-foreground"
            aria-label="Message character count"
          >
            {draft.length}/{AI_MAX_MESSAGE_CHARACTERS}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setResetIntent("clear")}
              disabled={pending || messages.every((message) => message.local)}
            >
              <Trash2 /> Clear
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                pending ||
                Boolean(error) ||
                turnLimitReached ||
                !online ||
                !draft.trim()
              }
            >
              <Send /> Send
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}
