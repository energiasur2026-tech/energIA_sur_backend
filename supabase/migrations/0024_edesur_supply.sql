-- Preserve existing profiles and their user/meter access policies.
alter table public.user_meter_tariff_profiles drop constraint if exists supply_provider_check;
alter table public.user_meter_tariff_profiles add constraint supply_provider_check
  check (provider in ('', 'SPSE', 'EDESUR', 'other'));
