-- EnergIA Sur · Coherencia temporal de los eventos
-- Ejecutar en el SQL Editor de Supabase, despues de 0011_alerts.sql.
--
-- Un evento no puede terminar antes de empezar. La deteccion ya lo garantiza
-- en codigo, pero esta restriccion convierte cualquier regresion futura en un
-- error inmediato y visible, en vez de datos corruptos que se descubren
-- mirando la pantalla.
--
-- Si la migracion falla, hay filas invalidas de antes: revisarlas con
--   select id, started_at, ended_at from public.events
--   where ended_at is not null and ended_at < started_at;
-- y corregirlas o borrarlas antes de reintentar.

alter table public.events
  drop constraint if exists events_time_order;

alter table public.events
  add constraint events_time_order
  check (ended_at is null or ended_at >= started_at);
