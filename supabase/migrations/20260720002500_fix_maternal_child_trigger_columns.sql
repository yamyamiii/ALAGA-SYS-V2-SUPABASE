-- Repair cross-table maternal/child trigger field access.
--
-- Trigger RECORD fields are resolved against the row type of the table that
-- fired the trigger. A single expression must therefore never reference both
-- pregnancy_number and child_number. Number assignment is table-specific, and
-- the shared semantic audit reads optional fields from JSONB row snapshots.

begin;

drop trigger if exists maternal_pregnancy_set_number
  on public.maternal_pregnancies;
drop trigger if exists child_profile_set_number
  on public.child_health_profiles;
drop function if exists public.set_maternal_child_number();

create function public.set_maternal_pregnancy_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.pregnancy_number := format(
      'MAT-%s-%s',
      to_char(clock_timestamp(), 'YYYY'),
      lpad(
        nextval('public.maternal_pregnancy_number_seq')::text,
        6,
        '0'
      )
    );
  elsif new.pregnancy_number is distinct from old.pregnancy_number then
    raise exception 'pregnancy_number is database-generated and immutable';
  end if;

  return new;
end;
$$;

create function public.set_child_health_profile_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.child_number := format(
      'CHD-%s-%s',
      to_char(clock_timestamp(), 'YYYY'),
      lpad(
        nextval('public.child_health_profile_number_seq')::text,
        6,
        '0'
      )
    );
  elsif new.child_number is distinct from old.child_number then
    raise exception 'child_number is database-generated and immutable';
  end if;

  return new;
end;
$$;

create trigger maternal_pregnancy_set_number
before insert or update on public.maternal_pregnancies
for each row execute function public.set_maternal_pregnancy_number();

create trigger child_profile_set_number
before insert or update on public.child_health_profiles
for each row execute function public.set_child_health_profile_number();

revoke all on function public.set_maternal_pregnancy_number()
  from public, anon, authenticated;
revoke all on function public.set_child_health_profile_number()
  from public, anon, authenticated;

create or replace function public.audit_maternal_child_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  action_name text;
  entity_id uuid;
  safe_identifier text;
  changed_fields jsonb;
  new_row jsonb;
  old_row jsonb;
begin
  new_row := to_jsonb(new);
  old_row := case
    when tg_op = 'UPDATE' then to_jsonb(old)
    else '{}'::jsonb
  end;
  entity_id := nullif(new_row ->> 'id', '')::uuid;

  select p.id
  into actor_id
  from public.profiles as p
  where p.id = auth.uid()
  limit 1;

  if tg_table_name = 'maternal_pregnancies' then
    action_name := case
      when tg_op = 'INSERT' then 'maternal.pregnancy_created'
      when old_row ->> 'status' is distinct from new_row ->> 'status'
        and new_row ->> 'status' = 'delivered'
        then 'maternal.pregnancy_delivered'
      when old_row ->> 'status' is distinct from new_row ->> 'status'
        and new_row ->> 'status' = 'completed'
        then 'maternal.pregnancy_completed'
      when old_row ->> 'status' is distinct from new_row ->> 'status'
        and new_row ->> 'status' = 'archived'
        then 'maternal.pregnancy_archived'
      else 'maternal.pregnancy_updated'
    end;
  elsif tg_table_name = 'maternal_prenatal_visits' then
    action_name := case
      when tg_op = 'INSERT' then 'maternal.prenatal_visit_created'
      else 'maternal.prenatal_visit_updated'
    end;
  elsif tg_table_name = 'maternal_delivery_outcomes' then
    action_name := 'maternal.delivery_recorded';
  elsif tg_table_name = 'maternal_postnatal_visits' then
    action_name := case
      when tg_op = 'INSERT' then 'maternal.postnatal_visit_created'
      else 'maternal.postnatal_visit_updated'
    end;
  elsif tg_table_name = 'child_health_profiles' then
    action_name := case
      when tg_op = 'INSERT' then 'child.profile_created'
      when old_row ->> 'archived_at' is null
        and new_row ->> 'archived_at' is not null
        then 'child.profile_archived'
      else 'child.profile_updated'
    end;
  elsif tg_table_name = 'child_growth_measurements' then
    action_name := case
      when tg_op = 'INSERT' then 'child.growth_recorded'
      else 'child.growth_updated'
    end;
  elsif tg_table_name = 'child_immunizations' then
    action_name := case
      when tg_op = 'INSERT' then 'child.immunization_created'
      when old_row ->> 'archived_at' is null
        and new_row ->> 'archived_at' is not null
        then 'child.immunization_archived'
      else 'child.immunization_updated'
    end;
  elsif tg_table_name = 'child_health_visits' then
    action_name := case
      when tg_op = 'INSERT' then 'child.visit_created'
      else 'child.visit_updated'
    end;
  else
    raise exception 'unsupported maternal/child audit table: %', tg_table_name;
  end if;

  safe_identifier := case tg_table_name
    when 'maternal_pregnancies' then new_row ->> 'pregnancy_number'
    when 'child_health_profiles' then new_row ->> 'child_number'
    else null
  end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(fields.key order by fields.key), '[]'::jsonb)
    into changed_fields
    from jsonb_object_keys(new_row) as fields(key)
    where old_row -> fields.key is distinct from new_row -> fields.key
      and fields.key in (
        'status',
        'archived_at',
        'attending_midwife_id',
        'appointment_id',
        'encounter_id',
        'visit_date',
        'next_visit_date',
        'scheduled_date',
        'administered_date'
      );
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    summary,
    old_values,
    new_values,
    request_metadata
  )
  values (
    actor_id,
    action_name,
    tg_table_name,
    entity_id,
    replace(action_name, '.', ' '),
    null,
    null,
    jsonb_strip_nulls(
      jsonb_build_object(
        'safe_identifier',
        safe_identifier,
        'changed_fields',
        changed_fields
      )
    )
  );

  return new;
end;
$$;

commit;
