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
  it("loads BHW dashboard totals from authorized aggregate and list RPCs", async () => {
    const client = clientReturning([
      {
        active_residents: 2,
        pending_requests: 1,
        appointments_today: 1,
      },
      [{ total_count: 3 }],
    ]);
    const service = createReportService(() => client);

    await expect(service.loadDashboard("2026-08-10")).resolves.toEqual({
      active_residents: 2,
      total_appointments: 3,
      pending_requests: 1,
      appointments_today: 1,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, "report_overview_summary", {
      p_start_date: "2026-08-10",
      p_end_date: "2026-08-10",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(
      2,
      "appointment_list",
      expect.objectContaining({
        p_date_from: null,
        p_date_to: null,
        p_include_archived: false,
        p_limit: 1,
        p_offset: 0,
      }),
    );
    expect(client.from).toBeUndefined();
  });

  it("does not turn dashboard authorization failures into zero counts", async () => {
    const client = {
      rpc: vi.fn((name) =>
        Promise.resolve(
          name === "report_overview_summary"
            ? { data: null, error: { message: "permission denied" } }
            : { data: [{ total_count: 3 }], error: null },
        ),
      ),
    };
    const service = createReportService(() => client);

    await expect(service.loadDashboard("2026-08-10")).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("rejects malformed dashboard aggregates instead of showing false zeroes", async () => {
    const client = clientReturning([
      { active_residents: 2, appointments_today: 1 },
      [{ total_count: 3 }],
    ]);
    const service = createReportService(() => client);

    await expect(service.loadDashboard("2026-08-10")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("builds the overview only from authorized resident and appointment aggregates", async () => {
    const client = clientReturning([
      {
        active_residents: 7,
        households: 3,
        appointments_today: 2,
        pending_requests: 1,
        checked_in_queue: 1,
        signed_encounters: 5,
        active_pregnancies: 4,
        active_child_profiles: 6,
        immunizations_due: 2,
      },
      {
        total: 9,
        completed: 4,
        cancelled: 1,
        status_counts: { confirmed: 3 },
      },
    ]);
    const service = createReportService(() => client);

    await expect(service.load("overview", filters)).resolves.toEqual({
      summary: {
        active_residents: 7,
        total_appointments: 9,
        pending_requests: 1,
        confirmed_appointments: 3,
        completed_appointments: 4,
        cancelled_appointments: 1,
        appointments_today: 2,
        checked_in_queue: 1,
      },
    });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      "report_overview_summary",
      "report_appointment_summary",
    ]);
  });

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

  it("removes legacy overview metrics from downloaded exports", async () => {
    const client = clientReturning([
      [
        {
          row_data: { metric: "Active Pregnancies", value: 4 },
          total_count: 9,
        },
      ],
      {
        active_residents: 7,
        appointments_today: 2,
        pending_requests: 1,
        checked_in_queue: 1,
      },
      {
        total: 9,
        completed: 4,
        cancelled: 1,
        status_counts: { confirmed: 3 },
      },
    ]);
    const service = createReportService(() => client);
    const result = await service.exportRows("overview", filters, "csv");

    expect(result.total).toBe(8);
    expect(result.rows).toContainEqual({
      metric: "Total appointments",
      value: 9,
    });
    expect(result.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "Active Pregnancies" }),
      ]),
    );
  });

  it("limits staff workload downloads to appointment workload fields", async () => {
    const client = clientReturning([
      [
        {
          row_data: {
            staff: "Nora Nurse",
            role: "nurse",
            assigned_appointments: 8,
            completed_appointments: 6,
            clinical_encounters: 5,
            maternal_child_events: 2,
          },
          total_count: 1,
        },
      ],
    ]);
    const service = createReportService(() => client);

    await expect(
      service.exportRows("staff_workload", filters, "excel"),
    ).resolves.toEqual({
      rows: [
        {
          staff: "Nora Nurse",
          role: "nurse",
          assigned_appointments: 8,
          completed_appointments: 6,
        },
      ],
      total: 1,
    });
  });
});
