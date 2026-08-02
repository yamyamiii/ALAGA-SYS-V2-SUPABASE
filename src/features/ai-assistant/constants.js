import { USER_ROLES } from "@/features/auth/permissions";

export const AI_ASSISTANT_NAME = "ALAGA AI Assistant";
export const AI_ASSISTANT_SUBTITLE = "General assistance only";
export const AI_MAX_MESSAGE_CHARACTERS = 2_000;
export const AI_MAX_CONVERSATION_TURNS = 10;

const ROLE_WELCOME = Object.freeze({
  [USER_ROLES.ADMINISTRATOR]:
    "I can explain ALAGA-SYS administration and module workflows. I cannot access records, run reports, or make clinical decisions.",
  [USER_ROLES.BARANGAY_HEALTH_WORKER]:
    "I can explain resident, household, appointment-review, announcement, and inquiry workflows. I cannot access resident data or provide medical advice.",
  [USER_ROLES.NURSE]:
    "I can explain assigned appointment, queue, and health-record workflows. I cannot view patient records here or provide diagnosis or prescriptions.",
  [USER_ROLES.MIDWIFE]:
    "I can explain assigned maternal, child-care, appointment, and health-record workflows. I cannot assess pregnancy or provide clinical advice.",
  [USER_ROLES.RESIDENT]:
    "I can explain appointment requests, notifications, signed health-record navigation, announcements, FAQs, health-center information, and inquiries. Do not enter personal or medical details.",
});

export function getAiWelcomeMessage(role) {
  return (
    ROLE_WELCOME[role] ??
    "I can provide general ALAGA-SYS guidance. Do not enter personal or medical details."
  );
}

export function createWelcomeMessage(role) {
  return {
    id: `welcome-${role}`,
    role: "assistant",
    content: getAiWelcomeMessage(role),
    local: true,
  };
}
