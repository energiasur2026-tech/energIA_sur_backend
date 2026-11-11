-- Personal goals: identity always comes from validated backend session.
create table if not exists public.user_meter_goals (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id text not null references public.meters(device_id) on delete cascade,
 input_mode text not null check(input_mode in ('ars','kwh')),
 input_value numeric check(input_value > 0),
 tariff_version text,
 updated_at timestamptz not null default now(),
 primary key(user_id,device_id)
);
alter table public.user_meter_goals enable row level security;
create policy personal_goal_select on public.user_meter_goals for select to authenticated using (
 user_id=auth.uid() and exists(select 1 from public.meters m where m.device_id=user_meter_goals.device_id and
 (m.owner_id=auth.uid() or exists(select 1 from public.meter_members mm where mm.device_id=m.device_id and mm.user_id=auth.uid()))));
-- Writes use the backend service role AFTER session and membership validation.
