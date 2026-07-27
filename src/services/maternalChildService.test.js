import { describe, expect, it, vi } from "vitest";

import {
  createMaternalChildService,
  MaternalChildServiceError,
} from "@/services/maternalChildService";

const recordId = "11111111-1111-4111-8111-111111111111";

describe("maternal-child service", () => {
  it("uses trusted server pagination for pregnancy lists", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const service = createMaternalChildService(() => ({ rpc }));
    await service.listPregnancies({
      search: " MAT-1 ",
      status: "active",
      page: 3,
      page_size: 20,
    });
    expect(rpc).toHaveBeenCalledWith("maternal_pregnancy_list", {
      p_search: "MAT-1",
      p_status: "active",
      p_limit: 20,
      p_offset: 40,
    });
  });

  it("normalizes child age groups to the deployed RPC contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const service = createMaternalChildService(() => ({ rpc }));
    await service.listChildren({
      search: "",
      age_group: "1_to_4",
      immunization_status: "due",
      page: 1,
      page_size: 20,
    });
    expect(rpc).toHaveBeenCalledWith(
      "child_profile_list",
      expect.objectContaining({
        p_age_min: 1,
        p_age_max: 4,
        p_limit: 20,
        p_offset: 0,
      }),
    );
  });

  it("sends creation through idempotent trusted RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: recordId, pregnancy_number: "MAT-2026-000001" }],
      error: null,
    });
    const service = createMaternalChildService(() => ({ rpc }));
    const requestKey = "22222222-2222-4222-8222-222222222222";
    await service.savePregnancy({ resident_id: recordId }, null, requestKey);
    expect(rpc).toHaveBeenCalledWith(
      "maternal_pregnancy_save",
      expect.objectContaining({
        p_id: null,
        p_expected_version: null,
        p_request_key: requestKey,
      }),
    );
  });

  it("uses expected versions for concurrent archive protection", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ id: recordId }], error: null });
    const service = createMaternalChildService(() => ({ rpc }));
    await service.archive("child_profile", { id: recordId, version: 4 });
    expect(rpc).toHaveBeenCalledWith("maternal_child_archive", {
      p_record_type: "child_profile",
      p_id: recordId,
      p_expected_version: 4,
    });
  });

  it("maps not-found and permission failures without exposing provider details", async () => {
    for (const [message, code] of [
      ["maternal-child record not found", "not_found"],
      ["maternal-child access denied", "permission_denied"],
    ]) {
      const service = createMaternalChildService(() => ({
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }),
      }));
      await expect(service.get("pregnancy", recordId)).rejects.toEqual(
        expect.objectContaining({ code }),
      );
    }
  });

  it("rejects invalid identifiers before a network request", async () => {
    const rpc = vi.fn();
    const service = createMaternalChildService(() => ({ rpc }));
    await expect(
      service.get("child", "CHD-2026-000001"),
    ).rejects.toBeInstanceOf(MaternalChildServiceError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
