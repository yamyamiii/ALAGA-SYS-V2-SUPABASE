-- Profiles are one-to-one with Supabase Auth users. Email remains in auth.users.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'resident',
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  phone_number text,
  account_status public.account_status not null default 'invited',
  avatar_path text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_length check (
    first_name is null or char_length(btrim(first_name)) between 1 and 100
  ),
  constraint profiles_middle_name_length check (
    middle_name is null or char_length(btrim(middle_name)) between 1 and 100
  ),
  constraint profiles_last_name_length check (
    last_name is null or char_length(btrim(last_name)) between 1 and 100
  ),
  constraint profiles_suffix_length check (
    suffix is null or char_length(btrim(suffix)) between 1 and 30
  ),
  constraint profiles_phone_number_length check (
    phone_number is null or char_length(btrim(phone_number)) between 7 and 30
  ),
  constraint profiles_avatar_path_length check (
    avatar_path is null or char_length(avatar_path) <= 500
  )
);

-- This trigger never trusts user metadata for role or account status. Every new
-- Auth user starts as an invited resident until an authorized workflow changes it.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata_first_name text;
  metadata_middle_name text;
  metadata_last_name text;
  metadata_suffix text;
  metadata_phone_number text;
begin
  metadata_first_name := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  metadata_middle_name := nullif(btrim(new.raw_user_meta_data ->> 'middle_name'), '');
  metadata_last_name := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  metadata_suffix := nullif(btrim(new.raw_user_meta_data ->> 'suffix'), '');
  metadata_phone_number := nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), '');

  if char_length(metadata_first_name) > 100 then metadata_first_name := null; end if;
  if char_length(metadata_middle_name) > 100 then metadata_middle_name := null; end if;
  if char_length(metadata_last_name) > 100 then metadata_last_name := null; end if;
  if char_length(metadata_suffix) > 30 then metadata_suffix := null; end if;
  if char_length(metadata_phone_number) not between 7 and 30 then
    metadata_phone_number := null;
  end if;

  insert into public.profiles (
    id,
    role,
    first_name,
    middle_name,
    last_name,
    suffix,
    phone_number,
    account_status,
    avatar_path
  )
  values (
    new.id,
    'resident'::public.app_role,
    metadata_first_name,
    metadata_middle_name,
    metadata_last_name,
    metadata_suffix,
    metadata_phone_number,
    'invited'::public.account_status,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_new_auth_user() from anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
