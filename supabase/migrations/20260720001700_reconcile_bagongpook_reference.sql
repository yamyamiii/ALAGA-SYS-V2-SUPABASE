-- Reconcile databases that received the original fictional location seed before
-- the Bagongpook deployment resolver was introduced.
--
-- This migration intentionally retains barangay rows and UUIDs. When the
-- fictional seed is the only candidate, its UUID becomes the deployment UUID.
-- If Bagongpook already exists, duplicate/legacy rows become inactive aliases
-- after all registry references are moved to the selected canonical row.

begin;

lock table public.barangays, public.puroks, public.households, public.residents
  in share row exclusive mode;

-- The three composite location constraints are recreated and validated after
-- the atomic reference rewrite. Direct barangay foreign keys stay enforced.
alter table public.households disable trigger user;
alter table public.residents disable trigger user;

alter table public.households
  drop constraint households_purok_belongs_to_barangay;
alter table public.residents
  drop constraint residents_purok_belongs_to_barangay,
  drop constraint residents_household_matches_location;

create temporary table migration_bagongpook_barangays (
  id uuid primary key
) on commit drop;

create temporary table migration_bagongpook_target (
  id uuid primary key
) on commit drop;

create temporary table migration_bagongpook_purok_ordinals (
  purok_id uuid primary key,
  ordinal integer not null check (ordinal between 1 and 8)
) on commit drop;

create temporary table migration_bagongpook_canonical_puroks (
  ordinal integer primary key check (ordinal between 1 and 8),
  purok_id uuid not null unique
) on commit drop;

do $$
declare
  target_barangay_id uuid;
  selected_purok_id uuid;
  deterministic_purok_id uuid;
  legacy_barangay_id uuid;
  purok_number integer;
  barangay_count integer;
  legacy_barangay_count integer;
  legacy_purok_count integer;
  legacy_code_count integer;
begin
  insert into migration_bagongpook_barangays (id)
  select b.id
  from public.barangays as b
  where regexp_replace(
      regexp_replace(
        lower(btrim(b.name)),
        '^(brgy\.?|barangay)\s+',
        ''
      ),
      '\s+',
      '',
      'g'
    ) = 'bagongpook'
    or lower(btrim(b.name)) = 'barangay masigla (fictional)';

  select
    count(*),
    (array_agg(b.id order by b.id))[1]
  into legacy_barangay_count, legacy_barangay_id
  from public.barangays as b
  where lower(btrim(b.name)) = 'barangay masigla (fictional)';

  if legacy_barangay_count > 1 then
    raise exception 'Cannot reconcile Brgy. Bagongpook: multiple Barangay Masigla seed rows were found';
  end if;

  if legacy_barangay_id is not null and not exists (
    select 1
    from public.barangays as b
    where b.id <> legacy_barangay_id
      and regexp_replace(
        regexp_replace(
          lower(btrim(b.name)),
          '^(brgy\.?|barangay)\s+',
          ''
        ),
        '\s+',
        '',
        'g'
      ) = 'bagongpook'
  ) then
    select count(*) into barangay_count from public.barangays;

    select
      count(*),
      count(distinct upper(btrim(p.code))) filter (
        where upper(btrim(p.code)) ~ '^P0[1-8]$'
      )
    into legacy_purok_count, legacy_code_count
    from public.puroks as p
    where p.barangay_id = legacy_barangay_id;

    if barangay_count <> 1
      or legacy_purok_count <> 8
      or legacy_code_count <> 8
      or exists (
        select 1
        from generate_series(1, 8) as expected(ordinal)
        where not exists (
          select 1
          from public.puroks as p
          where p.barangay_id = legacy_barangay_id
            and upper(btrim(p.code)) = 'P' || lpad(expected.ordinal::text, 2, '0')
            and (expected.ordinal = 8 or p.is_active)
        )
      ) then
      raise exception 'Cannot reconcile Brgy. Bagongpook: Barangay Masigla does not match the expected single-barangay P01-P08 seed';
    end if;
  end if;

  if not exists (select 1 from migration_bagongpook_barangays) then
    select count(*) into barangay_count from public.barangays;

    if barangay_count <> 0 then
      raise exception 'Cannot reconcile Brgy. Bagongpook: no deployment or original fictional seed barangay was found';
    end if;

    target_barangay_id := '10000000-0000-4000-8000-000000000001';

    insert into public.barangays (
      id, name, city_or_municipality, province, is_active
    ) values (
      target_barangay_id,
      'Brgy. Bagongpook',
      'Lipa City',
      'Batangas',
      true
    );

    insert into migration_bagongpook_barangays (id)
    values (target_barangay_id);
  else
    -- Prefer an existing deployment row. Active rows with the most registry
    -- references win, which minimizes rewrites when duplicate rows exist.
    select b.id
    into target_barangay_id
    from public.barangays as b
    join migration_bagongpook_barangays as candidate on candidate.id = b.id
    order by
      (
        regexp_replace(
          regexp_replace(
            lower(btrim(b.name)),
            '^(brgy\.?|barangay)\s+',
            ''
          ),
          '\s+',
          '',
          'g'
        ) = 'bagongpook'
      ) desc,
      b.is_active desc,
      (
        (select count(*) from public.households as h where h.barangay_id = b.id)
        + (select count(*) from public.residents as r where r.barangay_id = b.id)
      ) desc,
      b.id
    limit 1;
  end if;

  insert into migration_bagongpook_target (id) values (target_barangay_id);

  -- Rename duplicates first so the locality/name unique index cannot conflict
  -- when the selected target is normalized.
  update public.barangays as b
  set
    name = 'Legacy Barangay ' || b.id::text,
    is_active = false,
    updated_at = now()
  from migration_bagongpook_barangays as candidate
  where candidate.id = b.id
    and b.id <> target_barangay_id;

  update public.barangays
  set
    name = 'Brgy. Bagongpook',
    city_or_municipality = 'Lipa City',
    province = 'Batangas',
    is_active = true,
    updated_at = now()
  where id = target_barangay_id;

  -- Recognize the original seed by P01-P08 codes and any already canonical
  -- Purok 1-Purok 8 names before assigning collision-free temporary labels.
  insert into migration_bagongpook_purok_ordinals (purok_id, ordinal)
  select
    p.id,
    case
      when upper(btrim(p.code)) ~ '^P0?[1-8]$'
        then regexp_replace(upper(btrim(p.code)), '^P0?', '')::integer
      else regexp_replace(lower(btrim(p.name)), '^purok\s*', '')::integer
    end
  from public.puroks as p
  join migration_bagongpook_barangays as candidate
    on candidate.id = p.barangay_id
  where upper(btrim(p.code)) ~ '^P0?[1-8]$'
    or regexp_replace(lower(btrim(p.name)), '^purok\s*', '') ~ '^[1-8]$';

  update public.puroks as p
  set
    name = 'Legacy Purok ' || p.id::text,
    code = 'M' || left(replace(p.id::text, '-', ''), 19),
    is_active = false,
    updated_at = now()
  from migration_bagongpook_barangays as candidate
  where candidate.id = p.barangay_id;

  -- Keep a purok already attached to the target when possible. Otherwise use
  -- a deterministic existing UUID, so all original seed references survive.
  insert into migration_bagongpook_canonical_puroks (ordinal, purok_id)
  select distinct on (ordinal)
    ordinal,
    purok_id
  from migration_bagongpook_purok_ordinals as recognized
  join public.puroks as p on p.id = recognized.purok_id
  order by
    ordinal,
    (p.barangay_id = target_barangay_id) desc,
    p.id;

  for purok_number in 1..8 loop
    if not exists (
      select 1
      from migration_bagongpook_canonical_puroks
      where ordinal = purok_number
    ) then
      deterministic_purok_id := (
        '20000000-0000-4000-8000-' || lpad(purok_number::text, 12, '0')
      )::uuid;

      if exists (
        select 1 from public.puroks where id = deterministic_purok_id
      ) then
        deterministic_purok_id := gen_random_uuid();
      end if;

      insert into public.puroks (
        id, barangay_id, name, code, is_active
      ) values (
        deterministic_purok_id,
        target_barangay_id,
        'Migration Purok ' || deterministic_purok_id::text,
        'N' || left(replace(deterministic_purok_id::text, '-', ''), 19),
        false
      );

      insert into migration_bagongpook_purok_ordinals (purok_id, ordinal)
      values (deterministic_purok_id, purok_number);

      insert into migration_bagongpook_canonical_puroks (ordinal, purok_id)
      values (purok_number, deterministic_purok_id);
    end if;
  end loop;

  -- Point registry rows at the chosen Purok UUID for each ordinal. Composite
  -- locality constraints are restored only after both sides are consistent.
  update public.households as h
  set
    purok_id = canonical.purok_id,
    barangay_id = target_barangay_id
  from migration_bagongpook_purok_ordinals as recognized
  join migration_bagongpook_canonical_puroks as canonical
    on canonical.ordinal = recognized.ordinal
  where h.purok_id = recognized.purok_id;

  update public.residents as r
  set
    purok_id = canonical.purok_id,
    barangay_id = target_barangay_id
  from migration_bagongpook_purok_ordinals as recognized
  join migration_bagongpook_canonical_puroks as canonical
    on canonical.ordinal = recognized.ordinal
  where r.purok_id = recognized.purok_id;

  -- Preserve any noncanonical referenced purok UUIDs as inactive rows under
  -- Bagongpook. They remain valid historical references but are not selectable.
  update public.households as h
  set barangay_id = target_barangay_id
  where h.barangay_id in (select id from migration_bagongpook_barangays);

  update public.residents as r
  set barangay_id = target_barangay_id
  where r.barangay_id in (select id from migration_bagongpook_barangays);

  update public.puroks as p
  set barangay_id = target_barangay_id
  where p.barangay_id in (select id from migration_bagongpook_barangays);

  update public.puroks as p
  set
    name = 'Purok ' || canonical.ordinal::text,
    code = 'P' || lpad(canonical.ordinal::text, 2, '0'),
    is_active = canonical.ordinal between 1 and 7,
    updated_at = now()
  from migration_bagongpook_canonical_puroks as canonical
  where p.id = canonical.purok_id;

  select canonical.purok_id
  into selected_purok_id
  from migration_bagongpook_canonical_puroks as canonical
  where canonical.ordinal = 8;

  if not exists (
      select 1
      from public.puroks as p
      where p.id = selected_purok_id
        and p.name = 'Purok 8'
        and not p.is_active
    ) then
    raise exception 'Brgy. Bagongpook Purok 8 reconciliation failed';
  end if;
end;
$$;

alter table public.households
  add constraint households_purok_belongs_to_barangay
  foreign key (purok_id, barangay_id)
  references public.puroks (id, barangay_id)
  on delete restrict
  not valid;

alter table public.residents
  add constraint residents_purok_belongs_to_barangay
  foreign key (purok_id, barangay_id)
  references public.puroks (id, barangay_id)
  on delete restrict
  not valid,
  add constraint residents_household_matches_location
  foreign key (household_id, barangay_id, purok_id)
  references public.households (id, barangay_id, purok_id)
  on delete restrict
  not valid;

alter table public.households
  validate constraint households_purok_belongs_to_barangay;
alter table public.residents
  validate constraint residents_purok_belongs_to_barangay;
alter table public.residents
  validate constraint residents_household_matches_location;

alter table public.households enable trigger user;
alter table public.residents enable trigger user;

do $$
declare
  target_barangay_id uuid;
begin
  select id into target_barangay_id from migration_bagongpook_target;

  if public.deployment_barangay_id() <> target_barangay_id then
    raise exception 'Brgy. Bagongpook deployment resolver reconciliation failed';
  end if;

  if (
    select count(*)
    from public.puroks as p
    where p.barangay_id = target_barangay_id
      and p.is_active
  ) <> 7 or exists (
    select 1
    from generate_series(1, 7) as expected(ordinal)
    where not exists (
      select 1
      from public.puroks as p
      where p.barangay_id = target_barangay_id
        and p.name = 'Purok ' || expected.ordinal::text
        and p.code = 'P' || lpad(expected.ordinal::text, 2, '0')
        and p.is_active
    )
  ) then
    raise exception 'Brgy. Bagongpook active purok reconciliation failed';
  end if;
end;
$$;

commit;
