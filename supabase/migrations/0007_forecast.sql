-- EnergIA Sur · Etapa 7 · Base de datos para proyeccion de consumo
-- Ejecutar en el SQL Editor de Supabase, despues de 0006_collection_interval.sql.

-- Insumos para proyectar consumo.
--
-- El medidor expone un contador de energia ACUMULADO, no un caudal: la
-- diferencia entre la primera y la ultima lectura captura toda la energia
-- consumida en el medio, incluso durante los intervalos que no muestreamos.
-- Por eso la calidad de una proyeccion depende de cuantos DIAS abarca la
-- serie, no de cada cuanto se muestrea — y guardar cada 5 minutos en vez de
-- cada 5 segundos no degrada la proyeccion.
--
-- `days_with_data` cuenta dias calendario distintos (en huso de Argentina)
-- con al menos una lectura: sirve para exigir que la muestra cubra dias
-- reales y no un puñado de horas de un solo dia.
create or replace function public.forecast_basis(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  samples         bigint,
  first_at        timestamptz,
  last_at         timestamptz,
  first_energy    numeric,
  last_energy     numeric,
  days_with_data  bigint
)
language sql
stable
as $$
  select
    (select count(*) from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to) as samples,
    (select min(recorded_at) from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to) as first_at,
    (select max(recorded_at) from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to) as last_at,
    (select total_energy_kwh from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to
        and total_energy_kwh is not null
      order by recorded_at asc limit 1) as first_energy,
    (select total_energy_kwh from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to
        and total_energy_kwh is not null
      order by recorded_at desc limit 1) as last_energy,
    (select count(distinct (recorded_at at time zone 'America/Argentina/Buenos_Aires')::date)
      from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to) as days_with_data;
$$;

-- Potencia media por hora del dia, en hora local. Muestra en que franjas se
-- concentra el consumo. Solo es informativo con varios dias encima; el
-- gating de cuantos dias hacen falta vive en la aplicacion.
create or replace function public.hourly_profile(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  hour        int,
  samples     bigint,
  avg_power_w numeric
)
language sql
stable
as $$
  select
    extract(hour from r.recorded_at at time zone 'America/Argentina/Buenos_Aires')::int as hour,
    count(*)                        as samples,
    round(avg(r.power_w), 1)        as avg_power_w
  from public.readings r
  where r.device_id = p_device_id
    and r.recorded_at between p_from and p_to
    and r.power_w is not null
  group by 1
  order by 1;
$$;
