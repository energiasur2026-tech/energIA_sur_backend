-- Pending, user-confirmed company name. The existing user/meter key and RLS apply.
alter table public.user_meter_tariff_profiles add column if not exists provider_name text not null default ''
  check (char_length(provider_name)<=80);
