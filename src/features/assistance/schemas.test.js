import { describe, expect, it } from "vitest";

import {
  announcementSchema,
  faqSchema,
  healthCenterSchema,
  inquirySchema,
  parseList,
} from "@/features/assistance/schemas";

describe("assistance schemas", () => {
  it("requires announcement expiry to follow publication", () => {
    const values = {
      title: "Clinic schedule",
      category: "clinic_schedule",
      content: "The clinic opens at eight.",
      publish_now: false,
      publish_at: "2026-07-27T08:00",
      event_start_at: "",
      event_end_at: "",
      expires_at: "2026-07-27T07:59",
      is_pinned: false,
    };
    expect(announcementSchema.safeParse(values).success).toBe(false);
    expect(
      announcementSchema.safeParse({
        ...values,
        expires_at: "2026-07-28T08:00",
      }).success,
    ).toBe(true);
  });

  it("keeps event timing optional and validates an optional event end", () => {
    const values = {
      title: "Vaccination activity",
      category: "health_event",
      content: "Vaccination activity information.",
      publish_now: true,
      publish_at: "2026-09-25T08:00",
      event_start_at: "",
      event_end_at: "",
      expires_at: "",
      is_pinned: false,
    };

    expect(announcementSchema.safeParse(values).success).toBe(true);
    expect(
      announcementSchema.safeParse({
        ...values,
        event_start_at: "2026-09-26T13:45",
      }).success,
    ).toBe(true);
    expect(
      announcementSchema.safeParse({
        ...values,
        event_end_at: "2026-09-26T15:00",
      }).success,
    ).toBe(false);
    expect(
      announcementSchema.safeParse({
        ...values,
        event_start_at: "2026-09-26T13:45",
        event_end_at: "2026-09-26T13:30",
      }).success,
    ).toBe(false);
    expect(
      announcementSchema.safeParse({
        ...values,
        event_start_at: "2026-09-26T13:45",
        event_end_at: "2026-09-26T15:00",
      }).success,
    ).toBe(true);
  });

  it("bounds FAQ and inquiry content before RPC submission", () => {
    expect(
      faqSchema.safeParse({
        category: "general",
        question: "How do I contact the center?",
        answer: "Use the contact page.",
        display_order: "1",
      }).success,
    ).toBe(true);
    expect(
      inquirySchema.safeParse({
        category: "general",
        subject: "Help",
        message: "x".repeat(5001),
      }).success,
    ).toBe(false);
  });

  it("trims public-information list entries and removes blanks", () => {
    expect(parseList(" Doctor One \n\n Nurse Two ")).toEqual([
      "Doctor One",
      "Nurse Two",
    ]);
  });

  it("bounds health-center list fields and validates contact email", () => {
    const values = {
      health_center_name: "Brgy. Bagongpook Health Center",
      address: "",
      contact_number: "",
      email: "center@example.test",
      operating_hours: "",
      emergency_contacts: [],
      services_offered: [],
      doctors: [],
      midwives: [],
      nurses: [],
      bhws: [],
      version: 1,
    };
    expect(healthCenterSchema.safeParse(values).success).toBe(true);
    expect(
      healthCenterSchema.safeParse({
        ...values,
        email: "not-an-email",
      }).success,
    ).toBe(false);
    expect(
      healthCenterSchema.safeParse({
        ...values,
        emergency_contacts: Array.from({ length: 21 }, () => "Contact"),
      }).success,
    ).toBe(false);
  });
});
