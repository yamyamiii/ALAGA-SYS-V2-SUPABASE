import { useMutation } from "@tanstack/react-query";

import { aiAssistantService } from "@/services/aiAssistantService";

export function useAiAssistantMutation() {
  return useMutation({
    mutationKey: ["alaga-ai", "session-message"],
    mutationFn: (messages) => aiAssistantService.send(messages),
  });
}
