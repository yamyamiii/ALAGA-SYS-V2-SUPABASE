import { USER_ROLES } from "@/features/auth/permissions";

export const AI_ASSISTANT_NAME = "ALAGA AI Assistant";
export const AI_ASSISTANT_SUBTITLE = "Verified guidance • Read-only";
export const AI_MAX_MESSAGE_CHARACTERS = 2_000;
export const AI_MAX_CONVERSATION_TURNS = 10;

const ROLE_WELCOME = Object.freeze({
  [USER_ROLES.ADMINISTRATOR]:
    "I can help with verified ALAGA-SYS information, authorized navigation, and administration workflows. I cannot open records, run reports, or make clinical decisions.",
  [USER_ROLES.BARANGAY_HEALTH_WORKER]:
    "I can help with verified ALAGA-SYS information and authorized resident, household, appointment-review, announcement, and inquiry workflows. I cannot access resident data or provide medical advice.",
  [USER_ROLES.NURSE]:
    "I can help with verified ALAGA-SYS information and authorized assigned appointment, queue, and health-record navigation. I cannot view patient records here or provide diagnosis or prescriptions.",
  [USER_ROLES.MIDWIFE]:
    "I can help with verified ALAGA-SYS information and authorized maternal, child-care, appointment, and health-record navigation. I cannot assess pregnancy or provide clinical advice.",
  [USER_ROLES.RESIDENT]:
    "Maaari kitang tulungan sa verified health-center information, appointment requests, ALAGA-SYS guidance, at pagpunta sa mga page na available sa iyo. Huwag maglagay ng personal o medical details.",
});

const ROLE_STARTERS = Object.freeze({
  [USER_ROLES.RESIDENT]: [
    "Paano mag-request ng appointment?",
    "Ano ang operating hours?",
    "Buksan ang appointments ko.",
    "May bagong announcement ba?",
  ],
  [USER_ROLES.BARANGAY_HEALTH_WORKER]: [
    "Buksan ang incoming appointment requests.",
    "Buksan ang residents.",
    "Ano ang health-center services?",
  ],
  [USER_ROLES.NURSE]: [
    "Open today's queue.",
    "Open health records.",
    "Show my assigned appointments.",
  ],
  [USER_ROLES.MIDWIFE]: [
    "Open maternal and child care.",
    "Open immunizations.",
    "Open assigned appointments.",
  ],
  [USER_ROLES.ADMINISTRATOR]: [
    "Open reports.",
    "Open user management.",
    "Open announcements.",
    "Open audit logs.",
  ],
});

export function getAiWelcomeMessage(role) {
  return (
    ROLE_WELCOME[role] ??
    "I can provide general ALAGA-SYS guidance. Do not enter personal or medical details."
  );
}

export function getAiStarterPrompts(role) {
  return ROLE_STARTERS[role] ?? [];
}

export function createWelcomeMessage(role) {
  return {
    id: `welcome-${role}`,
    role: "assistant",
    content: getAiWelcomeMessage(role),
    local: true,
  };
}
