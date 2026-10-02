import fs from "node:fs";
import process from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const read = (name) =>
  fs.readFileSync(`supabase/migrations/${name}.sql`, "utf8");
const migration = read("20260720010600_restore_archived_resident_identity");
const functions = (sql, name) => {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  if (!match) throw new Error(`Missing test function ${name}`);
  return match[0];
};

describe("Resident restore trusted database boundary", () => {
  it("derives the caller, requires an active unretired Administrator and locks actor/Resident", () => {
    expect(migration).toMatch(/v_actor_id uuid := auth\.uid\(\)/);
    expect(migration).toMatch(/actor\.role = 'admin'/);
    expect(migration).toMatch(/actor\.account_status = 'active'/);
    expect(migration).toMatch(/actor\.retired_at is null/);
    expect(migration).toMatch(/for share/i);
    expect(migration).toMatch(/where resident\.id = p_resident_id for update/i);
    expect(migration).toMatch(
      /v_resident\.updated_at is distinct from p_expected_updated_at/,
    );
  });
  it("fails closed on portal links, preserves profile lifecycle/history and adds no table grants", () => {
    expect(migration).toMatch(
      /old\.linked_profile_id is not null or new\.linked_profile_id is not null/,
    );
    expect(migration).toMatch(/v_resident\.linked_profile_id is not null/);
    expect(migration).not.toMatch(
      /(?:update|delete from|insert into) public\.(?:profiles|appointments|health_encounters|health_event_bookings|account_retirements)/i,
    );
    expect(migration).not.toMatch(/grant\s+(?:update|insert|delete|all)/i);
    expect(migration).toMatch(
      /revoke all on function public\.registry_restore_resident\(uuid, timestamptz\)[\s\S]*from public, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(/set search_path = ''/);
  });
});

const pgliteModule = process.env.ALAGA_TEST_PGLITE_MODULE;
const admin = "10000000-0000-4000-8000-000000000001";
const oldProfile = "10000000-0000-4000-8000-000000000002";
const newProfile = "10000000-0000-4000-8000-000000000003";
const resident = "20000000-0000-4000-8000-000000000006";
const purok = "30000000-0000-4000-8000-000000000001";
const barangay = "40000000-0000-4000-8000-000000000001";
const request = "50000000-0000-4000-8000-000000000001";

describe.skipIf(!pgliteModule)(
  "executed PostgreSQL Resident restore and explicit relink",
  () => {
    let db;
    beforeAll(async () => {
      const { PGlite } = await import(/* @vite-ignore */ pgliteModule);
      db = new PGlite();
      const foundation = read("20260720000100_extensions_and_enums");
      const workflow = read("20260720001400_registry_workflows");
      const helpers = read("20260720000800_helper_functions_and_triggers");
      const management = read("20260720001200_trusted_user_management");
      await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      ${[...foundation.matchAll(/create type public\.[\s\S]*?\);/g)].map((match) => match[0]).join("\n")}
      create table public.profiles (id uuid primary key, role public.app_role, account_status public.account_status, retired_at timestamptz, first_name text, middle_name text, last_name text, phone_number text, status_changed_at timestamptz);
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated, anon;
      ${read("20260720000300_locations_and_households")}
      ${read("20260720000400_residents")}
      ${read("20260720001300_resident_archived_status")}
      commit;
      ${read("20260720000700_audit_logs")}
      ${workflow.slice(workflow.indexOf("alter table public.residents"), workflow.indexOf("-- A household head"))}
      ${functions(helpers, "set_updated_at")}
      create trigger residents_set_updated_at before update on public.residents for each row execute function public.set_updated_at();
      ${functions(helpers, "audit_safe_snapshot")}
      ${functions(workflow, "registry_changed_fields")}
      ${functions(workflow, "audit_row_change")}
      create trigger residents_audit_change after update on public.residents for each row execute function public.audit_row_change();
      ${functions(read("20260720001600_registry_hardening"), "protect_resident_profile_link")}
      create trigger residents_protect_account_link before insert or update of linked_profile_id on public.residents for each row execute function public.protect_resident_profile_link();
      ${read("20260720004400_resident_self_registration").split("create index resident_registration_status_submitted_idx")[0]}
      ${functions(management, "assert_active_administrator")}
      ${functions(management, "record_user_management_audit")}
      ${read("20260720004500_fix_resident_registration_approval")}
      ${migration}
      -- Real foreign-key history rows, intentionally minimal unrelated schemas.
      create table public.restore_test_appointments (id uuid primary key default gen_random_uuid(), resident_id uuid references public.residents(id) on delete restrict);
      create table public.restore_test_encounters (id uuid primary key default gen_random_uuid(), resident_id uuid references public.residents(id) on delete restrict);
      create table public.restore_test_event_bookings (id uuid primary key default gen_random_uuid(), resident_id uuid references public.residents(id) on delete restrict, booked_by uuid references public.profiles(id) on delete restrict);
      insert into public.profiles(id, role, account_status, retired_at) values
        ('${admin}', 'admin', 'active', null), ('${oldProfile}', 'resident', 'inactive', now()), ('${newProfile}', 'resident', 'invited', null);
      insert into auth.users values ('${newProfile}', 'test@example.com', now());
      insert into public.barangays(id,name,city_or_municipality,province) values ('${barangay}','Brgy. Bagongpook','Lipa City','Batangas');
      insert into public.puroks(id,barangay_id,code,name) values ('${purok}','${barangay}','P01','Purok 1');
      insert into public.residents(id,barangay_id,purok_id,first_name,last_name,date_of_birth,sex,address_line,status) values ('${resident}','${barangay}','${purok}','Test','Resident','1995-01-01','female','Test address','archived');
      insert into public.resident_registration_requests(id,profile_id,first_name,last_name,date_of_birth,sex,purok_id) values ('${request}','${newProfile}','Test','Resident','1995-01-01','female','${purok}');
      insert into public.restore_test_appointments(resident_id) values ('${resident}');
      insert into public.restore_test_encounters(resident_id) values ('${resident}');
      insert into public.restore_test_event_bookings(resident_id,booked_by) values ('${resident}','${oldProfile}');
    `);
    }, 30000);
    afterAll(async () => db?.close());

    async function transaction(fn, actor = admin, role = "authenticated") {
      await db.exec(
        `begin; set local role ${role}; set local "request.jwt.claim.sub" = '${actor}';`,
      );
      try {
        return await fn();
      } finally {
        await db.exec("rollback");
      }
    }
    // RPC argument snapshots are read as the test owner, not with broadened table grants.
    async function snapshot() {
      return (
        await db.query("select * from public.residents where id=$1", [resident])
      ).rows[0];
    }
    async function restoreWithRevision(revision) {
      return db.query("select * from public.registry_restore_resident($1,$2)", [
        resident,
        revision,
      ]);
    }

    it("restores active status while preserving UUID, RES number and old retired account", async () => {
      const before = await snapshot();
      await transaction(async () => {
        const result = (await restoreWithRevision(before.updated_at)).rows[0];
        expect(result).toMatchObject({
          id: resident,
          resident_number: before.resident_number,
          status: "active",
          archived_at: null,
        });
      });
      // No permission is granted to query profiles in the authenticated transaction.
      expect(
        (
          await db.query(
            "select account_status, retired_at from public.profiles where id=$1",
            [oldProfile],
          )
        ).rows[0],
      ).toMatchObject({
        account_status: "inactive",
        retired_at: expect.any(Date),
      });
    });
    it("preserves dependent history and emits a minimized resident.restored audit event", async () => {
      const before = await snapshot();
      await transaction(async () => {
        await restoreWithRevision(before.updated_at);
        await db.exec("set local role postgres");
        for (const table of [
          "restore_test_appointments",
          "restore_test_encounters",
          "restore_test_event_bookings",
        ]) {
          expect(
            (
              await db.query(
                `select count(*)::integer as total from public.${table} where resident_id=$1`,
                [resident],
              )
            ).rows[0].total,
          ).toBe(1);
        }
        expect(
          (
            await db.query(
              "select action from public.audit_logs where entity_id=$1",
              [resident],
            )
          ).rows,
        ).toContainEqual({ action: "resident.restored" });
      });
    });
    it("allows the existing service-role approval to link the new profile without creating another Resident", async () => {
      const before = await snapshot();
      await transaction(async () => {
        await restoreWithRevision(before.updated_at);
        await db.exec("set local role service_role");
        const result = (
          await db.query(
            "select * from public.admin_approve_resident_registration($1,$2,$3,1)",
            [admin, request, resident],
          )
        ).rows[0];
        expect(result).toEqual({
          resident_id: resident,
          resident_number: before.resident_number,
          linked_existing: true,
        });
        await db.exec("set local role postgres");
        expect(
          (
            await db.query(
              "select count(*)::integer as total from public.residents",
            )
          ).rows[0].total,
        ).toBe(1);
        expect((await snapshot()).linked_profile_id).toBe(newProfile);
        expect(
          (
            await db.query(
              "select status, resident_id from public.resident_registration_requests where id=$1",
              [request],
            )
          ).rows[0],
        ).toEqual({ status: "approved", resident_id: resident });
        expect(
          (
            await db.query(
              "select account_status from public.profiles where id=$1",
              [newProfile],
            )
          ).rows[0].account_status,
        ).toBe("active");
        expect(
          (
            await db.query(
              "select account_status from public.profiles where id=$1",
              [oldProfile],
            )
          ).rows[0].account_status,
        ).toBe("inactive");
      });
    });
    it.each(["barangay_health_worker", "nurse", "midwife", "resident"])(
      "denies %s despite RPC execute privilege",
      async (role) => {
        const before = await snapshot();
        await db.query("update public.profiles set role=$1 where id=$2", [
          role,
          newProfile,
        ]);
        await expect(
          transaction(() => restoreWithRevision(before.updated_at), newProfile),
        ).rejects.toMatchObject({ code: "42501" });
        await db.query(
          "update public.profiles set role='resident' where id=$1",
          [newProfile],
        );
      },
    );
    it("denies anonymous callers", async () => {
      await expect(
        transaction(() => restoreWithRevision(new Date()), admin, "anon"),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("rejects inactive Administrators", async () => {
      await db.query(
        "update public.profiles set account_status='inactive' where id=$1",
        [admin],
      );
      await expect(
        transaction(() => restoreWithRevision(new Date())),
      ).rejects.toMatchObject({ code: "42501" });
      await db.query(
        "update public.profiles set account_status='active' where id=$1",
        [admin],
      );
    });
    it("rejects stale revisions", async () => {
      await expect(
        transaction(() => restoreWithRevision(new Date(0))),
      ).rejects.toMatchObject({ code: "40001" });
    });
    it("rejects repeated restores without another lifecycle event", async () => {
      const before = await snapshot();
      await expect(
        transaction(async () => {
          await restoreWithRevision(before.updated_at);
          await restoreWithRevision(before.updated_at);
        }),
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("blocks an existing active replacement link without overwriting it", async () => {
      await db.query(
        "update public.profiles set account_status='active' where id=$1",
        [newProfile],
      );
      await db.exec(
        `begin; set local "app.trusted_resident_linking" = 'on'; update public.residents set linked_profile_id='${newProfile}' where id='${resident}'; commit;`,
      );
      const before = await snapshot();
      await expect(
        transaction(() => restoreWithRevision(before.updated_at)),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await snapshot()).linked_profile_id).toBe(newProfile);
      await db.exec(
        `begin; set local "app.trusted_resident_linking" = 'on'; update public.residents set linked_profile_id=null where id='${resident}'; commit;`,
      );
      await db.query(
        "update public.profiles set account_status='invited' where id=$1",
        [newProfile],
      );
    });
    it("also blocks a stale retired-profile link rather than silently clearing it", async () => {
      await db.exec(
        `begin; set local "app.trusted_resident_linking" = 'on'; update public.residents set linked_profile_id='${oldProfile}' where id='${resident}'; commit;`,
      );
      const before = await snapshot();
      await expect(
        transaction(() => restoreWithRevision(before.updated_at)),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await snapshot()).linked_profile_id).toBe(oldProfile);
      await db.exec(
        `begin; set local "app.trusted_resident_linking" = 'on'; update public.residents set linked_profile_id=null where id='${resident}'; commit;`,
      );
    });
    it("prevents a direct status write from bypassing portal-link conflict checks", async () => {
      await db.exec(
        `begin; set local "app.trusted_resident_linking" = 'on'; update public.residents set linked_profile_id='${newProfile}' where id='${resident}'; commit;`,
      );
      await expect(
        transaction(async () => {
          await db.exec("set local role postgres");
          await db.query(
            "update public.residents set status='active' where id=$1",
            [resident],
          );
        }),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await snapshot()).status).toBe("archived");
      await db.exec(
        `begin; set local "app.trusted_resident_linking" = 'on'; update public.residents set linked_profile_id=null where id='${resident}'; commit;`,
      );
    });
    it("blocks duplicate creation while the existing identity is still archived", async () => {
      await expect(
        transaction(
          () =>
            db.query(
              "select * from public.admin_approve_resident_registration($1,$2,null,1)",
              [admin, request],
            ),
          admin,
          "service_role",
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });
    it("retains optimistic review version protection after restoration", async () => {
      const before = await snapshot();
      await expect(
        transaction(async () => {
          await restoreWithRevision(before.updated_at);
          await db.exec("set local role service_role");
          await db.query(
            "select * from public.admin_approve_resident_registration($1,$2,$3,99)",
            [admin, request, resident],
          );
        }),
      ).rejects.toThrow(/changed by another administrator/);
    });
  },
);
