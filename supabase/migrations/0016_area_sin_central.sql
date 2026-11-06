-- EnergIA Sur · Un medidor de área puede existir sin un central
-- Ejecutar en el SQL Editor de Supabase, despues de 0015_meter_role.sql.
--
-- La 0015 exigia que todo medidor de area colgara de un central. Es demasiado
-- estricto: el producto no sirve solo para estimar la factura, sino tambien
-- para avisar de problemas electricos — tension fuera de rango,
-- sobrecorriente, cortes. Para eso alcanza con un solo medidor en el lugar
-- que importa: el garage, la sala de terapia intensiva, la oficina del
-- taller. No hace falta instrumentar el tablero principal.
--
-- Queda entonces:
--   central                      el tablero principal de la instalacion
--   area CON parent_device_id    un lugar, con su tablero tambien medido
--   area SIN parent_device_id    un lugar, sin medidor en el tablero
--
-- Lo que sigue siendo obligatorio es el nombre del area: si el medidor cubre
-- un lugar puntual, hay que poder decir cual, o el dato no significa nada.

alter table public.meters
  drop constraint if exists meters_role_coherent;

alter table public.meters
  add constraint meters_role_coherent check (
    (role = 'central' and parent_device_id is null and area_label is null)
    or
    (role = 'area' and area_label is not null)
  );

comment on column public.meters.parent_device_id is
  'El central del que cuelga este medidor de area, si ese central existe.
   `null` en un area autonoma: un medidor puesto solo en el lugar a vigilar,
   sin medicion del tablero principal.';
