import 'server-only';

/**
 * Punto de entrada de la lectura del medidor.
 *
 * La lógica vive en `src/domain`: las decisiones puras en `meter-sampling.ts`
 * (cuándo toca guardar, cómo se interpreta la respuesta cruda) y la
 * orquestación en `read-meter.ts`. Acá solo se le enchufan los adaptadores de
 * Tuya y Supabase.
 */
import { isPersistDueAt } from '../domain/meter-sampling';
import { readAndStoreMeterWith } from '../domain/read-meter';
import { supabaseReadingsStore, tuyaDevice } from '../infrastructure/supabase-tuya-adapters';
import type { Meter } from './meters';
import type { ReadingSource } from './readings';
import type { LiveReading } from '../domain/types';

/** Si ya pasó el intervalo configurado desde la última lectura de ese origen. */
export async function isPersistDue(meter: Meter, source: ReadingSource): Promise<boolean> {
  return isPersistDueAt({
    lastReadingAt: await supabaseReadingsStore.lastReadingAt(meter.deviceId, source),
    intervalMinutes: meter.collectionIntervalMinutes,
    now: new Date(),
  });
}

/**
 * Lee un medidor y, si corresponde según el intervalo configurado, persiste la
 * muestra. La lectura viva siempre se devuelve.
 */
export async function readAndStoreMeter(
  meter: Meter,
  source: ReadingSource
): Promise<LiveReading> {
  return readAndStoreMeterWith(
    { deviceId: meter.deviceId, collectionIntervalMinutes: meter.collectionIntervalMinutes },
    source,
    { device: tuyaDevice, store: supabaseReadingsStore }
  );
}
