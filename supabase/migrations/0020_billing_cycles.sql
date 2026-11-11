create table if not exists public.user_meter_billing_cycles (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id text not null references public.meters(device_id) on delete cascade,
 closed_on date not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,device_id)
);
alter table public.user_meter_billing_cycles enable row level security;
-- Only the backend service role reads/writes, after validating session and meter membership.
-- No direct browser policy is granted.
