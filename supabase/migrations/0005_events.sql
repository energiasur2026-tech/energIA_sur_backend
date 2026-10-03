-- EnergIA Sur · Etapa 5 · Eventos y anomalias electricas
-- Ejecutar en el SQL Editor de Supabase, despues de 0004_meters.sql.

-- Umbrales por medidor. Los valores por defecto siguen la tolerancia de
-- +/-8% sobre 220 V nominales que aplica ENRE para usuarios de baja tension
-- (202.4 / 237.6 V). Son editables por medidor porque la instalacion real
-- puede justificar otros.
alter table public.meters
  add column if not exists low_voltage_v          numeric     not null default 202.4,
  add column if not exists high_voltage_v         numeric     not null default 237.6,
  add column if not exists overcurrent_a          numeric     not null default 15,
  add column if not exists gap_minutes            int         not null default 15,
  -- Marca de agua: hasta que instante ya se evaluaron las lecturas. Evita
  -- reprocesar historia en cada ciclo y hace la deteccion idempotente.
  add column if not exists anomalies_evaluated_at timestamptz;

comment on column public.meters.overcurrent_a is
  'Umbral de sobrecorriente. El valor por defecto (15 A) es provisorio: hay que
   confirmarlo contra la capacidad real de la instalacion antes de confiar en
   las alertas de este tipo.';

create table if not exists public.events (
  id                bigint generated always as identity primary key,
  device_id         text        not null,
  type              text        not null,
  severity          text        not null,
  started_at        timestamptz not null,
  -- NULL = el evento sigue activo.
  ended_at          timestamptz,
  -- Instante de la ultima lectura que violaba la condicion. Al cerrar el
  -- evento, `ended_at` toma este valor: asi la duracion refleja cuanto duro
  -- la anomalia y no cuando la detectamos.
  last_violation_at timestamptz not null,
  samples           int         not null default 1,
  min_voltage       numeric,
  max_voltage       numeric,
  max_current       numeric,
  max_power_w       numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint events_type_valid
    check (type in ('LOW_VOLTAGE', 'HIGH_VOLTAGE', 'OVERCURRENT', 'DATA_GAP')),
  constraint events_severity_valid
    check (severity in ('INFO', 'WARNING', 'CRITICAL'))
);

comment on table public.events is
  'Anomalias detectadas sobre la serie de lecturas. Un evento agrupa lecturas
   consecutivas que violan la misma condicion, en vez de una alerta por muestra.';

-- Como maximo un evento abierto por tipo y medidor: es lo que hace que la
-- deteccion sea reentrante sin duplicar eventos si un ciclo se repite.
create unique index if not exists events_open_unique
  on public.events (device_id, type)
  where ended_at is null;

create index if not exists events_device_started_idx
  on public.events (device_id, started_at desc);

alter table public.events enable row level security;
