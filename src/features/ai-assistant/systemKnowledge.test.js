import { describe, expect, it } from "vitest";

import {
  announcementConversationResponseFor,
  buildProviderInput,
  buildSystemInstruction,
  faqConversationResponseFor,
  healthCenterConversationResponseFor,
  humanEscalationResponseFor,
  normalizeConversationalText,
  resolveConversationTopic,
  residentAppointmentStatusResponseFor,
  safetyResponseFor,
  serviceScheduleResponseFor,
  shouldLoadResidentAppointmentStatus,
  systemKnowledgeGroundingFor,
  systemKnowledgeResponseFor,
  workflowConversationResponseFor,
  workflowResponseFor,
} from "../../../supabase/functions/alaga-ai/domain.ts";
import {
  SYSTEM_KNOWLEDGE_ENTRIES,
  SYSTEM_KNOWLEDGE_TOPICS,
} from "../../../supabase/functions/alaga-ai/knowledge.ts";

const conversation = (...contents) =>
  contents.map((content, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content,
  }));

describe("ALAGA AI centralized system knowledge", () => {
  it("covers every approved conversation topic in one structured catalog", () => {
    expect(SYSTEM_KNOWLEDGE_TOPICS).toEqual(
      expect.arrayContaining([
        "appointment_workflow",
        "announcement",
        "health_center",
        "faq",
        "service_schedule",
        "registration",
        "notifications",
        "inquiries",
        "reports",
        "resident_registry",
        "health_records",
        "user_management",
        "account_management",
        "navigation",
        "alaga_ai",
        "general_system",
      ]),
    );
    expect(SYSTEM_KNOWLEDGE_ENTRIES.length).toBeGreaterThanOrEqual(18);
    expect(JSON.stringify(SYSTEM_KNOWLEDGE_ENTRIES)).not.toMatch(
      /resident_number|appointment_number|diagnosis_text|clinical_notes|service_role_key/i,
    );
  });

  it.each([
    ["appointment_workflow", "Explain the appointment lifecycle"],
    ["own_appointment_status", "Ano na nangyare sa appointment ko?"],
    ["announcement", "Ano latest announcement?"],
    ["health_center", "What are the health center opening hours?"],
    ["faq", "What does the FAQ say about appointments?"],
    ["service_schedule", "Kailan ang immunization?"],
    ["registration", "Pano ako mag register as Resident?"],
    ["notifications", "Ano ginagawa ng notifications?"],
    ["inquiries", "What are inquiries?"],
    ["reports", "Para saan yung Reports?"],
    ["resident_registry", "Para saan yung Residents registry?"],
    ["health_records", "Ano pinagkaiba ng appointment at health record?"],
    ["user_management", "Bakit may User Management?"],
    ["account_management", "How does password recovery work?"],
    ["navigation", "How does safe navigation work?"],
    ["alaga_ai", "Ano ginagawa ng ALAGA AI?"],
    ["general_system", "Ano ba ang ALAGA-SYS?"],
  ])("resolves %s from a natural paraphrase", (topic, message) => {
    expect(resolveConversationTopic(conversation(message))?.topic).toBe(topic);
  });

  it.each([
    ["pano", "paano"],
    ["anu", "ano"],
    ["san", "saan"],
    ["pede", "pwede"],
    ["bat", "bakit"],
    ["nangyare", "nangyari"],
    ["naba", "na ba"],
    ["yon", "yun"],
    ["doon", "dun"],
  ])("normalizes informal Filipino %s", (input, expected) => {
    expect(normalizeConversationalText(input)).toBe(expected);
  });

  it("keeps short follow-ups on bounded recent context", () => {
    expect(
      resolveConversationTopic(
        conversation(
          "Para saan yung Health Records?",
          "It documents authorized clinical information.",
          "Sino pwede gumamit nun?",
        ),
      ),
    ).toMatchObject({ topic: "health_records", contextual: true });

    expect(
      resolveConversationTopic(
        conversation(
          "Ano latest announcement?",
          "The latest announcement is available.",
          "Open my appointments.",
        ),
      )?.topic,
    ).toBe("appointment_workflow");
  });

  it("explains verified workflows naturally without exposing record data", () => {
    const registration = systemKnowledgeResponseFor(
      conversation("Pano mag register?"),
      "resident",
    );
    const records = systemKnowledgeResponseFor(
      conversation("Ano pinagkaiba ng appointment at health record?"),
      "nurse",
    );

    expect(registration?.message).toContain("kino-confirm ang email");
    expect(registration?.message).toContain("Administrator review");
    expect(records?.message).toContain("appointment");
    expect(records?.message).toContain("Health Record");
    expect(records?.message).toContain("Hindi binabasa ng ALAGA AI");
    expect(records?.sources[0]).toMatchObject({
      type: "workflow",
      label: "Verified System Knowledge",
    });
  });

  it("answers contextual role access and keeps actions role-allowlisted", () => {
    const resident = systemKnowledgeResponseFor(
      conversation(
        "Para saan yung Reports?",
        "Reports contains authorized aggregates.",
        "Saan ko makikita yun?",
      ),
      "resident",
    );
    const admin = systemKnowledgeResponseFor(
      conversation(
        "Para saan yung Reports?",
        "Reports contains authorized aggregates.",
        "Saan ko makikita yun?",
      ),
      "admin",
    );

    expect(resident?.message).toMatch(/Hindi available.*resident role/i);
    expect(resident?.actions).toEqual([]);
    expect(admin?.actions).toEqual([
      expect.objectContaining({ actionId: "open_reports" }),
    ]);
  });

  it("uses static knowledge provenance for verification follow-ups", () => {
    const response = systemKnowledgeResponseFor(
      conversation(
        "Para saan yung Reports?",
        "It provides authorized aggregate views.",
        "Sure ba yan?",
      ),
      "admin",
    );

    expect(response?.message).toContain(
      "verified static ALAGA-SYS system knowledge",
    );
  });

  it("loads own appointment data only for a Resident direct request or established follow-up", () => {
    const direct = conversation("Ano na nangyari sa appointment ko?");
    const followUp = conversation(
      "Ano na nangyari sa appointment ko?",
      "Pending pa ito.",
      "Anong oras?",
    );

    expect(shouldLoadResidentAppointmentStatus(direct, "resident")).toBe(true);
    expect(shouldLoadResidentAppointmentStatus(followUp, "resident")).toBe(
      true,
    );
    expect(shouldLoadResidentAppointmentStatus(followUp, "nurse")).toBe(false);
    expect(
      shouldLoadResidentAppointmentStatus(
        conversation("Appointment ni Juan ano status?"),
        "resident",
      ),
    ).toBe(false);
  });

  it.each([
    "Ano na appointment ko?",
    "Ano nangyari sa appointment ko?",
    "Ano na nangyare sa appointment ko?",
    "Na approve na ba?",
    "Na-approve naba?",
    "Pending pa?",
    "Confirmed na?",
    "Ano service ko?",
    "What happened to my appointment?",
  ])("recognizes a direct own-appointment paraphrase: %s", (message) => {
    expect(
      shouldLoadResidentAppointmentStatus(conversation(message), "resident"),
    ).toBe(true);
  });

  it.each([
    "Confirmed na?",
    "Kailan?",
    "Anong oras?",
    "Nabago ba schedule?",
    "Has it been approved?",
    "When is it?",
  ])("keeps own-appointment follow-up context for: %s", (message) => {
    expect(
      shouldLoadResidentAppointmentStatus(
        conversation(
          "Ano na nangyare sa appointment ko?",
          "Pending pa ito.",
          message,
        ),
        "resident",
      ),
    ).toBe(true);
  });

  it("answers own-appointment time follow-ups from only the approved summary", () => {
    const response = residentAppointmentStatusResponseFor(
      "Anong oras?",
      "resident",
      [
        {
          status: "confirmed",
          serviceType: "Immunization",
          scheduledDate: "2026-10-07",
          startTime: "09:00:00",
          scheduleChanged: true,
        },
      ],
      true,
      true,
    );

    expect(response?.message).toMatch(/7, 2026, 9:00 AM/);
    expect(response?.message).not.toMatch(/resident|assigned staff|reason/i);
    expect(response?.actions).toEqual([
      expect.objectContaining({ actionId: "open_appointments" }),
    ]);
  });

  it("identifies live announcement and health-center provenance in follow-ups", () => {
    const announcement = {
      type: "announcement",
      label: "Announcement",
      title: "Bakuna",
      content: "Vaccination activity.",
      publishAt: "2026-09-25T00:00:00.000Z",
      eventStartAt: "2026-09-28T01:00:00.000Z",
      expiresAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:00.000Z",
    };
    const healthCenter = {
      type: "health_center",
      label: "Health Center Information",
      title: "Brgy. Bagongpook Health Center",
      content:
        "Health center: Brgy. Bagongpook Health Center\nContact number: 0917 000 0000",
      updatedAt: "2026-09-25T00:00:00.000Z",
    };

    expect(
      announcementConversationResponseFor(
        conversation(
          "Ano latest announcement?",
          "Ang latest ay Bakuna.",
          "Sure ba yan?",
        ),
        [announcement],
        new Date("2026-09-26T00:00:00.000Z"),
      )?.message,
    ).toContain("current verified announcement");
    expect(
      healthCenterConversationResponseFor(
        conversation(
          "Ano contact ng health center?",
          "0917 000 0000",
          "Saan galing yan?",
        ),
        [healthCenter],
      )?.message,
    ).toContain("verified public Health Center Information");
    expect(
      healthCenterConversationResponseFor(
        conversation(
          "Anong oras bukas health center?",
          "Walang verified opening hours.",
          "Number naman?",
        ),
        [healthCenter],
      )?.message,
    ).toContain("0917 000 0000");
  });

  it("identifies FAQ and canonical schedule provenance", () => {
    const faq = {
      type: "faq",
      label: "FAQ",
      title: "How appointment review works",
      content: "Resident requests wait for health-center review.",
      updatedAt: "2026-09-25T00:00:00.000Z",
    };
    const faqResponse = faqConversationResponseFor(
      conversation(
        "What does the FAQ say about appointment review?",
        "It says requests wait for review.",
        "Can I verify that?",
      ),
      [faq],
    );
    const scheduleResponse = systemKnowledgeResponseFor(
      conversation(
        "Kailan ang immunization?",
        "Tuwing unang Miyerkules ng buwan.",
        "Sigurado ka?",
      ),
      "resident",
    );

    expect(faqResponse?.message).toContain("current verified FAQ");
    expect(faqResponse?.sources).toEqual([faq]);
    expect(scheduleResponse?.message).toContain(
      "canonical verified Barangay Bagongpook",
    );
    expect(scheduleResponse?.actions).toEqual([
      expect.objectContaining({ actionId: "open_health_center" }),
    ]);
  });

  it("supports the required end-to-end appointment workflow follow-ups", () => {
    const initial = workflowResponseFor("Paano mag appointment?", "resident");
    const location = workflowConversationResponseFor(
      conversation(
        "Paano mag appointment?",
        "Buksan ang My Appointments.",
        "Saan ko yun gagawin?",
      ),
      "resident",
    );
    const approval = systemKnowledgeResponseFor(
      conversation(
        "Paano mag appointment?",
        "Buksan ang My Appointments.",
        "Pag nagrequest ako approved agad?",
      ),
      "resident",
    );

    expect(initial?.actions).toEqual([
      expect.objectContaining({ actionId: "open_appointment_request_form" }),
    ]);
    expect(location?.actions).toEqual([
      expect.objectContaining({ actionId: "open_appointment_request_form" }),
    ]);
    expect(approval?.message).toMatch(/Pending muna|hindi automatic/i);
  });

  it("keeps exact service schedule facts deterministic", () => {
    expect(
      serviceScheduleResponseFor("Kailan ang immunization?")?.message,
    ).toContain("unang Miyerkules ng buwan");
  });

  it("provides only approved human escalation actions", () => {
    const resident = humanEscalationResponseFor(
      "May doctor ba bukas?",
      "resident",
    );
    const nurse = humanEscalationResponseFor("May doctor ba bukas?", "nurse");

    expect(resident.message).toContain("Barangay Health Center");
    expect(resident.actions.map(({ actionId }) => actionId)).toEqual([
      "open_health_center",
      "open_inquiries",
    ]);
    expect(nurse.actions.map(({ actionId }) => actionId)).toEqual([
      "open_health_center",
    ]);
  });

  it("keeps medical safety ahead of established system context", () => {
    expect(
      safetyResponseFor("Anong gamot sa mataas na blood pressure?")?.category,
    ).toBe("medical_boundary");
    expect(
      safetyResponseFor("Masakit dibdib ko, ano sakit ko?")?.category,
    ).toBe("emergency_guidance");
  });

  it("gives Gemini only bounded approved system knowledge", () => {
    const messages = conversation("Explain Resident registration please");
    const grounding = systemKnowledgeGroundingFor(messages, "resident");
    const providerInput = buildProviderInput(messages, grounding);
    const instruction = buildSystemInstruction("resident");

    expect(grounding.length).toBeGreaterThan(0);
    expect(providerInput).toContain("VERIFIED ALAGA-SYS GROUNDING");
    expect(providerInput).toContain("Resident registration workflow");
    expect(instruction).toContain(
      "language understanding and concise conversational composition only",
    );
    expect(instruction).toContain("you do not decide authorization");
  });
});
