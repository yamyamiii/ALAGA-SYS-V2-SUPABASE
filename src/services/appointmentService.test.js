import { describe, expect, it, vi } from "vitest";

import {
  AppointmentServiceError,
  buildAppointmentListParameters,
  buildAppointmentStaffSearchRequest,
  createAppointmentService,
} from "@/services/appointmentService";

const appointmentId = "11111111-1111-4111-8111-111111111111";
const residentId = "22222222-2222-4222-8222-222222222222";
const requestKey = "33333333-3333-4333-8333-333333333333";
const originalAppointmentId = "44444444-4444-4444-8444-444444444444";

function rpcClient(result) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("appointment service", () => {
  it("uses the deployed defaults for staff search", () => {
    expect(buildAppointmentStaffSearchRequest()).toEqual({
      page: 1,
      pageSize: 10,
      parameters: {
        p_search: null,
        p_service_type: null,
        p_limit: 10,
        p_offset: 0,
      },
    });
  });

  it("sends the first staff-search page with a zero offset", () => {
    expect(
      buildAppointmentStaffSearchRequest({
        search: " Nurse ",
        serviceType: "General Consultation",
        page: 1,
        pageSize: 10,
      }),
    ).toEqual({
      page: 1,
      pageSize: 10,
      parameters: {
        p_search: "Nurse",
        p_service_type: "General Consultation",
        p_limit: 10,
        p_offset: 0,
      },
    });
  });

  it("normalizes an empty staff search to the RPC null contract", () => {
    expect(
      buildAppointmentStaffSearchRequest({ search: "   " }).parameters,
    ).toEqual(
      expect.objectContaining({
        p_search: null,
        p_service_type: null,
      }),
    );
  });

  it("normalizes invalid and fractional staff-search pagination", () => {
    expect(
      buildAppointmentStaffSearchRequest({
        page: -4.8,
        pageSize: 9.9,
      }),
    ).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 9,
        parameters: expect.objectContaining({
          p_limit: 9,
          p_offset: 0,
        }),
      }),
    );
  });

  it("clamps staff-search page size to the RPC maximum", () => {
    expect(
      buildAppointmentStaffSearchRequest({ page: 2, pageSize: 100 }),
    ).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 25,
        parameters: expect.objectContaining({
          p_limit: 25,
          p_offset: 25,
        }),
      }),
    );
  });

  it("loads health-encounter staff without sending P0001 pagination", async () => {
    const client = {
      rpc: vi.fn(async (name, parameters) => {
        if (
          name === "appointment_search_staff" &&
          (parameters.p_limit < 1 ||
            parameters.p_limit > 25 ||
            parameters.p_offset < 0 ||
            !Number.isInteger(parameters.p_limit) ||
            !Number.isInteger(parameters.p_offset))
        ) {
          return {
            data: null,
            error: {
              code: "P0001",
              message: "invalid staff search pagination",
            },
          };
        }
        return { data: [], error: null };
      }),
    };
    const service = createAppointmentService(() => client);

    await expect(
      service.searchStaff({
        search: "",
        serviceType: "",
        page: 1,
        pageSize: 100,
      }),
    ).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
    });
    expect(client.rpc).toHaveBeenCalledWith("appointment_search_staff", {
      p_search: null,
      p_service_type: null,
      p_limit: 25,
      p_offset: 0,
    });
  });

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

  it("loads an original appointment without requesting a recursive relationship", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: appointmentId,
        appointment_number: "APT-2026-000001",
        rescheduled_from_id: null,
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select })) };
    const service = createAppointmentService(() => client);

    await expect(service.getAppointment(appointmentId)).resolves.toEqual(
      expect.objectContaining({
        appointment_number: "APT-2026-000001",
        rescheduled_from: null,
      }),
    );
    expect(client.from).toHaveBeenCalledOnce();
    expect(select.mock.calls[0][0]).not.toContain(
      "appointments_rescheduled_from_id_fkey",
    );
  });

  it("loads a replacement and its original appointment through separate RLS-protected queries", async () => {
    const replacementMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: appointmentId,
        appointment_number: "APT-2026-000002",
        rescheduled_from_id: originalAppointmentId,
      },
      error: null,
    });
    const replacementEq = vi.fn(() => ({
      maybeSingle: replacementMaybeSingle,
    }));
    const replacementSelect = vi.fn(() => ({ eq: replacementEq }));
    const originalMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: originalAppointmentId,
        appointment_number: "APT-2026-000001",
      },
      error: null,
    });
    const originalEq = vi.fn(() => ({ maybeSingle: originalMaybeSingle }));
    const originalSelect = vi.fn(() => ({ eq: originalEq }));
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce({ select: replacementSelect })
        .mockReturnValueOnce({ select: originalSelect }),
    };
    const service = createAppointmentService(() => client);

    await expect(service.getAppointment(appointmentId)).resolves.toEqual(
      expect.objectContaining({
        appointment_number: "APT-2026-000002",
        rescheduled_from: {
          id: originalAppointmentId,
          appointment_number: "APT-2026-000001",
        },
      }),
    );
    expect(client.from).toHaveBeenNthCalledWith(1, "appointments");
    expect(client.from).toHaveBeenNthCalledWith(2, "appointments");
    expect(originalEq).toHaveBeenCalledWith("id", originalAppointmentId);
    expect(originalSelect).toHaveBeenCalledWith("id, appointment_number");
  });
});
