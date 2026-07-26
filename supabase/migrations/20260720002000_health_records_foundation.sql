-- Phase 5: Electronic Health Records foundation.
-- Clinical narratives remain separate from operational appointment data.
-- Browser writes are denied; trusted RPCs enforce role, state, ownership,
-- idempotency, and optimistic-concurrency rules.

begin;

create type public.health_encounter_type as enum (
  'general_consultation',
  'nursing_care',
  'maternal_care',
  'child_health',
  'immunization',
  'blood_pressure_monitoring',
  'home_visit',
  'follow_up',
  'other'
);

create type public.health_encounter_status as enum (
  'draft',
  'signed',
  'amended',
  'archived'
);

create type public.allergy_severity as enum (
  'mild',
  'moderate',
  'severe',
  'unknown'
);

create type public.clinical_item_status as enum (
  'active',
  'resolved',
  'historical'
);

create sequence public.health_encounter_number_seq
  as bigint start with 1 increment by 1;

create table public.health_encounters (
  id uuid primary key default gen_random_uuid(),
  encounter_number text not null,
  resident_id uuid not null references public.residents (id) on delete restrict,
  appointment_id uuid references public.appointments (id) on delete restrict,
  encounter_type public.health_encounter_type not null,
  encounter_date date not null,
  attending_staff_id uuid not null references public.profiles (id) on delete restrict,
  chief_complaint text,
  subjective_notes text,
  objective_notes text,
  assessment text,
  plan text,
  diagnosis_text text,
  treatment_notes text,
  follow_up_date date,
  status public.health_encounter_status not null default 'draft',
  amends_encounter_id uuid references public.health_encounters (id) on delete restrict,
  amendment_reason text,
  request_key uuid,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  signed_by uuid references public.profiles (id) on delete restrict,
  signed_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint health_encounters_number_unique unique (encounter_number),
  constraint health_encounters_number_format check (
    encounter_number ~ '^ENC-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint health_encounters_not_self_amended check (
    amends_encounter_id is null or amends_encounter_id <> id
  ),
  constraint health_encounters_text_lengths check (
    (chief_complaint is null or char_length(chief_complaint) <= 2000)
    and (subjective_notes is null or char_length(subjective_notes) <= 10000)
    and (objective_notes is null or char_length(objective_notes) <= 10000)
    and (assessment is null or char_length(assessment) <= 10000)
    and (plan is null or char_length(plan) <= 10000)
    and (diagnosis_text is null or char_length(diagnosis_text) <= 5000)
    and (treatment_notes is null or char_length(treatment_notes) <= 10000)
    and (amendment_reason is null or char_length(btrim(amendment_reason)) between 1 and 1000)
  ),
  constraint health_encounters_follow_up_valid check (
    follow_up_date is null or follow_up_date >= encounter_date
  ),
  constraint health_encounters_date_valid check (
    encounter_date <= current_date
  ),
  constraint health_encounters_signature_consistent check (
    (
      status = 'draft'
      and signed_by is null
      and signed_at is null
      and archived_at is null
    )
    or (
      status in ('signed', 'amended')
      and signed_by is not null
      and signed_at is not null
      and archived_at is null
    )
    or (
      status = 'archived'
      and signed_by is not null
      and signed_at is not null
      and archived_at is not null
    )
  )
);

create unique index health_encounters_appointment_unique
  on public.health_encounters (appointment_id)
  where appointment_id is not null;

create unique index health_encounters_request_unique
  on public.health_encounters (created_by, request_key)
  where request_key is not null;

create unique index health_encounters_amendment_unique
  on public.health_encounters (amends_encounter_id)
  where amends_encounter_id is not null;

create index health_encounters_resident_timeline_idx
  on public.health_encounters (resident_id, encounter_date desc, created_at desc);

create index health_encounters_list_idx
  on public.health_encounters (encounter_date desc, status, encounter_type);

create table public.vital_signs (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.health_encounters (id) on delete restrict,
  temperature_c numeric(4, 1),
  systolic_bp smallint,
  diastolic_bp smallint,
  pulse_bpm smallint,
  respiratory_rate smallint,
  oxygen_saturation numeric(5, 2),
  height_cm numeric(5, 2),
  weight_kg numeric(6, 2),
  pain_score smallint,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vital_signs_encounter_unique unique (encounter_id),
  constraint vital_signs_temperature_bounds check (
    temperature_c is null or temperature_c between 20 and 50
  ),
  constraint vital_signs_blood_pressure_bounds check (
    (systolic_bp is null or systolic_bp between 30 and 300)
    and (diastolic_bp is null or diastolic_bp between 20 and 200)
  ),
  constraint vital_signs_pulse_bounds check (
    pulse_bpm is null or pulse_bpm between 20 and 300
  ),
  constraint vital_signs_respiratory_bounds check (
    respiratory_rate is null or respiratory_rate between 5 and 100
  ),
  constraint vital_signs_oxygen_bounds check (
    oxygen_saturation is null or oxygen_saturation between 20 and 100
  ),
  constraint vital_signs_height_bounds check (
    height_cm is null or height_cm between 20 and 250
  ),
  constraint vital_signs_weight_bounds check (
    weight_kg is null or weight_kg between 0.2 and 500
  ),
  constraint vital_signs_pain_bounds check (
    pain_score is null or pain_score between 0 and 10
  ),
  constraint vital_signs_has_measurement check (
    num_nonnulls(
      temperature_c, systolic_bp, diastolic_bp, pulse_bpm,
      respiratory_rate, oxygen_saturation, height_cm, weight_kg, pain_score
    ) > 0
  )
);

create table public.resident_allergies (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id) on delete restrict,
  allergen text not null,
  reaction text,
  severity public.allergy_severity not null default 'unknown',
  status public.clinical_item_status not null default 'active',
  noted_by uuid not null references public.profiles (id) on delete restrict,
  noted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint resident_allergies_allergen_length check (
    char_length(btrim(allergen)) between 1 and 200
  ),
  constraint resident_allergies_reaction_length check (
    reaction is null or char_length(reaction) <= 1000
  ),
  constraint resident_allergies_archive_consistent check (
    (archived_at is null) or (status <> 'active')
  )
);

create index resident_allergies_resident_idx
  on public.resident_allergies (resident_id, status, noted_at desc);

create table public.resident_medical_history (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents (id) on delete restrict,
  condition_name text not null,
  details text,
  onset_date date,
  status public.clinical_item_status not null default 'active',
  noted_by uuid not null references public.profiles (id) on delete restrict,
  noted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint resident_medical_history_condition_length check (
    char_length(btrim(condition_name)) between 1 and 200
  ),
  constraint resident_medical_history_details_length check (
    details is null or char_length(details) <= 2000
  ),
  constraint resident_medical_history_onset_valid check (
    onset_date is null or onset_date <= current_date
  ),
  constraint resident_medical_history_archive_consistent check (
    (archived_at is null) or (status <> 'active')
  )
);

create index resident_medical_history_resident_idx
  on public.resident_medical_history (resident_id, status, noted_at desc);

create or replace function public.set_health_encounter_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.encounter_number := format(
      'ENC-%s-%s',
      to_char(clock_timestamp(), 'YYYY'),
      lpad(nextval('public.health_encounter_number_seq')::text, 6, '0')
    );
  elsif new.encounter_number is distinct from old.encounter_number then
    raise exception 'encounter_number is database-generated and immutable';
  end if;
  return new;
end;
$$;

create or replace function public.bump_health_encounter_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.protect_signed_health_encounter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resident_id is distinct from old.resident_id
    or new.appointment_id is distinct from old.appointment_id
    or new.amends_encounter_id is distinct from old.amends_encounter_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'health encounter identity fields are immutable';
  end if;

  if old.status <> 'draft'::public.health_encounter_status then
    if not (
      (
        old.status = 'signed'::public.health_encounter_status
        and new.status = 'amended'::public.health_encounter_status
      )
      or (
        old.status in (
          'signed'::public.health_encounter_status,
          'amended'::public.health_encounter_status
        )
        and new.status = 'archived'::public.health_encounter_status
      )
    ) then
      raise exception 'signed health encounters are immutable'
        using errcode = '23514';
    end if;

    if new.encounter_type is distinct from old.encounter_type
      or new.encounter_date is distinct from old.encounter_date
      or new.attending_staff_id is distinct from old.attending_staff_id
      or new.chief_complaint is distinct from old.chief_complaint
      or new.subjective_notes is distinct from old.subjective_notes
      or new.objective_notes is distinct from old.objective_notes
      or new.assessment is distinct from old.assessment
      or new.plan is distinct from old.plan
      or new.diagnosis_text is distinct from old.diagnosis_text
      or new.treatment_notes is distinct from old.treatment_notes
      or new.follow_up_date is distinct from old.follow_up_date
      or new.amendment_reason is distinct from old.amendment_reason
      or new.signed_by is distinct from old.signed_by
      or new.signed_at is distinct from old.signed_at then
      raise exception 'signed clinical content cannot be overwritten'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_vital_signs_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  encounter_status public.health_encounter_status;
begin
  select e.status into encounter_status
  from public.health_encounters as e
  where e.id = new.encounter_id;

  if encounter_status is null then
    raise exception 'health encounter not found' using errcode = 'P0002';
  end if;
  if encounter_status <> 'draft'::public.health_encounter_status then
    raise exception 'vital signs cannot change after an encounter is signed'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.encounter_id is distinct from old.encounter_id then
    raise exception 'vital-sign encounter linkage is immutable';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_health_encounter_number() from public, anon, authenticated;
revoke all on function public.bump_health_encounter_version() from public, anon, authenticated;
revoke all on function public.protect_signed_health_encounter() from public, anon, authenticated;
revoke all on function public.protect_vital_signs_integrity() from public, anon, authenticated;

create trigger health_encounters_set_number
  before insert or update on public.health_encounters
  for each row execute function public.set_health_encounter_number();

create trigger health_encounters_protect_signed
  before update on public.health_encounters
  for each row execute function public.protect_signed_health_encounter();

create trigger health_encounters_bump_version
  before update on public.health_encounters
  for each row execute function public.bump_health_encounter_version();

create trigger vital_signs_protect_integrity
  before insert or update on public.vital_signs
  for each row execute function public.protect_vital_signs_integrity();

alter table public.health_encounters enable row level security;
alter table public.vital_signs enable row level security;
alter table public.resident_allergies enable row level security;
alter table public.resident_medical_history enable row level security;

-- Direct reads are deliberately narrower than metadata RPCs. Administrators and
-- BHWs never receive a direct table policy that could expose narrative columns.
create policy health_encounters_select_nurse
  on public.health_encounters for select to authenticated
  using (
    public.current_profile_role() = 'nurse'::public.app_role
    and status <> 'archived'::public.health_encounter_status
  );

create policy health_encounters_select_midwife
  on public.health_encounters for select to authenticated
  using (
    public.current_profile_role() = 'midwife'::public.app_role
    and encounter_type in (
      'maternal_care'::public.health_encounter_type,
      'child_health'::public.health_encounter_type
    )
    and status <> 'archived'::public.health_encounter_status
  );

create policy health_encounters_select_resident_signed
  on public.health_encounters for select to authenticated
  using (
    public.current_profile_role() = 'resident'::public.app_role
    and resident_id = public.current_resident_id()
    and status in (
      'signed'::public.health_encounter_status,
      'amended'::public.health_encounter_status
    )
  );

create policy vital_signs_select_clinical
  on public.vital_signs for select to authenticated
  using (
    exists (
      select 1
      from public.health_encounters as e
      where e.id = vital_signs.encounter_id
    )
  );

create policy resident_allergies_select_nurse
  on public.resident_allergies for select to authenticated
  using (
    public.current_profile_role() = 'nurse'::public.app_role
    and archived_at is null
  );

create policy resident_allergies_select_midwife
  on public.resident_allergies for select to authenticated
  using (
    public.current_profile_role() = 'midwife'::public.app_role
    and archived_at is null
    and exists (
      select 1
      from public.health_encounters as e
      where e.resident_id = resident_allergies.resident_id
        and e.encounter_type in (
          'maternal_care'::public.health_encounter_type,
          'child_health'::public.health_encounter_type
        )
        and e.status <> 'archived'::public.health_encounter_status
    )
  );

create policy resident_allergies_select_own
  on public.resident_allergies for select to authenticated
  using (
    resident_id = public.current_resident_id()
    and archived_at is null
  );

create policy resident_medical_history_select_nurse
  on public.resident_medical_history for select to authenticated
  using (
    public.current_profile_role() = 'nurse'::public.app_role
    and archived_at is null
  );

create policy resident_medical_history_select_midwife
  on public.resident_medical_history for select to authenticated
  using (
    public.current_profile_role() = 'midwife'::public.app_role
    and archived_at is null
    and exists (
      select 1
      from public.health_encounters as e
      where e.resident_id = resident_medical_history.resident_id
        and e.encounter_type in (
          'maternal_care'::public.health_encounter_type,
          'child_health'::public.health_encounter_type
        )
        and e.status <> 'archived'::public.health_encounter_status
    )
  );

create policy resident_medical_history_select_own
  on public.resident_medical_history for select to authenticated
  using (
    resident_id = public.current_resident_id()
    and archived_at is null
  );

revoke all on table public.health_encounters from public, anon, authenticated;
revoke all on table public.vital_signs from public, anon, authenticated;
revoke all on table public.resident_allergies from public, anon, authenticated;
revoke all on table public.resident_medical_history from public, anon, authenticated;

grant select on table public.health_encounters to authenticated;
grant select on table public.vital_signs to authenticated;
grant select on table public.resident_allergies to authenticated;
grant select on table public.resident_medical_history to authenticated;

grant select, insert, update on table public.health_encounters to service_role;
grant select, insert, update on table public.vital_signs to service_role;
grant select, insert, update on table public.resident_allergies to service_role;
grant select, insert, update on table public.resident_medical_history to service_role;
grant usage on sequence public.health_encounter_number_seq to service_role;

create or replace function public.health_record_list(
  p_search text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_status public.health_encounter_status default null,
  p_encounter_type public.health_encounter_type default null,
  p_attending_staff_id uuid default null,
  p_include_archived boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  encounter_number text,
  resident_id uuid,
  resident_number text,
  resident_name text,
  appointment_id uuid,
  appointment_number text,
  encounter_type public.health_encounter_type,
  encounter_date date,
  attending_staff_id uuid,
  attending_staff_name text,
  status public.health_encounter_status,
  signed_at timestamptz,
  version bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  actor_resident_id uuid := public.current_resident_id();
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if actor_role is null then
    raise exception 'health-record access requires an active account'
      using errcode = '42501';
  end if;
  if actor_role = 'resident'::public.app_role and actor_resident_id is null then
    raise exception 'resident account is not linked' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.encounter_number,
    e.resident_id,
    r.resident_number,
    concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix)::text,
    e.appointment_id,
    a.appointment_number,
    e.encounter_type,
    e.encounter_date,
    e.attending_staff_id,
    concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)::text,
    e.status,
    e.signed_at,
    e.version,
    count(*) over()
  from public.health_encounters as e
  join public.residents as r on r.id = e.resident_id
  join public.profiles as p on p.id = e.attending_staff_id
  left join public.appointments as a on a.id = e.appointment_id
  where (
      actor_role in (
        'admin'::public.app_role,
        'barangay_health_worker'::public.app_role,
        'nurse'::public.app_role
      )
      or (
        actor_role = 'midwife'::public.app_role
        and e.encounter_type in (
          'maternal_care'::public.health_encounter_type,
          'child_health'::public.health_encounter_type
        )
      )
      or (
        actor_role = 'resident'::public.app_role
        and e.resident_id = actor_resident_id
        and e.status in (
          'signed'::public.health_encounter_status,
          'amended'::public.health_encounter_status
        )
      )
    )
    and (
      e.status <> 'archived'::public.health_encounter_status
      or (actor_role = 'admin'::public.app_role and p_include_archived)
    )
    and (
      nullif(btrim(p_search), '') is null
      or e.encounter_number ilike '%' || btrim(p_search) || '%'
      or r.resident_number ilike '%' || btrim(p_search) || '%'
      or concat_ws(' ', r.first_name, r.middle_name, r.last_name, r.suffix)
        ilike '%' || btrim(p_search) || '%'
    )
    and (p_date_from is null or e.encounter_date >= p_date_from)
    and (p_date_to is null or e.encounter_date <= p_date_to)
    and (p_status is null or e.status = p_status)
    and (p_encounter_type is null or e.encounter_type = p_encounter_type)
    and (p_attending_staff_id is null or e.attending_staff_id = p_attending_staff_id)
  order by e.encounter_date desc, e.created_at desc, e.id
  limit safe_limit offset safe_offset;
end;
$$;

create or replace function public.health_record_get(p_encounter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  actor_resident_id uuid := public.current_resident_id();
  encounter_record public.health_encounters%rowtype;
  can_view_narrative boolean := false;
  can_view_vitals boolean := false;
  result jsonb;
begin
  select * into encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id;
  if not found then
    raise exception 'health encounter not found' using errcode = 'P0002';
  end if;

  can_view_narrative :=
    actor_role = 'nurse'::public.app_role
    or (
      actor_role = 'midwife'::public.app_role
      and encounter_record.encounter_type in (
        'maternal_care'::public.health_encounter_type,
        'child_health'::public.health_encounter_type
      )
    )
    or (
      actor_role = 'resident'::public.app_role
      and encounter_record.resident_id = actor_resident_id
      and encounter_record.status in (
        'signed'::public.health_encounter_status,
        'amended'::public.health_encounter_status
      )
    );

  can_view_vitals := can_view_narrative
    or (
      actor_role = 'barangay_health_worker'::public.app_role
      and encounter_record.status = 'draft'::public.health_encounter_status
      and encounter_record.appointment_id is not null
      and exists (
        select 1
        from public.appointments as appointment
        where appointment.id = encounter_record.appointment_id
          and appointment.status in ('checked_in', 'in_progress')
          and appointment.archived_at is null
      )
    );

  if actor_role is null
    or (
      actor_role = 'midwife'::public.app_role
      and encounter_record.encounter_type not in (
        'maternal_care'::public.health_encounter_type,
        'child_health'::public.health_encounter_type
      )
    )
    or (
      actor_role = 'resident'::public.app_role
      and not can_view_narrative
    )
    or (
      encounter_record.status = 'archived'::public.health_encounter_status
      and actor_role <> 'admin'::public.app_role
    ) then
    raise exception 'you are not authorized to view this health encounter'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', e.id,
    'encounter_number', e.encounter_number,
    'resident_id', e.resident_id,
    'appointment_id', e.appointment_id,
    'encounter_type', e.encounter_type,
    'encounter_date', e.encounter_date,
    'attending_staff_id', e.attending_staff_id,
    'status', e.status,
    'amends_encounter_id', e.amends_encounter_id,
    'amendment_reason', case when can_view_narrative then e.amendment_reason else null end,
    'signed_by', e.signed_by,
    'signed_at', e.signed_at,
    'version', e.version,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'archived_at', e.archived_at,
    'resident', jsonb_build_object(
      'id', r.id,
      'resident_number', r.resident_number,
      'first_name', r.first_name,
      'middle_name', r.middle_name,
      'last_name', r.last_name,
      'suffix', r.suffix,
      'date_of_birth', r.date_of_birth,
      'sex', r.sex,
      'blood_type', r.blood_type,
      'status', r.status
    ),
    'appointment', case when a.id is null then null else jsonb_build_object(
      'id', a.id,
      'appointment_number', a.appointment_number,
      'appointment_type', a.appointment_type,
      'service_type', a.service_type,
      'scheduled_date', a.scheduled_date,
      'start_time', a.start_time,
      'end_time', a.end_time,
      'status', a.status
    ) end,
    'attending_staff', jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'middle_name', p.middle_name,
      'last_name', p.last_name,
      'suffix', p.suffix,
      'role', p.role
    ),
    'clinical', case when can_view_narrative then jsonb_build_object(
      'chief_complaint', e.chief_complaint,
      'subjective_notes', e.subjective_notes,
      'objective_notes', e.objective_notes,
      'assessment', e.assessment,
      'plan', e.plan,
      'diagnosis_text', e.diagnosis_text,
      'treatment_notes', e.treatment_notes,
      'follow_up_date', e.follow_up_date
    ) else null end,
    'vital_signs', case when can_view_vitals then (
      select jsonb_build_object(
        'id', v.id,
        'temperature_c', v.temperature_c,
        'systolic_bp', v.systolic_bp,
        'diastolic_bp', v.diastolic_bp,
        'pulse_bpm', v.pulse_bpm,
        'respiratory_rate', v.respiratory_rate,
        'oxygen_saturation', v.oxygen_saturation,
        'height_cm', v.height_cm,
        'weight_kg', v.weight_kg,
        'bmi', case
          when v.height_cm is not null and v.weight_kg is not null and v.height_cm > 0
            then round(v.weight_kg / power(v.height_cm / 100, 2), 1)
          else null
        end,
        'pain_score', v.pain_score,
        'recorded_by', v.recorded_by,
        'recorded_at', v.recorded_at,
        'updated_at', v.updated_at
      )
      from public.vital_signs as v
      where v.encounter_id = e.id
    ) else null end
  )
  into result
  from public.health_encounters as e
  join public.residents as r on r.id = e.resident_id
  join public.profiles as p on p.id = e.attending_staff_id
  left join public.appointments as a on a.id = e.appointment_id
  where e.id = encounter_record.id;

  return result;
end;
$$;

create or replace function public.health_record_for_appointment(p_appointment_id uuid)
returns table (
  id uuid,
  encounter_number text,
  status public.health_encounter_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  appointment_record public.appointments%rowtype;
begin
  select * into appointment_record
  from public.appointments as a
  where a.id = p_appointment_id;
  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if actor_role is null or not (
    actor_role in ('admin', 'barangay_health_worker')
    or (
      actor_role = 'nurse'::public.app_role
      and appointment_record.assigned_staff_id = actor_id
    )
    or (
      actor_role = 'midwife'::public.app_role
      and appointment_record.service_type in ('Maternal Care', 'Child Health')
      and appointment_record.assigned_staff_id = actor_id
    )
    or (
      actor_role = 'resident'::public.app_role
      and appointment_record.resident_id = public.current_resident_id()
    )
  ) then
    raise exception 'you are not authorized for this appointment health record'
      using errcode = '42501';
  end if;

  return query
  select e.id, e.encounter_number, e.status
  from public.health_encounters as e
  where e.appointment_id = p_appointment_id
    and (
      actor_role <> 'resident'::public.app_role
      or e.status in ('signed', 'amended')
    )
  limit 1;
end;
$$;

create or replace function public.health_encounter_create(
  p_resident_id uuid,
  p_appointment_id uuid,
  p_encounter_type public.health_encounter_type,
  p_encounter_date date,
  p_request_key uuid
)
returns table (id uuid, encounter_number text, status public.health_encounter_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  appointment_record public.appointments%rowtype;
  existing_record public.health_encounters%rowtype;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'encounter creation requires authorized clinical staff'
      using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'an encounter request key is required' using errcode = '23502';
  end if;
  if actor_role = 'midwife'::public.app_role
    and p_encounter_type not in (
      'maternal_care'::public.health_encounter_type,
      'child_health'::public.health_encounter_type
    ) then
    raise exception 'midwives may create only maternal or child encounters'
      using errcode = '42501';
  end if;

  -- Serialize retries for the same caller-supplied idempotency key. Hash
  -- collisions only cause harmless extra serialization; uniqueness remains
  -- guaranteed by (created_by, request_key).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_key::text, 0)
  );

  select * into existing_record
  from public.health_encounters as e
  where e.created_by = actor_id
    and e.request_key = p_request_key;
  if found then
    if existing_record.resident_id is distinct from p_resident_id
      or existing_record.appointment_id is distinct from p_appointment_id
      or existing_record.encounter_type is distinct from p_encounter_type
      or existing_record.encounter_date is distinct from
        coalesce(p_encounter_date, current_date) then
      raise exception 'encounter request key was reused with different data'
        using errcode = '23514';
    end if;
    return query
    select existing_record.id, existing_record.encounter_number,
      existing_record.status, existing_record.version;
    return;
  end if;

  if not exists (
    select 1 from public.residents as r
    where r.id = p_resident_id
      and r.status = 'active'::public.resident_status
      and r.archived_at is null
  ) then
    raise exception 'resident must be active for a health encounter'
      using errcode = '23514';
  end if;

  if p_appointment_id is not null then
    select * into appointment_record
    from public.appointments as a
    where a.id = p_appointment_id
    for update;
    if not found then
      raise exception 'appointment not found' using errcode = 'P0002';
    end if;
    if appointment_record.resident_id <> p_resident_id then
      raise exception 'appointment and encounter resident do not match'
        using errcode = '23514';
    end if;
    if appointment_record.status not in ('in_progress', 'completed') then
      raise exception 'appointment must be in progress or completed'
        using errcode = '23514';
    end if;
    if appointment_record.archived_at is not null then
      raise exception 'archived appointment cannot start an encounter'
        using errcode = '23514';
    end if;
    if actor_role = 'nurse'::public.app_role
      and appointment_record.assigned_staff_id <> actor_id then
      raise exception 'nurse must be assigned to the linked appointment'
        using errcode = '42501';
    end if;
    if actor_role = 'midwife'::public.app_role
      and (
        appointment_record.assigned_staff_id <> actor_id
        or appointment_record.service_type not in ('Maternal Care', 'Child Health')
      ) then
      raise exception 'midwife appointment scope does not allow this encounter'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from public.health_encounters as e
      where e.appointment_id = p_appointment_id
    ) then
      raise exception 'an encounter already exists for this appointment'
        using errcode = '23505';
    end if;
  end if;

  return query
  insert into public.health_encounters (
    resident_id, appointment_id, encounter_type, encounter_date,
    attending_staff_id, status, request_key, created_by, updated_by
  ) values (
    p_resident_id, p_appointment_id, p_encounter_type,
    coalesce(p_encounter_date, current_date), actor_id,
    'draft'::public.health_encounter_status, p_request_key, actor_id, actor_id
  )
  returning health_encounters.id, health_encounters.encounter_number,
    health_encounters.status, health_encounters.version;
end;
$$;

create or replace function public.health_encounter_update(
  p_encounter_id uuid,
  p_expected_version bigint,
  p_chief_complaint text,
  p_subjective_notes text,
  p_objective_notes text,
  p_assessment text,
  p_plan text,
  p_diagnosis_text text,
  p_treatment_notes text,
  p_follow_up_date date
)
returns table (id uuid, encounter_number text, status public.health_encounter_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.health_encounters%rowtype;
begin
  select * into current_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;
  if not found then raise exception 'health encounter not found' using errcode = 'P0002'; end if;
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role)
    or current_record.attending_staff_id <> actor_id
    or (
      actor_role = 'midwife'::public.app_role
      and current_record.encounter_type not in ('maternal_care', 'child_health')
    ) then
    raise exception 'you are not authorized to edit this encounter'
      using errcode = '42501';
  end if;
  if current_record.status <> 'draft'::public.health_encounter_status then
    raise exception 'signed health encounters are immutable' using errcode = '23514';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'health encounter was changed by another user' using errcode = '40001';
  end if;
  if char_length(coalesce(p_chief_complaint, '')) > 2000
    or char_length(coalesce(p_subjective_notes, '')) > 10000
    or char_length(coalesce(p_objective_notes, '')) > 10000
    or char_length(coalesce(p_assessment, '')) > 10000
    or char_length(coalesce(p_plan, '')) > 10000
    or char_length(coalesce(p_diagnosis_text, '')) > 5000
    or char_length(coalesce(p_treatment_notes, '')) > 10000 then
    raise exception 'clinical text exceeds the allowed length' using errcode = '22001';
  end if;
  if p_follow_up_date is not null and p_follow_up_date < current_record.encounter_date then
    raise exception 'follow-up date cannot precede the encounter date'
      using errcode = '22007';
  end if;

  return query
  update public.health_encounters as e
  set chief_complaint = nullif(btrim(p_chief_complaint), ''),
      subjective_notes = nullif(btrim(p_subjective_notes), ''),
      objective_notes = nullif(btrim(p_objective_notes), ''),
      assessment = nullif(btrim(p_assessment), ''),
      plan = nullif(btrim(p_plan), ''),
      diagnosis_text = nullif(btrim(p_diagnosis_text), ''),
      treatment_notes = nullif(btrim(p_treatment_notes), ''),
      follow_up_date = p_follow_up_date,
      updated_by = actor_id
  where e.id = current_record.id
  returning e.id, e.encounter_number, e.status, e.version;
end;
$$;

create or replace function public.health_encounter_sign(
  p_encounter_id uuid,
  p_expected_version bigint
)
returns table (id uuid, encounter_number text, status public.health_encounter_status, version bigint, signed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.health_encounters%rowtype;
  original_record public.health_encounters%rowtype;
begin
  select * into current_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;
  if not found then raise exception 'health encounter not found' using errcode = 'P0002'; end if;
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role)
    or current_record.attending_staff_id <> actor_id
    or (
      actor_role = 'midwife'::public.app_role
      and current_record.encounter_type not in ('maternal_care', 'child_health')
    ) then
    raise exception 'you are not authorized to sign this encounter'
      using errcode = '42501';
  end if;
  if current_record.status <> 'draft'::public.health_encounter_status then
    raise exception 'only draft encounters may be signed' using errcode = '23514';
  end if;
  if current_record.version <> p_expected_version then
    raise exception 'health encounter was changed by another user' using errcode = '40001';
  end if;
  if nullif(btrim(current_record.chief_complaint), '') is null
    or nullif(btrim(current_record.assessment), '') is null
    or nullif(btrim(current_record.plan), '') is null then
    raise exception 'chief complaint, assessment, and plan are required before signing'
      using errcode = '23514';
  end if;

  if current_record.amends_encounter_id is not null then
    select * into original_record
    from public.health_encounters as e
    where e.id = current_record.amends_encounter_id
    for update;
    if original_record.status <> 'signed'::public.health_encounter_status then
      raise exception 'the original encounter is no longer amendable'
        using errcode = '23514';
    end if;
    update public.health_encounters as e
    set status = 'amended'::public.health_encounter_status,
        updated_by = actor_id
    where e.id = original_record.id;
  end if;

  return query
  update public.health_encounters as e
  set status = 'signed'::public.health_encounter_status,
      signed_by = actor_id,
      signed_at = pg_catalog.now(),
      updated_by = actor_id
  where e.id = current_record.id
  returning e.id, e.encounter_number, e.status, e.version, e.signed_at;
end;
$$;

create or replace function public.health_encounter_amend(
  p_encounter_id uuid,
  p_expected_version bigint,
  p_amendment_reason text,
  p_request_key uuid
)
returns table (id uuid, encounter_number text, status public.health_encounter_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  current_record public.health_encounters%rowtype;
  amendment_record public.health_encounters%rowtype;
  existing_record public.health_encounters%rowtype;
begin
  if p_request_key is null then
    raise exception 'an amendment request key is required' using errcode = '23502';
  end if;
  if nullif(btrim(p_amendment_reason), '') is null
    or char_length(btrim(p_amendment_reason)) > 1000 then
    raise exception 'a valid amendment reason is required' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_key::text, 0)
  );

  select * into existing_record
  from public.health_encounters as e
  where e.created_by = actor_id and e.request_key = p_request_key;
  if found then
    if existing_record.amends_encounter_id is distinct from p_encounter_id then
      raise exception 'amendment request key was reused for another encounter'
        using errcode = '23514';
    end if;
    return query
    select existing_record.id, existing_record.encounter_number,
      existing_record.status, existing_record.version;
    return;
  end if;

  select * into current_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;
  if not found then raise exception 'health encounter not found' using errcode = 'P0002'; end if;
  if current_record.version <> p_expected_version then
    raise exception 'health encounter was changed by another user' using errcode = '40001';
  end if;
  if current_record.status <> 'signed'::public.health_encounter_status then
    raise exception 'only a signed encounter may be amended' using errcode = '23514';
  end if;
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role)
    or (
      actor_role = 'midwife'::public.app_role
      and current_record.encounter_type not in ('maternal_care', 'child_health')
    ) then
    raise exception 'you are not authorized to amend this encounter'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.health_encounters as e
    where e.amends_encounter_id = current_record.id
  ) then
    raise exception 'an amendment already exists for this encounter'
      using errcode = '23505';
  end if;

  insert into public.health_encounters (
    resident_id, encounter_type, encounter_date, attending_staff_id,
    chief_complaint, subjective_notes, objective_notes, assessment, plan,
    diagnosis_text, treatment_notes, follow_up_date, status,
    amends_encounter_id, amendment_reason, request_key, created_by, updated_by
  ) values (
    current_record.resident_id, current_record.encounter_type, current_date, actor_id,
    current_record.chief_complaint, current_record.subjective_notes,
    current_record.objective_notes, current_record.assessment, current_record.plan,
    current_record.diagnosis_text, current_record.treatment_notes,
    current_record.follow_up_date, 'draft'::public.health_encounter_status,
    current_record.id, btrim(p_amendment_reason), p_request_key, actor_id, actor_id
  )
  returning * into amendment_record;

  insert into public.vital_signs (
    encounter_id, temperature_c, systolic_bp, diastolic_bp, pulse_bpm,
    respiratory_rate, oxygen_saturation, height_cm, weight_kg, pain_score,
    recorded_by, recorded_at
  )
  select
    amendment_record.id, v.temperature_c, v.systolic_bp, v.diastolic_bp,
    v.pulse_bpm, v.respiratory_rate, v.oxygen_saturation, v.height_cm,
    v.weight_kg, v.pain_score, actor_id, pg_catalog.now()
  from public.vital_signs as v
  where v.encounter_id = current_record.id;

  return query select amendment_record.id, amendment_record.encounter_number,
    amendment_record.status, amendment_record.version;
end;
$$;

create or replace function public.health_encounter_archive(
  p_encounter_id uuid,
  p_expected_version bigint
)
returns table (id uuid, encounter_number text, status public.health_encounter_status, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_record public.health_encounters%rowtype;
begin
  if public.current_profile_role() <> 'admin'::public.app_role then
    raise exception 'health-record archival requires an administrator'
      using errcode = '42501';
  end if;
  select * into current_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;
  if not found then raise exception 'health encounter not found' using errcode = 'P0002'; end if;
  if current_record.version <> p_expected_version then
    raise exception 'health encounter was changed by another user' using errcode = '40001';
  end if;
  if current_record.status not in ('signed', 'amended') then
    raise exception 'only signed or amended encounters may be archived'
      using errcode = '23514';
  end if;

  return query
  update public.health_encounters as e
  set status = 'archived'::public.health_encounter_status,
      archived_at = pg_catalog.now(),
      updated_by = actor_id
  where e.id = current_record.id
  returning e.id, e.encounter_number, e.status, e.version;
end;
$$;

create or replace function public.health_vital_signs_save(
  p_encounter_id uuid,
  p_temperature_c numeric,
  p_systolic_bp smallint,
  p_diastolic_bp smallint,
  p_pulse_bpm smallint,
  p_respiratory_rate smallint,
  p_oxygen_saturation numeric,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_pain_score smallint
)
returns table (id uuid, encounter_id uuid, bmi numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  encounter_record public.health_encounters%rowtype;
  vital_record public.vital_signs%rowtype;
begin
  select * into encounter_record
  from public.health_encounters as e
  where e.id = p_encounter_id
  for update;
  if not found then raise exception 'health encounter not found' using errcode = 'P0002'; end if;
  if encounter_record.status <> 'draft'::public.health_encounter_status then
    raise exception 'vital signs cannot change after an encounter is signed'
      using errcode = '23514';
  end if;
  if actor_role = 'barangay_health_worker'::public.app_role then
    if encounter_record.appointment_id is null or not exists (
      select 1 from public.appointments as a
      where a.id = encounter_record.appointment_id
        and a.status in ('checked_in', 'in_progress')
        and a.archived_at is null
    ) then
      raise exception 'BHW preliminary vitals require a checked-in appointment'
        using errcode = '42501';
    end if;
  elsif actor_role in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    if encounter_record.attending_staff_id <> actor_id
      or (
        actor_role = 'midwife'::public.app_role
        and encounter_record.encounter_type not in ('maternal_care', 'child_health')
      ) then
      raise exception 'you are not authorized to record these vital signs'
        using errcode = '42501';
    end if;
  else
    raise exception 'vital-sign recording requires authorized health staff'
      using errcode = '42501';
  end if;

  insert into public.vital_signs (
    encounter_id, temperature_c, systolic_bp, diastolic_bp, pulse_bpm,
    respiratory_rate, oxygen_saturation, height_cm, weight_kg, pain_score,
    recorded_by
  ) values (
    p_encounter_id, p_temperature_c, p_systolic_bp, p_diastolic_bp, p_pulse_bpm,
    p_respiratory_rate, p_oxygen_saturation, p_height_cm, p_weight_kg,
    p_pain_score, actor_id
  )
  on conflict (encounter_id) do update
  set temperature_c = excluded.temperature_c,
      systolic_bp = excluded.systolic_bp,
      diastolic_bp = excluded.diastolic_bp,
      pulse_bpm = excluded.pulse_bpm,
      respiratory_rate = excluded.respiratory_rate,
      oxygen_saturation = excluded.oxygen_saturation,
      height_cm = excluded.height_cm,
      weight_kg = excluded.weight_kg,
      pain_score = excluded.pain_score,
      recorded_by = actor_id,
      recorded_at = pg_catalog.now()
  returning * into vital_record;

  return query select vital_record.id, vital_record.encounter_id,
    case
      when vital_record.height_cm is not null and vital_record.weight_kg is not null
        then round(vital_record.weight_kg / power(vital_record.height_cm / 100, 2), 1)
      else null
    end;
end;
$$;

create or replace function public.health_allergy_save(
  p_id uuid,
  p_resident_id uuid,
  p_allergen text,
  p_reaction text,
  p_severity public.allergy_severity,
  p_status public.clinical_item_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  saved_id uuid;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'allergy documentation requires clinical staff'
      using errcode = '42501';
  end if;
  if actor_role = 'midwife'::public.app_role and not exists (
    select 1 from public.health_encounters as e
    where e.resident_id = p_resident_id
      and e.encounter_type in ('maternal_care', 'child_health')
      and e.status <> 'archived'
  ) then
    raise exception 'resident is outside midwife clinical scope'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_allergen), '') is null or char_length(btrim(p_allergen)) > 200
    or char_length(coalesce(p_reaction, '')) > 1000 then
    raise exception 'invalid allergy documentation' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.resident_allergies (
      resident_id, allergen, reaction, severity, status, noted_by
    ) values (
      p_resident_id, btrim(p_allergen), nullif(btrim(p_reaction), ''),
      coalesce(p_severity, 'unknown'), coalesce(p_status, 'active'), actor_id
    ) returning id into saved_id;
  else
    update public.resident_allergies as a
    set allergen = btrim(p_allergen),
        reaction = nullif(btrim(p_reaction), ''),
        severity = coalesce(p_severity, a.severity),
        status = coalesce(p_status, a.status),
        updated_at = pg_catalog.now()
    where a.id = p_id and a.resident_id = p_resident_id and a.archived_at is null
    returning a.id into saved_id;
    if saved_id is null then raise exception 'allergy record not found' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.health_allergy_archive(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  saved_id uuid;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'allergy archival requires clinical staff' using errcode = '42501';
  end if;
  update public.resident_allergies as a
  set status = case when a.status = 'active' then 'historical' else a.status end,
      archived_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where a.id = p_id and a.archived_at is null
    and (
      actor_role = 'nurse'::public.app_role
      or exists (
        select 1 from public.health_encounters as e
        where e.resident_id = a.resident_id
          and e.encounter_type in ('maternal_care', 'child_health')
          and e.status <> 'archived'
      )
    )
  returning a.id into saved_id;
  if saved_id is null then raise exception 'allergy record not found' using errcode = 'P0002'; end if;
  return saved_id;
end;
$$;

create or replace function public.health_medical_history_save(
  p_id uuid,
  p_resident_id uuid,
  p_condition_name text,
  p_details text,
  p_onset_date date,
  p_status public.clinical_item_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role := public.current_profile_role();
  saved_id uuid;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'medical-history documentation requires clinical staff'
      using errcode = '42501';
  end if;
  if actor_role = 'midwife'::public.app_role and not exists (
    select 1 from public.health_encounters as e
    where e.resident_id = p_resident_id
      and e.encounter_type in ('maternal_care', 'child_health')
      and e.status <> 'archived'
  ) then
    raise exception 'resident is outside midwife clinical scope'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_condition_name), '') is null
    or char_length(btrim(p_condition_name)) > 200
    or char_length(coalesce(p_details, '')) > 2000
    or p_onset_date > current_date then
    raise exception 'invalid medical-history documentation' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.resident_medical_history (
      resident_id, condition_name, details, onset_date, status, noted_by
    ) values (
      p_resident_id, btrim(p_condition_name), nullif(btrim(p_details), ''),
      p_onset_date, coalesce(p_status, 'active'), actor_id
    ) returning id into saved_id;
  else
    update public.resident_medical_history as h
    set condition_name = btrim(p_condition_name),
        details = nullif(btrim(p_details), ''),
        onset_date = p_onset_date,
        status = coalesce(p_status, h.status),
        updated_at = pg_catalog.now()
    where h.id = p_id and h.resident_id = p_resident_id and h.archived_at is null
    returning h.id into saved_id;
    if saved_id is null then raise exception 'medical-history record not found' using errcode = 'P0002'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.health_medical_history_archive(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role := public.current_profile_role();
  saved_id uuid;
begin
  if actor_role not in ('nurse'::public.app_role, 'midwife'::public.app_role) then
    raise exception 'medical-history archival requires clinical staff'
      using errcode = '42501';
  end if;
  update public.resident_medical_history as h
  set status = case when h.status = 'active' then 'historical' else h.status end,
      archived_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where h.id = p_id and h.archived_at is null
    and (
      actor_role = 'nurse'::public.app_role
      or exists (
        select 1 from public.health_encounters as e
        where e.resident_id = h.resident_id
          and e.encounter_type in ('maternal_care', 'child_health')
          and e.status <> 'archived'
      )
    )
  returning h.id into saved_id;
  if saved_id is null then raise exception 'medical-history record not found' using errcode = 'P0002'; end if;
  return saved_id;
end;
$$;

create or replace function public.health_clinical_changed_fields(
  table_name text,
  old_row jsonb,
  new_row jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  allowed_fields text[];
  changed jsonb;
begin
  if old_row is null or new_row is null then return null; end if;
  case table_name
    when 'health_encounters' then allowed_fields := array[
      'encounter_type', 'encounter_date', 'attending_staff_id',
      'chief_complaint', 'subjective_notes', 'objective_notes', 'assessment',
      'plan', 'diagnosis_text', 'treatment_notes', 'follow_up_date', 'status',
      'signed_by', 'signed_at', 'archived_at'
    ];
    when 'vital_signs' then allowed_fields := array[
      'temperature_c', 'systolic_bp', 'diastolic_bp', 'pulse_bpm',
      'respiratory_rate', 'oxygen_saturation', 'height_cm', 'weight_kg',
      'pain_score'
    ];
    when 'resident_allergies' then allowed_fields := array[
      'allergen', 'reaction', 'severity', 'status', 'archived_at'
    ];
    when 'resident_medical_history' then allowed_fields := array[
      'condition_name', 'details', 'onset_date', 'status', 'archived_at'
    ];
    else return null;
  end case;

  select coalesce(jsonb_agg(field_name order by field_name), '[]'::jsonb)
  into changed
  from unnest(allowed_fields) as field_name
  where old_row -> field_name is distinct from new_row -> field_name;
  return changed;
end;
$$;

create or replace function public.audit_clinical_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_row jsonb := to_jsonb(new);
  actor_uuid uuid := auth.uid();
  audit_action text;
  audit_summary text;
  safe_old jsonb;
  safe_new jsonb;
  entity_uuid uuid := new.id;
begin
  if tg_table_name = 'health_encounters' then
    audit_action := case
      when tg_op = 'INSERT' then 'encounter.created'
      when old.status <> new.status and new.status = 'signed' then 'encounter.signed'
      when old.status <> new.status and new.status = 'amended' then 'encounter.amended'
      when old.status <> new.status and new.status = 'archived' then 'encounter.archived'
      else 'encounter.updated'
    end;
    audit_summary := initcap(replace(audit_action, '.', ' '));
    safe_old := case when old_row is null then null else jsonb_build_object(
      'id', old.id, 'encounter_number', old.encounter_number,
      'resident_id', old.resident_id, 'appointment_id', old.appointment_id,
      'status', old.status
    ) end;
    safe_new := jsonb_build_object(
      'id', new.id, 'encounter_number', new.encounter_number,
      'resident_id', new.resident_id, 'appointment_id', new.appointment_id,
      'status', new.status
    );
  elsif tg_table_name = 'vital_signs' then
    audit_action := case when tg_op = 'INSERT' then 'vital_signs.created'
      else 'vital_signs.updated' end;
    audit_summary := initcap(replace(audit_action, '.', ' '));
    safe_old := case when old_row is null then null else jsonb_build_object(
      'id', old.id, 'encounter_id', old.encounter_id
    ) end;
    safe_new := jsonb_build_object('id', new.id, 'encounter_id', new.encounter_id);
  elsif tg_table_name = 'resident_allergies' then
    audit_action := case
      when tg_op = 'INSERT' then 'allergy.created'
      when old.archived_at is null and new.archived_at is not null then 'allergy.archived'
      else 'allergy.updated'
    end;
    audit_summary := initcap(replace(audit_action, '.', ' '));
    safe_old := case when old_row is null then null else jsonb_build_object(
      'id', old.id, 'resident_id', old.resident_id, 'status', old.status
    ) end;
    safe_new := jsonb_build_object(
      'id', new.id, 'resident_id', new.resident_id, 'status', new.status
    );
  else
    audit_action := case
      when tg_op = 'INSERT' then 'medical_history.created'
      when old.archived_at is null and new.archived_at is not null
        then 'medical_history.archived'
      else 'medical_history.updated'
    end;
    audit_summary := initcap(replace(audit_action, '.', ' '));
    safe_old := case when old_row is null then null else jsonb_build_object(
      'id', old.id, 'resident_id', old.resident_id, 'status', old.status
    ) end;
    safe_new := jsonb_build_object(
      'id', new.id, 'resident_id', new.resident_id, 'status', new.status
    );
  end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, summary,
    old_values, new_values, request_metadata
  ) values (
    actor_uuid, audit_action, tg_table_name, entity_uuid, audit_summary,
    safe_old, safe_new,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'changed_fields',
      public.health_clinical_changed_fields(tg_table_name, old_row, new_row)
    ) else null end
  );
  return new;
end;
$$;

revoke all on function public.health_clinical_changed_fields(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.audit_clinical_change()
  from public, anon, authenticated;

create trigger health_encounters_audit
  after insert or update on public.health_encounters
  for each row execute function public.audit_clinical_change();

create trigger vital_signs_audit
  after insert or update on public.vital_signs
  for each row execute function public.audit_clinical_change();

create trigger resident_allergies_audit
  after insert or update on public.resident_allergies
  for each row execute function public.audit_clinical_change();

create trigger resident_medical_history_audit
  after insert or update on public.resident_medical_history
  for each row execute function public.audit_clinical_change();

revoke all on function public.health_record_list(text, date, date, public.health_encounter_status, public.health_encounter_type, uuid, boolean, integer, integer) from public, anon;
revoke all on function public.health_record_get(uuid) from public, anon;
revoke all on function public.health_record_for_appointment(uuid) from public, anon;
revoke all on function public.health_encounter_create(uuid, uuid, public.health_encounter_type, date, uuid) from public, anon;
revoke all on function public.health_encounter_update(uuid, bigint, text, text, text, text, text, text, text, date) from public, anon;
revoke all on function public.health_encounter_sign(uuid, bigint) from public, anon;
revoke all on function public.health_encounter_amend(uuid, bigint, text, uuid) from public, anon;
revoke all on function public.health_encounter_archive(uuid, bigint) from public, anon;
revoke all on function public.health_vital_signs_save(uuid, numeric, smallint, smallint, smallint, smallint, numeric, numeric, numeric, smallint) from public, anon;
revoke all on function public.health_allergy_save(uuid, uuid, text, text, public.allergy_severity, public.clinical_item_status) from public, anon;
revoke all on function public.health_allergy_archive(uuid) from public, anon;
revoke all on function public.health_medical_history_save(uuid, uuid, text, text, date, public.clinical_item_status) from public, anon;
revoke all on function public.health_medical_history_archive(uuid) from public, anon;

grant execute on function public.health_record_list(text, date, date, public.health_encounter_status, public.health_encounter_type, uuid, boolean, integer, integer) to authenticated, service_role;
grant execute on function public.health_record_get(uuid) to authenticated, service_role;
grant execute on function public.health_record_for_appointment(uuid) to authenticated, service_role;
grant execute on function public.health_encounter_create(uuid, uuid, public.health_encounter_type, date, uuid) to authenticated, service_role;
grant execute on function public.health_encounter_update(uuid, bigint, text, text, text, text, text, text, text, date) to authenticated, service_role;
grant execute on function public.health_encounter_sign(uuid, bigint) to authenticated, service_role;
grant execute on function public.health_encounter_amend(uuid, bigint, text, uuid) to authenticated, service_role;
grant execute on function public.health_encounter_archive(uuid, bigint) to authenticated, service_role;
grant execute on function public.health_vital_signs_save(uuid, numeric, smallint, smallint, smallint, smallint, numeric, numeric, numeric, smallint) to authenticated, service_role;
grant execute on function public.health_allergy_save(uuid, uuid, text, text, public.allergy_severity, public.clinical_item_status) to authenticated, service_role;
grant execute on function public.health_allergy_archive(uuid) to authenticated, service_role;
grant execute on function public.health_medical_history_save(uuid, uuid, text, text, date, public.clinical_item_status) to authenticated, service_role;
grant execute on function public.health_medical_history_archive(uuid) to authenticated, service_role;

commit;
