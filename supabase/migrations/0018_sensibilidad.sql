-- EnergIA Sur · Grado de sensibilidad de las alertas de tensión
-- Ejecutar en el SQL Editor de Supabase, despues de 0017_contexto_instalacion.sql.
--
-- Hasta ahora los umbrales de tension se ajustaban uno por uno, por SQL. Son
-- dos numeros con decimales que nadie quiere elegir a mano, y pedirselos al
-- usuario garantiza que no los toque nunca.
--
-- En su lugar se ofrece un grado de sensibilidad, con rangos preestablecidos:
--
--   alta   210 - 230 V    avisa ante desviaciones chicas
--   media  205 - 235 V
--   baja   200 - 240 V    solo ante desviaciones grandes
--
-- A mayor sensibilidad, mas estrecho el rango aceptable, porque desviaciones
-- mas chicas ya deben ser avisadas.
--
-- `personalizada` deja los umbrales tal como esten en la fila: es para quien
-- ya los ajusto a mano y no quiere que un preset se los pise.
--
-- IMPORTANTE: esos rangos son umbrales internos de aviso de EnergIA Sur, no
-- limites normativos. El valor por defecto historico (202.4 - 237.6 V) es la
-- tolerancia de +-8% sobre 220 V que aplica ENRE a usuarios de baja tension,
-- y no coincide con ninguno de los tres grados. Por eso los medidores que ya
-- existen quedan en `personalizada`: cambiarles el criterio de alerta en una
-- migracion, sin que nadie lo pida, seria modificar en silencio cuando suena
-- una alarma.

alter table public.meters
  add column if not exists sensitivity text not null default 'personalizada';

alter table public.meters
  drop constraint if exists meters_sensitivity_valid;
alter table public.meters
  add constraint meters_sensitivity_valid
  check (sensitivity in ('alta', 'media', 'baja', 'personalizada'));

comment on column public.meters.sensitivity is
  'Grado de sensibilidad de las alertas de tension. Los grados alta, media y
   baja fijan low_voltage_v y high_voltage_v segun un rango preestablecido;
   `personalizada` significa que esos dos valores se eligieron a mano y
   ningun preset debe pisarlos. Son umbrales de aviso del producto, no
   limites normativos.';
