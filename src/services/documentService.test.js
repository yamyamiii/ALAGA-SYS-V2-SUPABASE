import { describe, expect, it, vi } from "vitest";

import { DOCUMENT_TYPES } from "@/features/documents/constants";
import {
  createDocumentService,
  DocumentServiceError,
} from "@/services/documentService";

const recordId = "11111111-1111-4111-8111-111111111111";

describe("document service boundary", () => {
  it("calls only the narrow RPC for the selected document", async () => {
    const payload = {
      document_type: DOCUMENT_TYPES.APPOINTMENT_SLIP,
      appointment_number: "APT-2026-000001",
    };
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
    const service = createDocumentService(() => ({ rpc }));

    await expect(
      service.getDocument(DOCUMENT_TYPES.APPOINTMENT_SLIP, recordId),
    ).resolves.toEqual(payload);
    expect(rpc).toHaveBeenCalledWith("document_appointment_slip", {
      p_appointment_id: recordId,
    });
  });

  it("rejects a malformed raw record ID before a request", async () => {
    const rpc = vi.fn();
    const service = createDocumentService(() => ({ rpc }));
    await expect(
      service.getDocument(DOCUMENT_TYPES.CONSULTATION_SUMMARY, "ENC-1"),
    ).rejects.toMatchObject({ code: "invalid_document_id" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database authorization failures without leaking provider details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "document access denied secret detail" },
    });
    const service = createDocumentService(() => ({ rpc }));
    await expect(
      service.getDocument(DOCUMENT_TYPES.CONSULTATION_SUMMARY, recordId),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "permission_denied",
        message: "You do not have permission to generate this document.",
      }),
    );
  });

  it("never sends a browser-supplied resident ID in referral saves", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: recordId,
          referral_number: "REF-2026-000001",
          status: "draft",
          version: 1,
        },
      ],
      error: null,
    });
    const service = createDocumentService(() => ({ rpc }));
    await service.saveReferral(
      recordId,
      {
        receiving_facility: "Lipa City Hospital",
        reason_for_referral: "Further evaluation",
        clinical_summary: "Clinician-approved concise summary",
        resident_id: "22222222-2222-4222-8222-222222222222",
      },
      null,
      "33333333-3333-4333-8333-333333333333",
    );
    const parameters = rpc.mock.calls[0][1];
    expect(parameters).not.toHaveProperty("resident_id");
    expect(parameters).not.toHaveProperty("p_resident_id");
    expect(parameters.p_encounter_id).toBe(recordId);
  });

  it("uses typed service errors", () => {
    expect(new DocumentServiceError("test", "message")).toBeInstanceOf(Error);
  });
});
