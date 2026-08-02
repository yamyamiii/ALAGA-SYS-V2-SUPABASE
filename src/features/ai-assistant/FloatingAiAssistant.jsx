import { MessageCircleMore } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { AiChatPanel } from "@/features/ai-assistant/AiChatPanel";
import {
  AI_MAX_CONVERSATION_TURNS,
  createWelcomeMessage,
} from "@/features/ai-assistant/constants";
import { useAiAssistantMutation } from "@/features/ai-assistant/hooks";

function messageId() {
  return globalThis.crypto?.randomUUID?.() ?? `message-${Date.now()}`;
}

export function FloatingAiAssistant({ profile }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(() => [
    createWelcomeMessage(profile.role),
  ]);
  const [retryMessages, setRetryMessages] = useState(null);
  const mutation = useAiAssistantMutation();
  const userTurns = messages.filter(
    (message) => !message.local && message.role === "user",
  ).length;
  const turnLimitReached = userTurns >= AI_MAX_CONVERSATION_TURNS;

  const completeRequest = (requestMessages) => {
    setRetryMessages(requestMessages);
    mutation.mutate(requestMessages, {
      onSuccess: ({ content }) => {
        setMessages((current) => [
          ...current,
          { id: messageId(), role: "assistant", content },
        ]);
        setRetryMessages(null);
      },
    });
  };

  const send = () => {
    const content = draft.trim();
    if (!content || mutation.isPending || mutation.error || turnLimitReached) {
      return;
    }
    const userMessage = { id: messageId(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    completeRequest(nextMessages);
  };

  const clear = () => {
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
        pending={mutation.isPending}
        error={mutation.error}
        turnLimitReached={turnLimitReached}
      />
    </Dialog>
  );
}
