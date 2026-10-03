-- EnergIA Sur · Perfil de usuario
-- Ejecutar en el SQL Editor de Supabase, despues de 0007_forecast.sql.
--
-- Datos personales de la cuenta. Van en tabla propia y no en los metadatos de
-- auth.users porque son datos de la aplicacion, no de la autenticacion: asi
-- se consultan y validan como cualquier otra tabla.

create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  first_name  text,
  last_name   text,
  phone       text,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Datos personales del titular de la cuenta. El telefono se usara para las
   alertas por SMS/WhatsApp cuando se implementen; hoy las alertas van al
   email de la cuenta.';

-- RLS activo y sin politicas, igual que el resto: nadie lee esta tabla con la
-- clave publica. El servidor resuelve el usuario desde la cookie de sesion y
-- filtra por user_id con la service role key.
alter table public.profiles enable row level security;
