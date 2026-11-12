create table if not exists public.user_meter_tariff_profiles (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id text not null references public.meters(device_id) on delete cascade,
 provider text not null check (provider in ('SPSE')),
 jurisdiction text not null check (jurisdiction in ('AR-Santa Cruz')),
 segment text not null check (segment in ('subsidized','unsubsidized')),
 updated_at timestamptz not null default now(),
 primary key (user_id,device_id)
);
alter table public.user_meter_tariff_profiles enable row level security;
-- Service role only, after session + accessible meter checks; no browser policy.
