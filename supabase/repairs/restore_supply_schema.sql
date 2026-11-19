-- Run in the Supabase SQL Editor for the same project used by the backend.
-- Equivalent supply schema to migrations 0021-0026. Repeatable; no row deletion.
-- Requires the existing public.meters table. Transaction rolls back on failure.
begin;
create table if not exists public.user_meter_tariff_profiles (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id text not null references public.meters(device_id) on delete cascade,
 provider text not null,
 jurisdiction text not null,
 segment text not null,
 updated_at timestamptz not null default now(),
 primary key (user_id,device_id)
);
alter table public.user_meter_tariff_profiles enable row level security;
-- These legacy checks were replaced by migration 0022.
alter table public.user_meter_tariff_profiles drop constraint if exists user_meter_tariff_profiles_provider_check;
alter table public.user_meter_tariff_profiles drop constraint if exists user_meter_tariff_profiles_jurisdiction_check;
alter table public.user_meter_tariff_profiles drop constraint if exists user_meter_tariff_profiles_segment_check;
alter table public.user_meter_tariff_profiles add column if not exists province text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists locality text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists category text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists category_text text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists bonus text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists provider_confirmed boolean not null default false;
alter table public.user_meter_tariff_profiles drop constraint if exists supply_provider_check;
alter table public.user_meter_tariff_profiles add constraint supply_provider_check check(provider in ('','SPSE','EDESUR','COOPRG','other'));
do $$
begin
 if not exists (select 1 from pg_constraint where conrelid='public.user_meter_tariff_profiles'::regclass and conname='supply_segment_check') then
  alter table public.user_meter_tariff_profiles add constraint supply_segment_check check(segment in ('','subsidized','unsubsidized'));
 end if;
 if not exists (select 1 from pg_constraint where conrelid='public.user_meter_tariff_profiles'::regclass and conname='supply_bonus_check') then
  alter table public.user_meter_tariff_profiles add constraint supply_bonus_check check(bonus in ('','none','other'));
 end if;
 if not exists (select 1 from pg_constraint where conrelid='public.user_meter_tariff_profiles'::regclass and conname='supply_locality_length') then
  alter table public.user_meter_tariff_profiles add constraint supply_locality_length check(length(locality)<=100);
 end if;
 if not exists (select 1 from pg_constraint where conrelid='public.user_meter_tariff_profiles'::regclass and conname='category_text_length') then
  alter table public.user_meter_tariff_profiles add constraint category_text_length check(length(category_text)<=120);
 end if;
end $$;
alter table public.user_meter_tariff_profiles add column if not exists supply_type text not null default ''
  check (supply_type in ('', 'single-phase', 'three-phase'));
alter table public.user_meter_tariff_profiles add column if not exists construction_charge text not null default ''
  check (construction_charge in ('', 'yes', 'no'));
alter table public.user_meter_tariff_profiles add column if not exists provider_name text not null default ''
  check (char_length(provider_name)<=80);
notify pgrst, 'reload schema';
commit;
