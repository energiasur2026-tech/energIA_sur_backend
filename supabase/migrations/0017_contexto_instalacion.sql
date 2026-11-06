-- EnergIA Sur · El medidor deja de asumir que está en una vivienda
-- Ejecutar en el SQL Editor de Supabase, despues de 0016_area_sin_central.sql.
--
-- Tres cambios, todos en la misma direccion: el sistema nacio pensado para
-- una casa y ahora tiene que servir tambien a una clinica, un taller, un
-- comercio o una concesionaria, y a medidores puestos en un area puntual
-- dentro de cualquiera de esas.
--
-- 1. Se elimina el vinculo entre medidores.
--
--    La 0015 ataba cada medidor de area a un central para poder desglosar uno
--    contra el otro. No es lo que queremos: cada medidor es independiente y
--    ninguno resta del otro. Un medidor en el tablero cuantifica toda la
--    infraestructura; uno en un area cuantifica solo esa area. Que convivan
--    en el mismo lugar no los relaciona.
--
-- 2. Se registra si el medidor es monofasico o trifasico.
--
--    El equipo trifasico todavia no esta definido, asi que no se modela aun
--    como se guardan sus tres fases. Lo que si se puede hacer desde ahora es
--    que el alta lo pregunte y quede asentado, para no rehacer despues el
--    recorrido del usuario.
--
-- 3. El contexto deja de ser "la vivienda" y pasa a ser "la instalacion".
--
--    `dwelling_type` admitia solo casa o depto. Pasa a llamarse
--    `context_type` y admite tanto tipos de infraestructura (para un medidor
--    central) como tipos de area (para uno de area). Los pisos pasan a ser
--    opcionales: una oficina no tiene pisos.
--
--    Las tablas `home_rooms` y `home_appliances` no cambian de forma. Lo que
--    cambia es como se las nombra en pantalla: lo que en una casa son
--    "ambientes", en una clinica son "sectores" y en un taller o un comercio
--    son "sectores y oficinas". Esa traduccion vive en el codigo, no en la
--    base: es una etiqueta, no una estructura distinta.

-- --------------------------------------------------------------------------
-- 1. Fuera el vinculo entre medidores
-- --------------------------------------------------------------------------
alter table public.meters drop constraint if exists meters_role_coherent;
alter table public.meters drop constraint if exists meters_parent_fk;
alter table public.meters drop constraint if exists meters_parent_not_self;
drop index if exists meters_parent_idx;
alter table public.meters drop column if exists parent_device_id;

-- Un central cubre toda la instalacion y no lleva etiqueta de area; un area
-- tiene que decir donde esta instalada.
alter table public.meters
  add constraint meters_role_coherent check (
    (role = 'central' and area_label is null)
    or
    (role = 'area' and area_label is not null)
  );

-- --------------------------------------------------------------------------
-- 2. Monofasico o trifasico
-- --------------------------------------------------------------------------
alter table public.meters
  add column if not exists phases smallint not null default 1;

alter table public.meters
  drop constraint if exists meters_phases_valid;
alter table public.meters
  add constraint meters_phases_valid check (phases in (1, 3));

comment on column public.meters.phases is
  'Cuantas fases mide el equipo: 1 monofasico, 3 trifasico. Se registra desde
   el alta aunque el soporte de lecturas trifasicas todavia no este
   implementado, para no rehacer el recorrido del usuario despues.';

-- --------------------------------------------------------------------------
-- 3. El contexto ya no es solo una vivienda
-- --------------------------------------------------------------------------
alter table public.home_contexts
  rename column dwelling_type to context_type;

alter table public.home_contexts
  drop constraint if exists home_contexts_dwelling_type_valid;
alter table public.home_contexts
  drop constraint if exists home_contexts_context_type_valid;

alter table public.home_contexts
  add constraint home_contexts_context_type_valid
  check (context_type in (
    -- Infraestructuras completas, para un medidor central
    'casa', 'depto', 'clinica', 'taller', 'comercio', 'concesionaria',
    'oficina_edificio', 'deposito', 'otra_infraestructura',
    -- Areas dentro de una infraestructura, para un medidor de area
    'ambiente_unico', 'dos_ambientes', 'area_oficina', 'area_taller',
    'area_garage', 'area_deposito', 'sector_clinico', 'area_cocina',
    'otra_area'
  ));

-- Una oficina o un taller no tienen pisos. Solo casa y depto los usan.
alter table public.home_contexts
  alter column floors drop not null,
  alter column floors drop default;

alter table public.home_contexts
  drop constraint if exists home_contexts_floors_range;
alter table public.home_contexts
  add constraint home_contexts_floors_range
  check (floors is null or floors between 1 and 50);

comment on table public.home_contexts is
  'Contexto de la instalacion donde vive cada medidor: que tipo de
   infraestructura es (medidor central) o que tipo de area (medidor de area).
   Una fila por medidor; su ausencia significa que el usuario todavia no lo
   cargo.';

comment on column public.home_contexts.floors is
  'Solo para casa y depto. `null` en los demas contextos.';

comment on table public.home_rooms is
  'Subdivisiones del contexto. Se llaman distinto segun el tipo: ambientes en
   una vivienda, sectores en una clinica, sectores y oficinas en un taller o
   un comercio. La estructura es la misma; la etiqueta vive en el codigo.';
