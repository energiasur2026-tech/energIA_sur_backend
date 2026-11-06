-- EnergIA Sur · Rol del medidor dentro de la instalación
-- Ejecutar en el SQL Editor de Supabase, despues de 0014_meter_members.sql.
--
-- Un medidor se instala en el tablero central de toda la infraestructura, o
-- en un lugar puntual dentro de ella: el garage de una casa, terapia
-- intensiva de una clinica, la oficina de un taller.
--
-- Esa distincion no es cosmetica. El medidor de area esta electricamente
-- AGUAS ABAJO del central, asi que su energia ya pasa por los dos: sumar el
-- central con sus areas contaria dos veces lo mismo. El total de la
-- instalacion es el central; las areas dicen que PARTE de ese total
-- corresponde a cada lugar, y la diferencia entre uno y otras es el consumo
-- que todavia no esta desglosado.
--
-- Consecuencia para la facturacion: la tarifa, el costo estimado y el
-- objetivo mensual se calculan contra el medidor CENTRAL, que es lo que mide
-- la distribuidora. Las areas se analizan, no se facturan.

alter table public.meters
  add column if not exists role       text not null default 'central',
  add column if not exists area_label text,
  -- De que medidor central cuelga este medidor de area.
  -- `null` en un central; obligatorio en un area (ver restriccion abajo).
  add column if not exists parent_device_id text;

-- Solo dos roles posibles.
alter table public.meters
  drop constraint if exists meters_role_valid;
alter table public.meters
  add constraint meters_role_valid check (role in ('central', 'area'));

-- Un area cuelga de un central y tiene nombre; un central no cuelga de nadie
-- y no lleva etiqueta de area. Se valida en la base ademas de en el codigo:
-- la aplicacion no es la unica puerta de entrada a esta tabla.
alter table public.meters
  drop constraint if exists meters_role_coherent;
alter table public.meters
  add constraint meters_role_coherent check (
    (role = 'central' and parent_device_id is null and area_label is null)
    or
    (role = 'area' and parent_device_id is not null and area_label is not null)
  );

-- La jerarquia es electrica y real: el padre tiene que existir. Si se borra
-- el central, sus areas pierden sentido como desglose.
alter table public.meters
  drop constraint if exists meters_parent_fk;
alter table public.meters
  add constraint meters_parent_fk
    foreign key (parent_device_id) references public.meters (device_id)
    on delete cascade;

-- Un medidor no puede colgar de si mismo.
alter table public.meters
  drop constraint if exists meters_parent_not_self;
alter table public.meters
  add constraint meters_parent_not_self check (parent_device_id is distinct from device_id);

create index if not exists meters_parent_idx on public.meters (parent_device_id);

comment on column public.meters.role is
  'central = tablero principal de la instalacion; area = un lugar dentro de
   ella, electricamente aguas abajo del central. NO sumar central + areas.';

comment on column public.meters.area_label is
  'Donde esta instalado el medidor de area: "Garage", "Terapia intensiva",
   "Oficina". Solo para role = area.';

comment on column public.meters.parent_device_id is
  'El central del que cuelga este medidor de area. Solo para role = area.';
