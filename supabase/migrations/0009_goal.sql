-- EnergIA Sur · Objetivo mensual de consumo
-- Ejecutar en el SQL Editor de Supabase, despues de 0008_profiles.sql.
--
-- El usuario fija una meta mensual y la app le dice cuanto puede gastar por
-- dia y por semana para cumplirla. La meta se guarda SIEMPRE en kWh: es la
-- unidad que el medidor mide. Si el usuario la expresa en pesos, la app la
-- convierte con el cuadro tarifario y recuerda en `goal_input_mode` como la
-- eligio, para mostrarsela en la misma unidad en que la penso.

alter table public.meters
  add column if not exists goal_kwh        numeric,
  add column if not exists goal_input_mode text not null default 'kwh';

alter table public.meters
  drop constraint if exists meters_goal_input_mode_valid;

alter table public.meters
  add constraint meters_goal_input_mode_valid
  check (goal_input_mode in ('kwh', 'ars'));

alter table public.meters
  drop constraint if exists meters_goal_kwh_positive;

alter table public.meters
  add constraint meters_goal_kwh_positive
  check (goal_kwh is null or goal_kwh > 0);

comment on column public.meters.goal_kwh is
  'Meta de consumo mensual en kWh. NULL = el usuario todavia no fijo objetivo.';
comment on column public.meters.goal_input_mode is
  'En que unidad penso la meta el usuario: kwh o ars. Solo afecta como se
   muestra, no como se calcula.';
