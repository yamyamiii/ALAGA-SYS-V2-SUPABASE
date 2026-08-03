import { z } from "zod";

import {
  AI_MAX_CONVERSATION_TURNS,
  AI_MAX_MESSAGE_CHARACTERS,
} from "@/features/ai-assistant/constants";
import { isKnownAiActionId } from "@/features/ai-assistant/navigation";

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

const aiSourceSchema = z
  .object({
    type: z.enum(["faq", "health_center", "announcement", "workflow"]),
    label: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(500),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const actionIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{2,79}$/);

const aiActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("navigate"),
      actionId: actionIdSchema,
      label: z.string().trim().min(1).max(100),
      requiresConfirmation: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ui_action"),
      actionId: actionIdSchema,
      label: z.string().trim().min(1).max(100),
      requiresConfirmation: z.boolean(),
    })
    .strict(),
]);

const aiResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    sources: z.array(z.unknown()).max(12).default([]),
    actions: z.array(z.unknown()).max(6).default([]),
  })
  .strict();

export function parseAiResponse(value) {
  const response = aiResponseSchema.parse(value);
  const sourceKeys = new Set();
  const actionIds = new Set();
  return {
    content: response.message,
    sources: response.sources.flatMap((source) => {
      const parsed = aiSourceSchema.safeParse(source);
      if (!parsed.success) return [];
      const key = `${parsed.data.type}\u0000${parsed.data.title}`;
      if (sourceKeys.has(key)) return [];
      sourceKeys.add(key);
      return [parsed.data];
    }),
    actions: response.actions.flatMap((action) => {
      const parsed = aiActionSchema.safeParse(action);
      if (
        !parsed.success ||
        !isKnownAiActionId(parsed.data.actionId) ||
        actionIds.has(parsed.data.actionId)
      ) {
        return [];
      }
      actionIds.add(parsed.data.actionId);
      return [parsed.data];
    }),
  };
}
