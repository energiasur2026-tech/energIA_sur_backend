import 'server-only';

import { BASE_CRON_MINUTES } from './collection-intervals';
import type { Meter } from './meters';
import { decodePhaseA } from './phase-a';
import { getLastReadingAt, saveReading, type ReadingSource } from './readings';
import { getDeviceDetails, getDeviceStatus } from './tuya';
import type { LiveReading } from './types';

/**
 * Tolerancia al comparar contra el intervalo configurado.
 *
 * El cron dispara cada `BASE_CRON_MINUTES`, así que sin margen un intervalo de
 * 6 h se cumpliría recién en el ciclo siguiente (6 h 5 min) y se iría
 * corriendo un poco más en cada vuelta. Con medio ciclo de tolerancia el
 * guardado cae en el primer disparo a partir del intervalo, sin deriva.
 */
const DUE_TOLERANCE_MS = (BASE_CRON_MINUTES / 2) * 60_000;

/** Si ya pasó el intervalo configurado desde la última lectura de ese origen. */
export async function isPersistDue(meter: Meter, source: ReadingSource): Promise<boolean> {
  const last = await getLastReadingAt(meter.deviceId, source);
  if (!last) return true;

  const elapsed = Date.now() - new Date(last).getTime();
  return elapsed >= meter.collectionIntervalMinutes * 60_000 - DUE_TOLERANCE_MS;
}

/**
 * Lee un medidor y, si corresponde según el intervalo configurado, persiste la
 * muestra.
 *
 * La lectura viva siempre se devuelve: el intervalo regula cuánto se **guarda**,
 * no cada cuánto se puede mirar. Por eso el dashboard sigue actualizando cada
 * 5 segundos aunque el guardado sea cada 6 horas.
 *
 * Cada origen (`dashboard` y `scheduled`) lleva su propio ritmo, así el
 * indicador de recolección automática sigue siendo veraz aunque alguien tenga
 * la pantalla abierta.
 */
export async function readAndStoreMeter(
  meter: Meter,
  source: ReadingSource
): Promise<LiveReading> {
  const [details, status] = await Promise.all([
    getDeviceDetails(meter.deviceId),
    getDeviceStatus(meter.deviceId),
  ]);

  const rawPhaseA = pick(status, 'phase_a');
  const rawEnergy = pick(status, 'total_forward_energy');

  // El medidor reporta la energía acumulada en centésimas de kWh.
  const parsedEnergy = rawEnergy === null ? null : Math.round(Number(rawEnergy)) / 100;
  const totalEnergyKwh = Number.isFinite(parsedEnergy as number) ? parsedEnergy : null;

  const decoded = decodePhaseA(rawPhaseA);
  const recordedAt = new Date();

  let persisted: LiveReading['persisted'] = 'skipped';
  if (await isPersistDue(meter, source)) {
    try {
      await saveReading({
        deviceId: meter.deviceId,
        recordedAt,
        voltage: decoded.voltage,
        current: decoded.current,
        powerW: decoded.powerW,
        totalEnergyKwh,
        rawPhaseA,
        source,
      });
      persisted = 'saved';
    } catch (error) {
      persisted = 'failed';
      console.error('[meter-reading] Persistencia fallida:', error);
    }
  }

  return {
    deviceId: meter.deviceId,
    online: details.online ?? false,
    recordedAt: recordedAt.toISOString(),
    voltage: decoded.voltage,
    current: decoded.current,
    powerW: decoded.powerW,
    totalEnergyKwh,
    persisted,
  };
}

function pick(status: { code: string; value: unknown }[], code: string): string | null {
  const item = status.find((dp) => dp.code === code);
  return item === undefined || item.value === null ? null : String(item.value);
}
