/**
 * Caso de uso: leer el medidor y, si corresponde, guardar la muestra.
 *
 * La lectura viva siempre se devuelve: el intervalo regula cuánto se
 * **guarda**, no cada cuánto se puede mirar. Por eso el monitor sigue
 * actualizando cada 5 segundos aunque el guardado sea cada 6 horas.
 *
 * Cada origen (`dashboard` y `scheduled`) lleva su propio ritmo, así el
 * indicador de recolección automática sigue siendo veraz aunque alguien tenga
 * la pantalla abierta.
 */
import { interpretStatus, isPersistDueAt, type TuyaStatusItem } from './meter-sampling';
import type { DevicePort, ReadingsStorePort, ReadingSource } from './ports';

export type MeterForSampling = {
  deviceId: string;
  collectionIntervalMinutes: number;
};

export type SampleResult = {
  deviceId: string;
  online: boolean;
  recordedAt: string;
  voltage: number | null;
  current: number | null;
  powerW: number | null;
  totalEnergyKwh: number | null;
  /**
   * `saved`   — la muestra se guardó.
   * `skipped` — todavía no tocaba según el intervalo configurado (normal).
   * `failed`  — se obtuvo la lectura pero la base la rechazó (esto sí es un problema).
   */
  persisted: 'saved' | 'skipped' | 'failed';
};

export type SamplingDeps = {
  device: DevicePort;
  store: ReadingsStorePort;
  /** Inyectable para poder fijar el instante en los tests. */
  now?: () => Date;
};

export async function readAndStoreMeterWith(
  meter: MeterForSampling,
  source: ReadingSource,
  deps: SamplingDeps
): Promise<SampleResult> {
  const [details, status] = await Promise.all([
    deps.device.details(meter.deviceId),
    deps.device.status(meter.deviceId),
  ]);

  const valores = interpretStatus(status as TuyaStatusItem[]);
  const recordedAt = (deps.now ?? (() => new Date()))();

  let persisted: SampleResult['persisted'] = 'skipped';

  const debeGuardar = isPersistDueAt({
    lastReadingAt: await deps.store.lastReadingAt(meter.deviceId, source),
    intervalMinutes: meter.collectionIntervalMinutes,
    now: recordedAt,
  });

  if (debeGuardar) {
    try {
      await deps.store.save({
        deviceId: meter.deviceId,
        recordedAt,
        voltage: valores.voltage,
        current: valores.current,
        powerW: valores.powerW,
        totalEnergyKwh: valores.totalEnergyKwh,
        rawPhaseA: valores.rawPhaseA,
        source,
      });
      persisted = 'saved';
    } catch (error) {
      // Una falla al guardar no invalida la lectura: se informa y se sigue.
      persisted = 'failed';
      console.error('[meter-reading] Persistencia fallida:', error);
    }
  }

  return {
    deviceId: meter.deviceId,
    online: details.online ?? false,
    recordedAt: recordedAt.toISOString(),
    voltage: valores.voltage,
    current: valores.current,
    powerW: valores.powerW,
    totalEnergyKwh: valores.totalEnergyKwh,
    persisted,
  };
}
