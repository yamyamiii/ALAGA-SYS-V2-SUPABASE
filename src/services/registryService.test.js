import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildHouseholdListParameters,
  buildResidentListParameters,
  createRegistryService,
  RegistryServiceError,
  validateResidentPhoto,
} from "@/services/registryService";

const barangayId = "11111111-1111-4111-8111-111111111111";
const residentId = "33333333-3333-4333-8333-333333333333";
const deploymentRows = Array.from({ length: 7 }, (_, index) => ({
  barangay_id: barangayId,
  barangay_name: "Brgy. Bagongpook",
  purok_id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  purok_name: `Purok ${index + 1}`,
  purok_code: `P0${index + 1}`,
}));

function deploymentRpc(result = { data: deploymentRows, error: null }) {
  return vi.fn((name) => {
    if (name === "registry_get_deployment_context") {
      return Promise.resolve(result);
    }
    return Promise.resolve({
      data: [{ id: "one", total_count: 12 }],
      error: null,
    });
  });
}

function residentDetailClient(result) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    client: { from },
    from,
    select,
    eq,
    maybeSingle,
  };
}

describe("registry service", () => {
  it("builds bounded server pagination parameters", () => {
    expect(
      buildHouseholdListParameters(
        {
          search: "  HH-2026 ",
          barangay_id: "browser-supplied-value",
          page: 3,
          page_size: 20,
          status: "archived",
        },
        barangayId,
      ),
    ).toMatchObject({
      p_search: "HH-2026",
      p_barangay_id: barangayId,
      p_include_archived: true,
      p_limit: 20,
      p_offset: 40,
    });
    expect(
      buildResidentListParameters(
        {
          page: 2,
          page_size: 50,
          is_pwd: "false",
          is_senior_citizen: "true",
        },
        barangayId,
      ),
    ).toMatchObject({
      p_is_pwd: false,
      p_is_senior_citizen: true,
      p_barangay_id: barangayId,
      p_limit: 50,
      p_offset: 50,
    });
  });

  it("uses the RLS-preserving RPC and returns total count", async () => {
    const rpc = deploymentRpc();
    const service = createRegistryService(() => ({ rpc }));
    const result = await service.listResidents({ page: 1, page_size: 10 });
    expect(rpc).toHaveBeenCalledWith(
      "registry_list_residents",
      expect.objectContaining({
        p_barangay_id: barangayId,
        p_limit: 10,
        p_offset: 0,
      }),
    );
    expect(result).toMatchObject({ total: 12, page: 1, page_size: 10 });
  });

  it("maps database authorization failures to a safe service error", async () => {
    const service = createRegistryService(() => ({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "new row violates row-level security policy" },
      }),
    }));
    await expect(
      service.listHouseholds({ page: 1, page_size: 20 }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "RegistryServiceError",
        code: "permission_denied",
      }),
    );
    await expect(
      service.listHouseholds({ page: 1, page_size: 20 }),
    ).rejects.toBeInstanceOf(RegistryServiceError);
  });

  it.each([
    "Brgy. Bagongpook reference record is missing",
    "Brgy. Bagongpook reference record is inactive",
    "Brgy. Bagongpook reference record is duplicated",
  ])("fails clearly when deployment context reports: %s", async (message) => {
    const service = createRegistryService(() => ({
      rpc: deploymentRpc({ data: null, error: { message } }),
    }));

    await expect(service.resolveDeploymentContext()).rejects.toEqual(
      expect.objectContaining({
        code: "deployment_context_invalid",
        message,
      }),
    );
  });

  it("accepts exactly Purok 1 through Purok 7 and rejects Purok 8", async () => {
    const validService = createRegistryService(() => ({
      rpc: deploymentRpc(),
    }));
    await expect(
      validService.resolveDeploymentContext(),
    ).resolves.toMatchObject({
      puroks: expect.arrayContaining([
        expect.objectContaining({ name: "Purok 7" }),
      ]),
    });

    const invalidService = createRegistryService(() => ({
      rpc: deploymentRpc({
        data: [
          ...deploymentRows.slice(0, 6),
          { ...deploymentRows[6], purok_name: "Purok 8" },
        ],
        error: null,
      }),
    }));
    await expect(invalidService.resolveDeploymentContext()).rejects.toEqual(
      expect.objectContaining({ code: "deployment_context_invalid" }),
    );
  });

  it("derives write barangay_id from the selected database purok", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "household", household_number: "HH-2026-000001" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const service = createRegistryService(() => ({
      rpc: deploymentRpc(),
      from: vi.fn(() => ({ insert })),
    }));

    await service.createHousehold({
      barangay_id: "browser-supplied-value",
      purok_id: deploymentRows[0].purok_id,
      address_line: "Sitio Test",
      status: "active",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        barangay_id: barangayId,
        purok_id: deploymentRows[0].purok_id,
      }),
    );
    expect(insert.mock.calls[0][0]).not.toHaveProperty("latitude");
    expect(insert.mock.calls[0][0]).not.toHaveProperty("longitude");
  });

  it("loads one resident by UUID through the unambiguous household relationship", async () => {
    const row = {
      id: residentId,
      resident_number: "RES-2026-000001",
      archived_at: null,
      household: { household_number: "HH-2026-000001" },
    };
    const detail = residentDetailClient({ data: row, error: null });
    const service = createRegistryService(() => detail.client);

    await expect(service.getResident(residentId)).resolves.toEqual(row);
    expect(detail.from).toHaveBeenCalledWith("residents");
    expect(detail.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "household:households!residents_household_matches_location",
      ),
    );
    expect(detail.eq).toHaveBeenCalledWith("id", residentId);
    expect(detail.maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns a specific safe error when the resident is missing or hidden by RLS", async () => {
    const detail = residentDetailClient({ data: null, error: null });
    const service = createRegistryService(() => detail.client);

    await expect(service.getResident(residentId)).rejects.toEqual(
      expect.objectContaining({
        code: "resident_not_found",
        message:
          "The resident record was not found or is not available to your account.",
      }),
    );
  });

  it("maps an explicit authorization failure without weakening RLS", async () => {
    const detail = residentDetailClient({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table residents",
      },
    });
    const service = createRegistryService(() => detail.client);

    await expect(service.getResident(residentId)).rejects.toEqual(
      expect.objectContaining({ code: "permission_denied" }),
    );
  });

  it("allows an archived row returned by administrator RLS", async () => {
    const archivedRow = {
      id: residentId,
      resident_number: "RES-2026-000001",
      status: "archived",
      archived_at: "2026-07-20T00:00:00Z",
    };
    const detail = residentDetailClient({ data: archivedRow, error: null });
    const service = createRegistryService(() => detail.client);

    await expect(service.getResident(residentId)).resolves.toEqual(archivedRow);
  });

  it("rejects resident numbers and other non-UUID detail identifiers", async () => {
    const from = vi.fn();
    const service = createRegistryService(() => ({ from }));

    await expect(service.getResident("RES-2026-000001")).rejects.toEqual(
      expect.objectContaining({ code: "invalid_resident_id" }),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("contains no permanent-delete or service-role browser path", () => {
    const source = fs.readFileSync("src/services/registryService.js", "utf8");
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/service[_-]?role/i);
    expect(source).not.toContain(barangayId);
  });

  it("validates resident photo MIME, size, and magic bytes", async () => {
    const jpeg = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00])],
      "resident.jpg",
      { type: "image/jpeg" },
    );
    await expect(validateResidentPhoto(jpeg)).resolves.toEqual({
      mimeType: "image/jpeg",
      extension: "jpg",
    });
    const disguised = new File(["not an image"], "resident.jpg", {
      type: "image/jpeg",
    });
    await expect(validateResidentPhoto(disguised)).rejects.toMatchObject({
      code: "photo_content_invalid",
    });
    const oversized = {
      size: 5 * 1024 * 1024 + 1,
      type: "image/png",
      arrayBuffer: vi.fn(),
    };
    await expect(validateResidentPhoto(oversized)).rejects.toMatchObject({
      code: "photo_too_large",
    });
  });

  it("uses server pagination for searchable current households", async () => {
    const rpc = vi.fn((name) => {
      if (name === "registry_get_deployment_context") {
        return Promise.resolve({ data: deploymentRows, error: null });
      }
      return Promise.resolve({
        data: [{ id: "household-1", total_count: 31 }],
        error: null,
      });
    });
    const service = createRegistryService(() => ({ rpc }));
    const result = await service.searchHouseholds({
      purokId: deploymentRows[0].purok_id,
      search: "Reyes",
      page: 2,
      pageSize: 10,
    });
    expect(rpc).toHaveBeenLastCalledWith("registry_search_households", {
      p_purok_id: deploymentRows[0].purok_id,
      p_search: "Reyes",
      p_limit: 10,
      p_offset: 10,
    });
    expect(result).toMatchObject({ total: 31, page: 2 });
  });

  it("passes normalized identity inputs to the RLS-safe duplicate RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: residentId, resident_number: "RES-2026-000001" }],
      error: null,
    });
    const service = createRegistryService(() => ({ rpc }));
    await expect(
      service.findResidentDuplicates(
        {
          first_name: "Ana",
          middle_name: "",
          last_name: "Reyes",
          suffix: "",
          date_of_birth: "1990-01-01",
          sex: "female",
          phone_number: "",
        },
        residentId,
      ),
    ).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("registry_find_resident_duplicates", {
      p_first_name: "Ana",
      p_middle_name: null,
      p_last_name: "Reyes",
      p_suffix: null,
      p_date_of_birth: "1990-01-01",
      p_sex: "female",
      p_phone_number: null,
      p_exclude_id: residentId,
    });
  });

  it("removes the old photo only after upload and database update succeed", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({
      data: { id: residentId, photo_path: "new-path" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const service = createRegistryService(() => ({
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => ({ update })),
    }));
    const file = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xdb])],
      "resident.jpg",
      { type: "image/jpeg" },
    );
    await service.uploadResidentPhoto(residentId, file, "old/photo.jpg");
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^${residentId}/[0-9a-f-]{36}\\.jpg$`, "i"),
      ),
      file,
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
    expect(remove).toHaveBeenCalledWith(["old/photo.jpg"]);
  });

  it("rolls back the new object and preserves the old path when database attachment fails", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    const service = createRegistryService(() => ({
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
        })),
      })),
    }));
    const file = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xdb])],
      "resident.jpg",
      { type: "image/jpeg" },
    );
    await expect(
      service.uploadResidentPhoto(residentId, file, "old/photo.jpg"),
    ).rejects.toMatchObject({ code: "registry_request_failed" });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalledWith(["old/photo.jpg"]);
  });

  it("creates short-lived signed URLs without exposing a public URL", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.invalid/signed" },
      error: null,
    });
    const service = createRegistryService(() => ({
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    }));
    await expect(
      service.createResidentPhotoUrl(`${residentId}/photo.jpg`),
    ).resolves.toBe("https://example.invalid/signed");
    expect(createSignedUrl).toHaveBeenCalledWith(
      `${residentId}/photo.jpg`,
      300,
    );
  });
});
