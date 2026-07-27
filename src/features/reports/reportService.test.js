import { describe, expect, it, vi } from "vitest";

import { createReportService } from "@/services/reportService";

const filters = {
  start_date: "2026-07-01",
  end_date: "2026-07-27",
  purok_id: "",
  service_type: "",
  status: "",
  staff_id: "",
};

function clientReturning(values) {
  let call = 0;
  return {
    rpc: vi.fn((_name, _parameters) =>
      Promise.resolve({ data: values[call++], error: null }),
    ),
  };
}

describe("report service", () => {
  it("loads only the selected report category", async () => {
    const client = clientReturning([{ total: 2 }]);
    const service = createReportService(() => client);
    await expect(service.load("health_records", filters)).resolves.toEqual({
      summary: { total: 2 },
    });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("report_health_summary", {
      p_start_date: "2026-07-01",
      p_end_date: "2026-07-27",
      p_purok_id: null,
      p_staff_id: null,
    });
  });

  it("uses aggregate RPCs for the resident report", async () => {
    const client = clientReturning([
      { active_residents: 7 },
      [{ label: "Purok 1", value: 7 }],
      [{ label: "18–59", value: 7 }],
    ]);
    const service = createReportService(() => client);
    const result = await service.load("residents", filters);
    expect(result.summary.active_residents).toBe(7);
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      "report_registry_summary",
      "report_residents_by_purok",
      "report_residents_by_age_group",
    ]);
  });

  it("sends bounded, normalized export arguments and unwraps safe rows", async () => {
    const client = clientReturning([
      [{ row_data: { metric: "Completed", value: 4 }, total_count: 1 }],
    ]);
    const service = createReportService(() => client);
    await expect(
      service.exportRows("appointments", filters, "csv"),
    ).resolves.toEqual({
      rows: [{ metric: "Completed", value: 4 }],
      total: 1,
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "report_export_rows",
      expect.objectContaining({ p_limit: 5000, p_offset: 0, p_format: "csv" }),
    );
  });
});
