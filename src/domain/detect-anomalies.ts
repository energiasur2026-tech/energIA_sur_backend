/**
 * Caso de uso: evaluar las lecturas nuevas de un medidor y mantener al día su
 * registro de eventos.
 *
 * No sabe nada de Supabase. Pide lo que necesita a los puertos, decide qué
 * hacer con `planAnomalies` (que es pura), y aplica el resultado. Toda la
 * lógica de *qué* es una anomalía vive en `anomaly-rules.ts`; acá solo está
 * el *orden* en que se persisten las cosas.
 */
import { planAnomalies, type Episode } from './anomaly-rules';
import type { AnomalyDeps, EventsPort } from './ports';
import type { MeterThresholds } from '../lib/threshold-types';

/** Lo que el caso de uso necesita saber del medidor. */
export type MeterForDetection = {
  deviceId: string;
  thresholds: MeterThresholds;
  anomaliesEvaluatedAt: string | null;
};

export type DetectionResult = {
  deviceId: string;
  readingsEvaluated: number;
  opened: number;
  closed: number;
  gaps: number;
};

export async function detectAnomaliesWith(
  meter: MeterForDetection,
  deps: AnomalyDeps
): Promise<DetectionResult> {
  const readings = await deps.readings.after(meter.deviceId, meter.anomaliesEvaluatedAt);

  const result: DetectionResult = {
    deviceId: meter.deviceId,
    readingsEvaluated: readings.length,
    opened: 0,
    closed: 0,
    gaps: 0,
  };

  if (readings.length === 0) return result;

  const plan = planAnomalies({
    readings,
    thresholds: meter.thresholds,
    openEvents: await deps.events.openByType(meter.deviceId),
    evaluatedAt: meter.anomaliesEvaluatedAt,
  });

  for (const episodio of plan.episodes) {
    const { abierto } = await aplicarEpisodio(meter.deviceId, episodio, deps.events);
    if (abierto) result.opened += 1;
    if (episodio.endedAt) result.closed += 1;
  }

  for (const hueco of plan.gaps) {
    await deps.events.insertClosed({
      deviceId: meter.deviceId,
      type: 'DATA_GAP',
      severity: hueco.severity,
      startedAt: hueco.startedAt,
      endedAt: hueco.endedAt,
      lastViolationAt: hueco.endedAt,
      samples: 0,
      minVoltage: null,
      maxVoltage: null,
      maxCurrent: null,
      maxPowerW: null,
    });
    result.gaps += 1;
  }

  if (plan.watermark) {
    await deps.meters.markEvaluated(meter.deviceId, plan.watermark);
  }

  return result;
}

/**
 * Persiste un episodio.
 *
 * El orden importa: un episodio nuevo se registra apenas se detecta, con los
 * valores de su primera lectura en falta, y recién después se le escriben los
 * agregados definitivos. Si el proceso se corta en el medio, el evento quedó
 * asentado igual.
 */
async function aplicarEpisodio(
  deviceId: string,
  episodio: Episode,
  events: EventsPort
): Promise<{ abierto: boolean }> {
  let id = episodio.existingId;
  let abierto = false;

  if (id === null) {
    const inicial = episodio.opening ?? {
      severity: episodio.severity,
      aggregates: episodio.aggregates,
    };
    const creado = await events.openOrGet({
      deviceId,
      type: episodio.type,
      severity: inicial.severity,
      startedAt: episodio.startedAt,
      lastViolationAt: episodio.startedAt,
      ...inicial.aggregates,
    });
    id = creado.id;
    abierto = true;
  }

  await events.update(id, {
    lastViolationAt: episodio.lastViolationAt,
    severity: episodio.severity,
    ...episodio.aggregates,
  });

  if (episodio.endedAt) {
    await events.close(id, episodio.endedAt);
  }

  return { abierto };
}
