import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHealthEventService } from "./healthEventService";
describe("trusted health event service", () => {
  let rpc, service;
  beforeEach(() => {
    rpc = vi.fn().mockReturnValue({
      abortSignal: vi
        .fn()
        .mockResolvedValue({ data: { id: "event" }, error: null }),
    });
    service = createHealthEventService(() => ({ rpc }));
  });
  it("Resident booking submits only symbolic event, request key and waitlist intent", async () => {
    await service.book("event", "key");
    expect(rpc).toHaveBeenCalledWith("health_event_book", {
      p_event_id: "event",
      p_request_key: "key",
      p_join_waitlist: false,
    });
  });
  it("waitlist uses the same trusted booking boundary", async () => {
    await service.book("event", "key", true);
    expect(rpc.mock.calls[0][1].p_join_waitlist).toBe(true);
  });
  it.each(["", "   ", undefined])(
    "blank cancellation %s is SQL NULL",
    async (reason) => {
      await service.cancelBooking({ id: "booking", version: 3 }, reason);
      expect(rpc.mock.calls[0][1]).toEqual({
        p_booking_id: "booking",
        p_expected_version: 3,
        p_reason: null,
      });
    },
  );
  it("supplied cancellation is trimmed", async () => {
    await service.cancelBooking(
      { id: "booking", version: 1 },
      " changed plans ",
    );
    expect(rpc.mock.calls[0][1].p_reason).toBe("changed plans");
  });
  it("manager save forwards optimistic version and explicit selected team", async () => {
    await service.save(
      { id: "e", version: 4 },
      {
        title: " Event ",
        service_type: "Immunization",
        event_date: "2099-01-01",
        start_time: "08:00",
        end_time: "12:00",
        capacity: 60,
        staff_ids: ["staff"],
        publish: true,
        notify: true,
      },
      "key",
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_id: "e",
      p_expected_version: 4,
      p_title: "Event",
      p_capacity: 60,
      p_staff_ids: ["staff"],
      p_request_key: "key",
    });
  });
  it("pagination is bounded", async () => {
    await service.list({ page: -9, page_size: 100 });
    expect(rpc.mock.calls[0][1]).toEqual({
      p_include_archived: false,
      p_event_id: null,
      p_limit: 50,
      p_offset: 0,
    });
  });
  it.each(["42501", "40001", "23P01", "P0001"])(
    "maps %s safely without leaking DB internals",
    async (code) => {
      rpc.mockReturnValue({
        abortSignal: () =>
          Promise.resolve({ error: { code, message: "private raw detail" } }),
      });
      await expect(service.book("event", "key")).rejects.toMatchObject({
        code,
      });
      await expect(service.book("event", "key")).rejects.not.toThrow(
        "private raw detail",
      );
    },
  );
  it("reports, queue and history use minimized RPCs only", async () => {
    await service.report("2099-01-01", "2099-01-02");
    await service.queue("e");
    await service.history("e");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "health_event_report",
      "health_event_queue",
      "health_event_history_list",
    ]);
  });
});
