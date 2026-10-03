/** Opciones de intervalo de guardado. Sin 'server-only': las usa el formulario de Ajustes. */

export const COLLECTION_INTERVALS = [
  { minutes: 5, label: 'Cada 5 minutos' },
  { minutes: 10, label: 'Cada 10 minutos' },
  { minutes: 15, label: 'Cada 15 minutos' },
  { minutes: 30, label: 'Cada 30 minutos' },
  { minutes: 60, label: 'Cada hora' },
  { minutes: 120, label: 'Cada 2 horas' },
  { minutes: 180, label: 'Cada 3 horas' },
  { minutes: 360, label: 'Cada 6 horas' },
  { minutes: 720, label: 'Cada 12 horas' },
  { minutes: 1440, label: 'Una vez por día' },
] as const;

export const DEFAULT_INTERVAL_MINUTES = 360;

/**
 * Cadencia del cron en Netlify. Es el piso: no se puede guardar más seguido
 * que esto, y cada opción se cumple salteando ciclos.
 * Debe coincidir con el `schedule` de netlify/functions/collect-reading.mts.
 */
export const BASE_CRON_MINUTES = 5;

export function isValidInterval(minutes: number): boolean {
  return COLLECTION_INTERVALS.some((option) => option.minutes === minutes);
}

export function intervalLabel(minutes: number): string {
  return (
    COLLECTION_INTERVALS.find((option) => option.minutes === minutes)?.label ??
    `Cada ${minutes} min`
  );
}

/**
 * Cuántas filas por día genera un intervalo, contando los dos orígenes que
 * escriben (recolector programado y sondeo del dashboard). Sirve para que la
 * pantalla de Ajustes muestre el costo real de cada opción en vez de dejarlo
 * a la intuición.
 */
export function rowsPerDay(minutes: number): number {
  return Math.round((24 * 60) / minutes) * 2;
}
