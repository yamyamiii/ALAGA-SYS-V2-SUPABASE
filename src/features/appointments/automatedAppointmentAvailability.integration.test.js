// @vitest-environment node
// Optional executable PostgreSQL regression: set ALAGA_TEST_PGLITE_MODULE to
// the file URL of a temporary @electric-sql/pglite installation's dist/index.js.
// No hosted database, project dependency, credentials, or deployed state is used.
import fs from "node:fs";
import process from "node:process";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const readMigration = (name) =>
  fs.readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const original = readMigration(
  "20260720010300_automated_resident_appointments",
);
const correction = readMigration(
  "20260720010400_fix_automated_appointment_availability",
);
const pgliteModule = process.env.ALAGA_TEST_PGLITE_MODULE;
const actorId = "10000000-0000-4000-8000-000000000001";
const residentId = "20000000-0000-4000-8000-000000000001";
const otherActorId = "10000000-0000-4000-8000-000000000002";
const otherResidentId = "20000000-0000-4000-8000-000000000002";
const staffId = "10000000-0000-4000-8000-000000000003";

function functionSql(sql, name) {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  if (!match) throw new Error(`Missing test function: ${name}`);
  return match[0];
}

describe.skipIf(!pgliteModule)(
  "automated appointment PostgreSQL runtime",
  () => {
    let db;
    let dateFrom;
    let dateTo;

    beforeAll(async () => {
      const { PGlite } = await import(/* @vite-ignore */ pgliteModule);
      db = new PGlite();
      // Use the actual enums and appointment table/number trigger. Only profiles
      // and residents are minimized to the columns these RPCs consume.
      const enums = readMigration("20260720000100_extensions_and_enums");
      await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      ${[...enums.matchAll(/create type public\.[\s\S]*?\);/g)].map((match) => match[0]).join("\n")}
      create table public.profiles (
        id uuid primary key, role public.app_role,
        account_status public.account_status, retired_at timestamptz
      );
      create table public.residents (
        id uuid primary key, linked_profile_id uuid,
        status public.resident_status, archived_at timestamptz
      );
      create function auth.uid() returns uuid language sql stable as $$
        select current_setting('test.actor_id', true)::uuid
      $$;
      grant usage on schema auth to authenticated, anon;
      ${functionSql(readMigration("20260720000800_helper_functions_and_triggers"), "current_profile_role")}
      ${readMigration("20260720000600_appointments")}
      alter table public.appointments
        add column version bigint not null default 1,
        add column request_key uuid;
      ${readMigration("20260720002200_resident_appointment_requests").split("create index appointments_resident_requests_review_idx")[0]}
      commit;
      ${functionSql(readMigration("20260720005700_add_bagongpook_appointment_services"), "appointment_service_type_valid")}
      ${functionSql(readMigration("20260720001800_appointment_workflows"), "appointment_assert_slot_available")}
      ${functionSql(readMigration("20260720005600_enforce_appointment_start_slots"), "appointment_start_time_valid")}
      ${original.slice(0, original.indexOf("-- Reuse the centralized role/service predicate"))}
      commit;
      ${functionSql(original, "appointment_validate_schedule")}
      ${functionSql(readMigration("20260720001800_appointment_workflows"), "appointment_create")}
      revoke all on function public.appointment_create(uuid, public.appointment_type, text, date, time, time, public.appointment_priority, uuid, text, text, uuid) from public, anon;
      grant execute on function public.appointment_create(uuid, public.appointment_type, text, date, time, time, public.appointment_priority, uuid, text, text, uuid) to authenticated;
      ${functionSql(original, "resident_appointment_request")}
      alter table public.appointments enable row level security;
      revoke all on public.appointments from public, anon, authenticated;
      insert into public.profiles values
        ('${actorId}', 'resident', 'active', null),
        ('${otherActorId}', 'resident', 'active', null);
      insert into public.residents values
        ('${residentId}', '${actorId}', 'active', null),
        ('${otherResidentId}', '${otherActorId}', 'active', null);
    `);

      // Real in-app notification and realtime emitters, with their narrow owning
      // tables. External delivery remains a stub, never an email/SMS side effect.
      const assistance = readMigration("20260720002700_general_assistance");
      const realtime = readMigration(
        "20260720010200_realtime_state_consistency",
      );
      const outbound = readMigration(
        "20260720003200_outbound_notification_foundation",
      );
      await db.exec(`
      ${assistance.match(/create type public\.assistance_notification_type[\s\S]*?\);/)[0]}
      ${outbound.match(/create type public\.outbound_notification_event[\s\S]*?\);/)[0]}
      ${outbound.match(/create type public\.outbound_notification_template[\s\S]*?\);/)[0]}
      create table public.assistance_notifications (
        recipient_profile_id uuid, notification_type public.assistance_notification_type,
        title text, summary text, source_type text, source_id uuid,
        action_path text, dedup_key text, available_at timestamptz,
        unique (recipient_profile_id, dedup_key)
      );
      ${functionSql(assistance, "assistance_add_notification")}
      ${realtime.slice(realtime.indexOf("create table public.realtime_sync_events"), realtime.indexOf("create or replace function public.emit_profile_realtime_sync"))}
      ${functionSql(realtime, "emit_appointment_realtime_sync")}
      create trigger appointments_realtime_sync
        after insert or update or delete on public.appointments
        for each row execute function public.emit_appointment_realtime_sync();
      create function public.notification_enqueue_for_profile(
        uuid, text, public.outbound_notification_event, text, uuid,
        public.outbound_notification_template, jsonb, timestamptz
      ) returns void language sql as $$ select $$;
      create function public.notification_schedule_appointment_reminder(public.appointments)
        returns void language sql as $$ select $$;
      ${functionSql(original, "notify_automated_resident_appointment")}
      create trigger appointments_automated_resident_notifications
        after insert on public.appointments
        for each row execute function public.notify_automated_resident_appointment();
    `);
      ({
        rows: [{ date_from: dateFrom, date_to: dateTo }],
      } = await db.query(`
      select (date_trunc('month', statement_timestamp() at time zone 'Asia/Manila')
        + interval '1 month')::date::text as date_from,
        (date_trunc('month', statement_timestamp() at time zone 'Asia/Manila')
        + interval '1 month' + interval '27 days')::date::text as date_to
    `));
    }, 30_000);

    beforeEach(async () => {
      await db.exec(`
      reset role;
      set time zone 'UTC';
      truncate public.appointments, public.assistance_notifications,
        public.realtime_sync_events;
      delete from public.profiles where id not in ('${actorId}', '${otherActorId}');
      update public.profiles set role = 'resident', account_status = 'active';
      update public.residents set status = 'active', archived_at = null;
      select set_config('test.actor_id', '${actorId}', false);
    `);
      await db.exec(correction);
    });

    afterAll(async () => db?.close());

    async function addStaff(
      role = "nurse",
      status = "active",
      retired = false,
    ) {
      await db.query("insert into public.profiles values ($1, $2, $3, $4)", [
        staffId,
        role,
        status,
        retired ? "2020-01-01T00:00:00Z" : null,
      ]);
    }

    const availability = (
      service = "General Consultation",
      from = dateFrom,
      to = dateTo,
    ) =>
      db.query(
        "select * from public.appointment_resident_available_slots($1, $2::date, $3::date)",
        [service, from, to],
        { parsers: { 1082: (value) => value } },
      );

    async function busyAppointment(date, start, end, owner = otherResidentId) {
      await db.query(
        `
      insert into public.appointments (resident_id, assigned_staff_id,
        appointment_type, service_type, scheduled_date, start_time, end_time, status)
      values ($1, $2, 'scheduled', 'General Consultation', $3::date,
        $4::time, $5::time, 'confirmed')
    `,
        [owner, staffId, date, start, end],
      );
    }

    it.each([
      "General Consultation",
      "Buntis / Prenatal Care",
      "Maternal Care",
      "Immunization",
      "Family Planning",
    ])("reproduces Migration 103 SQLSTATE 42702 for %s", async (service) => {
      await db.exec(
        functionSql(original, "appointment_resident_available_slots"),
      );
      await expect(availability(service)).rejects.toMatchObject({
        code: "42702",
        message: 'column reference "resident_id" is ambiguous',
        detail:
          "It could refer to either a PL/pgSQL variable or a table column.",
      });
    });

    it("catalog still returns all six modes to the linked active Resident", async () => {
      const result = await db.query(
        "select * from public.appointment_resident_service_catalog()",
      );
      expect(result.rows).toHaveLength(6);
      expect(result.rows[5]).toMatchObject({
        service_type: "Postpartum Home Visit",
        booking_mode: "COORDINATION_REQUIRED",
      });
    });

    it.each([
      ["General Consultation", null, false],
      ["Buntis / Prenatal Care", 2, false],
      ["Maternal Care", 2, true],
      ["Immunization", 3, true],
      ["Family Planning", 4, false],
    ])(
      "returns only approved %s dates and 30-minute slots",
      async (service, weekday, first) => {
        await addStaff();
        const { rows } = await availability(service);
        expect(rows.length).toBeGreaterThan(0);
        for (const slot of rows) {
          const date = new Date(`${slot.scheduled_date}T00:00:00Z`);
          if (weekday) expect(date.getUTCDay()).toBe(weekday);
          if (first) expect(date.getUTCDate()).toBeLessThanOrEqual(7);
          expect(slot.start_time).toMatch(
            /^(?:0[89]|1[0-5]):(?:00|30):00$|^16:00:00$/,
          );
          expect(Object.keys(slot)).toEqual([
            "scheduled_date",
            "start_time",
            "end_time",
          ]);
        }
        expect(rows[0].start_time).toBe("08:00:00");
        expect(rows.at(-1)).toMatchObject({
          start_time: "16:00:00",
          end_time: "16:30:00",
        });
      },
    );

    it("no eligible staff returns an empty successful result", async () => {
      expect((await availability()).rows).toEqual([]);
    });

    it("fully busy staff also returns empty success, not a system exception", async () => {
      await addStaff();
      await busyAppointment(dateFrom, "08:00", "16:30");
      expect(
        (await availability("General Consultation", dateFrom, dateFrom)).rows,
      ).toEqual([]);
    });

    it("retains native date/time return types and session-independent Manila behavior", async () => {
      await addStaff();
      const utcSlots = (await availability()).rows;
      await db.exec("set time zone 'America/Los_Angeles'");
      expect((await availability()).rows).toEqual(utcSlots);
      const types = (
        await db.query(
          `
      select pg_typeof(slot.scheduled_date)::text as date_type,
        pg_typeof(slot.start_time)::text as start_type,
        pg_typeof(slot.end_time)::text as end_type
      from public.appointment_resident_available_slots('General Consultation', $1::date, $2::date) as slot
      limit 1
    `,
          [dateFrom, dateTo],
        )
      ).rows[0];
      expect(types).toEqual({
        date_type: "date",
        start_type: "time without time zone",
        end_type: "time without time zone",
      });
    });

    it.each([
      ["nurse", "inactive", false],
      ["nurse", "active", true],
      ["admin", "active", false],
      ["midwife", "active", false],
    ])(
      "does not offer General Consultation capacity for %s/%s/retired=%s",
      async (role, status, retired) => {
        await addStaff(role, status, retired);
        expect((await availability()).rows).toEqual([]);
      },
    );

    it("Midwife remains eligible for Maternal Care only under existing rules", async () => {
      await addStaff("midwife");
      expect((await availability("Maternal Care")).rows.length).toBeGreaterThan(
        0,
      );
      expect((await availability("Buntis / Prenatal Care")).rows).toEqual([]);
    });

    it("busy staff removes only overlapping slots; archived appointments do not block", async () => {
      await addStaff();
      await busyAppointment(dateFrom, "08:00", "09:00");
      let { rows } = await availability(
        "General Consultation",
        dateFrom,
        dateFrom,
      );
      expect(rows).toHaveLength(15);
      expect(rows[0].start_time).toBe("09:00:00");
      await db.exec(
        "update public.appointments set archived_at = statement_timestamp()",
      );
      ({ rows } = await availability(
        "General Consultation",
        dateFrom,
        dateFrom,
      ));
      expect(rows).toHaveLength(17);
    });

    it("Resident overlap removes slots even with other eligible staff capacity", async () => {
      await addStaff();
      await busyAppointment(dateFrom, "08:00", "08:30", residentId);
      await db.exec("update public.appointments set assigned_staff_id = null");
      expect(
        (await availability("General Consultation", dateFrom, dateFrom)).rows[0]
          .start_time,
      ).toBe("08:30:00");
      await db.query("select set_config('test.actor_id', $1, false)", [
        otherActorId,
      ]);
      expect(
        (await availability("General Consultation", dateFrom, dateFrom)).rows[0]
          .start_time,
      ).toBe("08:00:00");
    });

    it("coordination-required service returns no instant slots before and after repair", async () => {
      expect((await availability("Postpartum Home Visit")).rows).toEqual([]);
      await db.exec(
        functionSql(original, "appointment_resident_available_slots"),
      );
      expect((await availability("Postpartum Home Visit")).rows).toEqual([]);
    });

    it.each(["admin", "barangay_health_worker", "nurse", "midwife"])(
      "denies availability to %s",
      async (role) => {
        await db.query("update public.profiles set role = $1 where id = $2", [
          role,
          actorId,
        ]);
        await expect(availability()).rejects.toMatchObject({ code: "42501" });
      },
    );

    it("unlinked/inactive Resident and anonymous calls fail closed", async () => {
      await db.query("select set_config('test.actor_id', $1, false)", [
        staffId,
      ]);
      await expect(availability()).rejects.toMatchObject({ code: "42501" });
      await db.query("select set_config('test.actor_id', $1, false)", [
        actorId,
      ]);
      await db.exec(
        `update public.residents set status = 'inactive' where id = '${residentId}'`,
      );
      await expect(availability()).rejects.toMatchObject({ code: "42501" });
      await db.exec("set role anon");
      await expect(availability()).rejects.toMatchObject({ code: "42501" });
    });

    it("62-day limit and invalid ranges remain rejected", async () => {
      const tooFar = (
        await db.query("select ($1::date + 63)::text as date", [dateFrom])
      ).rows[0].date;
      await expect(
        availability("General Consultation", dateFrom, tooFar),
      ).rejects.toMatchObject({ code: "22007" });
      await expect(
        availability("General Consultation", dateTo, dateFrom),
      ).rejects.toMatchObject({ code: "22007" });
      await expect(
        availability("General Consultation", "2000-01-01", "2000-01-02"),
      ).rejects.toMatchObject({ code: "22007" });
      const allowedEnd = (
        await db.query("select ($1::date + 62)::text as date", [dateFrom])
      ).rows[0].date;
      expect(
        (await availability("General Consultation", dateFrom, allowedEnd)).rows,
      ).toEqual([]);
    });

    it("authenticated execution returns safe slots without direct table/helper privileges", async () => {
      await addStaff();
      await db.exec("set role authenticated");
      expect((await availability()).rows.length).toBeGreaterThan(0);
      await expect(
        db.query("select * from public.appointment_service_schedules"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query(
          "select public.appointment_staff_role_eligible('nurse', 'General Consultation')",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("delete from public.appointments"),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it.each([null, "   ", "Routine visit"])(
      "booking with reason %s stays assigned/Confirmed, idempotent, notified, and realtime",
      async (reason) => {
        await addStaff();
        const requestKey = "30000000-0000-4000-8000-000000000001";
        const book = () =>
          db.query(
            "select * from public.resident_appointment_request('General Consultation', $1::date, '08:00', $3, $2::uuid)",
            [dateFrom, requestKey, reason],
          );
        const {
          rows: [created],
        } = await book();
        expect(created).toMatchObject({ status: "confirmed", version: 1 });
        expect((await book()).rows[0]).toEqual(created);
        const { rows } = await db.query("select * from public.appointments");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          resident_id: residentId,
          assigned_staff_id: staffId,
          reason: reason?.trim() || null,
          start_time: "08:00:00",
          end_time: "08:30:00",
        });

        expect(
          (await db.query("select * from public.assistance_notifications"))
            .rows,
        ).toHaveLength(2);
        const events = (
          await db.query("select * from public.realtime_sync_events")
        ).rows;
        expect(events).toHaveLength(4);
        expect(
          events.some((event) => event.audience_profile_id === actorId),
        ).toBe(true);
        expect(
          events.some((event) => event.audience_profile_id === staffId),
        ).toBe(true);
        expect(
          (await availability("General Consultation", dateFrom, dateFrom))
            .rows[0].start_time,
        ).toBe("08:30:00");
      },
    );

    it("reproduces the separate original optional-reason booking regression", async () => {
      await addStaff();
      await db.exec(functionSql(original, "appointment_validate_schedule"));
      await expect(
        db.query(
          "select * from public.resident_appointment_request('General Consultation', $1::date, '08:00', null, '30000000-0000-4000-8000-000000000001')",
          [dateFrom],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: "an appointment reason is required",
      });
      expect(
        (await db.query("select * from public.appointments")).rows,
      ).toEqual([]);
    });

    it("does not extend the optional reason exception to another Resident", async () => {
      await addStaff();
      await expect(
        db.query(
          "select public.appointment_validate_schedule($1, 'scheduled', 'General Consultation', $2::date, '08:00', '08:30', $3, null, null)",
          [otherResidentId, dateFrom, staffId],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: "an appointment reason is required",
      });
    });

    it("staff-created appointment validation still requires its reason", async () => {
      await addStaff();
      await db.exec(
        `update public.profiles set role = 'admin' where id = '${actorId}'`,
      );
      await expect(
        db.query(
          "select public.appointment_validate_schedule($1, 'scheduled', 'General Consultation', $2::date, '08:00', '08:30', $3, null, null)",
          [residentId, dateFrom, staffId],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: "an appointment reason is required",
      });
    });

    const createAssisted = (
      type = "scheduled",
      date = dateFrom,
      reason = "Assisted booking",
      staff = staffId,
      key = crypto.randomUUID(),
    ) =>
      db.query(
        "select * from public.appointment_create($1,$2,'General Consultation',$3::date,'08:00','08:30','normal',$4,$5,null,$6)",
        [residentId, type, date, staff, reason, key],
      );

    it.each(["admin", "barangay_health_worker"])(
      "preserves trusted staff-assisted booking and idempotency for %s",
      async (role) => {
        await addStaff();
        await db.query("update public.profiles set role=$1 where id=$2", [
          role,
          actorId,
        ]);
        await db.exec("set role authenticated");
        const key = crypto.randomUUID();
        const first = (
          await createAssisted(
            "scheduled",
            dateFrom,
            "Assisted booking",
            staffId,
            key,
          )
        ).rows[0];
        const second = (
          await createAssisted(
            "scheduled",
            dateFrom,
            "Assisted booking",
            staffId,
            key,
          )
        ).rows[0];
        expect(second).toEqual(first);
        await db.exec("reset role");
        expect(
          (
            await db.query(
              "select appointment_type, request_source, status, assigned_staff_id from public.appointments where id=$1",
              [first.id],
            )
          ).rows[0],
        ).toMatchObject({
          appointment_type: "scheduled",
          request_source: "staff",
          status: "pending",
          assigned_staff_id: staffId,
        });
      },
    );

    it.each(["resident", "nurse", "midwife"])(
      "denies direct %s calls to staff-assisted creation",
      async (role) => {
        await addStaff();
        await db.query("update public.profiles set role=$1 where id=$2", [
          role,
          actorId,
        ]);
        await db.exec("set role authenticated");
        await expect(createAssisted()).rejects.toMatchObject({ code: "42501" });
        await db.exec("reset role");
        expect(
          (
            await db.query(
              "select count(*)::integer as total from public.appointments",
            )
          ).rows[0].total,
        ).toBe(0);
      },
    );

    it("preserves overlap and eligible-staff validation for assisted booking", async () => {
      await addStaff();
      await db.query("update public.profiles set role='admin' where id=$1", [
        actorId,
      ]);
      await busyAppointment(dateFrom, "08:00", "08:30");
      await expect(createAssisted()).rejects.toThrow(/conflict|overlap/i);
      await db.query(
        "update public.profiles set account_status='inactive' where id=$1",
        [staffId],
      );
      await expect(createAssisted()).rejects.toMatchObject({ code: "23514" });
    });

    it("registers walk-ins only for today's Manila date and retains their distinct type", async () => {
      await addStaff();
      await db.query("update public.profiles set role='admin' where id=$1", [
        actorId,
      ]);
      const today = (
        await db.query(
          "select (now() at time zone 'Asia/Manila')::date::text as day",
        )
      ).rows[0].day;
      await expect(
        createAssisted("walk_in", dateFrom, null),
      ).rejects.toMatchObject({ code: "22007" });
      const result = (await createAssisted("walk_in", today, null)).rows[0];
      expect(
        (
          await db.query(
            "select appointment_type from public.appointments where id=$1",
            [result.id],
          )
        ).rows[0].appointment_type,
      ).toBe("walk_in");
    });
  },
);
