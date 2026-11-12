-- Per authenticated user and authorized meter. Personal address is never copied.
alter table public.user_meter_tariff_profiles drop constraint if exists user_meter_tariff_profiles_provider_check;
alter table public.user_meter_tariff_profiles drop constraint if exists user_meter_tariff_profiles_jurisdiction_check;
alter table public.user_meter_tariff_profiles drop constraint if exists user_meter_tariff_profiles_segment_check;
alter table public.user_meter_tariff_profiles add column if not exists province text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists locality text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists category text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists bonus text not null default '';
alter table public.user_meter_tariff_profiles add column if not exists provider_confirmed boolean not null default false;
alter table public.user_meter_tariff_profiles add constraint supply_provider_check check(provider in ('','SPSE','other'));
alter table public.user_meter_tariff_profiles add constraint supply_segment_check check(segment in ('','subsidized','unsubsidized'));
alter table public.user_meter_tariff_profiles add constraint supply_bonus_check check(bonus in ('','none','other'));
alter table public.user_meter_tariff_profiles add constraint supply_locality_length check(length(locality)<=100);
-- Existing profiles stay incomplete until the user confirms locality/category/benefits.
-- No automatic name changes or province-to-provider inference.
