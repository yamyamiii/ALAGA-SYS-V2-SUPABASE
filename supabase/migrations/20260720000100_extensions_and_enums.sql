-- Phase 1: shared extensions and validated database values.
-- Lowercase enum labels are stable storage values; the UI may map labels later.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum (
  'admin',
  'barangay_health_worker',
  'nurse',
  'midwife',
  'resident'
);

create type public.account_status as enum (
  'invited',
  'active',
  'inactive',
  'suspended'
);

create type public.resident_status as enum (
  'active',
  'inactive',
  'moved_out',
  'deceased'
);

create type public.sex_type as enum ('male', 'female');

create type public.household_status as enum ('active', 'inactive', 'archived');

create type public.civil_status_type as enum (
  'single',
  'married',
  'widowed',
  'separated',
  'annulled'
);

create type public.pregnancy_status_type as enum (
  'not_pregnant',
  'pregnant',
  'postpartum',
  'unknown'
);

create type public.appointment_type as enum (
  'scheduled',
  'walk_in',
  'follow_up',
  'home_visit'
);

create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled'
);

create type public.appointment_priority as enum (
  'normal',
  'priority',
  'urgent'
);
