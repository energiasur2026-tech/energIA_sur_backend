-- Existing profiles stay scoped by the user_id/device_id key and RLS.
alter table public.user_meter_tariff_profiles drop constraint if exists supply_provider_check;
alter table public.user_meter_tariff_profiles add constraint supply_provider_check
  check (provider in ('', 'SPSE', 'EDESUR', 'COOPRG', 'other'));
alter table public.user_meter_tariff_profiles add column if not exists supply_type text not null default ''
  check (supply_type in ('', 'single-phase', 'three-phase'));
alter table public.user_meter_tariff_profiles add column if not exists construction_charge text not null default ''
  check (construction_charge in ('', 'yes', 'no'));
