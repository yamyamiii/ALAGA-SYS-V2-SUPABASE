import { describe, expect, it, vi } from "vitest";

import {
  AssistanceServiceError,
  createAssistanceService,
} from "@/services/assistanceService";

function serviceWith(data = []) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return { rpc, service: createAssistanceService(() => ({ rpc })) };
}

describe("assistance service", () => {
  it("normalizes bounded list pagination before calling the RPC", async () => {
    const { rpc, service } = serviceWith([]);
    await service.listAnnouncements({
      search: " clinic ",
      category: "",
      page: 0,
      page_size: 999,
    });
    expect(rpc).toHaveBeenCalledWith("announcement_list", {
      p_search: "clinic",
      p_category: null,
      p_include_archived: false,
      p_limit: 50,
      p_offset: 0,
    });
  });

  it("archives an announcement through the trusted versioned RPC", async () => {
    const { rpc, service } = serviceWith(6);
    await service.archiveAnnouncement(
      "11111111-1111-4111-8111-111111111111",
      5,
    );
    expect(rpc).toHaveBeenCalledWith("announcement_archive", {
      p_id: "11111111-1111-4111-8111-111111111111",
      p_expected_version: 5,
    });
  });

  it("preserves the existing create and edit announcement RPC contract", async () => {
    const { rpc, service } = serviceWith([{ id: "announcement-one" }]);
    const values = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Updated schedule",
      category: "clinic_schedule",
      content: "Updated PHI-free health center schedule.",
      publish_at: "2026-08-15T00:00:00.000Z",
      expires_at: "",
      is_pinned: true,
      version: 4,
      request_key: null,
    };

    await service.saveAnnouncement(values);

    expect(rpc).toHaveBeenCalledWith("announcement_save", {
      p_id: values.id,
      p_title: values.title,
      p_category: values.category,
      p_content: values.content,
      p_publish_at: values.publish_at,
      p_expires_at: null,
      p_is_pinned: true,
      p_expected_version: 4,
      p_request_key: null,
    });
  });

  it("returns recipient-scoped unread totals from notification rows", async () => {
    const { service } = serviceWith([
      { id: "one", total_count: 4, unread_count: 3 },
    ]);
    await expect(
      service.listNotifications({
        unread_only: false,
        page: 1,
        page_size: 20,
      }),
    ).resolves.toMatchObject({ total: 4, unread: 3 });
  });

  it("accepts a genuinely empty notification result without inventing records", async () => {
    const { service } = serviceWith([]);
    await expect(
      service.listNotifications({
        unread_only: true,
        page: 1,
        page_size: 20,
      }),
    ).resolves.toEqual({
      items: [],
      total: 0,
      unread: 0,
      page: 1,
      page_size: 20,
    });
  });

  it("rejects malformed notification counts instead of showing false zeroes", async () => {
    const { service } = serviceWith([
      { id: "one", total_count: 2, unread_count: null },
    ]);
    await expect(
      service.listNotifications({
        unread_only: false,
        page: 1,
        page_size: 20,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("does not convert notification authorization errors into empty counts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "notification access denied" },
    });
    const service = createAssistanceService(() => ({ rpc }));
    await expect(
      service.listNotifications({
        unread_only: false,
        page: 1,
        page_size: 20,
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("submits inquiries without a browser resident identifier", async () => {
    const { rpc, service } = serviceWith([{ id: "one" }]);
    await service.createInquiry({
      subject: "Appointment question",
      category: "appointments",
      message: "May I ask about clinic hours?",
      request_key: "11111111-1111-4111-8111-111111111111",
      resident_id: "browser-value",
    });
    expect(rpc).toHaveBeenCalledWith("inquiry_create", {
      p_subject: "Appointment question",
      p_category: "appointments",
      p_message: "May I ask about clinic hours?",
      p_request_key: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("maps database authorization failures to a safe error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "this assistance action is not authorized",
      },
    });
    const service = createAssistanceService(() => ({ rpc }));
    await expect(
      service.listActivity({ page: 1, page_size: 20 }),
    ).rejects.toEqual(expect.objectContaining({ code: "permission_denied" }));
  });

  it("fails before network access while offline", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      const { rpc, service } = serviceWith([]);
      await expect(service.getHealthCenter()).rejects.toBeInstanceOf(
        AssistanceServiceError,
      );
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(navigator, "onLine", descriptor);
      else delete navigator.onLine;
    }
  });
});
