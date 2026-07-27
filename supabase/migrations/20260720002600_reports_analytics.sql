-- Phase 7: privacy-safe reports, analytics, exports, and operational workload.
-- Registry and appointment reports are security invoker. Narrow aggregate-only
-- definers cover clinical sources whose RLS deliberately denies raw narrative
-- access to administrative roles. No table policy or direct grant is broadened.

begin;

create or replace function public.report_validate_scope(
  p_group text,
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_service_type text default null,
  p_staff_id uuid default null
)
returns public.app_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  select p.role
  into actor_role
  from public.profiles as p
  where p.id = auth.uid()
    and p.account_status = 'active';

  if actor_role is null or actor_role = 'resident' then
    raise exception 'reports are unavailable to this account'
      using errcode = '42501';
  end if;

  if p_group = 'registry'
    and actor_role not in ('admin', 'barangay_health_worker') then
    raise exception 'registry reports require administrator or BHW access'
      using errcode = '42501';
  elsif p_group = 'health'
    and actor_role not in ('admin', 'nurse') then
    raise exception 'health reports require administrator or nurse access'
      using errcode = '42501';
  elsif p_group in ('maternal', 'child')
    and actor_role not in ('admin', 'barangay_health_worker', 'midwife') then
    raise exception 'maternal and child reports are unavailable to this role'
      using errcode = '42501';
  elsif p_group = 'workload'
    and actor_role not in ('admin', 'nurse', 'midwife') then
    raise exception 'staff workload reports are unavailable to this role'
      using errcode = '42501';
  elsif p_group not in (
    'overview', 'registry', 'appointments', 'health',
    'maternal', 'child', 'workload'
  ) then
    raise exception 'invalid report group';
  end if;

  if p_group = 'workload' and actor_role <> 'admin'
    and p_staff_id is not null and p_staff_id <> auth.uid() then
    raise exception 'clinical staff may view only their own workload'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
    or p_end_date < p_start_date then
    raise exception 'invalid report date range';
  end if;
  if p_end_date - p_start_date > 1826 then
    raise exception 'report date range cannot exceed five years';
  end if;

  if p_purok_id is not null and not exists (
    select 1
    from public.puroks as pk
    where pk.id = p_purok_id
      and pk.barangay_id = public.deployment_barangay_id()
      and pk.is_active
      and pk.code in ('P01','P02','P03','P04','P05','P06','P07')
  ) then
    raise exception 'invalid deployment purok filter';
  end if;

  if p_service_type is not null and p_service_type not in (
    'General Consultation', 'Maternal Care', 'Child Health',
    'Immunization', 'Blood Pressure Monitoring', 'Medicine Refill',
    'Health Certificate', 'Other'
  ) then
    raise exception 'invalid report service filter';
  end if;

  if p_staff_id is not null and not exists (
    select 1
    from public.profiles as staff
    where staff.id = p_staff_id
      and staff.account_status = 'active'
      and staff.role in ('admin', 'barangay_health_worker', 'nurse', 'midwife')
  ) then
    raise exception 'invalid report staff filter';
  end if;

  return actor_role;
end;
$$;

create or replace function public.report_overview_summary(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  manila_today date :=
    (current_timestamp at time zone 'Asia/Manila')::date;
begin
  perform public.report_validate_scope(
    'overview', p_start_date, p_end_date, null, null, null
  );
  return jsonb_build_object(
    'active_residents', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null
    ),
    'households', (
      select count(*) from public.households h
      where h.status = 'active' and h.archived_at is null
    ),
    'appointments_today', (
      select count(*) from public.appointments a
      where a.scheduled_date = manila_today and a.archived_at is null
    ),
    'pending_requests', (
      select count(*) from public.appointments a
      where a.request_source = 'resident' and a.status = 'pending'
        and a.archived_at is null
    ),
    'checked_in_queue', (
      select count(*) from public.appointments a
      where a.scheduled_date = manila_today and a.status = 'checked_in'
        and a.archived_at is null
    ),
    'completed_today', (
      select count(*) from public.appointments a
      where a.scheduled_date = manila_today and a.status = 'completed'
        and a.archived_at is null
    ),
    'signed_encounters', (
      select count(*) from public.health_encounters e
      where e.status in ('signed', 'amended') and e.archived_at is null
        and e.encounter_date between p_start_date and p_end_date
    ),
    'active_pregnancies', (
      select count(*) from public.maternal_pregnancies p
      where p.status = 'active' and p.archived_at is null
    ),
    'active_child_profiles', (
      select count(*) from public.child_health_profiles c
      where c.archived_at is null
    ),
    'immunizations_due', (
      select count(*) from public.child_immunizations i
      where i.status = 'due' and i.archived_at is null
        and (i.scheduled_date is null or i.scheduled_date <= manila_today)
    )
  );
end;
$$;

create or replace function public.report_registry_summary(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  manila_today date :=
    (current_timestamp at time zone 'Asia/Manila')::date;
begin
  perform public.report_validate_scope(
    'registry', p_start_date, p_end_date, p_purok_id, null, null
  );
  return jsonb_build_object(
    'active_residents', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'male', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null and r.sex = 'male'
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'female', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null and r.sex = 'female'
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'senior_citizens', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null
        and (
          r.is_senior_citizen
          or age(manila_today, r.date_of_birth) >= interval '60 years'
        )
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'pwd_residents', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null and r.is_pwd
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'households', (
      select count(*) from public.households h
      where h.status = 'active' and h.archived_at is null
        and (p_purok_id is null or h.purok_id = p_purok_id)
    ),
    'average_household_size', (
      select coalesce(round(avg(member_count)::numeric, 2), 0)
      from (
        select h.id, count(r.id) as member_count
        from public.households h
        left join public.residents r on r.household_id = h.id
          and r.status = 'active' and r.archived_at is null
        where h.status = 'active' and h.archived_at is null
          and (p_purok_id is null or h.purok_id = p_purok_id)
        group by h.id
      ) sizes
    ),
    'without_household', (
      select count(*) from public.residents r
      where r.status = 'active' and r.archived_at is null
        and r.household_id is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'inactive', (
      select count(*) from public.residents r
      where r.status = 'inactive'
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'moved_out', (
      select count(*) from public.residents r
      where r.status = 'moved_out'
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'deceased', (
      select count(*) from public.residents r
      where r.status = 'deceased'
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'archived', (
      select count(*) from public.residents r
      where (r.status = 'archived' or r.archived_at is not null)
        and (p_purok_id is null or r.purok_id = p_purok_id)
    )
  );
end;
$$;

create or replace function public.report_residents_by_purok(
  p_start_date date,
  p_end_date date
)
returns table(label text, value bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.report_validate_scope(
    'registry', p_start_date, p_end_date, null, null, null
  );
  return query
  select pk.name::text, count(r.id)::bigint
  from public.puroks pk
  left join public.residents r on r.purok_id = pk.id
    and r.status = 'active' and r.archived_at is null
  where pk.barangay_id = public.deployment_barangay_id()
    and pk.is_active
    and pk.code in ('P01','P02','P03','P04','P05','P06','P07')
  group by pk.id, pk.name, pk.code
  order by pk.code;
end;
$$;

create or replace function public.report_residents_by_age_group(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null
)
returns table(label text, value bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  manila_today date :=
    (current_timestamp at time zone 'Asia/Manila')::date;
begin
  perform public.report_validate_scope(
    'registry', p_start_date, p_end_date, p_purok_id, null, null
  );
  return query
  with categorized as (
    select case
      when extract(year from age(manila_today, r.date_of_birth)) < 1
        then 'Under 1'
      when extract(year from age(manila_today, r.date_of_birth)) <= 4
        then '1–4'
      when extract(year from age(manila_today, r.date_of_birth)) <= 12
        then '5–12'
      when extract(year from age(manila_today, r.date_of_birth)) <= 17
        then '13–17'
      when extract(year from age(manila_today, r.date_of_birth)) <= 59
        then '18–59'
      else '60+'
    end as age_label
    from public.residents r
    where r.status = 'active' and r.archived_at is null
      and (p_purok_id is null or r.purok_id = p_purok_id)
  ),
  groups(label, sort_order) as (
    values ('Under 1', 1), ('1–4', 2), ('5–12', 3),
      ('13–17', 4), ('18–59', 5), ('60+', 6)
  )
  select groups.label, count(categorized.age_label)::bigint
  from groups
  left join categorized on categorized.age_label = groups.label
  group by groups.label, groups.sort_order
  order by groups.sort_order;
end;
$$;

create or replace function public.report_appointment_summary(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_service_type text default null,
  p_status public.appointment_status default null,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.report_validate_scope(
    'appointments', p_start_date, p_end_date, p_purok_id,
    p_service_type, p_staff_id
  );
  with filtered as (
    select a.*
    from public.appointments a
    join public.residents r on r.id = a.resident_id
    where a.scheduled_date between p_start_date and p_end_date
      and a.archived_at is null
      and (p_purok_id is null or r.purok_id = p_purok_id)
      and (p_service_type is null or a.service_type = p_service_type)
      and (p_status is null or a.status = p_status)
      and (p_staff_id is null or a.assigned_staff_id = p_staff_id)
  )
  select jsonb_build_object(
    'total', count(*),
    'scheduled', count(*) filter (where appointment_type = 'scheduled'),
    'walk_in', count(*) filter (where appointment_type = 'walk_in'),
    'resident_requested', count(*) filter (where request_source = 'resident'),
    'staff_created', count(*) filter (where request_source = 'staff'),
    'completed', count(*) filter (where status = 'completed'),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'no_show', count(*) filter (where status = 'no_show'),
    'cancellation_rate', case when count(*) = 0 then 0
      else round(100.0 * count(*) filter (where status = 'cancelled') / count(*), 2)
    end,
    'no_show_rate', case when count(*) = 0 then 0
      else round(100.0 * count(*) filter (where status = 'no_show') / count(*), 2)
    end,
    'status_counts', coalesce((
      select jsonb_object_agg(status::text, status_count)
      from (
        select status, count(*) status_count from filtered
        group by status
      ) status_rows
    ), '{}'::jsonb),
    'priority_counts', coalesce((
      select jsonb_object_agg(priority::text, priority_count)
      from (
        select priority, count(*) priority_count from filtered
        group by priority
      ) priority_rows
    ), '{}'::jsonb)
  )
  into result
  from filtered;
  return result;
end;
$$;

create or replace function public.report_appointments_over_time(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_service_type text default null,
  p_status public.appointment_status default null,
  p_staff_id uuid default null
)
returns table(period_date date, value bigint, completed bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.report_validate_scope(
    'appointments', p_start_date, p_end_date, p_purok_id,
    p_service_type, p_staff_id
  );
  return query
  with days as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date day
  ),
  filtered as (
    select a.scheduled_date, a.status
    from public.appointments a
    join public.residents r on r.id = a.resident_id
    where a.scheduled_date between p_start_date and p_end_date
      and a.archived_at is null
      and (p_purok_id is null or r.purok_id = p_purok_id)
      and (p_service_type is null or a.service_type = p_service_type)
      and (p_status is null or a.status = p_status)
      and (p_staff_id is null or a.assigned_staff_id = p_staff_id)
  )
  select days.day, count(filtered.scheduled_date)::bigint,
    count(filtered.scheduled_date) filter (
      where filtered.status = 'completed'
    )::bigint
  from days
  left join filtered on filtered.scheduled_date = days.day
  group by days.day
  order by days.day;
end;
$$;

create or replace function public.report_services_distribution(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_status public.appointment_status default null,
  p_staff_id uuid default null
)
returns table(label text, value bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.report_validate_scope(
    'appointments', p_start_date, p_end_date, p_purok_id, null, p_staff_id
  );
  return query
  select a.service_type::text, count(*)::bigint
  from public.appointments a
  join public.residents r on r.id = a.resident_id
  where a.scheduled_date between p_start_date and p_end_date
    and a.archived_at is null
    and (p_purok_id is null or r.purok_id = p_purok_id)
    and (p_status is null or a.status = p_status)
    and (p_staff_id is null or a.assigned_staff_id = p_staff_id)
  group by a.service_type
  order by count(*) desc, a.service_type;
end;
$$;

create or replace function public.report_health_summary(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.report_validate_scope(
    'health', p_start_date, p_end_date, p_purok_id, null, p_staff_id
  );
  with filtered as (
    select e.*
    from public.health_encounters e
    join public.residents r on r.id = e.resident_id
    where e.encounter_date between p_start_date and p_end_date
      and e.archived_at is null
      and (p_purok_id is null or r.purok_id = p_purok_id)
      and (p_staff_id is null or e.attending_staff_id = p_staff_id)
  )
  select jsonb_build_object(
    'total', count(*),
    'residents_served', count(distinct resident_id),
    'appointment_linked', count(*) filter (where appointment_id is not null),
    'with_vital_signs', (
      select count(*) from filtered f
      where exists (
        select 1 from public.vital_signs v where v.encounter_id = f.id
      )
    ),
    'vital_sign_completion_rate', case when count(*) = 0 then 0 else round(
      100.0 * (
        select count(*) from filtered f
        where exists (
          select 1 from public.vital_signs v where v.encounter_id = f.id
        )
      ) / count(*), 2
    ) end,
    'status_counts', coalesce((
      select jsonb_object_agg(status::text, status_count)
      from (select status, count(*) status_count from filtered group by status) s
    ), '{}'::jsonb),
    'type_counts', coalesce((
      select jsonb_object_agg(encounter_type::text, type_count)
      from (
        select encounter_type, count(*) type_count
        from filtered group by encounter_type
      ) t
    ), '{}'::jsonb)
  )
  into result
  from filtered;
  return result;
end;
$$;

create or replace function public.report_maternal_summary(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.report_validate_scope(
    'maternal', p_start_date, p_end_date, p_purok_id, null, null
  );
  return jsonb_build_object(
    'active_pregnancies', (
      select count(*) from public.maternal_pregnancies p
      join public.residents r on r.id = p.resident_id
      where p.status = 'active' and p.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'expected_deliveries', (
      select count(*) from public.maternal_pregnancies p
      join public.residents r on r.id = p.resident_id
      where p.estimated_delivery_date between p_start_date and p_end_date
        and p.status = 'active' and p.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'prenatal_visits', (
      select count(*) from public.maternal_prenatal_visits v
      join public.maternal_pregnancies p on p.id = v.pregnancy_id
      join public.residents r on r.id = p.resident_id
      where v.visit_date between p_start_date and p_end_date
        and v.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'delivery_outcomes', (
      select count(*) from public.maternal_delivery_outcomes d
      join public.maternal_pregnancies p on p.id = d.pregnancy_id
      join public.residents r on r.id = p.resident_id
      where d.delivery_date between p_start_date and p_end_date
        and d.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'postnatal_visits', (
      select count(*) from public.maternal_postnatal_visits v
      join public.maternal_pregnancies p on p.id = v.pregnancy_id
      join public.residents r on r.id = p.resident_id
      where v.visit_date between p_start_date and p_end_date
        and v.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'maternal_appointments', (
      select count(*) from public.appointments a
      join public.residents r on r.id = a.resident_id
      where a.scheduled_date between p_start_date and p_end_date
        and a.service_type = 'Maternal Care' and a.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'maternal_encounters', (
      select count(*) from public.health_encounters e
      join public.residents r on r.id = e.resident_id
      where e.encounter_date between p_start_date and p_end_date
        and e.encounter_type = 'maternal_care' and e.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'status_counts', coalesce((
      select jsonb_object_agg(status::text, status_count)
      from (
        select p.status, count(*) status_count
        from public.maternal_pregnancies p
        join public.residents r on r.id = p.resident_id
        where (p_purok_id is null or r.purok_id = p_purok_id)
        group by p.status
      ) rows
    ), '{}'::jsonb),
    'outcome_counts', coalesce((
      select jsonb_object_agg(outcome, outcome_count)
      from (
        select d.outcome, count(*) outcome_count
        from public.maternal_delivery_outcomes d
        join public.maternal_pregnancies p on p.id = d.pregnancy_id
        join public.residents r on r.id = p.resident_id
        where d.delivery_date between p_start_date and p_end_date
          and d.archived_at is null
          and (p_purok_id is null or r.purok_id = p_purok_id)
        group by d.outcome
      ) rows
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.report_child_summary(
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_growth_threshold_days integer default 180
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  manila_today date :=
    (current_timestamp at time zone 'Asia/Manila')::date;
begin
  perform public.report_validate_scope(
    'child', p_start_date, p_end_date, p_purok_id, null, null
  );
  if p_growth_threshold_days < 30 or p_growth_threshold_days > 730 then
    raise exception 'growth record threshold must be between 30 and 730 days';
  end if;
  return jsonb_build_object(
    'active_child_profiles', (
      select count(*) from public.child_health_profiles c
      join public.residents r on r.id = c.child_resident_id
      where c.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'growth_measurements', (
      select count(*) from public.child_growth_measurements g
      join public.child_health_profiles c on c.id = g.child_profile_id
      join public.residents r on r.id = c.child_resident_id
      where (g.measured_at at time zone 'Asia/Manila')::date
        between p_start_date and p_end_date
        and g.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'child_health_visits', (
      select count(*) from public.child_health_visits v
      join public.child_health_profiles c on c.id = v.child_profile_id
      join public.residents r on r.id = c.child_resident_id
      where v.visit_date between p_start_date and p_end_date
        and v.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'immunizations_due', (
      select count(*) from public.child_immunizations i
      join public.child_health_profiles c on c.id = i.child_profile_id
      join public.residents r on r.id = c.child_resident_id
      where i.status = 'due' and i.archived_at is null
        and (i.scheduled_date is null or i.scheduled_date <= manila_today)
        and (p_purok_id is null or r.purok_id = p_purok_id)
    ),
    'without_recent_growth_record', (
      select count(*) from public.child_health_profiles c
      join public.residents r on r.id = c.child_resident_id
      where c.archived_at is null
        and (p_purok_id is null or r.purok_id = p_purok_id)
        and not exists (
          select 1 from public.child_growth_measurements g
          where g.child_profile_id = c.id and g.archived_at is null
            and (g.measured_at at time zone 'Asia/Manila')::date
              >= manila_today - p_growth_threshold_days
        )
    ),
    'immunization_status_counts', coalesce((
      select jsonb_object_agg(status::text, status_count)
      from (
        select i.status, count(*) status_count
        from public.child_immunizations i
        join public.child_health_profiles c on c.id = i.child_profile_id
        join public.residents r on r.id = c.child_resident_id
        where i.archived_at is null
          and (p_purok_id is null or r.purok_id = p_purok_id)
        group by i.status
      ) rows
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.report_staff_workload(
  p_start_date date,
  p_end_date date,
  p_service_type text default null,
  p_staff_id uuid default null
)
returns table(
  staff_id uuid,
  staff_name text,
  role public.app_role,
  assigned_appointments bigint,
  completed_appointments bigint,
  clinical_encounters bigint,
  maternal_child_events bigint,
  total_volume bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_role public.app_role;
begin
  actor_role := public.report_validate_scope(
    'workload', p_start_date, p_end_date, null, p_service_type, p_staff_id
  );
  return query
  select p.id,
    concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)::text,
    p.role,
    count(distinct a.id)::bigint,
    count(distinct a.id) filter (where a.status = 'completed')::bigint,
    count(distinct e.id)::bigint,
    (
      count(distinct prv.id) + count(distinct pov.id)
      + count(distinct del.id) + count(distinct gr.id)
      + count(distinct imm.id) + count(distinct chv.id)
    )::bigint,
    (
      count(distinct a.id) + count(distinct e.id)
      + count(distinct prv.id) + count(distinct pov.id)
      + count(distinct del.id) + count(distinct gr.id)
      + count(distinct imm.id) + count(distinct chv.id)
    )::bigint
  from public.profiles p
  left join public.appointments a on a.assigned_staff_id = p.id
    and a.scheduled_date between p_start_date and p_end_date
    and a.archived_at is null
    and (p_service_type is null or a.service_type = p_service_type)
  left join public.health_encounters e on e.attending_staff_id = p.id
    and e.encounter_date between p_start_date and p_end_date
    and e.archived_at is null
  left join public.maternal_prenatal_visits prv on prv.recorded_by = p.id
    and prv.visit_date between p_start_date and p_end_date
    and prv.archived_at is null
  left join public.maternal_postnatal_visits pov on pov.recorded_by = p.id
    and pov.visit_date between p_start_date and p_end_date
    and pov.archived_at is null
  left join public.maternal_delivery_outcomes del on del.recorded_by = p.id
    and del.delivery_date between p_start_date and p_end_date
    and del.archived_at is null
  left join public.child_growth_measurements gr on gr.recorded_by = p.id
    and (gr.measured_at at time zone 'Asia/Manila')::date
      between p_start_date and p_end_date and gr.archived_at is null
  left join public.child_immunizations imm on imm.recorded_by = p.id
    and coalesce(imm.administered_date, imm.scheduled_date)
      between p_start_date and p_end_date and imm.archived_at is null
  left join public.child_health_visits chv on chv.recorded_by = p.id
    and chv.visit_date between p_start_date and p_end_date
    and chv.archived_at is null
  where p.account_status = 'active'
    and p.role in ('admin', 'barangay_health_worker', 'nurse', 'midwife')
    and (p_staff_id is null or p.id = p_staff_id)
    and (actor_role = 'admin' or p.id = auth.uid())
  group by p.id, p.first_name, p.middle_name, p.last_name, p.suffix, p.role
  order by total_volume desc, staff_name;
end;
$$;

create or replace function public.report_record_export(
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_filter_fields text[],
  p_format text,
  p_row_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare action_name text;
  report_group text;
begin
  report_group := case p_report_type
    when 'overview' then 'overview'
    when 'residents' then 'registry'
    when 'appointments' then 'appointments'
    when 'health_records' then 'health'
    when 'maternal_care' then 'maternal'
    when 'child_care' then 'child'
    when 'staff_workload' then 'workload'
    else null
  end;
  if report_group is null then
    raise exception 'invalid export report type';
  end if;
  perform public.report_validate_scope(
    report_group, p_start_date, p_end_date, null, null, null
  );
  if p_format not in ('csv', 'excel', 'pdf', 'print') then
    raise exception 'invalid export format';
  end if;
  if p_row_count < 0 or p_row_count > 5000 then
    raise exception 'invalid export row count';
  end if;
  if p_filter_fields is null
    or (p_filter_fields <@ array[
      'purok', 'service_type', 'appointment_status', 'staff'
    ]::text[]) is not true then
    raise exception 'invalid export filter metadata';
  end if;
  action_name := case when p_row_count >= 4000
    then 'report.large_export_requested'
    else 'report.exported'
  end;
  insert into public.audit_logs (
    actor_profile_id, action, entity_type, summary, request_metadata
  )
  values (
    auth.uid(), action_name, 'reports', 'Privacy-safe report export generated',
    jsonb_build_object(
      'report_type', p_report_type,
      'date_from', p_start_date,
      'date_to', p_end_date,
      'filter_fields', p_filter_fields,
      'format', p_format,
      'row_count', p_row_count
    )
  );
end;
$$;

create or replace function public.report_export_rows(
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_purok_id uuid default null,
  p_service_type text default null,
  p_status public.appointment_status default null,
  p_staff_id uuid default null,
  p_format text default 'csv',
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(row_data jsonb, total_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  report_group text;
  rows_data jsonb := '[]'::jsonb;
  row_count integer;
  filter_fields text[] := array[]::text[];
begin
  report_group := case p_report_type
    when 'overview' then 'overview'
    when 'residents' then 'registry'
    when 'appointments' then 'appointments'
    when 'health_records' then 'health'
    when 'maternal_care' then 'maternal'
    when 'child_care' then 'child'
    when 'staff_workload' then 'workload'
    else null
  end;
  if report_group is null then raise exception 'invalid export report type'; end if;
  perform public.report_validate_scope(
    report_group, p_start_date, p_end_date, p_purok_id,
    p_service_type, p_staff_id
  );
  if p_format not in ('csv', 'excel', 'pdf', 'print') then
    raise exception 'invalid export format';
  end if;
  if p_limit < 1 or p_limit > 5000 or p_offset < 0 or p_offset > 5000 then
    raise exception 'invalid export pagination';
  end if;

  if p_purok_id is not null then filter_fields := array_append(filter_fields, 'purok'); end if;
  if p_service_type is not null then filter_fields := array_append(filter_fields, 'service_type'); end if;
  if p_status is not null then filter_fields := array_append(filter_fields, 'appointment_status'); end if;
  if p_staff_id is not null then filter_fields := array_append(filter_fields, 'staff'); end if;

  if p_report_type = 'overview' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'metric', initcap(replace(metric.key, '_', ' ')),
      'value', metric.value
    ) order by metric.key), '[]'::jsonb)
    into rows_data
    from jsonb_each_text(
      public.report_overview_summary(p_start_date, p_end_date)
    ) metric;
  elsif p_report_type = 'residents' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'metric', report_row.label, 'value', report_row.value
    ) order by report_row.label), '[]'::jsonb)
    into rows_data
    from public.report_residents_by_age_group(
      p_start_date, p_end_date, p_purok_id
    ) report_row;
  elsif p_report_type = 'appointments' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'metric', report_row.label, 'value', report_row.value
    ) order by report_row.label), '[]'::jsonb)
    into rows_data
    from public.report_services_distribution(
      p_start_date, p_end_date, p_purok_id, p_status, p_staff_id
    ) report_row
    where p_service_type is null or report_row.label = p_service_type;
  elsif p_report_type = 'health_records' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'metric', initcap(replace(report_row.key, '_', ' ')),
      'value', report_row.value
    ) order by report_row.key), '[]'::jsonb)
    into rows_data
    from jsonb_each_text(
      public.report_health_summary(
        p_start_date, p_end_date, p_purok_id, p_staff_id
      )
    ) report_row
    where report_row.key <> 'status_counts'
      and report_row.key <> 'type_counts';
  elsif p_report_type = 'maternal_care' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'metric', initcap(replace(report_row.key, '_', ' ')),
      'value', report_row.value
    ) order by report_row.key), '[]'::jsonb)
    into rows_data
    from jsonb_each_text(
      public.report_maternal_summary(p_start_date, p_end_date, p_purok_id)
    ) report_row
    where report_row.key <> 'status_counts'
      and report_row.key <> 'outcome_counts';
  elsif p_report_type = 'child_care' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'metric', initcap(replace(report_row.key, '_', ' ')),
      'value', report_row.value
    ) order by report_row.key), '[]'::jsonb)
    into rows_data
    from jsonb_each_text(
      public.report_child_summary(p_start_date, p_end_date, p_purok_id, 180)
    ) report_row
    where report_row.key <> 'immunization_status_counts';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'staff', report_row.staff_name,
      'role', report_row.role,
      'assigned_appointments', report_row.assigned_appointments,
      'completed_appointments', report_row.completed_appointments,
      'clinical_encounters', report_row.clinical_encounters,
      'maternal_child_events', report_row.maternal_child_events,
      'total_volume', report_row.total_volume
    ) order by report_row.total_volume desc, report_row.staff_name), '[]'::jsonb)
    into rows_data
    from public.report_staff_workload(
      p_start_date, p_end_date, p_service_type, p_staff_id
    ) report_row;
  end if;

  row_count := jsonb_array_length(rows_data);
  if row_count > 5000 then
    perform public.report_record_export(
      p_report_type, p_start_date, p_end_date,
      filter_fields, p_format, row_count
    );
    raise exception 'report export exceeds the 5000 row limit';
  end if;
  perform public.report_record_export(
    p_report_type, p_start_date, p_end_date,
    filter_fields, p_format, row_count
  );

  return query
  select element.value, row_count::bigint
  from jsonb_array_elements(rows_data) with ordinality element(value, position)
  where element.position > p_offset
  order by element.position
  limit p_limit;
end;
$$;

revoke all on function public.report_validate_scope(text,date,date,uuid,text,uuid),
  public.report_record_export(text,date,date,text[],text,integer)
  from public, anon, authenticated;
grant execute on function public.report_validate_scope(text,date,date,uuid,text,uuid),
  public.report_record_export(text,date,date,text[],text,integer)
  to authenticated;

revoke all on function public.report_overview_summary(date,date),
  public.report_registry_summary(date,date,uuid),
  public.report_residents_by_purok(date,date),
  public.report_residents_by_age_group(date,date,uuid),
  public.report_appointment_summary(date,date,uuid,text,public.appointment_status,uuid),
  public.report_appointments_over_time(date,date,uuid,text,public.appointment_status,uuid),
  public.report_services_distribution(date,date,uuid,public.appointment_status,uuid),
  public.report_health_summary(date,date,uuid,uuid),
  public.report_maternal_summary(date,date,uuid),
  public.report_child_summary(date,date,uuid,integer),
  public.report_staff_workload(date,date,text,uuid),
  public.report_export_rows(text,date,date,uuid,text,public.appointment_status,uuid,text,integer,integer)
  from public, anon, authenticated;

grant execute on function public.report_overview_summary(date,date),
  public.report_registry_summary(date,date,uuid),
  public.report_residents_by_purok(date,date),
  public.report_residents_by_age_group(date,date,uuid),
  public.report_appointment_summary(date,date,uuid,text,public.appointment_status,uuid),
  public.report_appointments_over_time(date,date,uuid,text,public.appointment_status,uuid),
  public.report_services_distribution(date,date,uuid,public.appointment_status,uuid),
  public.report_health_summary(date,date,uuid,uuid),
  public.report_maternal_summary(date,date,uuid),
  public.report_child_summary(date,date,uuid,integer),
  public.report_staff_workload(date,date,text,uuid),
  public.report_export_rows(text,date,date,uuid,text,public.appointment_status,uuid,text,integer,integer)
  to authenticated;

commit;
