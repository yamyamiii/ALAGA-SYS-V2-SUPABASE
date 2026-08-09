import { MessageCircleMore } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { AiChatPanel } from "@/features/ai-assistant/AiChatPanel";
import {
  AI_MAX_CONVERSATION_TURNS,
  createWelcomeMessage,
} from "@/features/ai-assistant/constants";
import { useAiAssistantMutation } from "@/features/ai-assistant/hooks";
import { OPEN_AI_ASSISTANT_EVENT } from "@/features/ai-assistant/launcher";
import { resolveAiAction } from "@/features/ai-assistant/navigation";
import {
  clearPendingAiUiActions,
  queueAiUiAction,
} from "@/features/ai-assistant/uiActions";

function messageId() {
  return globalThis.crypto?.randomUUID?.() ?? `message-${Date.now()}`;
}

export function FloatingAiAssistant({ profile }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(() => [
    createWelcomeMessage(profile.role),
  ]);
  const [retryMessages, setRetryMessages] = useState(null);
  const requestInFlightRef = useRef(false);
  const mutation = useAiAssistantMutation();
  const userTurns = messages.filter(
    (message) => !message.local && message.role === "user",
  ).length;
  const turnLimitReached = userTurns >= AI_MAX_CONVERSATION_TURNS;

  useEffect(() => () => clearPendingAiUiActions(), []);

  useEffect(() => {
    const openAssistant = () => setOpen(true);
    globalThis.addEventListener?.(OPEN_AI_ASSISTANT_EVENT, openAssistant);
    return () =>
      globalThis.removeEventListener?.(OPEN_AI_ASSISTANT_EVENT, openAssistant);
  }, []);

  const completeRequest = (requestMessages) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setRetryMessages(requestMessages);
    mutation.mutate(requestMessages, {
      onSuccess: ({ content, sources, actions }) => {
        setMessages((current) => [
          ...current,
          {
            id: messageId(),
            role: "assistant",
            content,
            sources,
            actions,
          },
        ]);
        setRetryMessages(null);
      },
      onSettled: () => {
        requestInFlightRef.current = false;
      },
    });
  };

  const send = (suggestedPrompt) => {
    const content =
      typeof suggestedPrompt === "string"
        ? suggestedPrompt.trim()
        : draft.trim();
    if (
      !content ||
      requestInFlightRef.current ||
      mutation.isPending ||
      mutation.error ||
      turnLimitReached
    ) {
      return;
    }
    const userMessage = { id: messageId(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    completeRequest(nextMessages);
  };

  const clear = () => {
    requestInFlightRef.current = false;
    mutation.reset();
    setRetryMessages(null);
    setDraft("");
    setMessages([createWelcomeMessage(profile.role)]);
  };

  const retry = () => {
    if (!retryMessages || mutation.isPending) return;
    mutation.reset();
    completeRequest(retryMessages);
  };

  const followAction = (action) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const target = resolveAiAction(action, profile.role);
    if (!target) return;
    if (target.type === "ui_action") {
      const token = queueAiUiAction(target.actionId, profile.role);
      if (!token) return;
      navigate(target.route, {
        state: { alagaAiUiActionToken: token },
      });
    } else {
      navigate(target.route);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="lg"
          className="print-hidden fixed bottom-20 right-4 z-40 h-14 rounded-full px-5 shadow-xl sm:bottom-6 sm:right-6"
          aria-label="Open ALAGA AI Assistant"
        >
          <MessageCircleMore className="h-5 w-5" />
          <span>ALAGA AI</span>
        </Button>
      </DialogTrigger>
      <AiChatPanel
        messages={messages}
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        onRetry={retry}
        onClear={clear}
        onNewConversation={clear}
        onStarter={send}
        pending={mutation.isPending}
        error={mutation.error}
        turnLimitReached={turnLimitReached}
        profileRole={profile.role}
        onAction={followAction}
      />
    </Dialog>
  );
}
