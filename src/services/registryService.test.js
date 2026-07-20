import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildHouseholdListParameters,
  buildResidentListParameters,
  createRegistryService,
  RegistryServiceError,
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
      latitude: "",
      longitude: "",
      status: "active",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        barangay_id: barangayId,
        purok_id: deploymentRows[0].purok_id,
      }),
    );
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
});
