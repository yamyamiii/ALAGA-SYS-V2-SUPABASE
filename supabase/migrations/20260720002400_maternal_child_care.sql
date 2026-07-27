-- Phase 6: structured maternal and child care.
-- Clinical interpretation remains human-entered. No diagnosis, recommendation,
-- eligibility, growth classification, or vaccine schedule is generated.

begin;

create type public.maternal_pregnancy_status as enum (
  'active', 'delivered', 'completed', 'archived'
);
create type public.maternal_risk_level as enum (
  'unassessed', 'low', 'moderate', 'high'
);
create type public.child_immunization_status as enum (
  'due', 'completed', 'missed', 'deferred'
);

create sequence public.maternal_pregnancy_number_seq as bigint start with 1;
create sequence public.child_health_profile_number_seq as bigint start with 1;

create table public.maternal_pregnancies (
  id uuid primary key default gen_random_uuid(),
  pregnancy_number text not null unique,
  resident_id uuid not null references public.residents(id) on delete restrict,
  status public.maternal_pregnancy_status not null default 'active',
  last_menstrual_period date,
  estimated_delivery_date date not null,
  gravida smallint not null,
  para smallint not null,
  term_births smallint not null default 0,
  preterm_births smallint not null default 0,
  abortions smallint not null default 0,
  living_children smallint not null default 0,
  pregnancy_risk_level public.maternal_risk_level not null default 'unassessed',
  risk_notes text,
  attending_midwife_id uuid references public.profiles(id) on delete restrict,
  request_key uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint maternal_pregnancy_number_format check (
    pregnancy_number ~ '^MAT-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint maternal_obstetric_counts check (
    gravida between 1 and 30 and para between 0 and 30
    and term_births between 0 and 30 and preterm_births between 0 and 30
    and abortions between 0 and 30 and living_children between 0 and 30
    and term_births + preterm_births <= para
  ),
  constraint maternal_pregnancy_dates check (
    last_menstrual_period is null
    or estimated_delivery_date > last_menstrual_period
  ),
  constraint maternal_risk_notes_length check (
    risk_notes is null or char_length(risk_notes) <= 5000
  ),
  constraint maternal_pregnancy_archive_consistency check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  )
);
create unique index maternal_one_active_pregnancy
  on public.maternal_pregnancies(resident_id)
  where status = 'active' and archived_at is null;
create unique index maternal_pregnancy_request_unique
  on public.maternal_pregnancies(created_by, request_key)
  where request_key is not null;
create index maternal_pregnancy_list_idx
  on public.maternal_pregnancies(status, estimated_delivery_date, created_at desc);

create table public.maternal_prenatal_visits (
  id uuid primary key default gen_random_uuid(),
  pregnancy_id uuid not null references public.maternal_pregnancies(id) on delete restrict,
  encounter_id uuid references public.health_encounters(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete restrict,
  visit_date date not null,
  gestational_age_weeks numeric(4,1),
  weight_kg numeric(6,2),
  systolic_bp smallint,
  diastolic_bp smallint,
  fundal_height_cm numeric(5,2),
  fetal_heart_rate_bpm smallint,
  fetal_movement_status text,
  presentation text,
  edema_status text,
  findings text,
  plan text,
  next_visit_date date,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  request_key uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint maternal_prenatal_measurements check (
    (gestational_age_weeks is null or gestational_age_weeks between 0 and 45)
    and (weight_kg is null or weight_kg between 20 and 300)
    and (systolic_bp is null or systolic_bp between 30 and 300)
    and (diastolic_bp is null or diastolic_bp between 20 and 200)
    and (fundal_height_cm is null or fundal_height_cm between 0 and 60)
    and (fetal_heart_rate_bpm is null or fetal_heart_rate_bpm between 30 and 250)
  ),
  constraint maternal_prenatal_text_lengths check (
    (fetal_movement_status is null or char_length(fetal_movement_status) <= 100)
    and (presentation is null or char_length(presentation) <= 100)
    and (edema_status is null or char_length(edema_status) <= 100)
    and (findings is null or char_length(findings) <= 10000)
    and (plan is null or char_length(plan) <= 10000)
  ),
  constraint maternal_prenatal_next_date check (
    next_visit_date is null or next_visit_date >= visit_date
  )
);
create unique index maternal_prenatal_request_unique
  on public.maternal_prenatal_visits(recorded_by, request_key)
  where request_key is not null;
create unique index maternal_prenatal_encounter_unique
  on public.maternal_prenatal_visits(encounter_id)
  where encounter_id is not null;
create index maternal_prenatal_timeline_idx
  on public.maternal_prenatal_visits(pregnancy_id, visit_date desc);

create table public.maternal_delivery_outcomes (
  id uuid primary key default gen_random_uuid(),
  pregnancy_id uuid not null unique references public.maternal_pregnancies(id) on delete restrict,
  delivery_date date not null,
  delivery_type text not null,
  delivery_place text not null,
  outcome text not null,
  newborn_count smallint not null default 1,
  maternal_condition text,
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  request_key uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint maternal_delivery_values check (
    delivery_type in ('vaginal', 'cesarean', 'assisted', 'other')
    and outcome in ('live_birth', 'stillbirth', 'miscarriage', 'multiple_outcomes', 'other')
    and newborn_count between 0 and 10
  ),
  constraint maternal_delivery_text_lengths check (
    char_length(btrim(delivery_place)) between 1 and 500
    and (maternal_condition is null or char_length(maternal_condition) <= 5000)
    and (notes is null or char_length(notes) <= 10000)
  )
);
create unique index maternal_delivery_request_unique
  on public.maternal_delivery_outcomes(recorded_by, request_key)
  where request_key is not null;

create table public.maternal_postnatal_visits (
  id uuid primary key default gen_random_uuid(),
  pregnancy_id uuid not null references public.maternal_pregnancies(id) on delete restrict,
  encounter_id uuid references public.health_encounters(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete restrict,
  visit_date date not null,
  maternal_condition text,
  systolic_bp smallint,
  diastolic_bp smallint,
  temperature_c numeric(4,1),
  bleeding_status text,
  breastfeeding_status text,
  mental_wellbeing_notes text,
  findings text,
  plan text,
  next_visit_date date,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  request_key uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint maternal_postnatal_measurements check (
    (systolic_bp is null or systolic_bp between 30 and 300)
    and (diastolic_bp is null or diastolic_bp between 20 and 200)
    and (temperature_c is null or temperature_c between 20 and 50)
  ),
  constraint maternal_postnatal_text_lengths check (
    (maternal_condition is null or char_length(maternal_condition) <= 5000)
    and (bleeding_status is null or char_length(bleeding_status) <= 100)
    and (breastfeeding_status is null or char_length(breastfeeding_status) <= 100)
    and (mental_wellbeing_notes is null or char_length(mental_wellbeing_notes) <= 10000)
    and (findings is null or char_length(findings) <= 10000)
    and (plan is null or char_length(plan) <= 10000)
  ),
  constraint maternal_postnatal_next_date check (
    next_visit_date is null or next_visit_date >= visit_date
  )
);
create unique index maternal_postnatal_request_unique
  on public.maternal_postnatal_visits(recorded_by, request_key)
  where request_key is not null;
create unique index maternal_postnatal_encounter_unique
  on public.maternal_postnatal_visits(encounter_id)
  where encounter_id is not null;
create index maternal_postnatal_timeline_idx
  on public.maternal_postnatal_visits(pregnancy_id, visit_date desc);

create table public.child_health_profiles (
  id uuid primary key default gen_random_uuid(),
  child_number text not null unique,
  child_resident_id uuid not null references public.residents(id) on delete restrict,
  mother_resident_id uuid references public.residents(id) on delete restrict,
  guardian_resident_id uuid references public.residents(id) on delete restrict,
  birth_date date not null,
  birth_weight_kg numeric(5,2),
  birth_length_cm numeric(5,2),
  birth_place text,
  delivery_type text,
  gestational_age_weeks numeric(4,1),
  newborn_screening_status text,
  blood_type text,
  request_key uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint child_number_format check (
    child_number ~ '^CHD-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint child_profile_links check (
    child_resident_id is distinct from mother_resident_id
    and child_resident_id is distinct from guardian_resident_id
  ),
  constraint child_birth_measurements check (
    (birth_weight_kg is null or birth_weight_kg between 0.1 and 15)
    and (birth_length_cm is null or birth_length_cm between 20 and 80)
    and (gestational_age_weeks is null or gestational_age_weeks between 20 and 45)
  ),
  constraint child_profile_text_lengths check (
    (birth_place is null or char_length(birth_place) <= 500)
    and (delivery_type is null or char_length(delivery_type) <= 100)
    and (newborn_screening_status is null or char_length(newborn_screening_status) <= 100)
    and (blood_type is null or blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'))
  )
);
create unique index child_one_active_profile
  on public.child_health_profiles(child_resident_id)
  where archived_at is null;
create unique index child_profile_request_unique
  on public.child_health_profiles(created_by, request_key)
  where request_key is not null;
create index child_profile_list_idx
  on public.child_health_profiles(birth_date desc, created_at desc)
  where archived_at is null;

create table public.child_growth_measurements (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.child_health_profiles(id) on delete restrict,
  encounter_id uuid references public.health_encounters(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete restrict,
  measured_at timestamptz not null,
  weight_kg numeric(6,2),
  height_cm numeric(5,2),
  head_circumference_cm numeric(5,2),
  mid_upper_arm_circumference_cm numeric(5,2),
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  request_key uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint child_growth_measurements_possible check (
    (weight_kg is null or weight_kg between 0.1 and 300)
    and (height_cm is null or height_cm between 20 and 250)
    and (head_circumference_cm is null or head_circumference_cm between 15 and 80)
    and (mid_upper_arm_circumference_cm is null or mid_upper_arm_circumference_cm between 5 and 80)
    and num_nonnulls(weight_kg, height_cm, head_circumference_cm, mid_upper_arm_circumference_cm) > 0
  ),
  constraint child_growth_notes_length check (
    notes is null or char_length(notes) <= 5000
  )
);
create unique index child_growth_request_unique
  on public.child_growth_measurements(recorded_by, request_key)
  where request_key is not null;
create unique index child_growth_encounter_unique
  on public.child_growth_measurements(encounter_id)
  where encounter_id is not null;
create index child_growth_timeline_idx
  on public.child_growth_measurements(child_profile_id, measured_at desc);

create table public.child_immunizations (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.child_health_profiles(id) on delete restrict,
  vaccine_code text not null,
  vaccine_name text not null,
  dose_number smallint not null,
  scheduled_date date,
  administered_date date,
  status public.child_immunization_status not null,
  administered_by uuid references public.profiles(id) on delete restrict,
  facility text,
  lot_number text,
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint child_immunization_identity_unique unique (
    child_profile_id, vaccine_code, dose_number
  ),
  constraint child_immunization_values check (
    char_length(btrim(vaccine_code)) between 1 and 50
    and char_length(btrim(vaccine_name)) between 1 and 200
    and dose_number between 1 and 20
    and (facility is null or char_length(facility) <= 500)
    and (lot_number is null or char_length(lot_number) <= 100)
    and (notes is null or char_length(notes) <= 5000)
    and (
      status <> 'completed'
      or (administered_date is not null and administered_by is not null)
    )
  )
);
create index child_immunization_timeline_idx
  on public.child_immunizations(child_profile_id, scheduled_date, administered_date);
create unique index child_immunization_request_unique
  on public.child_immunizations(recorded_by, request_key)
  where request_key is not null;

create table public.child_health_visits (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.child_health_profiles(id) on delete restrict,
  encounter_id uuid references public.health_encounters(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete restrict,
  visit_date date not null,
  developmental_notes text,
  findings text,
  plan text,
  next_visit_date date,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  request_key uuid,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint child_visit_text_lengths check (
    (developmental_notes is null or char_length(developmental_notes) <= 10000)
    and (findings is null or char_length(findings) <= 10000)
    and (plan is null or char_length(plan) <= 10000)
  ),
  constraint child_visit_next_date check (
    next_visit_date is null or next_visit_date >= visit_date
  )
);
create unique index child_visit_request_unique
  on public.child_health_visits(recorded_by, request_key)
  where request_key is not null;
create unique index child_visit_encounter_unique
  on public.child_health_visits(encounter_id)
  where encounter_id is not null;
create index child_visit_timeline_idx
  on public.child_health_visits(child_profile_id, visit_date desc);

create or replace function public.set_maternal_child_number()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'maternal_pregnancies' then
    if tg_op = 'INSERT' then
      new.pregnancy_number := format('MAT-%s-%s',
        to_char(clock_timestamp(), 'YYYY'),
        lpad(nextval('public.maternal_pregnancy_number_seq')::text, 6, '0'));
    elsif new.pregnancy_number is distinct from old.pregnancy_number then
      raise exception 'pregnancy_number is database-generated and immutable';
    end if;
  elsif tg_table_name = 'child_health_profiles' then
    if tg_op = 'INSERT' then
      new.child_number := format('CHD-%s-%s',
        to_char(clock_timestamp(), 'YYYY'),
        lpad(nextval('public.child_health_profile_number_seq')::text, 6, '0'));
    elsif new.child_number is distinct from old.child_number then
      raise exception 'child_number is database-generated and immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger maternal_pregnancy_set_number before insert or update
  on public.maternal_pregnancies for each row
  execute function public.set_maternal_child_number();
create trigger child_profile_set_number before insert or update
  on public.child_health_profiles for each row
  execute function public.set_maternal_child_number();

create or replace function public.protect_maternal_child_row()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'maternal and child record identity is immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'maternal_pregnancies','maternal_prenatal_visits',
    'maternal_delivery_outcomes','maternal_postnatal_visits',
    'child_health_profiles','child_growth_measurements',
    'child_immunizations','child_health_visits'
  ] loop
    execute format(
      'create trigger %I_protect before update on public.%I
       for each row execute function public.protect_maternal_child_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

create or replace function public.maternal_child_can_access(p_resident_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case public.current_profile_role()
    when 'midwife' then true
    when 'nurse' then exists (
      select 1 from public.appointments a
      where a.resident_id = p_resident_id and a.assigned_staff_id = auth.uid()
        and a.service_type in ('Maternal Care','Child Health')
        and a.archived_at is null
    ) or exists (
      select 1 from public.health_encounters e
      where e.resident_id = p_resident_id and e.attending_staff_id = auth.uid()
        and e.encounter_type in ('maternal_care','child_health','immunization')
        and e.archived_at is null
    )
    else false
  end
$$;

create or replace function public.maternal_child_validate_links(
  p_resident_id uuid, p_appointment_id uuid, p_encounter_id uuid
)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.resident_id = p_resident_id
      and a.archived_at is null
  ) then
    raise exception 'linked appointment does not belong to the resident'
      using errcode = '23514';
  end if;
  if p_encounter_id is not null and not exists (
    select 1 from public.health_encounters e
    where e.id = p_encounter_id and e.resident_id = p_resident_id
      and e.archived_at is null
      and (p_appointment_id is null or e.appointment_id = p_appointment_id)
  ) then
    raise exception 'linked encounter does not belong to the resident or appointment'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.maternal_pregnancies enable row level security;
alter table public.maternal_prenatal_visits enable row level security;
alter table public.maternal_delivery_outcomes enable row level security;
alter table public.maternal_postnatal_visits enable row level security;
alter table public.child_health_profiles enable row level security;
alter table public.child_growth_measurements enable row level security;
alter table public.child_immunizations enable row level security;
alter table public.child_health_visits enable row level security;

create policy maternal_pregnancies_clinical_read
  on public.maternal_pregnancies for select to authenticated
  using (public.maternal_child_can_access(resident_id));
create policy maternal_prenatal_clinical_read
  on public.maternal_prenatal_visits for select to authenticated
  using (exists (
    select 1 from public.maternal_pregnancies p
    where p.id = pregnancy_id and public.maternal_child_can_access(p.resident_id)
  ));
create policy maternal_delivery_clinical_read
  on public.maternal_delivery_outcomes for select to authenticated
  using (exists (
    select 1 from public.maternal_pregnancies p
    where p.id = pregnancy_id and public.maternal_child_can_access(p.resident_id)
  ));
create policy maternal_postnatal_clinical_read
  on public.maternal_postnatal_visits for select to authenticated
  using (exists (
    select 1 from public.maternal_pregnancies p
    where p.id = pregnancy_id and public.maternal_child_can_access(p.resident_id)
  ));
create policy child_profiles_clinical_read
  on public.child_health_profiles for select to authenticated
  using (public.maternal_child_can_access(child_resident_id));
create policy child_growth_clinical_read
  on public.child_growth_measurements for select to authenticated
  using (exists (
    select 1 from public.child_health_profiles c
    where c.id = child_profile_id
      and public.maternal_child_can_access(c.child_resident_id)
  ));
create policy child_immunizations_clinical_read
  on public.child_immunizations for select to authenticated
  using (exists (
    select 1 from public.child_health_profiles c
    where c.id = child_profile_id
      and public.maternal_child_can_access(c.child_resident_id)
  ));
create policy child_visits_clinical_read
  on public.child_health_visits for select to authenticated
  using (exists (
    select 1 from public.child_health_profiles c
    where c.id = child_profile_id
      and public.maternal_child_can_access(c.child_resident_id)
  ));

create or replace function public.audit_maternal_child_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid;
  action_name text;
  entity_id uuid := new.id;
  safe_identifier text;
  changed_fields jsonb;
begin
  select p.id into actor_id from public.profiles p
  where p.id = auth.uid() limit 1;

  action_name := case tg_table_name
    when 'maternal_pregnancies' then case
      when tg_op = 'INSERT' then 'maternal.pregnancy_created'
      when old.status is distinct from new.status and new.status = 'delivered'
        then 'maternal.pregnancy_delivered'
      when old.status is distinct from new.status and new.status = 'completed'
        then 'maternal.pregnancy_completed'
      when old.status is distinct from new.status and new.status = 'archived'
        then 'maternal.pregnancy_archived'
      else 'maternal.pregnancy_updated' end
    when 'maternal_prenatal_visits' then case when tg_op = 'INSERT'
      then 'maternal.prenatal_visit_created'
      else 'maternal.prenatal_visit_updated' end
    when 'maternal_delivery_outcomes' then 'maternal.delivery_recorded'
    when 'maternal_postnatal_visits' then case when tg_op = 'INSERT'
      then 'maternal.postnatal_visit_created'
      else 'maternal.postnatal_visit_updated' end
    when 'child_health_profiles' then case
      when tg_op = 'INSERT' then 'child.profile_created'
      when old.archived_at is null and new.archived_at is not null
        then 'child.profile_archived'
      else 'child.profile_updated' end
    when 'child_growth_measurements' then case when tg_op = 'INSERT'
      then 'child.growth_recorded' else 'child.growth_updated' end
    when 'child_immunizations' then case
      when tg_op = 'INSERT' then 'child.immunization_created'
      when old.archived_at is null and new.archived_at is not null
        then 'child.immunization_archived'
      else 'child.immunization_updated' end
    when 'child_health_visits' then case when tg_op = 'INSERT'
      then 'child.visit_created' else 'child.visit_updated' end
  end;

  safe_identifier := case
    when tg_table_name = 'maternal_pregnancies' then new.pregnancy_number
    when tg_table_name = 'child_health_profiles' then new.child_number
    else null end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
    into changed_fields
    from jsonb_object_keys(to_jsonb(new)) key
    where to_jsonb(old) -> key is distinct from to_jsonb(new) -> key
      and key in (
        'status','archived_at','attending_midwife_id','appointment_id',
        'encounter_id','visit_date','next_visit_date','scheduled_date',
        'administered_date'
      );
  end if;

  insert into public.audit_logs(
    actor_profile_id, action, entity_type, entity_id, summary,
    old_values, new_values, request_metadata
  ) values (
    actor_id, action_name, tg_table_name, entity_id,
    replace(action_name, '.', ' '),
    null, null,
    jsonb_strip_nulls(jsonb_build_object(
      'safe_identifier', safe_identifier,
      'changed_fields', changed_fields
    ))
  );
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'maternal_pregnancies','maternal_prenatal_visits',
    'maternal_delivery_outcomes','maternal_postnatal_visits',
    'child_health_profiles','child_growth_measurements',
    'child_immunizations','child_health_visits'
  ] loop
    execute format(
      'create trigger %I_audit after insert or update on public.%I
       for each row execute function public.audit_maternal_child_change()',
      table_name, table_name
    );
  end loop;
end;
$$;

create or replace function public.maternal_pregnancy_list(
  p_search text default null,
  p_status public.maternal_pregnancy_status default null,
  p_edd_from date default null,
  p_edd_to date default null,
  p_attending_midwife_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid, pregnancy_number text, resident_id uuid, resident_number text,
  resident_name text, status public.maternal_pregnancy_status,
  estimated_delivery_date date, attending_midwife_id uuid,
  attending_midwife_name text, pregnancy_risk_level public.maternal_risk_level,
  version bigint, total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare actor_role public.app_role := public.current_profile_role();
begin
  if actor_role is null then raise exception 'maternal access denied'
    using errcode = '42501'; end if;
  if p_limit not between 1 and 50 or p_offset < 0 then
    raise exception 'invalid maternal pagination'; end if;

  return query
  select p.id, p.pregnancy_number, p.resident_id, r.resident_number,
    concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
    p.status, p.estimated_delivery_date, p.attending_midwife_id,
    nullif(concat_ws(' ',m.first_name,m.middle_name,m.last_name,m.suffix),''),
    case when actor_role in ('midwife','nurse') then p.pregnancy_risk_level end,
    p.version, count(*) over()
  from public.maternal_pregnancies p
  join public.residents r on r.id = p.resident_id
  left join public.profiles m on m.id = p.attending_midwife_id
  where (p_status is null or p.status = p_status)
    and (p_edd_from is null or p.estimated_delivery_date >= p_edd_from)
    and (p_edd_to is null or p.estimated_delivery_date <= p_edd_to)
    and (p_attending_midwife_id is null or p.attending_midwife_id = p_attending_midwife_id)
    and (nullif(btrim(p_search),'') is null or
      p.pregnancy_number ilike '%'||btrim(p_search)||'%' or
      r.resident_number ilike '%'||btrim(p_search)||'%' or
      concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix)
        ilike '%'||btrim(p_search)||'%')
    and case actor_role
      when 'resident' then p.resident_id = public.current_resident_id()
      when 'nurse' then public.maternal_child_can_access(p.resident_id)
      else actor_role in ('admin','barangay_health_worker','midwife') end
  order by p.estimated_delivery_date, p.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.child_profile_list(
  p_search text default null,
  p_age_min integer default null,
  p_age_max integer default null,
  p_immunization_status public.child_immunization_status default null,
  p_has_growth boolean default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid, child_number text, child_resident_id uuid, resident_number text,
  child_name text, birth_date date, mother_name text, guardian_name text,
  has_growth boolean, has_due_immunization boolean, version bigint,
  total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  manila_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if actor_role is null then raise exception 'child health access denied'
    using errcode = '42501'; end if;
  if p_limit not between 1 and 50 or p_offset < 0
    or coalesce(p_age_min,0) < 0 or coalesce(p_age_max,0) < 0 then
    raise exception 'invalid child profile filters'; end if;

  return query
  select c.id,c.child_number,c.child_resident_id,r.resident_number,
    concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
    c.birth_date,
    nullif(concat_ws(' ',mr.first_name,mr.middle_name,mr.last_name,mr.suffix),''),
    nullif(concat_ws(' ',gr.first_name,gr.middle_name,gr.last_name,gr.suffix),''),
    exists(select 1 from public.child_growth_measurements g
      where g.child_profile_id=c.id and g.archived_at is null),
    exists(select 1 from public.child_immunizations i
      where i.child_profile_id=c.id and i.status='due' and i.archived_at is null),
    c.version,count(*) over()
  from public.child_health_profiles c
  join public.residents r on r.id=c.child_resident_id
  left join public.residents mr on mr.id=c.mother_resident_id
  left join public.residents gr on gr.id=c.guardian_resident_id
  where c.archived_at is null
    and (nullif(btrim(p_search),'') is null or
      c.child_number ilike '%'||btrim(p_search)||'%' or
      r.resident_number ilike '%'||btrim(p_search)||'%' or
      concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix)
        ilike '%'||btrim(p_search)||'%')
    and (p_age_min is null or
      extract(year from age(manila_today,c.birth_date))::integer >= p_age_min)
    and (p_age_max is null or
      extract(year from age(manila_today,c.birth_date))::integer <= p_age_max)
    and (p_immunization_status is null or exists(
      select 1 from public.child_immunizations i
      where i.child_profile_id=c.id and i.status=p_immunization_status
        and i.archived_at is null))
    and (p_has_growth is null or p_has_growth = exists(
      select 1 from public.child_growth_measurements g
      where g.child_profile_id=c.id and g.archived_at is null))
    and case actor_role
      when 'resident' then c.child_resident_id=public.current_resident_id()
      when 'nurse' then public.maternal_child_can_access(c.child_resident_id)
      else actor_role in ('admin','barangay_health_worker','midwife') end
  order by c.birth_date desc,c.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.maternal_child_get(
  p_record_type text, p_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  resident_id uuid;
  clinical boolean;
  result jsonb;
begin
  if p_record_type = 'pregnancy' then
    select p.resident_id into resident_id from public.maternal_pregnancies p
    where p.id=p_id;
  elsif p_record_type = 'child' then
    select c.child_resident_id into resident_id from public.child_health_profiles c
    where c.id=p_id;
  else raise exception 'invalid maternal-child record type'; end if;
  if not found then raise exception 'maternal-child record not found'
    using errcode='P0002'; end if;

  if actor_role='resident' and resident_id<>public.current_resident_id() then
    raise exception 'maternal-child record not found' using errcode='P0002';
  elsif actor_role='nurse' and not public.maternal_child_can_access(resident_id) then
    raise exception 'maternal-child access denied' using errcode='42501';
  elsif actor_role not in ('admin','barangay_health_worker','nurse','midwife','resident') then
    raise exception 'maternal-child access denied' using errcode='42501';
  end if;
  clinical := actor_role in ('nurse','midwife');

  if p_record_type='pregnancy' then
    select jsonb_build_object(
      'type','pregnancy','id',p.id,'pregnancy_number',p.pregnancy_number,
      'resident_id',p.resident_id,'resident_number',r.resident_number,
      'resident_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
      'status',p.status,'last_menstrual_period',p.last_menstrual_period,
      'estimated_delivery_date',p.estimated_delivery_date,
      'gravida',p.gravida,'para',p.para,'term_births',p.term_births,
      'preterm_births',p.preterm_births,'abortions',p.abortions,
      'living_children',p.living_children,
      'pregnancy_risk_level',case when clinical then p.pregnancy_risk_level end,
      'risk_notes',case when clinical then p.risk_notes end,
      'attending_midwife_id',p.attending_midwife_id,'version',p.version,
      'created_at',p.created_at,'updated_at',p.updated_at,
      'prenatal_visits',case when clinical then coalesce((
        select jsonb_agg(to_jsonb(v)-'request_key' order by v.visit_date desc)
        from public.maternal_prenatal_visits v
        where v.pregnancy_id=p.id and v.archived_at is null),'[]'::jsonb)
        else '[]'::jsonb end,
      'delivery_outcome',case when clinical then (
        select to_jsonb(d) from public.maternal_delivery_outcomes d
        where d.pregnancy_id=p.id and d.archived_at is null) end,
      'postnatal_visits',case when clinical then coalesce((
        select jsonb_agg(to_jsonb(v)-'request_key' order by v.visit_date desc)
        from public.maternal_postnatal_visits v
        where v.pregnancy_id=p.id and v.archived_at is null),'[]'::jsonb)
        else '[]'::jsonb end,
      'appointments',coalesce((
        select jsonb_agg(jsonb_build_object('id',a.id,
          'appointment_number',a.appointment_number,'scheduled_date',a.scheduled_date,
          'status',a.status) order by a.scheduled_date desc)
        from public.appointments a where a.resident_id=p.resident_id
          and a.service_type='Maternal Care' and a.archived_at is null),'[]'::jsonb),
      'encounters',coalesce((
        select jsonb_agg(jsonb_build_object('id',e.id,
          'encounter_number',e.encounter_number,'encounter_date',e.encounter_date,
          'status',e.status) order by e.encounter_date desc)
        from public.health_encounters e where e.resident_id=p.resident_id
          and e.encounter_type='maternal_care' and e.archived_at is null),'[]'::jsonb)
    ) into result
    from public.maternal_pregnancies p join public.residents r on r.id=p.resident_id
    where p.id=p_id;
  else
    select jsonb_build_object(
      'type','child','id',c.id,'child_number',c.child_number,
      'child_resident_id',c.child_resident_id,'resident_number',r.resident_number,
      'child_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
      'birth_date',c.birth_date,'birth_weight_kg',c.birth_weight_kg,
      'birth_length_cm',c.birth_length_cm,'birth_place',c.birth_place,
      'delivery_type',c.delivery_type,'gestational_age_weeks',c.gestational_age_weeks,
      'newborn_screening_status',c.newborn_screening_status,'blood_type',c.blood_type,
      'mother_resident_id',c.mother_resident_id,
      'mother_name',concat_ws(' ',mr.first_name,mr.middle_name,mr.last_name,mr.suffix),
      'guardian_resident_id',c.guardian_resident_id,
      'guardian_name',concat_ws(' ',gr.first_name,gr.middle_name,gr.last_name,gr.suffix),
      'version',c.version,'created_at',c.created_at,'updated_at',c.updated_at,
      'growth_measurements',case when clinical then coalesce((
        select jsonb_agg(to_jsonb(g)-'request_key' order by g.measured_at desc)
        from public.child_growth_measurements g
        where g.child_profile_id=c.id and g.archived_at is null),'[]'::jsonb)
        else '[]'::jsonb end,
      'immunizations',case when clinical then coalesce((
        select jsonb_agg(to_jsonb(i) order by coalesce(i.administered_date,i.scheduled_date) desc)
        from public.child_immunizations i
        where i.child_profile_id=c.id and i.archived_at is null),'[]'::jsonb)
        else '[]'::jsonb end,
      'child_visits',case when clinical then coalesce((
        select jsonb_agg(to_jsonb(v)-'request_key' order by v.visit_date desc)
        from public.child_health_visits v
        where v.child_profile_id=c.id and v.archived_at is null),'[]'::jsonb)
        else '[]'::jsonb end,
      'appointments',coalesce((
        select jsonb_agg(jsonb_build_object('id',a.id,
          'appointment_number',a.appointment_number,'scheduled_date',a.scheduled_date,
          'status',a.status) order by a.scheduled_date desc)
        from public.appointments a where a.resident_id=c.child_resident_id
          and a.service_type='Child Health' and a.archived_at is null),'[]'::jsonb),
      'encounters',coalesce((
        select jsonb_agg(jsonb_build_object('id',e.id,
          'encounter_number',e.encounter_number,'encounter_date',e.encounter_date,
          'status',e.status) order by e.encounter_date desc)
        from public.health_encounters e where e.resident_id=c.child_resident_id
          and e.encounter_type in ('child_health','immunization')
          and e.archived_at is null),'[]'::jsonb)
    ) into result
    from public.child_health_profiles c
    join public.residents r on r.id=c.child_resident_id
    left join public.residents mr on mr.id=c.mother_resident_id
    left join public.residents gr on gr.id=c.guardian_resident_id
    where c.id=p_id;
  end if;
  return result;
end;
$$;

create or replace function public.maternal_pregnancy_save(
  p_id uuid, p_expected_version bigint, p_values jsonb, p_request_key uuid
)
returns table(id uuid, pregnancy_number text, status public.maternal_pregnancy_status, version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  record public.maternal_pregnancies%rowtype;
  resident public.residents%rowtype;
  resident_uuid uuid := nullif(p_values->>'resident_id','')::uuid;
  manila_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if actor_role <> 'midwife' then raise exception 'pregnancy documentation requires a midwife'
    using errcode='42501'; end if;
  if p_id is null and p_request_key is null then raise exception 'pregnancy request key is required'
    using errcode='23502'; end if;

  if p_id is null then
    select * into record from public.maternal_pregnancies
    where created_by=actor_id and request_key=p_request_key limit 1;
    if found then return query select record.id,record.pregnancy_number,record.status,record.version; return; end if;

    select * into resident from public.residents r where r.id=resident_uuid;
    if not found or resident.status<>'active' or resident.archived_at is not null
      or resident.sex<>'female' then
      raise exception 'pregnancy requires an active female resident' using errcode='23514';
    end if;
    if nullif(p_values->>'last_menstrual_period','')::date > manila_today then
      raise exception 'last menstrual period cannot be in the future' using errcode='22007'; end if;

    return query insert into public.maternal_pregnancies(
      pregnancy_number,resident_id,last_menstrual_period,estimated_delivery_date,
      gravida,para,term_births,preterm_births,abortions,living_children,
      pregnancy_risk_level,risk_notes,attending_midwife_id,request_key,
      created_by,updated_by
    ) values (
      'PENDING',resident_uuid,nullif(p_values->>'last_menstrual_period','')::date,
      (p_values->>'estimated_delivery_date')::date,
      (p_values->>'gravida')::smallint,(p_values->>'para')::smallint,
      coalesce((p_values->>'term_births')::smallint,0),
      coalesce((p_values->>'preterm_births')::smallint,0),
      coalesce((p_values->>'abortions')::smallint,0),
      coalesce((p_values->>'living_children')::smallint,0),
      coalesce(nullif(p_values->>'pregnancy_risk_level','')::public.maternal_risk_level,'unassessed'),
      nullif(btrim(p_values->>'risk_notes'),''),
      actor_id,p_request_key,actor_id,actor_id
    ) returning maternal_pregnancies.id,maternal_pregnancies.pregnancy_number,
      maternal_pregnancies.status,maternal_pregnancies.version;
  else
    select * into record from public.maternal_pregnancies p where p.id=p_id for update;
    if not found then raise exception 'pregnancy not found' using errcode='P0002'; end if;
    if record.status<>'active' or record.archived_at is not null then
      raise exception 'only active pregnancies can be edited' using errcode='23514'; end if;
    if record.version<>p_expected_version then raise exception 'pregnancy changed by another user'
      using errcode='40001'; end if;
    return query update public.maternal_pregnancies p set
      last_menstrual_period=nullif(p_values->>'last_menstrual_period','')::date,
      estimated_delivery_date=(p_values->>'estimated_delivery_date')::date,
      gravida=(p_values->>'gravida')::smallint,para=(p_values->>'para')::smallint,
      term_births=(p_values->>'term_births')::smallint,
      preterm_births=(p_values->>'preterm_births')::smallint,
      abortions=(p_values->>'abortions')::smallint,
      living_children=(p_values->>'living_children')::smallint,
      pregnancy_risk_level=(p_values->>'pregnancy_risk_level')::public.maternal_risk_level,
      risk_notes=nullif(btrim(p_values->>'risk_notes'),''),
      updated_by=actor_id
    where p.id=record.id
    returning p.id,p.pregnancy_number,p.status,p.version;
  end if;
exception when unique_violation then
  raise exception 'resident already has an active pregnancy' using errcode='23505';
end;
$$;

create or replace function public.maternal_pregnancy_transition(
  p_id uuid, p_expected_version bigint, p_target public.maternal_pregnancy_status
)
returns table(id uuid,status public.maternal_pregnancy_status,version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  record public.maternal_pregnancies%rowtype;
begin
  select * into record from public.maternal_pregnancies p where p.id=p_id for update;
  if not found then raise exception 'pregnancy not found' using errcode='P0002'; end if;
  if record.version<>p_expected_version then raise exception 'pregnancy changed by another user'
    using errcode='40001'; end if;
  if p_target='archived' then
    if actor_role<>'admin' then raise exception 'pregnancy archival requires an administrator'
      using errcode='42501'; end if;
  elsif actor_role<>'midwife' then raise exception 'pregnancy transition requires a midwife'
    using errcode='42501';
  elsif p_target='delivered' and (
    record.status<>'active' or not exists(select 1 from public.maternal_delivery_outcomes d
      where d.pregnancy_id=record.id and d.archived_at is null)
  ) then raise exception 'delivered status requires a delivery outcome' using errcode='23514';
  elsif p_target='completed' and (
    record.status<>'delivered' or not exists(select 1 from public.maternal_postnatal_visits v
      where v.pregnancy_id=record.id and v.archived_at is null)
  ) then raise exception 'completed status requires delivered status and postnatal follow-up'
    using errcode='23514';
  elsif p_target not in ('delivered','completed') then
    raise exception 'invalid pregnancy status transition' using errcode='23514';
  end if;
  return query update public.maternal_pregnancies p set
    status=p_target,archived_at=case when p_target='archived' then now() else null end,
    updated_by=auth.uid()
  where p.id=record.id returning p.id,p.status,p.version;
end;
$$;

create or replace function public.maternal_visit_save(
  p_visit_type text, p_id uuid, p_pregnancy_id uuid,
  p_expected_version bigint, p_values jsonb, p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.app_role:=public.current_profile_role();
  pregnancy public.maternal_pregnancies%rowtype;
  appointment_uuid uuid;
  encounter_uuid uuid;
  visit_date_value date;
  result jsonb;
begin
  if actor_role not in ('midwife','nurse') then raise exception 'maternal visit documentation requires clinical staff'
    using errcode='42501'; end if;
  select * into pregnancy from public.maternal_pregnancies p
    where p.id=p_pregnancy_id and p.archived_at is null;
  if not found then raise exception 'pregnancy not found' using errcode='P0002'; end if;
  appointment_uuid:=nullif(p_values->>'appointment_id','')::uuid;
  encounter_uuid:=nullif(p_values->>'encounter_id','')::uuid;
  visit_date_value:=(p_values->>'visit_date')::date;
  perform public.maternal_child_validate_links(pregnancy.resident_id,appointment_uuid,encounter_uuid);
  if actor_role='nurse' and not (
    (appointment_uuid is not null and exists(select 1 from public.appointments a
      where a.id=appointment_uuid and a.assigned_staff_id=actor_id))
    or (encounter_uuid is not null and exists(select 1 from public.health_encounters e
      where e.id=encounter_uuid and e.attending_staff_id=actor_id))
  ) then raise exception 'nurse maternal documentation requires an assigned appointment or encounter'
    using errcode='42501'; end if;
  if visit_date_value>(now() at time zone 'Asia/Manila')::date then
    raise exception 'maternal visit date cannot be in the future' using errcode='22007'; end if;

  if p_visit_type='prenatal' then
    if p_id is null then
      if p_request_key is null then raise exception 'visit request key is required'; end if;
      select to_jsonb(v) into result from public.maternal_prenatal_visits v
       where v.recorded_by=actor_id and v.request_key=p_request_key limit 1;
      if result is not null then return result; end if;
      insert into public.maternal_prenatal_visits(
        pregnancy_id,encounter_id,appointment_id,visit_date,gestational_age_weeks,
        weight_kg,systolic_bp,diastolic_bp,fundal_height_cm,fetal_heart_rate_bpm,
        fetal_movement_status,presentation,edema_status,findings,plan,next_visit_date,
        recorded_by,request_key
      ) values (
        p_pregnancy_id,encounter_uuid,appointment_uuid,visit_date_value,
        nullif(p_values->>'gestational_age_weeks','')::numeric,
        nullif(p_values->>'weight_kg','')::numeric,
        nullif(p_values->>'systolic_bp','')::smallint,
        nullif(p_values->>'diastolic_bp','')::smallint,
        nullif(p_values->>'fundal_height_cm','')::numeric,
        nullif(p_values->>'fetal_heart_rate_bpm','')::smallint,
        nullif(btrim(p_values->>'fetal_movement_status'),''),
        nullif(btrim(p_values->>'presentation'),''),
        nullif(btrim(p_values->>'edema_status'),''),
        nullif(btrim(p_values->>'findings'),''),
        nullif(btrim(p_values->>'plan'),''),
        nullif(p_values->>'next_visit_date','')::date,actor_id,p_request_key
      ) returning to_jsonb(maternal_prenatal_visits.*) into result;
    else
      update public.maternal_prenatal_visits v set
        visit_date=visit_date_value,encounter_id=encounter_uuid,appointment_id=appointment_uuid,
        gestational_age_weeks=nullif(p_values->>'gestational_age_weeks','')::numeric,
        weight_kg=nullif(p_values->>'weight_kg','')::numeric,
        systolic_bp=nullif(p_values->>'systolic_bp','')::smallint,
        diastolic_bp=nullif(p_values->>'diastolic_bp','')::smallint,
        fundal_height_cm=nullif(p_values->>'fundal_height_cm','')::numeric,
        fetal_heart_rate_bpm=nullif(p_values->>'fetal_heart_rate_bpm','')::smallint,
        fetal_movement_status=nullif(btrim(p_values->>'fetal_movement_status'),''),
        presentation=nullif(btrim(p_values->>'presentation'),''),
        edema_status=nullif(btrim(p_values->>'edema_status'),''),
        findings=nullif(btrim(p_values->>'findings'),''),
        plan=nullif(btrim(p_values->>'plan'),''),
        next_visit_date=nullif(p_values->>'next_visit_date','')::date
      where v.id=p_id and v.version=p_expected_version and v.archived_at is null
      returning to_jsonb(v.*) into result;
    end if;
  elsif p_visit_type='postnatal' then
    if pregnancy.status not in ('delivered','completed') then
      raise exception 'postnatal visit requires a delivered pregnancy' using errcode='23514'; end if;
    if p_id is null then
      if p_request_key is null then raise exception 'visit request key is required'; end if;
      select to_jsonb(v) into result from public.maternal_postnatal_visits v
       where v.recorded_by=actor_id and v.request_key=p_request_key limit 1;
      if result is not null then return result; end if;
      insert into public.maternal_postnatal_visits(
        pregnancy_id,encounter_id,appointment_id,visit_date,maternal_condition,
        systolic_bp,diastolic_bp,temperature_c,bleeding_status,breastfeeding_status,
        mental_wellbeing_notes,findings,plan,next_visit_date,recorded_by,request_key
      ) values (
        p_pregnancy_id,encounter_uuid,appointment_uuid,visit_date_value,
        nullif(btrim(p_values->>'maternal_condition'),''),
        nullif(p_values->>'systolic_bp','')::smallint,
        nullif(p_values->>'diastolic_bp','')::smallint,
        nullif(p_values->>'temperature_c','')::numeric,
        nullif(btrim(p_values->>'bleeding_status'),''),
        nullif(btrim(p_values->>'breastfeeding_status'),''),
        nullif(btrim(p_values->>'mental_wellbeing_notes'),''),
        nullif(btrim(p_values->>'findings'),''),
        nullif(btrim(p_values->>'plan'),''),
        nullif(p_values->>'next_visit_date','')::date,actor_id,p_request_key
      ) returning to_jsonb(maternal_postnatal_visits.*) into result;
    else
      update public.maternal_postnatal_visits v set
        visit_date=visit_date_value,encounter_id=encounter_uuid,appointment_id=appointment_uuid,
        maternal_condition=nullif(btrim(p_values->>'maternal_condition'),''),
        systolic_bp=nullif(p_values->>'systolic_bp','')::smallint,
        diastolic_bp=nullif(p_values->>'diastolic_bp','')::smallint,
        temperature_c=nullif(p_values->>'temperature_c','')::numeric,
        bleeding_status=nullif(btrim(p_values->>'bleeding_status'),''),
        breastfeeding_status=nullif(btrim(p_values->>'breastfeeding_status'),''),
        mental_wellbeing_notes=nullif(btrim(p_values->>'mental_wellbeing_notes'),''),
        findings=nullif(btrim(p_values->>'findings'),''),
        plan=nullif(btrim(p_values->>'plan'),''),
        next_visit_date=nullif(p_values->>'next_visit_date','')::date
      where v.id=p_id and v.version=p_expected_version and v.archived_at is null
      returning to_jsonb(v.*) into result;
    end if;
  else raise exception 'invalid maternal visit type'; end if;
  if result is null then raise exception 'maternal visit changed by another user'
    using errcode='40001'; end if;
  return result-'request_key';
end;
$$;

create or replace function public.maternal_delivery_save(
  p_id uuid,p_pregnancy_id uuid,p_expected_version bigint,p_values jsonb,
  p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_role public.app_role:=public.current_profile_role();
  pregnancy public.maternal_pregnancies%rowtype;
  result jsonb;
begin
  if actor_role<>'midwife' then raise exception 'delivery documentation requires a midwife'
    using errcode='42501'; end if;
  if p_id is null then
    if p_request_key is null then raise exception 'delivery request key is required'; end if;
    select to_jsonb(d) into result from public.maternal_delivery_outcomes d
      where d.recorded_by=auth.uid() and d.request_key=p_request_key limit 1;
    if result is not null then return result-'request_key'; end if;
  end if;
  select * into pregnancy from public.maternal_pregnancies p
    where p.id=p_pregnancy_id and p.status='active' and p.archived_at is null for update;
  if not found then raise exception 'active pregnancy not found' using errcode='P0002'; end if;
  if (p_values->>'delivery_date')::date>(now() at time zone 'Asia/Manila')::date then
    raise exception 'delivery date cannot be in the future' using errcode='22007'; end if;
  if p_id is null then
    insert into public.maternal_delivery_outcomes(
      pregnancy_id,delivery_date,delivery_type,delivery_place,outcome,newborn_count,
      maternal_condition,notes,recorded_by,request_key
    ) values (
      p_pregnancy_id,(p_values->>'delivery_date')::date,p_values->>'delivery_type',
      p_values->>'delivery_place',p_values->>'outcome',
      (p_values->>'newborn_count')::smallint,
      nullif(btrim(p_values->>'maternal_condition'),''),
      nullif(btrim(p_values->>'notes'),''),auth.uid(),p_request_key
    ) returning to_jsonb(maternal_delivery_outcomes.*) into result;
  else
    update public.maternal_delivery_outcomes d set
      delivery_date=(p_values->>'delivery_date')::date,
      delivery_type=p_values->>'delivery_type',delivery_place=p_values->>'delivery_place',
      outcome=p_values->>'outcome',newborn_count=(p_values->>'newborn_count')::smallint,
      maternal_condition=nullif(btrim(p_values->>'maternal_condition'),''),
      notes=nullif(btrim(p_values->>'notes'),'')
    where d.id=p_id and d.pregnancy_id=p_pregnancy_id and d.version=p_expected_version
      and d.archived_at is null returning to_jsonb(d.*) into result;
  end if;
  if result is null then raise exception 'delivery outcome changed by another user'
    using errcode='40001'; end if; return result;
end;
$$;

create or replace function public.child_profile_save(
  p_id uuid, p_expected_version bigint, p_values jsonb, p_request_key uuid
)
returns table(id uuid,child_number text,version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.app_role:=public.current_profile_role();
  child_uuid uuid:=nullif(p_values->>'child_resident_id','')::uuid;
  mother_uuid uuid:=nullif(p_values->>'mother_resident_id','')::uuid;
  guardian_uuid uuid:=nullif(p_values->>'guardian_resident_id','')::uuid;
  child_record public.residents%rowtype;
  mother_record public.residents%rowtype;
  profile_record public.child_health_profiles%rowtype;
begin
  if actor_role<>'midwife' then
    raise exception 'child profile management requires a midwife' using errcode='42501';
  end if;
  if p_id is null and p_request_key is null then
    raise exception 'child profile request key is required' using errcode='23502';
  end if;

  select * into child_record from public.residents r where r.id=child_uuid;
  if not found or child_record.status<>'active' or child_record.archived_at is not null then
    raise exception 'child profile requires an active resident' using errcode='23514';
  end if;
  if child_record.date_of_birth<>(p_values->>'birth_date')::date then
    raise exception 'child birth date must match the resident registry' using errcode='23514';
  end if;
  if mother_uuid is not null then
    select * into mother_record from public.residents r where r.id=mother_uuid;
    if not found or mother_record.status<>'active' or mother_record.archived_at is not null
      or mother_record.sex<>'female' then
      raise exception 'mother link requires an active female resident' using errcode='23514';
    end if;
  end if;
  if guardian_uuid is not null and not exists(
    select 1 from public.residents r
    where r.id=guardian_uuid and r.status='active' and r.archived_at is null
  ) then raise exception 'guardian link requires an active resident' using errcode='23514';
  end if;

  if p_id is null then
    select * into profile_record from public.child_health_profiles c
      where c.created_by=actor_id and c.request_key=p_request_key limit 1;
    if found then
      return query select profile_record.id,profile_record.child_number,profile_record.version;
      return;
    end if;
    return query insert into public.child_health_profiles(
      child_number,child_resident_id,mother_resident_id,guardian_resident_id,birth_date,
      birth_weight_kg,birth_length_cm,birth_place,delivery_type,gestational_age_weeks,
      newborn_screening_status,blood_type,request_key,created_by,updated_by
    ) values (
      'PENDING',child_uuid,mother_uuid,guardian_uuid,(p_values->>'birth_date')::date,
      nullif(p_values->>'birth_weight_kg','')::numeric,
      nullif(p_values->>'birth_length_cm','')::numeric,
      nullif(btrim(p_values->>'birth_place'),''),
      nullif(btrim(p_values->>'delivery_type'),''),
      nullif(p_values->>'gestational_age_weeks','')::numeric,
      nullif(btrim(p_values->>'newborn_screening_status'),''),
      coalesce(nullif(p_values->>'blood_type',''),'unknown'),
      p_request_key,actor_id,actor_id
    ) returning child_health_profiles.id,child_health_profiles.child_number,
      child_health_profiles.version;
  else
    select * into profile_record from public.child_health_profiles c
      where c.id=p_id and c.archived_at is null for update;
    if not found then raise exception 'child profile not found' using errcode='P0002'; end if;
    if profile_record.version<>p_expected_version then
      raise exception 'child profile changed by another user' using errcode='40001';
    end if;
    return query update public.child_health_profiles c set
      child_resident_id=child_uuid,mother_resident_id=mother_uuid,
      guardian_resident_id=guardian_uuid,birth_date=(p_values->>'birth_date')::date,
      birth_weight_kg=nullif(p_values->>'birth_weight_kg','')::numeric,
      birth_length_cm=nullif(p_values->>'birth_length_cm','')::numeric,
      birth_place=nullif(btrim(p_values->>'birth_place'),''),
      delivery_type=nullif(btrim(p_values->>'delivery_type'),''),
      gestational_age_weeks=nullif(p_values->>'gestational_age_weeks','')::numeric,
      newborn_screening_status=nullif(btrim(p_values->>'newborn_screening_status'),''),
      blood_type=coalesce(nullif(p_values->>'blood_type',''),'unknown'),updated_by=actor_id
    where c.id=profile_record.id returning c.id,c.child_number,c.version;
  end if;
exception when unique_violation then
  raise exception 'resident already has an active child health profile' using errcode='23505';
end;
$$;

create or replace function public.child_event_save(
  p_event_type text, p_id uuid, p_child_profile_id uuid,
  p_expected_version bigint, p_values jsonb, p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.app_role:=public.current_profile_role();
  child_profile public.child_health_profiles%rowtype;
  appointment_uuid uuid:=nullif(p_values->>'appointment_id','')::uuid;
  encounter_uuid uuid:=nullif(p_values->>'encounter_id','')::uuid;
  measured_value timestamptz;
  visit_date_value date;
  result jsonb;
begin
  if actor_role not in ('midwife','nurse','barangay_health_worker') then
    raise exception 'child health documentation requires authorized staff' using errcode='42501';
  end if;
  if actor_role='barangay_health_worker' and p_event_type<>'growth' then
    raise exception 'barangay health workers may record growth measurements only' using errcode='42501';
  end if;
  select * into child_profile from public.child_health_profiles c
    where c.id=p_child_profile_id and c.archived_at is null;
  if not found or not exists(
    select 1 from public.residents r
    where r.id=child_profile.child_resident_id and r.status='active' and r.archived_at is null
  ) then raise exception 'active child profile not found' using errcode='P0002';
  end if;

  if p_event_type in ('growth','visit','immunization') then
    perform public.maternal_child_validate_links(
      child_profile.child_resident_id,appointment_uuid,encounter_uuid
    );
  end if;
  if actor_role='nurse' and not (
    (appointment_uuid is not null and exists(select 1 from public.appointments a
      where a.id=appointment_uuid and a.assigned_staff_id=actor_id))
    or (encounter_uuid is not null and exists(select 1 from public.health_encounters e
      where e.id=encounter_uuid and e.attending_staff_id=actor_id))
  ) then raise exception 'nurse child documentation requires an assigned appointment or encounter'
    using errcode='42501';
  end if;
  if actor_role='barangay_health_worker' and not exists(
    select 1 from public.appointments a where a.id=appointment_uuid
      and a.resident_id=child_profile.child_resident_id
      and a.service_type='Child Health'
      and a.status in ('checked_in','in_progress')
  ) then raise exception 'BHW growth recording requires a checked-in child appointment'
    using errcode='42501';
  end if;

  if p_event_type='growth' then
    measured_value:=(p_values->>'measured_at')::timestamptz;
    if measured_value>now()+interval '5 minutes' then
      raise exception 'growth measurement cannot be in the future' using errcode='22007';
    end if;
    if p_id is null then
      if p_request_key is null then raise exception 'event request key is required'; end if;
      select to_jsonb(g) into result from public.child_growth_measurements g
        where g.recorded_by=actor_id and g.request_key=p_request_key limit 1;
      if result is not null then return result-'request_key'; end if;
      insert into public.child_growth_measurements(
        child_profile_id,encounter_id,appointment_id,measured_at,weight_kg,height_cm,
        head_circumference_cm,mid_upper_arm_circumference_cm,notes,recorded_by,request_key
      ) values (
        p_child_profile_id,encounter_uuid,appointment_uuid,measured_value,
        nullif(p_values->>'weight_kg','')::numeric,
        nullif(p_values->>'height_cm','')::numeric,
        nullif(p_values->>'head_circumference_cm','')::numeric,
        nullif(p_values->>'mid_upper_arm_circumference_cm','')::numeric,
        nullif(btrim(p_values->>'notes'),''),actor_id,p_request_key
      ) returning to_jsonb(child_growth_measurements.*) into result;
    else
      update public.child_growth_measurements g set
        encounter_id=encounter_uuid,appointment_id=appointment_uuid,
        measured_at=measured_value,weight_kg=nullif(p_values->>'weight_kg','')::numeric,
        height_cm=nullif(p_values->>'height_cm','')::numeric,
        head_circumference_cm=nullif(p_values->>'head_circumference_cm','')::numeric,
        mid_upper_arm_circumference_cm=nullif(p_values->>'mid_upper_arm_circumference_cm','')::numeric,
        notes=nullif(btrim(p_values->>'notes'),'')
      where g.id=p_id and g.child_profile_id=p_child_profile_id
        and g.version=p_expected_version and g.archived_at is null
      returning to_jsonb(g.*) into result;
    end if;
  elsif p_event_type='immunization' then
    if actor_role not in ('midwife','nurse') then
      raise exception 'immunization documentation requires clinical staff' using errcode='42501';
    end if;
    if nullif(p_values->>'administered_date','')::date >
      (now() at time zone 'Asia/Manila')::date then
      raise exception 'immunization date cannot be in the future' using errcode='22007';
    end if;
    if p_id is null then
      if p_request_key is null then raise exception 'event request key is required'; end if;
      select to_jsonb(i) into result from public.child_immunizations i
        where i.recorded_by=actor_id and i.request_key=p_request_key limit 1;
      if result is not null then return result-'request_key'; end if;
      insert into public.child_immunizations(
        child_profile_id,vaccine_code,vaccine_name,dose_number,scheduled_date,
        administered_date,status,administered_by,facility,lot_number,notes,recorded_by,request_key
      ) values (
        p_child_profile_id,upper(btrim(p_values->>'vaccine_code')),
        btrim(p_values->>'vaccine_name'),(p_values->>'dose_number')::smallint,
        nullif(p_values->>'scheduled_date','')::date,
        nullif(p_values->>'administered_date','')::date,
        (p_values->>'status')::public.child_immunization_status,
        case when p_values->>'status'='completed' then actor_id else null end,
        nullif(btrim(p_values->>'facility'),''),nullif(btrim(p_values->>'lot_number'),''),
        nullif(btrim(p_values->>'notes'),''),actor_id,p_request_key
      ) returning to_jsonb(child_immunizations.*) into result;
    else
      update public.child_immunizations i set
        vaccine_code=upper(btrim(p_values->>'vaccine_code')),
        vaccine_name=btrim(p_values->>'vaccine_name'),
        dose_number=(p_values->>'dose_number')::smallint,
        scheduled_date=nullif(p_values->>'scheduled_date','')::date,
        administered_date=nullif(p_values->>'administered_date','')::date,
        status=(p_values->>'status')::public.child_immunization_status,
        administered_by=case when p_values->>'status'='completed' then actor_id else null end,
        facility=nullif(btrim(p_values->>'facility'),''),
        lot_number=nullif(btrim(p_values->>'lot_number'),''),
        notes=nullif(btrim(p_values->>'notes'),'')
      where i.id=p_id and i.child_profile_id=p_child_profile_id
        and i.version=p_expected_version and i.archived_at is null
      returning to_jsonb(i.*) into result;
    end if;
  elsif p_event_type='visit' then
    visit_date_value:=(p_values->>'visit_date')::date;
    if visit_date_value>(now() at time zone 'Asia/Manila')::date then
      raise exception 'child visit date cannot be in the future' using errcode='22007';
    end if;
    if p_id is null then
      if p_request_key is null then raise exception 'event request key is required'; end if;
      select to_jsonb(v) into result from public.child_health_visits v
        where v.recorded_by=actor_id and v.request_key=p_request_key limit 1;
      if result is not null then return result-'request_key'; end if;
      insert into public.child_health_visits(
        child_profile_id,encounter_id,appointment_id,visit_date,developmental_notes,
        findings,plan,next_visit_date,recorded_by,request_key
      ) values (
        p_child_profile_id,encounter_uuid,appointment_uuid,visit_date_value,
        nullif(btrim(p_values->>'developmental_notes'),''),
        nullif(btrim(p_values->>'findings'),''),nullif(btrim(p_values->>'plan'),''),
        nullif(p_values->>'next_visit_date','')::date,actor_id,p_request_key
      ) returning to_jsonb(child_health_visits.*) into result;
    else
      update public.child_health_visits v set
        encounter_id=encounter_uuid,appointment_id=appointment_uuid,
        visit_date=visit_date_value,
        developmental_notes=nullif(btrim(p_values->>'developmental_notes'),''),
        findings=nullif(btrim(p_values->>'findings'),''),
        plan=nullif(btrim(p_values->>'plan'),''),
        next_visit_date=nullif(p_values->>'next_visit_date','')::date
      where v.id=p_id and v.child_profile_id=p_child_profile_id
        and v.version=p_expected_version and v.archived_at is null
      returning to_jsonb(v.*) into result;
    end if;
  else raise exception 'invalid child event type' using errcode='22023'; end if;
  if result is null then raise exception 'child health record changed by another user'
    using errcode='40001'; end if;
  return result-'request_key';
exception when unique_violation then
  raise exception 'duplicate child health record' using errcode='23505';
end;
$$;

create or replace function public.maternal_child_archive(
  p_record_type text,p_id uuid,p_expected_version bigint
)
returns table(id uuid,version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if public.current_profile_role()<>'admin' then
    raise exception 'archival requires an administrator' using errcode='42501';
  end if;
  if p_record_type='child_profile' then
    update public.child_health_profiles c set archived_at=now(),updated_by=auth.uid()
      where c.id=p_id and c.version=p_expected_version and c.archived_at is null
      returning jsonb_build_object('id',c.id,'version',c.version) into result;
  elsif p_record_type='immunization' then
    update public.child_immunizations i set archived_at=now()
      where i.id=p_id and i.version=p_expected_version and i.archived_at is null
      returning jsonb_build_object('id',i.id,'version',i.version) into result;
  else raise exception 'invalid archive record type' using errcode='22023'; end if;
  if result is null then raise exception 'record not found or changed by another user'
    using errcode='40001'; end if;
  return query select (result->>'id')::uuid,(result->>'version')::bigint;
end;
$$;

create or replace function public.maternal_child_dashboard()
returns table(
  active_pregnancies bigint,expected_deliveries bigint,prenatal_visits_today bigint,
  immunizations_due bigint,child_visits_today bigint
)
language plpgsql security definer set search_path = ''
as $$
declare actor_role public.app_role:=public.current_profile_role();
  today date:=(now() at time zone 'Asia/Manila')::date;
begin
  if actor_role not in ('admin','barangay_health_worker','nurse','midwife','resident') then
    raise exception 'maternal and child dashboard access denied' using errcode='42501';
  end if;
  return query
  select
    count(*) filter(where source='pregnancy' and status='active'),
    count(*) filter(where source='pregnancy' and event_date between today and today+30),
    count(*) filter(where source='prenatal' and event_date=today),
    count(*) filter(where source='immunization' and event_date<=today and status='due'),
    count(*) filter(where source='child_visit' and event_date=today)
  from (
    select 'pregnancy'::text source,p.status::text status,p.estimated_delivery_date event_date,
      p.resident_id from public.maternal_pregnancies p where p.archived_at is null
    union all
    select 'prenatal','recorded',v.visit_date,p.resident_id
      from public.maternal_prenatal_visits v join public.maternal_pregnancies p
        on p.id=v.pregnancy_id where v.archived_at is null and p.archived_at is null
    union all
    select 'immunization',i.status::text,i.scheduled_date,c.child_resident_id
      from public.child_immunizations i join public.child_health_profiles c
        on c.id=i.child_profile_id where i.archived_at is null and c.archived_at is null
    union all
    select 'child_visit','recorded',v.visit_date,c.child_resident_id
      from public.child_health_visits v join public.child_health_profiles c
        on c.id=v.child_profile_id where v.archived_at is null and c.archived_at is null
  ) events
  where actor_role in ('admin','barangay_health_worker','midwife')
    or (actor_role='resident' and exists(
      select 1 from public.residents r where r.id=events.resident_id and r.profile_id=auth.uid()
    ))
    or (actor_role='nurse' and public.maternal_child_can_access(events.resident_id));
end;
$$;

revoke all on table public.maternal_pregnancies,public.maternal_prenatal_visits,
  public.maternal_delivery_outcomes,public.maternal_postnatal_visits,
  public.child_health_profiles,public.child_growth_measurements,
  public.child_immunizations,public.child_health_visits from public,anon,authenticated;
grant select on table public.maternal_pregnancies,public.maternal_prenatal_visits,
  public.maternal_delivery_outcomes,public.maternal_postnatal_visits,
  public.child_health_profiles,public.child_growth_measurements,
  public.child_immunizations,public.child_health_visits to authenticated;
grant select,insert,update,delete on table public.maternal_pregnancies,
  public.maternal_prenatal_visits,public.maternal_delivery_outcomes,
  public.maternal_postnatal_visits,public.child_health_profiles,
  public.child_growth_measurements,public.child_immunizations,
  public.child_health_visits to service_role;
revoke all on sequence public.maternal_pregnancy_number_seq,
  public.child_health_profile_number_seq from public,anon,authenticated;
grant usage,select on sequence public.maternal_pregnancy_number_seq,
  public.child_health_profile_number_seq to service_role;

revoke all on function public.set_maternal_child_number(),
  public.protect_maternal_child_row(),public.audit_maternal_child_change(),
  public.maternal_child_validate_links(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.maternal_child_can_access(uuid),
  public.maternal_pregnancy_list(text,public.maternal_pregnancy_status,date,date,uuid,integer,integer),
  public.child_profile_list(text,integer,integer,public.child_immunization_status,boolean,integer,integer),
  public.maternal_child_get(text,uuid),
  public.maternal_pregnancy_save(uuid,bigint,jsonb,uuid),
  public.maternal_pregnancy_transition(uuid,bigint,public.maternal_pregnancy_status),
  public.maternal_visit_save(text,uuid,uuid,bigint,jsonb,uuid),
  public.maternal_delivery_save(uuid,uuid,bigint,jsonb,uuid),
  public.child_profile_save(uuid,bigint,jsonb,uuid),
  public.child_event_save(text,uuid,uuid,bigint,jsonb,uuid),
  public.maternal_child_archive(text,uuid,bigint),
  public.maternal_child_dashboard() from public,anon,authenticated;
grant execute on function public.maternal_child_can_access(uuid),
  public.maternal_pregnancy_list(text,public.maternal_pregnancy_status,date,date,uuid,integer,integer),
  public.child_profile_list(text,integer,integer,public.child_immunization_status,boolean,integer,integer),
  public.maternal_child_get(text,uuid),
  public.maternal_pregnancy_save(uuid,bigint,jsonb,uuid),
  public.maternal_pregnancy_transition(uuid,bigint,public.maternal_pregnancy_status),
  public.maternal_visit_save(text,uuid,uuid,bigint,jsonb,uuid),
  public.maternal_delivery_save(uuid,uuid,bigint,jsonb,uuid),
  public.child_profile_save(uuid,bigint,jsonb,uuid),
  public.child_event_save(text,uuid,uuid,bigint,jsonb,uuid),
  public.maternal_child_archive(text,uuid,bigint),
  public.maternal_child_dashboard() to authenticated;

commit;
