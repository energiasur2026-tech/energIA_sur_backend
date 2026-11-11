/**
 * Con qué valores arranca un medidor recién vinculado. **Dominio puro.**
 *
 * ## Por qué existe este archivo
 *
 * Estos valores vivían únicamente como `default` de cada columna en las
 * migraciones, y `linkMeter` insertaba solo el identificador, el nombre y las
 * fases: todo lo demás lo decidía la base. Eso falló de la peor forma posible
 * el 2026-11-09. Al revincular un medidor que estaba configurado para guardar
 * cada 5 minutos, quedó con el default de la columna —6 horas— y el histórico
 * dejó de crecer. Nada dio error: el recolector corría y decidía
 * correctamente, ciclo tras ciclo, que todavía no tocaba guardar.
 *
 * Los umbrales se resetearon en el mismo movimiento y eso **no se vio**,
 * porque los defaults de la base coincidían con los del medidor real. Parecían
 * conservados sin estarlo.
 *
 * De ahí la regla: **el alta escribe todos los valores explícitamente**. Un
 * default de columna es invisible desde el código, no se puede testear y
 * puede alejarse de lo que el dominio cree sin que nada avise.
 *
 * Desvincular sigue borrando la configuración —la fila se va entera—, pero
 * ahora lo que se recupera al revincular es un estado conocido y declarado
 * acá, no lo que haya quedado en el esquema.
 */
import { BASE_CRON_MINUTES } from './collection-intervals';
import { SENSITIVITY_RANGES, type Sensitivity } from './sensitivity';

/**
 * Cada cuánto guarda un medidor nuevo.
 *
 * Dos restricciones lo acotan: no puede ser menor que la cadencia del cron,
 * que es el piso real, y tiene que ser **menor que `gapMinutes`**, porque si
 * no el detector de huecos marca como falla el muestreo normal. Con un
 * default de 6 horas y huecos de 15 minutos, un medidor recién vinculado se
 * veía caído todo el tiempo.
 *
 * Diez minutos deja margen contra los 15 del hueco y genera la mitad de filas
 * que el piso de 5. Quien quiera más resolución la elige en Ajustes.
 */
export const DEFAULT_COLLECTION_INTERVAL_MINUTES = 10;

/** Cuánto silencio se considera un hueco de datos. */
export const DEFAULT_GAP_MINUTES = 15;

export const DEFAULT_OVERCURRENT_A = 15;

/**
 * Sensibilidad inicial.
 *
 * `media` y no `personalizada`: un medidor que nadie tocó todavía no tiene
 * nada de personalizado, y decir que sí fue lo que convirtió ese grado en una
 * puerta de una sola dirección. Los umbrales se derivan del grado, así que no
 * pueden quedar incoherentes entre sí.
 */
export const DEFAULT_SENSITIVITY: Sensitivity = 'media';

export const DEFAULT_ALERTS_ENABLED = true;

/** Todo lo que se escribe al vincular, resuelto. */
export function initialMeterSettings() {
  const range = SENSITIVITY_RANGES[DEFAULT_SENSITIVITY as 'media'];

  return {
    collectionIntervalMinutes: DEFAULT_COLLECTION_INTERVAL_MINUTES,
    gapMinutes: DEFAULT_GAP_MINUTES,
    overcurrentA: DEFAULT_OVERCURRENT_A,
    lowVoltageV: range.lowVoltageV,
    highVoltageV: range.highVoltageV,
    sensitivity: DEFAULT_SENSITIVITY,
    alertsEnabled: DEFAULT_ALERTS_ENABLED,
    goalKwh: null as number | null,
  };
}

/**
 * Invariante del muestreo inicial, afirmada acá para que no se pueda romper
 * cambiando un número sin mirar el otro.
 */
export const SAMPLING_INVARIANTS = {
  notFasterThanCron: DEFAULT_COLLECTION_INTERVAL_MINUTES >= BASE_CRON_MINUTES,
  shorterThanGap: DEFAULT_COLLECTION_INTERVAL_MINUTES < DEFAULT_GAP_MINUTES,
} as const;
