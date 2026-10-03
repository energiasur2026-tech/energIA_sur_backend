-- EnergIA Sur · Etapa 3 (complemento) · Origen de cada lectura
-- Ejecutar en el SQL Editor de Supabase, despues de 0002_period_consumption.sql.

-- Distingue si la lectura la disparo el sondeo del dashboard o el recolector
-- programado. Sirve para que la UI pueda mostrar, de forma verificable, que
-- la recoleccion automatica esta corriendo — no es solo un texto fijo.
alter table public.readings
  add column if not exists source text not null default 'dashboard';

create index if not exists readings_device_source_time_idx
  on public.readings (device_id, source, recorded_at desc);
