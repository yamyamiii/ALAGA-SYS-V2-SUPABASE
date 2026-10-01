import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { equalAllocation, healthEventSchema } from "./schemas";
import { resolveNotificationDestination } from "@/features/notifications/navigation";
import { hasPermission } from "@/features/auth/permissions";
const sql = fs.readFileSync(
  "supabase/migrations/20260720010500_automated_health_service_events.sql",
  "utf8",
);
const id = "10000000-0000-4000-8000-000000000001";
describe("event configuration and security contracts", () => {
  it("current minimized notification RPC shape opens only the event index", () => {
    const notification = {
      notification_type: "appointment_approved",
      action_path: "/appointments/events",
    };
    expect(resolveNotificationDestination(notification, () => true)).toBe(
      "/appointments/events",
    );
    expect(
      resolveNotificationDestination(notification, () => false),
    ).toBeNull();
    expect(
      resolveNotificationDestination(
        { ...notification, notification_type: "unknown" },
        () => true,
      ),
    ).toBeNull();
  });
  it.each([
    [60, 2, [30, 30]],
    [60, 3, [20, 20, 20]],
    [61, 2, [31, 30]],
  ])("previews %i/%i equal quotas", (capacity, n, expected) =>
    expect(
      equalAllocation(capacity, ["c", "b", "a"].slice(0, n)).map(
        (s) => s.quota,
      ),
    ).toEqual(expected),
  );
  it("preview tie break is stable across checkbox selection order", () =>
    expect(equalAllocation(61, ["b", "a"])).toEqual(
      equalAllocation(61, ["a", "b"]),
    ));
  it("validates capacity, team and scheduling window without changing ordinary slots", () => {
    const values = {
      title: "Event",
      service_type: "Immunization",
      event_date: "2099-01-01",
      start_time: "08:00",
      end_time: "12:00",
      capacity: 60,
      staff_ids: [id],
      publish: true,
      notify: true,
    };
    expect(healthEventSchema.safeParse(values).success).toBe(true);
    for (const invalid of [
      { capacity: 0 },
      { capacity: 1.5 },
      { staff_ids: [] },
      { service_type: "Postpartum Home Visit" },
      { start_time: "07:30" },
      { end_time: "17:00" },
    ])
      expect(
        healthEventSchema.safeParse({ ...values, ...invalid }).success,
      ).toBe(false);
  });
  it.each(["admin", "barangay_health_worker", "nurse", "midwife", "resident"])(
    "%s receives safe event notification navigation",
    (role) => {
      expect(
        resolveNotificationDestination(
          {
            notification_type: "appointment_approved",
            source_type: "health_events",
            source_id: id,
            action_path: "/appointments/events",
          },
          (p) => hasPermission(role, p),
        ),
      ).toBe(`/appointments/events?event=${id}`);
    },
  );
  it("unknown/malformed notification navigation fails closed", () => {
    for (const invalid of [
      { source_id: "javascript:alert(1)" },
      { action_path: "https://attacker.invalid" },
      { notification_type: "unknown" },
    ])
      expect(
        resolveNotificationDestination(
          {
            notification_type: "appointment_approved",
            source_type: "health_events",
            source_id: id,
            action_path: "/appointments/events",
            ...invalid,
          },
          () => true,
        ),
      ).toBeNull();
  });
  it("all new operational tables are RLS enabled and no browser mutation grants exist", () => {
    for (const table of [
      "health_service_events",
      "health_event_staff",
      "health_event_bookings",
      "health_event_history",
    ])
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?to authenticated/i,
    );
    expect(sql).toContain(
      "revoke all on function %s from public, anon, authenticated",
    );
  });
  it("locks authoritative capacity and prevents duplicate active Residents", () => {
    expect(sql).toContain("for update;");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("health_event_one_active_booking");
    expect(sql).toContain("v_used >= v_event.target_capacity");
    expect(sql).toContain("order by booking.join_order loop");
  });
  it("residents cannot supply authoritative identity, staff or state", () => {
    const signature = sql.match(
      /function public.health_event_book\(([\s\S]*?)\)/,
    )[1];
    expect(signature).not.toMatch(
      /p_resident|p_staff|p_status|p_capacity|p_order/,
    );
    expect(sql).toContain("resident.linked_profile_id = auth.uid()");
  });
  it("ordinary reservation validation and availability remain integrated", () => {
    expect(sql).toContain("function public.appointment_assert_slot_available");
    expect(sql).toContain(
      "function public.appointment_resident_available_slots",
    );
    expect(sql).toContain("function public.resident_appointment_request");
    expect(sql).toContain("health_event_staff_reserved");
    expect(sql).not.toMatch(/drop\s+(table|constraint)/i);
  });
  it("minimized event models store no clinical narratives", () => {
    const tables = sql.slice(0, sql.indexOf("create or replace function"));
    expect(tables).not.toMatch(
      /diagnosis|clinical_notes|medical_history|treatment_plan/i,
    );
    expect(sql).not.toContain("alter publication");
  });
});
