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
