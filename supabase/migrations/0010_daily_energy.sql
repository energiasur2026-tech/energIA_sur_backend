-- EnergIA Sur · Energia acumulada por dia
-- Ejecutar en el SQL Editor de Supabase, despues de 0009_goal.sql.
--
-- Devuelve la ultima lectura del contador de cada dia (en hora de Argentina).
-- Restando la primera del mes se obtiene la curva de consumo acumulado, que
-- es lo que la vista de objetivo compara contra el ritmo ideal.
--
-- DISTINCT ON es la forma directa en Postgres de quedarse con una fila por
-- grupo: ordena por dia y fecha descendente, y toma la primera de cada dia.
create or replace function public.daily_energy(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  day         date,
  last_energy numeric,
  samples     bigint
)
language sql
stable
as $$
  with per_day as (
    select distinct on (dia)
      (r.recorded_at at time zone 'America/Argentina/Buenos_Aires')::date as dia,
      r.total_energy_kwh,
      r.recorded_at
    from public.readings r
    where r.device_id = p_device_id
      and r.recorded_at between p_from and p_to
      and r.total_energy_kwh is not null
    order by dia, r.recorded_at desc
  )
  select
    p.dia as day,
    p.total_energy_kwh as last_energy,
    (select count(*) from public.readings r2
      where r2.device_id = p_device_id
        and (r2.recorded_at at time zone 'America/Argentina/Buenos_Aires')::date = p.dia
        and r2.recorded_at between p_from and p_to) as samples
  from per_day p
  order by p.dia asc;
$$;
