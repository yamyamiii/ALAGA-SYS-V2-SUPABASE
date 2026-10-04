import { describe, expect, it, vi } from "vitest";
import { createResidentHealthHistoryService } from "@/services/residentHealthHistoryService";

const id = "30000000-0000-4000-8000-000000000001";
const client = (data, error = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, service: createResidentHealthHistoryService(() => ({ rpc })) };
};
describe("Resident-only health history service", () => {
  it("uses only the trusted own-history RPC and ignores supplied identity/filter fields", async () => {
    const { rpc, service } = client({ items: [], total: 0 });
    expect(
      await service.list({
        page: 2,
        page_size: 20,
        resident_id: id,
        status: "draft",
        include_archived: true,
      }),
    ).toEqual({ items: [], total: 0 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "resident_health_history_list",
      { p_limit: 20, p_offset: 20 },
    );
  });
  it("retrieves a finalized entry using an ID only as a selector", async () => {
    const record = {
      status: "finalized",
      summary: { assessment: "Recorded summary" },
    };
    const { service, rpc } = client(record);
    expect(await service.get(id)).toEqual(record);
    expect(rpc).toHaveBeenCalledWith("resident_health_history_get", {
      p_encounter_id: id,
    });
  });
  it("missing/cross-Resident selectors use the same safe unavailable error", async () => {
    const { service } = client(null);
    await expect(service.get(id)).rejects.toMatchObject({
      code: "history_not_found",
    });
  });
  it.each([undefined, "not-a-uuid", "../../residents"])(
    "rejects invalid selector %s locally",
    async (value) => {
      const { service, rpc } = client(null);
      await expect(service.get(value)).rejects.toMatchObject({
        code: "history_not_found",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it.each([{ page: 0 }, { page: 1.5 }, { page_size: 101 }, { page_size: 0 }])(
    "rejects invalid pagination %j",
    async (filters) => {
      const { service, rpc } = client(null);
      await expect(service.list(filters)).rejects.toMatchObject({
        code: "invalid_pagination",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("maps authorization failure without logging or exposing provider details", async () => {
    const { service } = client(null, {
      code: "42501",
      message: "PRIVATE clinical text",
    });
    const error = await service.list().catch((failure) => failure);
    expect(error.code).toBe("permission_denied");
    expect(error.message).not.toContain("PRIVATE");
  });
  it("maps offline/server failure safely", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("PRIVATE response"));
    const service = createResidentHealthHistoryService(() => ({ rpc }));
    await expect(service.list()).rejects.toMatchObject({
      code: "history_unavailable",
      message: "Your health history could not be loaded. Please try again.",
    });
  });
  it("times out a stalled RPC without exposing clinical content", async () => {
    vi.useFakeTimers();
    try {
      const service = createResidentHealthHistoryService(() => ({
        rpc: () => new Promise(() => {}),
      }));
      const result = service.list().catch((error) => error);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await result).toMatchObject({ code: "history_unavailable" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects malformed list responses", async () => {
    const { service } = client({ items: null, total: 0 });
    await expect(service.list()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
  it("exposes no mutation methods", () => {
    expect(Object.keys(client(null).service)).toEqual(["list", "get"]);
  });
});
