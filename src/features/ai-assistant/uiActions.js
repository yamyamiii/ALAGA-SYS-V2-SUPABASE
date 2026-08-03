import { USER_ROLES } from "@/features/auth/permissions";

export const APPOINTMENT_REQUEST_FORM_ACTION = "open_appointment_request_form";

const pendingActions = new Map();

function actionToken() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `alaga-ai-action-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function queueAiUiAction(actionId, role) {
  if (
    actionId !== APPOINTMENT_REQUEST_FORM_ACTION ||
    role !== USER_ROLES.RESIDENT
  ) {
    return null;
  }
  pendingActions.clear();
  const token = actionToken();
  pendingActions.set(token, { actionId, role });
  return token;
}

export function consumeAiUiAction(token, role) {
  if (typeof token !== "string" || !token) return null;
  const pending = pendingActions.get(token);
  pendingActions.delete(token);
  if (!pending || pending.role !== role) return null;
  return pending.actionId;
}

export function clearPendingAiUiActions() {
  pendingActions.clear();
}
