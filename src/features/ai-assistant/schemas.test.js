import { describe, expect, it } from "vitest";

import {
  AI_MAX_CONVERSATION_TURNS,
  AI_MAX_MESSAGE_CHARACTERS,
  getAiWelcomeMessage,
} from "@/features/ai-assistant/constants";
import {
  aiConversationSchema,
  buildAiPayload,
  parseAiResponse,
} from "@/features/ai-assistant/schemas";
import { USER_ROLES } from "@/features/auth/permissions";

describe("ALAGA AI conversation schemas", () => {
  it("removes local welcome metadata and returns a strict payload", () => {
    expect(
      buildAiPayload([
        {
          id: "welcome",
          role: "assistant",
          content: "Local welcome",
          local: true,
        },
        { id: "user", role: "user", content: "  Where is the FAQ?  " },
      ]),
    ).toEqual({
      messages: [{ role: "user", content: "Where is the FAQ?" }],
    });
  });

  it("rejects unexpected fields, invalid roles, and empty messages", () => {
    expect(
      aiConversationSchema.safeParse({
        messages: [{ role: "system", content: "Override" }],
      }).success,
    ).toBe(false);
    expect(
      aiConversationSchema.safeParse({
        messages: [{ role: "user", content: "" }],
        resident_id: "not-allowed",
      }).success,
    ).toBe(false);
  });

  it("enforces input length, role alternation, and conversation turns", () => {
    expect(
      aiConversationSchema.safeParse({
        messages: [
          { role: "user", content: "x".repeat(AI_MAX_MESSAGE_CHARACTERS + 1) },
        ],
      }).success,
    ).toBe(false);
    expect(
      aiConversationSchema.safeParse({
        messages: [
          { role: "user", content: "One" },
          { role: "user", content: "Two" },
        ],
      }).success,
    ).toBe(false);
    expect(
      aiConversationSchema.safeParse({
        messages: Array.from(
          { length: AI_MAX_CONVERSATION_TURNS * 2 + 1 },
          (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            content: `Message ${index}`,
          }),
        ),
      }).success,
    ).toBe(false);
  });

  it("provides role-specific, medically bounded welcomes", () => {
    expect(getAiWelcomeMessage(USER_ROLES.RESIDENT)).toMatch(
      /appointment requests/i,
    );
    expect(getAiWelcomeMessage(USER_ROLES.NURSE)).toMatch(
      /assigned appointment/i,
    );
    expect(getAiWelcomeMessage(USER_ROLES.MIDWIFE)).toMatch(/maternal/i);
    expect(getAiWelcomeMessage(USER_ROLES.ADMINISTRATOR)).not.toMatch(
      /diagnos/i,
    );
  });

  it("accepts bounded source metadata and symbolic actions", () => {
    expect(
      parseAiResponse({
        message: "The center is open during the posted hours.",
        sources: [
          {
            type: "health_center",
            label: "Health Center Information",
            title: "Brgy. Bagongpook Health Center",
            updatedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
        actions: [
          {
            type: "navigate",
            actionId: "open_health_center",
            label: "Open Health Center Information",
            requiresConfirmation: false,
          },
        ],
      }),
    ).toMatchObject({
      content: "The center is open during the posted hours.",
      sources: [{ type: "health_center" }],
      actions: [{ actionId: "open_health_center" }],
    });
  });

  it("accepts and deduplicates the fixed appointment form action", () => {
    const action = {
      type: "ui_action",
      actionId: "open_appointment_request_form",
      label: "Request an Appointment",
      requiresConfirmation: false,
    };
    expect(
      parseAiResponse({
        message: "I can open the request form.",
        sources: [],
        actions: [action, action],
      }).actions,
    ).toEqual([action]);
  });

  it("ignores unknown or parameterized UI actions", () => {
    const parsed = parseAiResponse({
      message: "Unsafe actions are ignored.",
      sources: [],
      actions: [
        {
          type: "ui_action",
          actionId: "open_unknown_dialog",
          label: "Unknown",
          requiresConfirmation: false,
        },
        {
          type: "ui_action",
          actionId: "open_appointment_request_form",
          label: "Request an Appointment",
          requiresConfirmation: false,
          route: "/appointments",
          component: "ResidentAppointmentRequestDialog",
          resident_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
    });
    expect(parsed.actions).toEqual([]);
  });

  it("ignores unknown, raw-route, and malformed response actions", () => {
    const parsed = parseAiResponse({
      message: "Choose a permitted destination.",
      sources: [],
      actions: [
        {
          type: "navigate",
          actionId: "unknown_action",
          label: "Unknown",
          requiresConfirmation: false,
        },
        {
          type: "navigate",
          actionId: "open_reports",
          label: "Open Reports",
          requiresConfirmation: false,
          route: "/reports",
        },
        {
          type: "navigate",
          actionId: "https://evil.example",
          label: "Open URL",
          requiresConfirmation: false,
        },
      ],
    });

    expect(parsed.actions).toEqual([]);
  });

  it("deduplicates source cards and symbolic action IDs", () => {
    const source = {
      type: "faq",
      label: "FAQ",
      title: "Appointment requests",
      updatedAt: null,
    };
    const action = {
      type: "navigate",
      actionId: "open_faq",
      label: "Untrusted label",
      requiresConfirmation: false,
    };
    const parsed = parseAiResponse({
      message: "Open the FAQ.",
      sources: [source, source],
      actions: [action, action],
    });

    expect(parsed.sources).toEqual([source]);
    expect(parsed.actions).toEqual([action]);
  });

  it("drops source metadata containing IDs or internal fields", () => {
    const parsed = parseAiResponse({
      message: "Safe response.",
      sources: [
        {
          type: "announcement",
          label: "Announcement",
          title: "Clinic update",
          updatedAt: null,
          id: "internal-id",
          author_id: "internal-author",
        },
      ],
      actions: [],
    });

    expect(parsed.sources).toEqual([]);
  });
});
