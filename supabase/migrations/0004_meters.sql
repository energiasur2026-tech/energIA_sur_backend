-- EnergIA Sur · Etapa 4 · Propiedad de medidores por usuario
-- Ejecutar en el SQL Editor de Supabase, despues de 0003_reading_source.sql.
--
-- Requiere que la autenticacion por email/contrasena este habilitada en
-- Authentication > Providers > Email del proyecto (viene habilitada por
-- defecto en un proyecto nuevo).

create table if not exists public.meters (
  device_id  text primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'Medidor',
  created_at timestamptz not null default now()
);

create index if not exists meters_owner_idx on public.meters (owner_id);

comment on table public.meters is
  'Que medidor le pertenece a que usuario. Sin autoservicio de alta todavia:
   vincular un medidor a una cuenta es una operacion manual (ver README).';

-- RLS activo y sin policies: ninguna consulta con la clave publica (anon) o
-- de un usuario autenticado puede leer esta tabla directamente. El servidor
-- resuelve el owner con la service role key y filtra por owner_id en
-- codigo de aplicacion — mismo patron que ya usan `readings` y las funciones
-- de agregacion.
alter table public.meters enable row level security;
