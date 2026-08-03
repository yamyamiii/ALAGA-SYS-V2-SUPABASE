import { beforeEach, describe, expect, it } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import {
  APPOINTMENT_REQUEST_FORM_ACTION,
  clearPendingAiUiActions,
  consumeAiUiAction,
  queueAiUiAction,
} from "@/features/ai-assistant/uiActions";

describe("ALAGA AI one-time UI actions", () => {
  beforeEach(() => clearPendingAiUiActions());

  it("queues and consumes the fixed resident action exactly once", () => {
    const token = queueAiUiAction(
      APPOINTMENT_REQUEST_FORM_ACTION,
      USER_ROLES.RESIDENT,
    );
    expect(token).toEqual(expect.any(String));
    expect(consumeAiUiAction(token, USER_ROLES.RESIDENT)).toBe(
      APPOINTMENT_REQUEST_FORM_ACTION,
    );
    expect(consumeAiUiAction(token, USER_ROLES.RESIDENT)).toBeNull();
  });

  it("rejects unknown actions, staff roles, and role changes", () => {
    expect(
      queueAiUiAction("open_unknown_dialog", USER_ROLES.RESIDENT),
    ).toBeNull();
    expect(
      queueAiUiAction(
        APPOINTMENT_REQUEST_FORM_ACTION,
        USER_ROLES.ADMINISTRATOR,
      ),
    ).toBeNull();
    const token = queueAiUiAction(
      APPOINTMENT_REQUEST_FORM_ACTION,
      USER_ROLES.RESIDENT,
    );
    expect(consumeAiUiAction(token, USER_ROLES.NURSE)).toBeNull();
  });

  it("clears pending actions for reload, logout, or profile changes", () => {
    const token = queueAiUiAction(
      APPOINTMENT_REQUEST_FORM_ACTION,
      USER_ROLES.RESIDENT,
    );
    clearPendingAiUiActions();
    expect(consumeAiUiAction(token, USER_ROLES.RESIDENT)).toBeNull();
  });
});
