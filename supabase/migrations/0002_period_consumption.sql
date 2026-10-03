-- EnergIA Sur · Etapa 2 · Consumo real del período
-- Ejecutar en el SQL Editor de Supabase, despues de 0001_readings.sql.

-- El consumo del periodo se calcula como la diferencia entre la energia
-- acumulada del medidor en la primera y la ultima lectura del rango, no
-- integrando potencia: el medidor ya reporta un contador acumulado real, y
-- restar sus dos extremos es exacto en vez de aproximado.
--
-- Los subselects escalares siempre devuelven una fila (con null si no hay
-- lecturas), asi que la funcion nunca deja de responder por falta de datos.
create or replace function public.period_consumption(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  samples       bigint,
  first_at      timestamptz,
  last_at       timestamptz,
  first_energy  numeric,
  last_energy   numeric
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
      order by recorded_at asc limit 1) as first_energy,
    (select total_energy_kwh from public.readings
      where device_id = p_device_id and recorded_at between p_from and p_to
      order by recorded_at desc limit 1) as last_energy;
$$;
