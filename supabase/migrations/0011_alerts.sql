-- EnergIA Sur · Alertas por email
-- Ejecutar en el SQL Editor de Supabase, despues de 0010_daily_energy.sql.

-- Preferencia por medidor: si su dueño quiere recibir avisos por email.
alter table public.meters
  add column if not exists alerts_enabled boolean not null default true;

comment on column public.meters.alerts_enabled is
  'Si el dueño recibe un email cuando se abre una anomalia en este medidor.';

-- Marca de que evento ya se notifico. Vive en la fila del evento para que
-- "detectar" y "avisar" no puedan desincronizarse: si el envio falla, la
-- columna queda en NULL y el proximo ciclo reintenta.
alter table public.events
  add column if not exists notified_at timestamptz;

create index if not exists events_pending_notification_idx
  on public.events (device_id)
  where notified_at is null;
