export const OPEN_AI_ASSISTANT_EVENT = "alaga:open-ai-assistant";

export function openAiAssistant() {
  globalThis.dispatchEvent?.(new Event(OPEN_AI_ASSISTANT_EVENT));
}
