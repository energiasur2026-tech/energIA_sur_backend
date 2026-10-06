/**
 * Tipos de lectura del medidor. Dominio puro: sin `server-only`, sin imports
 * de infraestructura, sin dependencias de Next ni de Supabase.
 *
 * Viven acá y no en `lib/readings.ts` para que la lógica de negocio pueda
 * usarlos sin arrastrar consigo el cliente de base de datos.
 */

/** Una lectura tal como quedó persistida. `null` = el medidor no reportó ese valor. */
export type RawReading = {
  recordedAt: string;
  voltage: number | null;
  current: number | null;
  powerW: number | null;
};
