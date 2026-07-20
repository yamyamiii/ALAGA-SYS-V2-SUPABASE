import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildHouseholdListParameters,
  buildResidentListParameters,
  createRegistryService,
  RegistryServiceError,
} from "@/services/registryService";

describe("registry service", () => {
  it("builds bounded server pagination parameters", () => {
    expect(
      buildHouseholdListParameters({
        search: "  HH-2026 ",
        page: 3,
        page_size: 20,
        status: "archived",
      }),
    ).toMatchObject({
      p_search: "HH-2026",
      p_include_archived: true,
      p_limit: 20,
      p_offset: 40,
    });
    expect(
      buildResidentListParameters({
        page: 2,
        page_size: 50,
        is_pwd: "false",
        is_senior_citizen: "true",
      }),
    ).toMatchObject({
      p_is_pwd: false,
      p_is_senior_citizen: true,
      p_limit: 50,
      p_offset: 50,
    });
  });

  it("uses the RLS-preserving RPC and returns total count", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "one", total_count: 12 }],
      error: null,
    });
    const service = createRegistryService(() => ({ rpc }));
    const result = await service.listResidents({ page: 1, page_size: 10 });
    expect(rpc).toHaveBeenCalledWith(
      "registry_list_residents",
      expect.objectContaining({ p_limit: 10, p_offset: 0 }),
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

  it("contains no permanent-delete or service-role browser path", () => {
    const source = fs.readFileSync("src/services/registryService.js", "utf8");
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/service[_-]?role/i);
  });
});
