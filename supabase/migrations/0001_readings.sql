-- EnergIA Sur · Etapa 1 · Esquema de lecturas del medidor
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists public.readings (
  id                bigint generated always as identity primary key,
  device_id         text        not null,
  recorded_at       timestamptz not null,
  voltage           numeric(6,1),
  current           numeric(9,3),
  power_w           numeric(10,2),
  total_energy_kwh  numeric(12,2),
  raw_phase_a       text,
  created_at        timestamptz not null default now(),

  -- Las lecturas se agrupan en cubetas de 5 segundos: si el frontend consulta
  -- mas rapido que eso, la lectura se actualiza en lugar de duplicarse.
  constraint readings_device_instant_unique unique (device_id, recorded_at)
);

comment on table public.readings is
  'Serie temporal de lecturas del medidor. recorded_at viene redondeado a cubetas de 5 s.';

create index if not exists readings_device_time_idx
  on public.readings (device_id, recorded_at desc);

-- Sin autenticacion todavia (Etapa 4). RLS queda activo y sin politicas: nadie
-- puede leer desde el cliente, y el servidor entra con la service role key.
alter table public.readings enable row level security;

-- Serie agregada por cubeta de tiempo. Se resuelve en Postgres para no traer
-- miles de filas al servidor de Node solo para promediarlas.
create or replace function public.reading_series(
  p_device_id       text,
  p_from            timestamptz,
  p_to              timestamptz,
  p_bucket_seconds  int
)
returns table (
  bucket        timestamptz,
  samples       bigint,
  avg_voltage   numeric,
  min_voltage   numeric,
  max_voltage   numeric,
  avg_current   numeric,
  avg_power_w   numeric,
  max_power_w   numeric,
  last_energy   numeric
)
language sql
stable
as $$
  select
    to_timestamp(floor(extract(epoch from r.recorded_at) / p_bucket_seconds) * p_bucket_seconds) as bucket,
    count(*)                                        as samples,
    round(avg(r.voltage), 1)                        as avg_voltage,
    min(r.voltage)                                  as min_voltage,
    max(r.voltage)                                  as max_voltage,
    round(avg(r.current), 3)                        as avg_current,
    round(avg(r.power_w), 1)                        as avg_power_w,
    max(r.power_w)                                  as max_power_w,
    max(r.total_energy_kwh)                         as last_energy
  from public.readings r
  where r.device_id = p_device_id
    and r.recorded_at >= p_from
    and r.recorded_at <= p_to
  group by 1
  order by 1 asc;
$$;

-- Resumen del periodo, para las tarjetas de estadisticas del dashboard.
create or replace function public.reading_summary(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  samples       bigint,
  first_at      timestamptz,
  last_at       timestamptz,
  avg_voltage   numeric,
  min_voltage   numeric,
  max_voltage   numeric,
  avg_power_w   numeric,
  max_power_w   numeric,
  max_current   numeric
)
language sql
stable
as $$
  select
    count(*)                  as samples,
    min(r.recorded_at)        as first_at,
    max(r.recorded_at)        as last_at,
    round(avg(r.voltage), 1)  as avg_voltage,
    min(r.voltage)            as min_voltage,
    max(r.voltage)            as max_voltage,
    round(avg(r.power_w), 1)  as avg_power_w,
    max(r.power_w)            as max_power_w,
    max(r.current)            as max_current
  from public.readings r
  where r.device_id = p_device_id
    and r.recorded_at >= p_from
    and r.recorded_at <= p_to;
$$;
