alter table public.events
  add column if not exists detection_threshold numeric;

comment on column public.events.detection_threshold is
  'Umbral al iniciar el episodio: V, A o minutos según el tipo. NULL en históricos sin umbral conocido.';

-- La restricción cubre las inserciones nuevas sin reescribir filas antiguas.
create unique index if not exists events_detection_episode_unique
  on public.events (device_id, type, started_at)
  where detection_threshold is not null;
