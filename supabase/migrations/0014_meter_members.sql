-- EnergIA Sur · Acceso compartido a un medidor
-- Ejecutar en el SQL Editor de Supabase, despues de 0013_home_context.sql.
--
-- Hasta ahora un medidor tenia un unico dueño (`meters.owner_id`) y esa era
-- la unica forma de verlo. Esta tabla agrega invitados: cuentas que pueden
-- ver el mismo medidor con su propio usuario y contraseña, sin ser las
-- dueñas. Pensado para dejar entrar a alguien que ayuda a probar la app sin
-- compartir la cuenta propia.
--
-- El dueño (`owner_id` en `meters`) sigue siendo el unico que existe hoy sin
-- fila aca — no hace falta duplicarlo como miembro de si mismo.

create table if not exists public.meter_members (
  device_id  text not null references public.meters(device_id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);

create index if not exists meter_members_user_idx on public.meter_members (user_id);

comment on table public.meter_members is
  'Cuentas invitadas a ver un medidor que no es el suyo. El dueño real vive en
   meters.owner_id y no necesita fila aca. Alta manual, igual que el resto del
   ciclo de vida de un medidor.';

alter table public.meter_members enable row level security;
