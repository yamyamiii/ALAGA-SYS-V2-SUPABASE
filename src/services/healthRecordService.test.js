import { describe, expect, it, vi } from "vitest";

import {
  buildHealthRecordListParameters,
  createHealthRecordService,
  HealthRecordServiceError,
} from "@/services/healthRecordService";

const encounterId = "11111111-1111-4111-8111-111111111111";
const residentId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";

describe("health-record service", () => {
  it("builds server-side pagination and explicit filters", () => {
    expect(
      buildHealthRecordListParameters({
        search: " ENC-1 ",
        status: "draft",
        page: 3,
        page_size: 20,
      }),
    ).toEqual(
      expect.objectContaining({
        p_search: "ENC-1",
        p_status: "draft",
        p_limit: 20,
        p_offset: 40,
      }),
    );
  });

  it("creates from an appointment through the trusted idempotent RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: encounterId, encounter_number: "ENC-2026-000001" }],
      error: null,
    });
    const service = createHealthRecordService(() => ({ rpc }));
    await service.create(
      {
        resident_id: residentId,
        appointment_id: appointmentId,
        encounter_type: "general_consultation",
        encounter_date: "2026-07-26",
      },
      "44444444-4444-4444-8444-444444444444",
    );
    expect(rpc).toHaveBeenCalledWith(
      "health_encounter_create",
      expect.objectContaining({
        p_resident_id: residentId,
        p_appointment_id: appointmentId,
        p_request_key: "44444444-4444-4444-8444-444444444444",
      }),
    );
  });

  it("uses expected versions for draft updates and signing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: encounterId, version: 3 }],
      error: null,
    });
    const service = createHealthRecordService(() => ({ rpc }));
    const encounter = { id: encounterId, version: 2 };
    await service.sign(encounter);
    expect(rpc).toHaveBeenCalledWith("health_encounter_sign", {
      p_encounter_id: encounterId,
      p_expected_version: 2,
    });
  });

  it("maps duplicate, stale, signed, and permission failures safely", async () => {
    for (const [message, code] of [
      ["an encounter already exists", "encounter_exists"],
      ["health encounter was changed by another user", "stale_encounter"],
      ["signed health encounters are immutable", "signed_record_immutable"],
      ["you are not authorized", "permission_denied"],
    ]) {
      const service = createHealthRecordService(() => ({
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }),
      }));
      await expect(service.get(encounterId)).rejects.toEqual(
        expect.objectContaining({ code }),
      );
    }
  });

  it("rejects invalid identifiers before making a clinical request", async () => {
    const rpc = vi.fn();
    const service = createHealthRecordService(() => ({ rpc }));
    await expect(service.get("ENC-2026-000001")).rejects.toBeInstanceOf(
      HealthRecordServiceError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails safely while offline without sending a clinical request", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    const rpc = vi.fn();
    const service = createHealthRecordService(() => ({ rpc }));

    await expect(service.list({ page: 1, page_size: 20 })).rejects.toEqual(
      expect.objectContaining({ code: "offline" }),
    );
    expect(rpc).not.toHaveBeenCalled();
    online.mockRestore();
  });
});
