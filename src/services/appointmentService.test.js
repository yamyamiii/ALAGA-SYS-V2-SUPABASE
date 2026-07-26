import { describe, expect, it, vi } from "vitest";

import {
  AppointmentServiceError,
  buildAppointmentListParameters,
  createAppointmentService,
} from "@/services/appointmentService";

const appointmentId = "11111111-1111-4111-8111-111111111111";
const residentId = "22222222-2222-4222-8222-222222222222";
const requestKey = "33333333-3333-4333-8333-333333333333";

function rpcClient(result) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("appointment service", () => {
  it("builds bounded server pagination and explicit filters", () => {
    expect(
      buildAppointmentListParameters({
        search: " APT-1 ",
        page: 3,
        page_size: 20,
        status: "pending",
      }),
    ).toEqual(
      expect.objectContaining({
        p_search: "APT-1",
        p_status: "pending",
        p_limit: 20,
        p_offset: 40,
        p_include_archived: false,
      }),
    );
  });

  it("creates through the trusted idempotent RPC without direct table writes", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000001",
          version: 1,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);
    const values = {
      resident_id: residentId,
      appointment_type: "scheduled",
      service_type: "General Consultation",
      scheduled_date: "2026-08-01",
      start_time: "08:00",
      end_time: "08:30",
      priority: "normal",
      assigned_staff_id: "",
      reason: "Routine visit",
      operational_notes: "",
    };

    await expect(
      service.createAppointment(values, requestKey),
    ).resolves.toMatchObject({ appointment_number: "APT-2026-000001" });
    expect(client.rpc).toHaveBeenCalledWith(
      "appointment_create",
      expect.objectContaining({
        p_resident_id: residentId,
        p_assigned_staff_id: null,
        p_request_key: requestKey,
      }),
    );
  });

  it("maps conflict and permission failures to safe actionable errors", async () => {
    const conflict = createAppointmentService(() =>
      rpcClient({
        data: null,
        error: {
          code: "23P01",
          message: "Staff schedule conflicts with appointment APT-2026-000001",
        },
      }),
    );
    await expect(conflict.listQueue({ date: "2026-08-01" })).rejects.toEqual(
      expect.objectContaining({ code: "schedule_conflict" }),
    );

    const denied = createAppointmentService(() =>
      rpcClient({
        data: null,
        error: { code: "42501", message: "permission denied" },
      }),
    );
    await expect(denied.getDashboardSummary()).rejects.toEqual(
      expect.objectContaining({ code: "permission_denied" }),
    );
  });

  it("rejects invalid detail identifiers before querying Supabase", async () => {
    const client = { from: vi.fn() };
    const service = createAppointmentService(() => client);
    await expect(
      service.getAppointment("APT-2026-000001"),
    ).rejects.toBeInstanceOf(AppointmentServiceError);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns a specific not-found error for a hidden or missing appointment", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const service = createAppointmentService(() => ({
      from: vi.fn(() => ({ select })),
    }));

    await expect(service.getAppointment(appointmentId)).rejects.toEqual(
      expect.objectContaining({ code: "appointment_not_found" }),
    );
    expect(eq).toHaveBeenCalledWith("id", appointmentId);
    expect(maybeSingle).toHaveBeenCalledOnce();
  });
});
