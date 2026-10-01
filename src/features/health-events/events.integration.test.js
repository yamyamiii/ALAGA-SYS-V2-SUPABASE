// @vitest-environment node
import process from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEventTestDatabase } from "./testDatabase";

const uuid = (n, prefix = 1) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uuid(99);
const staff = [uuid(3), uuid(4), uuid(5)];
describe.skipIf(!process.env.ALAGA_TEST_PGLITE_MODULE)(
  "health event PostgreSQL runtime",
  () => {
    let db, date;
    beforeAll(async () => {
      const fixture = await createEventTestDatabase();
      db = fixture.db;
      date = fixture.dateFrom;
    }, 30000);
    afterAll(async () => db?.close());
    const actor = (id) =>
      db.query("select set_config('test.actor_id', $1, false)", [id]);
    async function call(name, args = []) {
      const result = await db.query(
        `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
        args,
      );
      return result.rows[0].result;
    }
    beforeEach(async () => {
      await db.exec(`reset role; truncate health_event_history, health_event_bookings, health_event_staff, announcements, health_service_events, audit_logs, appointments, assistance_notifications, realtime_sync_events;
      delete from profiles where role <> 'resident';
      update profiles set account_status='active', retired_at=null;
      update residents set status='active', archived_at=null;
      insert into profiles(id,role,account_status) values ('${admin}','admin','active'),('${staff[0]}','barangay_health_worker','active'),('${staff[1]}','nurse','active'),('${staff[2]}','nurse','active');`);
      for (let n = 10; n < 80; n++) {
        await db.query(
          "insert into profiles(id,role,account_status) values ($1,'resident','active') on conflict(id) do nothing",
          [uuid(n)],
        );
        await db.query(
          "insert into residents(id,linked_profile_id,status) values ($1,$2,'active') on conflict(id) do nothing",
          [uuid(n, 2), uuid(n)],
        );
      }
      await actor(admin);
    });
    const save = (capacity = 60, ids = staff.slice(0, 2), options = {}) =>
      call("health_event_save", [
        options.id ?? null,
        options.version ?? null,
        "Immunization event",
        options.service ?? "Immunization",
        options.date ?? date,
        "08:00",
        "12:00",
        capacity,
        ids,
        options.publish ?? true,
        options.notify ?? false,
        crypto.randomUUID(),
      ]);
    const list = () => call("health_event_list", [false, 20, 0]);
    async function book(
      event,
      n = 10,
      wait = false,
      key = crypto.randomUUID(),
    ) {
      await actor(uuid(n));
      return call("health_event_book", [event.id, key, wait]);
    }
    async function count(event) {
      return (
        await db.query(
          "select count(*)::int as total from health_event_bookings where event_id=$1 and booking_state in ('confirmed','checked_in','completed')",
          [event.id],
        )
      ).rows[0].total;
    }
    it.each([
      [60, 2, [30, 30]],
      [60, 3, [20, 20, 20]],
      [61, 2, [31, 30]],
    ])("allocates %i / %i deterministically", async (capacity, n, quotas) => {
      await save(capacity, staff.slice(0, n));
      expect((await list()).items[0].staff.map((s) => s.quota)).toEqual(quotas);
    });
    it("balances 60 bookings to 30/30 and enforces exact capacity", async () => {
      const event = await save();
      for (let n = 10; n < 70; n++) await book(event, n);
      await actor(admin);
      expect((await list()).items[0].staff.map((s) => s.assigned)).toEqual([
        30, 30,
      ]);
      expect(await count(event)).toBe(60);
      await expect(book(event, 70)).rejects.toMatchObject({ code: "P0001" });
    });
    it("serialized parallel independent Residents claim only one final place", async () => {
      const e = await save(1);
      const results = await Promise.all(
        [10, 11].map((n) =>
          db.transaction(async (tx) => {
            await tx.query("select set_config('test.actor_id',$1,true)", [
              uuid(n),
            ]);
            return tx.query("select health_event_book($1,$2,true) as result", [
              e.id,
              crypto.randomUUID(),
            ]);
          }),
        ),
      );
      expect(results.map((r) => r.rows[0].result.state).sort()).toEqual([
        "confirmed",
        "waitlisted",
      ]);
      expect(await count(e)).toBe(1);
    });
    it("duplicate resident and request-key retries return the same booking", async () => {
      const e = await save();
      const key = crypto.randomUUID();
      const b = await book(e, 10, false, key);
      expect(await call("health_event_book", [e.id, key, false])).toEqual(b);
      expect(
        (await call("health_event_book", [e.id, crypto.randomUUID(), false]))
          .id,
      ).toBe(b.id);
      expect(await count(e)).toBe(1);
    });
    it.each(["inactive", "suspended"])(
      "rejects %s participating staff",
      async (status) => {
        await db.query("update profiles set account_status=$1 where id=$2", [
          status,
          staff[0],
        ]);
        await expect(save()).rejects.toMatchObject({ code: "23514" });
      },
    );
    it("rejects retired and ineligible staff", async () => {
      await db.query("update profiles set retired_at=now() where id=$1", [
        staff[0],
      ]);
      await expect(save()).rejects.toMatchObject({ code: "23514" });
      await expect(save(60, [uuid(10)])).rejects.toMatchObject({
        code: "23514",
      });
    });
    it("waitlists FIFO and automatically promotes and notifies on cancellation", async () => {
      const e = await save(1);
      const first = await book(e);
      const next = await book(e, 11, true);
      const third = await book(e, 12, true);
      expect(next.state).toBe("waitlisted");
      expect(third.queue_order).toBeGreaterThan(next.queue_order);
      await actor(uuid(10));
      await call("health_event_cancel_booking", [
        first.id,
        first.version,
        "  ",
      ]);
      await actor(uuid(11));
      const own = (await list()).items[0].own_booking;
      expect(own.state).toBe("confirmed");
      expect(own.assigned_staff).toBeTruthy();
      expect(await count(e)).toBe(1);
      expect(
        (
          await db.query(
            "select summary from assistance_notifications where recipient_profile_id=$1",
            [uuid(11)],
          )
        ).rows.some((n) => n.summary.includes("place became available")),
      ).toBe(true);
    });
    it("skips suspended waitlisted residents before promoting next eligible", async () => {
      const e = await save(1);
      const first = await book(e);
      await book(e, 11, true);
      await book(e, 12, true);
      await db.query(
        "update profiles set account_status='suspended' where id=$1",
        [uuid(11)],
      );
      await actor(uuid(10));
      await call("health_event_cancel_booking", [first.id, 1, null]);
      await actor(uuid(12));
      expect((await list()).items[0].own_booking.state).toBe("confirmed");
    });
    it("cancellation without a waitlist releases the place with NULL narrative", async () => {
      const e = await save(1);
      const b = await book(e);
      await call("health_event_cancel_booking", [b.id, 1, "  "]);
      expect(await count(e)).toBe(0);
      expect(
        (
          await db.query(
            "select cancellation_reason from health_event_bookings where id=$1",
            [b.id],
          )
        ).rows[0].cancellation_reason,
      ).toBeNull();
    });
    it("rebalances automatically after participating staff suspension", async () => {
      const e = await save(6, staff);
      for (let n = 10; n < 16; n++) await book(e, n);
      await actor(admin);
      await db.query(
        "update profiles set account_status='suspended' where id=$1",
        [staff[0]],
      );
      const item = (await list()).items[0];
      expect(item.staff.map((s) => s.assigned)).toEqual([0, 3, 3]);
      expect(item.exception).toBeNull();
      expect(await count(e)).toBe(6);
    });
    it("keeps bookings and exposes an exception when no eligible staff remain", async () => {
      const e = await save(1, [staff[0]]);
      await book(e);
      await actor(admin);
      await db.query(
        "update profiles set account_status='suspended' where id=$1",
        [staff[0]],
      );
      expect((await list()).items[0].exception).toBe("staff_unavailable");
      expect(await count(e)).toBe(1);
    });
    it("linked announcement mapping is trusted and informational announcements have no link", async () => {
      const e = await save(60, staff.slice(0, 2), { notify: true });
      const ann = (await db.query("select id,publish_at from announcements"))
        .rows[0];
      await actor(uuid(10));
      expect(
        await call("health_event_announcement_links", [
          [ann.id, crypto.randomUUID()],
        ]),
      ).toEqual({ [ann.id]: e.id });
      expect(
        (
          await db.query(
            "select available_at from assistance_notifications where source_id=$1",
            [ann.id],
          )
        ).rows.every(
          (n) => n.available_at.getTime() >= ann.publish_at.getTime(),
        ),
      ).toBe(true);
    });
    it("event cancellation retains booking/history and removes only linked announcement notifications", async () => {
      const e = await save(2, staff.slice(0, 2), { notify: true });
      await book(e);
      await actor(admin);
      await call("health_event_set_status", [e.id, 1, "cancel"]);
      expect(await count(e)).toBe(0);
      expect(
        (await db.query("select count(*)::int as n from health_event_history"))
          .rows[0].n,
      ).toBeGreaterThan(2);
      expect(
        (
          await db.query(
            "select count(*)::int as n from assistance_notifications where source_type='announcements'",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await db.query(
            "select count(*)::int as n from assistance_notifications where notification_type='appointment_cancelled'",
          )
        ).rows[0].n,
      ).toBe(1);
    });
    it("emits minimized realtime invalidation for managers, resident and assigned staff", async () => {
      const e = await save();
      await book(e);
      expect(
        (
          await db.query(
            "select count(*)::int as n from realtime_sync_events where topic='appointment'",
          )
        ).rows[0].n,
      ).toBeGreaterThan(0);
    });
    it("resident cannot read participant queue or another resident booking", async () => {
      const e = await save();
      await book(e);
      await actor(uuid(11));
      expect((await list()).items[0].own_booking).toBeNull();
      await expect(call("health_event_queue", [e.id])).rejects.toMatchObject({
        code: "42501",
      });
    });
    it.each(["health_event_save", "health_event_report"])(
      "denies resident access to %s",
      async (name) => {
        await actor(uuid(10));
        await expect(
          name === "health_event_save" ? save() : call(name, [date, date]),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
    it("clinical staff queue and report are assignment scoped", async () => {
      const e = await save(2);
      await book(e);
      await book(e, 11);
      await actor(staff[1]);
      const queue = await call("health_event_queue", [e.id]);
      expect(queue).toHaveLength(1);
      expect(Object.keys(queue[0])).not.toContain("clinical_notes");
      expect((await call("health_event_report", [date, date]))[0].booked).toBe(
        1,
      );
    });
    it("stale versions and non-owner cancellation remain rejected", async () => {
      const e = await save();
      const b = await book(e);
      await expect(
        call("health_event_cancel_booking", [b.id, 999, null]),
      ).rejects.toMatchObject({ code: "40001" });
      await actor(uuid(11));
      await expect(
        call("health_event_cancel_booking", [b.id, 1, null]),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("reserved event window excludes ordinary availability and trusted ordinary writes", async () => {
      const e = await save(60, staff.slice(0, 2), {
        service: "General Consultation",
      });
      await db.query(
        "update profiles set account_status='inactive' where id=$1",
        [staff[2]],
      );
      await actor(uuid(10));
      const result = await db.query(
        "select * from appointment_resident_available_slots('General Consultation',$1,$1)",
        [date],
      );
      expect(result.rows.every((s) => s.start_time >= "12:00:00")).toBe(true);
      await expect(
        call("resident_appointment_request", [
          "General Consultation",
          date,
          "08:00",
          null,
          crypto.randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: "23P01" });
      await actor(admin);
      await expect(
        call("appointment_assert_slot_available", [
          staff[0],
          date,
          "08:00",
          "08:30",
          null,
        ]),
      ).rejects.toMatchObject({ code: "23P01" });
      expect(e.id).toBeTruthy();
    });
    it("ordinary automated booking still works outside the event window", async () => {
      await save(60, staff.slice(0, 2), { service: "General Consultation" });
      await actor(uuid(10));
      const result = await db.query(
        "select * from resident_appointment_request('General Consultation',$1,'12:00',null,$2)",
        [date, crypto.randomUUID()],
      );
      expect(result.rows[0].status).toBe("confirmed");
    });
    it("Postpartum remains coordination-required, not an event or instant booking", async () => {
      await expect(
        save(1, [staff[0]], { service: "Postpartum Home Visit" }),
      ).rejects.toMatchObject({ code: "23514" });
      await actor(uuid(10));
      await expect(
        call("resident_appointment_request", [
          "Postpartum Home Visit",
          date,
          "08:00",
          null,
          crypto.randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("browser roles cannot write tables or invoke internal helpers", async () => {
      await db.exec("set role authenticated");
      await expect(
        db.query("select * from health_event_bookings"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        call("health_event_pick_staff", [crypto.randomUUID()]),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("authenticated Resident can book through the granted RPC without table access", async () => {
      const event = await save(1);
      await actor(uuid(10));
      await db.exec("set role authenticated");
      const result = await call("health_event_book", [
        event.id,
        crypto.randomUUID(),
        false,
      ]);
      expect(result.state).toBe("confirmed");
      await expect(
        db.query("update health_event_bookings set booking_state='completed'"),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("anonymous caller cannot use the public event RPC", async () => {
      await db.exec("set role anon");
      await expect(
        call("health_event_list", [false, 20, 0]),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("elapsed booking window is reflected in the read model and enforced by the RPC", async () => {
      const event = await save(1);
      await db.query(
        "update health_service_events set booking_opens_at=now()-interval '1 hour', booking_closes_at=now()-interval '1 second' where id=$1",
        [event.id],
      );
      await actor(uuid(10));
      expect((await list()).items[0].booking_open).toBe(false);
      await expect(
        call("health_event_book", [event.id, crypto.randomUUID(), false]),
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("booking API has no staff, resident, status, quota or queue input", async () => {
      const result = await db.query(
        "select proargnames from pg_proc where proname='health_event_book'",
      );
      expect(result.rows[0].proargnames).toEqual([
        "p_event_id",
        "p_request_key",
        "p_join_waitlist",
      ]);
    });
    it("checked in to completed works without a clinical encounter", async () => {
      const e = await save(1);
      const b = await book(e);
      await actor(admin);
      await db.query(
        "update health_service_events set event_date=(now() at time zone 'Asia/Manila')::date where id=$1",
        [e.id],
      );
      await call("health_event_transition_booking", [b.id, 1, "check_in"]);
      await call("health_event_transition_booking", [b.id, 2, "complete"]);
      expect((await call("health_event_queue", [e.id]))[0].state).toBe(
        "completed",
      );
    });
  },
);
