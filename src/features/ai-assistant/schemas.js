import { z } from "zod";

import {
  AI_MAX_CONVERSATION_TURNS,
  AI_MAX_MESSAGE_CHARACTERS,
} from "@/features/ai-assistant/constants";

export const aiMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z
      .string()
      .trim()
      .min(1, "Enter a message before sending.")
      .max(
        AI_MAX_MESSAGE_CHARACTERS,
        `Messages are limited to ${AI_MAX_MESSAGE_CHARACTERS} characters.`,
      ),
  })
  .strict();

export const aiConversationSchema = z
  .object({
    messages: z
      .array(aiMessageSchema)
      .min(1)
      .max(AI_MAX_CONVERSATION_TURNS * 2 - 1),
  })
  .strict()
  .superRefine(({ messages }, context) => {
    if (messages[0]?.role !== "user" || messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Conversation history must begin and end with a user message.",
      });
    }
    for (let index = 1; index < messages.length; index += 1) {
      if (messages[index].role === messages[index - 1].role) {
        context.addIssue({
          code: "custom",
          path: ["messages", index],
          message: "Conversation roles must alternate.",
        });
      }
    }
  });

export function buildAiPayload(messages) {
  return aiConversationSchema.parse({
    messages: messages
      .filter((message) => !message.local)
      .map(({ role, content }) => ({ role, content })),
  });
}
