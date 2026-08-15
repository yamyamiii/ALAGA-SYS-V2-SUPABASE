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

function sequentialRpcClient(results) {
  let call = 0;
  return {
    rpc: vi.fn(() => Promise.resolve(results[call++])),
  };
}

describe("appointment service", () => {
  it("combines Manila-day aggregates with the caller-RLS assigned total", async () => {
    const client = sequentialRpcClient([
      {
        data: [
          {
            appointments_today: 0,
            pending_appointments: 0,
            checked_in_today: 0,
            completed_today: 0,
            upcoming_appointments: 1,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: appointmentId,
            appointment_number: "APT-2026-000003",
            scheduled_date: "2026-08-12",
            total_count: 1,
          },
        ],
        error: null,
      },
    ]);
    const service = createAppointmentService(() => client);

    await expect(service.getDashboardSummary()).resolves.toMatchObject({
      assigned_appointments: 1,
      appointments_today: 0,
      upcoming_appointments: 1,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(
      1,
      "appointment_dashboard_summary",
      {},
    );
    expect(client.rpc).toHaveBeenNthCalledWith(
      2,
      "appointment_list",
      expect.objectContaining({
        p_date_from: null,
        p_date_to: null,
        p_assigned_staff_id: null,
        p_include_archived: false,
        p_limit: 1,
        p_offset: 0,
      }),
    );
  });

  it("counts historical and future assignments without inflating today's schedule", async () => {
    const client = sequentialRpcClient([
      {
        data: [
          {
            appointments_today: 0,
            pending_appointments: 0,
            checked_in_today: 0,
            completed_today: 0,
            upcoming_appointments: 1,
          },
        ],
        error: null,
      },
      { data: [{ total_count: 2 }], error: null },
    ]);
    const service = createAppointmentService(() => client);

    await expect(service.getDashboardSummary()).resolves.toMatchObject({
      assigned_appointments: 2,
      appointments_today: 0,
    });
  });

  it("rejects malformed assigned totals instead of showing a false zero", async () => {
    const client = sequentialRpcClient([
      {
        data: [
          {
            appointments_today: 0,
            pending_appointments: 0,
            checked_in_today: 0,
            completed_today: 0,
            upcoming_appointments: 1,
          },
        ],
        error: null,
      },
      { data: [{}], error: null },
    ]);
    const service = createAppointmentService(() => client);

    await expect(service.getDashboardSummary()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

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
    };

    await expect(
      service.createAppointment(values, requestKey),
    ).resolves.toMatchObject({ appointment_number: "APT-2026-000001" });
    expect(client.rpc).toHaveBeenCalledWith(
      "appointment_create",
      expect.objectContaining({
        p_resident_id: residentId,
        p_assigned_staff_id: null,
        p_operational_notes: null,
        p_request_key: requestKey,
      }),
    );
  });

  it("submits a resident request without browser-supplied ownership or staff fields", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000002",
          status: "pending",
          version: 1,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await expect(
      service.requestResidentAppointment(
        {
          service_type: "General Consultation",
          scheduled_date: "2026-08-01",
          start_time: "08:00",
          reason: " Routine visit ",
        },
        requestKey,
      ),
    ).resolves.toMatchObject({
      appointment_number: "APT-2026-000002",
      status: "pending",
    });

    expect(client.rpc).toHaveBeenCalledWith("resident_appointment_request", {
      p_service_type: "General Consultation",
      p_scheduled_date: "2026-08-01",
      p_start_time: "08:00",
      p_reason: "Routine visit",
      p_request_key: requestKey,
    });
    const payload = client.rpc.mock.calls[0][1];
    expect(payload).not.toHaveProperty("p_resident_id");
    expect(payload).not.toHaveProperty("p_assigned_staff_id");
    expect(payload).not.toHaveProperty("p_status");
    expect(payload).not.toHaveProperty("p_appointment_type");
    expect(payload).not.toHaveProperty("p_priority");
    expect(payload).not.toHaveProperty("p_end_time");
  });

  it("keeps unlinked residents blocked with health-center guidance", async () => {
    const client = rpcClient({
      data: null,
      error: {
        code: "42501",
        message: "resident account is not linked to a resident record",
      },
    });
    const service = createAppointmentService(() => client);

    await expect(
      service.requestResidentAppointment(
        {
          service_type: "General Consultation",
          scheduled_date: "2026-08-01",
          start_time: "08:00",
          reason: "Routine visit",
        },
        requestKey,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "resident_link_required",
        message: expect.stringMatching(/contact the health center/i),
      }),
    );
  });

  it("normalizes an omitted Resident reason to null without a placeholder", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000004",
          status: "pending",
          version: 1,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.requestResidentAppointment(
      {
        service_type: "General Consultation",
        scheduled_date: "2026-08-15",
        start_time: "08:00",
        reason: "   ",
      },
      requestKey,
    );

    expect(client.rpc).toHaveBeenCalledWith("resident_appointment_request", {
      p_service_type: "General Consultation",
      p_scheduled_date: "2026-08-15",
      p_start_time: "08:00",
      p_reason: null,
      p_request_key: requestKey,
    });
    expect(JSON.stringify(client.rpc.mock.calls[0][1])).not.toMatch(
      /N\/A|None|Not provided/i,
    );
  });

  it("preserves a null reason and hidden legacy notes during a staff schedule edit", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000004",
          version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.updateAppointment(
      {
        id: appointmentId,
        version: 1,
        request_source: "resident",
        operational_notes: "Legacy scheduling note",
      },
      {
        appointment_type: "scheduled",
        service_type: "General Consultation",
        scheduled_date: "2026-08-15",
        start_time: "09:00",
        end_time: "09:30",
        priority: "normal",
        assigned_staff_id: "33333333-3333-4333-8333-333333333333",
        reason: "   ",
      },
    );

    expect(client.rpc).toHaveBeenCalledWith("appointment_update_schedule", {
      p_appointment_id: appointmentId,
      p_expected_version: 1,
      p_appointment_type: "scheduled",
      p_service_type: "General Consultation",
      p_scheduled_date: "2026-08-15",
      p_start_time: "09:00",
      p_end_time: "09:30",
      p_priority: "normal",
      p_assigned_staff_id: "33333333-3333-4333-8333-333333333333",
      p_reason: null,
      p_operational_notes: "Legacy scheduling note",
    });
  });

  it("preserves and trims an existing reason during a staff schedule edit", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000004",
          version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.updateAppointment(
      { id: appointmentId, version: 1, request_source: "resident" },
      {
        appointment_type: "scheduled",
        service_type: "General Consultation",
        scheduled_date: "2026-08-15",
        start_time: "09:00",
        end_time: "09:30",
        priority: "normal",
        assigned_staff_id: "33333333-3333-4333-8333-333333333333",
        reason: " Existing reason ",
      },
    );

    expect(client.rpc).toHaveBeenCalledWith(
      "appointment_update_schedule",
      expect.objectContaining({ p_reason: "Existing reason" }),
    );
  });

  it("fails safely while offline without sending a resident request", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    const client = rpcClient({ data: [], error: null });
    const service = createAppointmentService(() => client);

    await expect(
      service.requestResidentAppointment(
        {
          service_type: "General Consultation",
          scheduled_date: "2026-08-01",
          start_time: "08:00",
          reason: "Routine visit",
        },
        requestKey,
      ),
    ).rejects.toEqual(expect.objectContaining({ code: "offline" }));
    expect(client.rpc).not.toHaveBeenCalled();
    online.mockRestore();
  });

  it("cancels a resident request through its narrow versioned RPC", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000002",
          status: "cancelled",
          version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.cancelResidentAppointment(
      { id: appointmentId, version: 1 },
      " CHANGE DATE ",
    );

    expect(client.rpc).toHaveBeenCalledWith("resident_appointment_cancel", {
      p_appointment_id: appointmentId,
      p_expected_version: 1,
      p_cancellation_reason: "CHANGE DATE",
    });
  });

  it("normalizes a blank Resident cancellation reason to null", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000002",
          status: "cancelled",
          version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.cancelResidentAppointment(
      { id: appointmentId, version: 1 },
      "   ",
    );

    expect(client.rpc).toHaveBeenCalledWith("resident_appointment_cancel", {
      p_appointment_id: appointmentId,
      p_expected_version: 1,
      p_cancellation_reason: null,
    });
    expect(JSON.stringify(client.rpc.mock.calls[0][1])).not.toMatch(
      /N\/A|None|No reason|Not provided/i,
    );
  });

  it("normalizes a blank authorized staff cancellation reason to null", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000002",
          status: "cancelled",
          version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.transition({ id: appointmentId, version: 1 }, "cancelled", {
      cancellation_reason: "   ",
    });

    expect(client.rpc).toHaveBeenCalledWith("appointment_transition", {
      p_appointment_id: appointmentId,
      p_expected_version: 1,
      p_target_status: "cancelled",
      p_cancellation_reason: null,
      p_operational_notes: null,
    });
    expect(JSON.stringify(client.rpc.mock.calls[0][1])).not.toMatch(
      /N\/A|None|No reason|Not provided/i,
    );
  });

  it("trims and preserves a supplied staff cancellation reason", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000002",
          status: "cancelled",
          version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await service.transition({ id: appointmentId, version: 1 }, "cancelled", {
      cancellation_reason: " Clinic closing early ",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "appointment_transition",
      expect.objectContaining({
        p_cancellation_reason: "Clinic closing early",
      }),
    );
  });

  it("reschedules the same authoritative appointment through the versioned RPC", async () => {
    const client = rpcClient({
      data: [
        {
          original_id: appointmentId,
          original_version: 2,
          replacement_id: appointmentId,
          replacement_number: "APT-2026-000002",
          replacement_version: 2,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);
    const assignedStaffId = "33333333-3333-4333-8333-333333333333";

    await expect(
      service.reschedule(
        {
          id: appointmentId,
          version: 1,
          assigned_staff_id: assignedStaffId,
        },
        {
          scheduled_date: "2026-08-20",
          start_time: "10:00",
          end_time: "10:30",
        },
        requestKey,
      ),
    ).resolves.toMatchObject({
      original_id: appointmentId,
      replacement_id: appointmentId,
      replacement_number: "APT-2026-000002",
    });

    expect(client.rpc).toHaveBeenCalledWith("appointment_reschedule", {
      p_appointment_id: appointmentId,
      p_expected_version: 1,
      p_scheduled_date: "2026-08-20",
      p_start_time: "10:00",
      p_end_time: "10:30",
      p_assigned_staff_id: assignedStaffId,
      p_request_key: requestKey,
    });
  });

  it("loads resident-safe appointment details through the dedicated RPC", async () => {
    const client = rpcClient({
      data: {
        id: appointmentId,
        appointment_number: "APT-2026-000002",
        status: "pending",
      },
      error: null,
    });
    const service = createAppointmentService(() => client);

    await expect(
      service.getAppointment(appointmentId, { resident: true }),
    ).resolves.toMatchObject({ appointment_number: "APT-2026-000002" });
    expect(client.rpc).toHaveBeenCalledWith("resident_appointment_detail", {
      p_appointment_id: appointmentId,
    });
  });

  it("loads only the staff-review resident request overview", async () => {
    const client = rpcClient({
      data: [
        {
          id: appointmentId,
          appointment_number: "APT-2026-000002",
          total_count: 1,
        },
      ],
      error: null,
    });
    const service = createAppointmentService(() => client);

    await expect(
      service.listResidentAppointmentRequests(),
    ).resolves.toMatchObject({ total: 1, page: 1, page_size: 5 });
    expect(client.rpc).toHaveBeenCalledWith(
      "appointment_resident_request_list",
      {
        p_limit: 5,
        p_offset: 0,
      },
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
