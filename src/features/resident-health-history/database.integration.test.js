// @vitest-environment node
// Executable PostgreSQL tests, using a temporary PGlite installation only.
// Set ALAGA_TEST_PGLITE_MODULE to its dist/index.js file URL. No hosted writes.
import fs from "node:fs";
import process from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const read = (name) =>
  fs.readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const foundation = read("20260720002000_health_records_foundation");
const migration = read("20260720010700_resident_health_history");
const modulePath = process.env.ALAGA_TEST_PGLITE_MODULE;
const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const nurse = "10000000-0000-4000-8000-000000000003";
const resident = "20000000-0000-4000-8000-000000000001";
const foreignResident = "20000000-0000-4000-8000-000000000002";
const ids = [1, 2, 3, 4, 5].map(
  (n) => `30000000-0000-4000-8000-00000000000${n}`,
);
const fn = (sql, name) => {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
};

describe.skipIf(!modulePath)(
  "Resident health history PostgreSQL boundary",
  () => {
    let db;
    beforeAll(async () => {
      const { PGlite } = await import(/* @vite-ignore */ modulePath);
      db = new PGlite();
      const enums = read("20260720000100_extensions_and_enums");
      const helpers = read("20260720000800_helper_functions_and_triggers");
      const realtime = read("20260720010200_realtime_state_consistency");
      const policyStart = foundation.indexOf(
        "create policy health_encounters_select_nurse",
      );
      const policyEnd = foundation.indexOf(
        "create policy resident_allergies_select_nurse",
      );
      await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      ${[...enums.matchAll(/create type public\.[\s\S]*?\);/g)].map((m) => m[0]).join("\n")}
      alter type public.resident_status add value 'archived';
      ${[...foundation.matchAll(/create type public\.[\s\S]*?\);/g)].map((m) => m[0]).join("\n")}
      create table public.profiles (id uuid primary key, role public.app_role,
        account_status public.account_status, retired_at timestamptz,
        first_name text, middle_name text, last_name text, suffix text);
      create table public.residents (id uuid primary key, linked_profile_id uuid unique,
        status public.resident_status, archived_at timestamptz);
      create table public.appointments (id uuid primary key, resident_id uuid,
        assigned_staff_id uuid, scheduled_date date, service_type text,
        status public.appointment_status, archived_at timestamptz);
      create table public.health_service_events (id uuid primary key, event_date date,
        service_type text, archived_at timestamptz);
      create table public.health_event_bookings (id uuid primary key, resident_id uuid,
        event_id uuid, assigned_staff_id uuid, booking_state text, completed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.actor_id', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated, anon;
      ${fn(helpers, "current_profile_role")}
      ${fn(helpers, "current_resident_id")}
      grant execute on function public.current_profile_role(), public.current_resident_id() to authenticated;
      ${foundation.match(/create table public\.health_encounters[\s\S]*?\n\);/)[0]}
      ${foundation.match(/create table public\.vital_signs[\s\S]*?\n\);/)[0]}
      ${fn(foundation, "bump_health_encounter_version")}
      ${fn(foundation, "protect_signed_health_encounter")}
      ${fn(foundation, "protect_vital_signs_integrity")}
      create trigger health_encounters_protect_signed before update on public.health_encounters
        for each row execute function public.protect_signed_health_encounter();
      create trigger health_encounters_bump_version before update on public.health_encounters
        for each row execute function public.bump_health_encounter_version();
      create trigger vital_signs_protect_integrity before insert or update on public.vital_signs
        for each row execute function public.protect_vital_signs_integrity();
      alter table public.health_encounters enable row level security;
      alter table public.vital_signs enable row level security;
      ${foundation.slice(policyStart, policyEnd)}
      grant select on public.health_encounters, public.vital_signs to authenticated;
      ${fn(foundation, "health_encounter_update")}
      ${fn(foundation, "health_encounter_sign")}
      ${fn(foundation, "health_encounter_archive")}
      ${fn(read("20260720002100_fix_clinical_manila_dates"), "health_encounter_create")}
      ${realtime.slice(realtime.indexOf("create table public.realtime_sync_events"), realtime.indexOf("create or replace function public.emit_profile_realtime_sync"))}
      insert into public.profiles values
        ('${actor}', 'resident', 'active', null, 'Resident', null, 'One', null),
        ('${other}', 'resident', 'active', null, 'Resident', null, 'Two', null),
        ('${nurse}', 'nurse', 'active', null, 'Nurse', null, 'Test', null);
      insert into public.residents values
        ('${resident}', '${actor}', 'active', null),
        ('${foreignResident}', '${other}', 'active', null);
    `);
      // Compile the complete migration, including ACLs, policy and trigger changes.
      await db.exec(migration);
    }, 30_000);
    afterAll(async () => db?.close());
    beforeEach(async () => {
      await db.exec(`reset role; set time zone 'UTC';
      truncate public.vital_signs, public.health_encounters, public.appointments,
        public.health_event_bookings, public.health_service_events, public.realtime_sync_events;
      update public.profiles set account_status = 'active', retired_at = null;
      update public.profiles set role = 'resident' where id in ('${actor}', '${other}');
      update public.profiles set role = 'nurse' where id = '${nurse}';
      update public.residents set status = 'active', archived_at = null;
      update public.residents set linked_profile_id = null;
      update public.residents set linked_profile_id = '${actor}' where id = '${resident}';
      update public.residents set linked_profile_id = '${other}' where id = '${foreignResident}';
      select set_config('test.actor_id', '${actor}', false);
    `);
      for (let i = 0; i < ids.length; i++) {
        await db.query(
          `insert into public.health_encounters(id, encounter_number, resident_id,
        encounter_type, encounter_date, attending_staff_id, created_by, updated_by,
        chief_complaint, assessment, plan, subjective_notes, objective_notes,
        diagnosis_text, treatment_notes)
        values ($1, $2, $3, 'general_consultation', '2026-01-01', $4, $4, $4,
          'Visit reason', 'Signed assessment', 'Signed plan', 'INTERNAL SUBJECTIVE',
          'INTERNAL OBJECTIVE', 'PRIVATE DIAGNOSIS', 'PRIVATE TREATMENT')`,
          [
            ids[i],
            `ENC-2026-00000${i + 1}`,
            i === 1 ? foreignResident : resident,
            nurse,
          ],
        );
      }
      await db.query(
        `insert into public.vital_signs(encounter_id, temperature_c, systolic_bp,
      diastolic_bp, pulse_bpm, respiratory_rate, oxygen_saturation, height_cm, weight_kg,
      pain_score, recorded_by) values ($1, 36.7, 120, 80, 78, 18, 98, 160, 60, 0, $2)`,
        [ids[0], nurse],
      );
      await db.query(
        `update public.health_encounters set status = 'signed', signed_by = $1,
      signed_at = now() where id = any($2::uuid[])`,
        [nurse, [ids[0], ids[1]]],
      );
      await db.query(
        `update public.health_encounters set status = 'amended', signed_by = $1,
      signed_at = now() where id = $2`,
        [nurse, ids[3]],
      );
      await db.query(
        `update public.health_encounters set status = 'archived', signed_by = $1,
      signed_at = now(), archived_at = now() where id = $2`,
        [nurse, ids[4]],
      );
      await db.exec(
        "truncate public.realtime_sync_events; set role authenticated;",
      );
    });

    const list = async (limit = 20, offset = 0) =>
      (
        await db.query(
          "select public.resident_health_history_list($1, $2) as data",
          [limit, offset],
        )
      ).rows[0].data;
    const get = async (id) =>
      (
        await db.query(
          "select public.resident_health_history_get($1) as data",
          [id],
        )
      ).rows[0].data;

    it("lists only own signed/amended non-archived records with minimized fields", async () => {
      const data = await list();
      expect(data.total).toBe(2);
      expect(data.items.map((e) => e.id)).toEqual([ids[0], ids[3]]);
      expect(Object.keys(data.items[0]).sort()).toEqual(
        [
          "id",
          "kind",
          "visit_date",
          "service_type",
          "encounter_type",
          "staff_name",
          "status",
          "is_amended",
        ].sort(),
      );
    });
    it("returns the approved summary and actual vitals without internal metadata", async () => {
      const data = await get(ids[0]);
      expect(data.summary).toEqual({
        chief_complaint: "Visit reason",
        assessment: "Signed assessment",
        plan: "Signed plan",
      });
      expect(data.vital_signs).toEqual({
        temperature_c: 36.7,
        systolic_bp: 120,
        diastolic_bp: 80,
        pulse_bpm: 78,
        respiratory_rate: 18,
        oxygen_saturation: 98,
        height_cm: 160,
        weight_kg: 60,
        pain_score: 0,
      });
      expect(JSON.stringify(data)).not.toMatch(
        /INTERNAL|PRIVATE|resident_id|signed_by|recorded_by|version|created_at|amendment_reason|bmi/i,
      );
    });
    it.each([1, 2, 4])(
      "hides foreign, draft or archived selector %s identically",
      async (index) => {
        expect(await get(ids[index])).toBeNull();
      },
    );
    it("a manipulated Resident UUID is not an identity authority", async () => {
      expect(await get(foreignResident)).toBeNull();
      await expect(
        db.query(
          "select public.resident_health_history_list(20, 0, $1::uuid)",
          [foreignResident],
        ),
      ).rejects.toMatchObject({ code: "42883" });
    });
    it("an unsigned record cannot masquerade as finalized", async () => {
      await db.exec("reset role;");
      await expect(
        db.query(
          "update public.health_encounters set status='signed' where id=$1",
          [ids[2]],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await db.query(
            "select public.resident_health_history_finalized('signed', null, $1, null) as visible",
            [nurse],
          )
        ).rows[0].visible,
      ).toBe(false);
    });
    it.each(["inactive", "suspended", "invited"])(
      "denies %s accounts",
      async (status) => {
        await db.exec(
          `reset role; update public.profiles set account_status='${status}' where id='${actor}'; set role authenticated;`,
        );
        await expect(list()).rejects.toMatchObject({ code: "42501" });
      },
    );
    it.each(["admin", "barangay_health_worker", "nurse", "midwife"])(
      "denies personal history RPCs to %s",
      async (role) => {
        await db.exec(
          `reset role; update public.profiles set role='${role}' where id='${actor}'; set role authenticated;`,
        );
        await expect(list()).rejects.toMatchObject({ code: "42501" });
        await expect(get(ids[0])).rejects.toMatchObject({ code: "42501" });
      },
    );
    it("denies anonymous calls and unlinked/archived identities", async () => {
      await db.exec("set role anon;");
      await expect(list()).rejects.toMatchObject({ code: "42501" });
      await db.exec(
        `reset role; update public.residents set linked_profile_id=null where id='${resident}'; set role authenticated;`,
      );
      await expect(list()).rejects.toMatchObject({ code: "42501" });
      await db.exec(
        `reset role; update public.residents set linked_profile_id='${actor}', status='archived', archived_at=now() where id='${resident}'; set role authenticated;`,
      );
      await expect(list()).rejects.toMatchObject({ code: "42501" });
    });
    it("relinking uses the same durable history and never restores old retired access", async () => {
      await db.exec(`reset role; update public.residents set linked_profile_id=null;
      update public.residents set linked_profile_id='${other}' where id='${resident}';
      update public.profiles set account_status='inactive', retired_at=now() where id='${actor}';
      set role authenticated;`);
      await expect(list()).rejects.toMatchObject({ code: "42501" });
      await db.query("select set_config('test.actor_id', $1, false)", [other]);
      expect((await list()).items.map((entry) => entry.id)).toEqual([
        ids[0],
        ids[3],
      ]);
    });
    it("denies direct raw clinical reads and all direct Resident writes", async () => {
      expect(
        (await db.query("select * from public.health_encounters")).rows,
      ).toEqual([]);
      expect((await db.query("select * from public.vital_signs")).rows).toEqual(
        [],
      );
      for (const sql of [
        "delete from public.health_encounters",
        "update public.health_encounters set assessment='changed'",
        "delete from public.vital_signs",
        "update public.vital_signs set pulse_bpm=90",
      ]) {
        await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
      }
    });
    it("Resident cannot create, edit, sign or archive through existing clinical RPCs", async () => {
      for (const sql of [
        `select * from public.health_encounter_sign('${ids[2]}', 1)`,
        `select * from public.health_encounter_archive('${ids[0]}', 2)`,
        `select * from public.health_encounter_update('${ids[2]}', 1, 'x', null, null, 'x', 'x', null, null, null)`,
        `select * from public.health_encounter_create('${resident}', null, 'general_consultation', '2026-01-01', gen_random_uuid())`,
      ])
        await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
    });
    it("Nurse signing remains intact and emits only a private content-free invalidation", async () => {
      await db.query("select set_config('test.actor_id', $1, false)", [nurse]);
      expect(
        (
          await db.query("select * from public.health_encounter_sign($1, 1)", [
            ids[2],
          ])
        ).rows[0].status,
      ).toBe("signed");
      await db.exec("reset role;");
      const events = (
        await db.query("select * from public.realtime_sync_events")
      ).rows;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        topic: "health_history",
        entity_id: null,
        audience_profile_id: actor,
        audience_role: null,
      });
      expect(JSON.stringify(events)).not.toMatch(
        /Signed assessment|Signed plan|INTERNAL|PRIVATE|encounter/i,
      );
      await db.query("select set_config('test.actor_id', $1, false)", [actor]);
      await db.exec("set role authenticated;");
      expect((await list()).total).toBe(3);
      await list();
      await get(ids[2]);
      await db.exec("reset role;");
      expect(
        (await db.query("select * from public.realtime_sync_events")).rows,
      ).toHaveLength(1);
    });
    it("staff clinical RLS and signed immutability remain intact", async () => {
      await db.query("select set_config('test.actor_id', $1, false)", [nurse]);
      expect(
        (
          await db.query(
            "select subjective_notes from public.health_encounters",
          )
        ).rows.length,
      ).toBeGreaterThan(0);
      await expect(
        db.query(
          "select * from public.health_encounter_update($1, 2, 'x', null, null, 'x', 'x', null, null, null)",
          [ids[0]],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await db.exec(`reset role; update public.profiles set role='midwife' where id='${nurse}';
      update public.health_encounters set encounter_type='maternal_care' where id='${ids[2]}'; set role authenticated;`);
      expect(
        (
          await db.query("select * from public.health_encounter_sign($1, 2)", [
            ids[2],
          ])
        ).rows[0].status,
      ).toBe("signed");
    });
    it("completed visits/events are own-only metadata; completion never exposes draft notes", async () => {
      await db.exec(`reset role;
      insert into public.appointments values
        ('40000000-0000-4000-8000-000000000001', '${resident}', '${nurse}', '2026-02-01', 'Immunization', 'completed', null),
        ('40000000-0000-4000-8000-000000000002', '${foreignResident}', '${nurse}', '2026-02-01', 'Immunization', 'completed', null);
      insert into public.health_encounters(id, encounter_number, resident_id, appointment_id,
        encounter_type, encounter_date, attending_staff_id, created_by, updated_by, assessment)
      values ('30000000-0000-4000-8000-000000000006', 'ENC-2026-000006', '${resident}',
        '40000000-0000-4000-8000-000000000001', 'immunization', '2026-02-01', '${nurse}', '${nurse}', '${nurse}', 'UNFINALIZED');
      insert into public.health_service_events values ('50000000-0000-4000-8000-000000000001', '2026-03-01', 'Maternal Care', null);
      insert into public.health_event_bookings values
        ('60000000-0000-4000-8000-000000000001', '${resident}', '50000000-0000-4000-8000-000000000001', '${nurse}', 'completed', now()),
        ('60000000-0000-4000-8000-000000000002', '${foreignResident}', '50000000-0000-4000-8000-000000000001', '${nurse}', 'completed', now());
      set role authenticated;`);
      const data = await list();
      expect(data.total).toBe(4);
      expect(
        data.items.filter((entry) => entry.status === "completed"),
      ).toHaveLength(2);
      expect(await get(ids[2])).toBeNull();
      expect(await get("30000000-0000-4000-8000-000000000006")).toBeNull();
      expect(JSON.stringify(data)).not.toContain("Signed assessment");
      expect(JSON.stringify(data)).not.toContain("UNFINALIZED");
      await db.exec(`reset role; update public.health_encounters set status='signed',
      signed_at=now(), signed_by='${nurse}' where id='30000000-0000-4000-8000-000000000006'; set role authenticated;`);
      expect(
        (await list()).items.filter((entry) => entry.kind === "appointment"),
      ).toHaveLength(0);
      expect((await list()).total).toBe(4);
    });
    it("missing measurements and pagination/empty results behave safely", async () => {
      expect((await get(ids[3])).vital_signs).toBeNull();
      expect((await list(1)).items).toHaveLength(1);
      expect((await list(1, 1)).items).toHaveLength(1);
      expect((await list(1, 2)).items).toEqual([]);
      await expect(list(101)).rejects.toMatchObject({ code: "22023" });
      await db.query("select set_config('test.actor_id', $1, false)", [other]);
      await db.exec(
        `reset role; delete from public.health_encounters where resident_id='${foreignResident}'; set role authenticated;`,
      );
      expect(await list()).toEqual({ items: [], total: 0 });
    });
  },
);
