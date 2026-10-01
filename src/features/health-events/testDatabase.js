import fs from "node:fs";
import process from "node:process";
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

export async function createEventTestDatabase() {
  const { PGlite } = await import(/* @vite-ignore */ pgliteModule);
  const db = new PGlite();
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
  const realtime = readMigration("20260720010200_realtime_state_consistency");
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
  const {
    rows: [{ date_from: dateFrom, date_to: dateTo }],
  } = await db.query(`
      select (date_trunc('month', statement_timestamp() at time zone 'Asia/Manila')
        + interval '1 month')::date::text as date_from,
        (date_trunc('month', statement_timestamp() at time zone 'Asia/Manila')
        + interval '1 month' + interval '27 days')::date::text as date_to
    `);

  await db.exec(correction);
  await db.exec(`
alter table public.profiles add column first_name text default 'Test', add column last_name text default 'Staff';
alter table public.residents add column first_name text default 'Test', add column last_name text default 'Resident', add column resident_number text default 'RES-TEST';
create table public.audit_logs(actor_profile_id uuid, action text, entity_type text, entity_id uuid, summary text);
create table public.announcements (id uuid primary key default gen_random_uuid(), title text, category text, content text,
publish_at timestamptz, event_start_at timestamptz, event_end_at timestamptz, expires_at timestamptz, is_pinned boolean,
created_by uuid, updated_by uuid, request_key uuid, archived_at timestamptz, updated_at timestamptz, version bigint default 1);
`);
  await db.exec(
    readMigration("20260720010500_automated_health_service_events"),
  );
  return { db, dateFrom, dateTo };
}
