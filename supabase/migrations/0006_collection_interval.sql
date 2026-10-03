-- EnergIA Sur · Intervalo de guardado configurable
-- Ejecutar en el SQL Editor de Supabase, despues de 0005_events.sql.
--
-- Motivacion: el plan gratuito de Supabase tiene limites de almacenamiento y
-- de trafico. Guardar una lectura cada 5 segundos mientras alguien mira el
-- dashboard genera ~17.000 filas por dia; con el intervalo configurable, el
-- usuario decide cuanto detalle historico quiere pagar en recursos.

alter table public.meters
  add column if not exists collection_interval_minutes int not null default 360;

comment on column public.meters.collection_interval_minutes is
  'Cada cuantos minutos se guarda una lectura, por origen (programado y
   dashboard llevan su propio ritmo). No afecta la frecuencia con la que la
   pantalla muestra valores en vivo, solo cuanto se persiste.';

-- El conjunto se valida en la base ademas de en la UI: la lista de opciones
-- es parte del contrato de datos, no solo una decoracion del formulario.
alter table public.meters
  drop constraint if exists meters_collection_interval_valid;

alter table public.meters
  add constraint meters_collection_interval_valid
  check (collection_interval_minutes in (5, 10, 15, 30, 60, 120, 180, 360, 720, 1440));
