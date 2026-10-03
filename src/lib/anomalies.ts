import 'server-only';

import {
  closeEvent,
  getOpenEvents,
  insertEvent,
  openOrGetEvent,
  updateOpenEvent,
  type NewEvent,
} from './events';
import type { EventRecord, EventSeverity, EventType } from './event-types';
import { setAnomaliesEvaluatedAt, type Meter, type MeterThresholds } from './meters';
import { getReadingsAfter, type RawReading } from './readings';

/**
 * Banda muerta entre el umbral que abre un evento y el que lo cierra.
 *
 * Sin esto, una tensión oscilando alrededor del umbral (justo lo que hace una
 * red al límite) generaría decenas de eventos de un par de segundos. La
 * histéresis exige recuperarse con margen antes de dar la anomalía por
 * terminada, que es como se comportan los relés de protección reales.
 */
const VOLTAGE_HYSTERESIS_V = 2;
const CURRENT_HYSTERESIS_A = 0.5;

/** Cuánto hay que exceder el umbral para que el evento sea crítico y no solo una advertencia. */
const CRITICAL_VOLTAGE_MARGIN_V = 8;
const CRITICAL_CURRENT_FACTOR = 1.25;

/** Un hueco largo deja de ser una interrupción menor del monitoreo. */
const GAP_WARNING_MINUTES = 60;

type Rule = {
  type: Exclude<EventType, 'DATA_GAP'>;
  /** Valor evaluado de una lectura, o `null` si esa lectura no lo trae. */
  value: (reading: RawReading) => number | null;
  violates: (value: number, t: MeterThresholds) => boolean;
  recovered: (value: number, t: MeterThresholds) => boolean;
  severity: (event: Aggregates, t: MeterThresholds) => EventSeverity;
};

const RULES: Rule[] = [
  {
    type: 'LOW_VOLTAGE',
    value: (r) => r.voltage,
    violates: (v, t) => v < t.lowVoltageV,
    recovered: (v, t) => v >= t.lowVoltageV + VOLTAGE_HYSTERESIS_V,
    severity: (agg, t) =>
      agg.minVoltage !== null && agg.minVoltage < t.lowVoltageV - CRITICAL_VOLTAGE_MARGIN_V
        ? 'CRITICAL'
        : 'WARNING',
  },
  {
    type: 'HIGH_VOLTAGE',
    value: (r) => r.voltage,
    violates: (v, t) => v > t.highVoltageV,
    recovered: (v, t) => v <= t.highVoltageV - VOLTAGE_HYSTERESIS_V,
    severity: (agg, t) =>
      agg.maxVoltage !== null && agg.maxVoltage > t.highVoltageV + CRITICAL_VOLTAGE_MARGIN_V
        ? 'CRITICAL'
        : 'WARNING',
  },
  {
    type: 'OVERCURRENT',
    value: (r) => r.current,
    violates: (a, t) => a > t.overcurrentA,
    recovered: (a, t) => a <= t.overcurrentA - CURRENT_HYSTERESIS_A,
    severity: (agg, t) =>
      agg.maxCurrent !== null && agg.maxCurrent > t.overcurrentA * CRITICAL_CURRENT_FACTOR
        ? 'CRITICAL'
        : 'WARNING',
  },
];

type Aggregates = {
  samples: number;
  minVoltage: number | null;
  maxVoltage: number | null;
  maxCurrent: number | null;
  maxPowerW: number | null;
};

export type DetectionResult = {
  deviceId: string;
  readingsEvaluated: number;
  opened: number;
  closed: number;
  gaps: number;
};

/**
 * Evalúa las lecturas nuevas de un medidor y mantiene el registro de eventos.
 *
 * Avanza sobre la serie con una marca de agua, así que es reentrante: correrla
 * dos veces no duplica eventos ni reevalúa lo ya visto. Agrupa lecturas
 * consecutivas que violan la misma condición en un solo evento, en vez de
 * emitir una alerta por muestra.
 */
export async function detectAnomalies(meter: Meter): Promise<DetectionResult> {
  const readings = await getReadingsAfter(meter.deviceId, meter.anomaliesEvaluatedAt);

  const result: DetectionResult = {
    deviceId: meter.deviceId,
    readingsEvaluated: readings.length,
    opened: 0,
    closed: 0,
    gaps: 0,
  };

  if (readings.length === 0) return result;

  const open = await getOpenEvents(meter.deviceId);

  for (const rule of RULES) {
    const outcome = await applyRule(meter, rule, readings, open.get(rule.type) ?? null);
    result.opened += outcome.opened;
    result.closed += outcome.closed;
  }

  result.gaps = await detectGaps(meter, readings);

  await setAnomaliesEvaluatedAt(meter.deviceId, readings[readings.length - 1].recordedAt);

  return result;
}

type OpenState = {
  id: number;
  startedAt: string;
  lastViolationAt: string;
  aggregates: Aggregates;
};

async function applyRule(
  meter: Meter,
  rule: Rule,
  readings: RawReading[],
  existing: EventRecord | null
) {
  const t = meter.thresholds;
  let opened = 0;
  let closed = 0;

  let state: OpenState | null = existing
    ? {
        id: existing.id,
        startedAt: existing.startedAt,
        lastViolationAt: existing.lastViolationAt,
        aggregates: {
          samples: existing.samples,
          minVoltage: existing.minVoltage,
          maxVoltage: existing.maxVoltage,
          maxCurrent: existing.maxCurrent,
          maxPowerW: existing.maxPowerW,
        },
      }
    : null;

  for (const reading of readings) {
    const value = rule.value(reading);
    if (value === null) continue;

    // Una lectura anterior al inicio del evento abierto ya está contemplada
    // por él. Puede aparecer si se reprocesa historia (marca de agua
    // reiniciada): sin este filtro, el evento retrocedería su fin hasta antes
    // de su propio comienzo.
    if (state && reading.recordedAt < state.startedAt) continue;

    if (rule.violates(value, t)) {
      if (state) {
        state.aggregates = accumulate(state.aggregates, reading);
        // Monotónico: la última violación solo puede avanzar en el tiempo.
        state.lastViolationAt = maxInstant(state.lastViolationAt, reading.recordedAt);
      } else {
        const aggregates = accumulate(emptyAggregates(), reading);
        const created = await openOrGetEvent({
          deviceId: meter.deviceId,
          type: rule.type,
          severity: rule.severity(aggregates, t),
          startedAt: reading.recordedAt,
          lastViolationAt: reading.recordedAt,
          ...aggregates,
        } satisfies NewEvent);
        opened += 1;
        state = {
          id: created.id,
          startedAt: created.startedAt,
          lastViolationAt: created.lastViolationAt,
          aggregates,
        };
      }
      continue;
    }

    // Entre `violates` y `recovered` está la banda muerta: no abre ni cierra.
    if (state && rule.recovered(value, t)) {
      await updateOpenEvent(state.id, {
        lastViolationAt: state.lastViolationAt,
        severity: rule.severity(state.aggregates, t),
        ...state.aggregates,
      });
      // El fin nunca puede quedar antes del inicio, ni siquiera si los datos
      // llegaran desordenados.
      await closeEvent(state.id, maxInstant(state.startedAt, state.lastViolationAt));
      closed += 1;
      state = null;
    }
  }

  // El evento sigue activo al final de la tanda: se persisten sus agregados
  // para que la UI muestre valores al día aunque todavía no haya cerrado.
  if (state) {
    await updateOpenEvent(state.id, {
      lastViolationAt: state.lastViolationAt,
      severity: rule.severity(state.aggregates, t),
      ...state.aggregates,
    });
  }

  return { opened, closed };
}

/**
 * Huecos en la serie: intervalos sin ninguna lectura más largos que el umbral
 * del medidor. Nacen y mueren en la misma detección — su fin se conoce en el
 * mismo momento en que se descubre que hubo hueco.
 */
async function detectGaps(meter: Meter, readings: RawReading[]): Promise<number> {
  const gapMs = meter.thresholds.gapMinutes * 60_000;
  let previous = meter.anomaliesEvaluatedAt;
  let gaps = 0;

  for (const reading of readings) {
    if (previous) {
      const elapsed = new Date(reading.recordedAt).getTime() - new Date(previous).getTime();
      if (elapsed > gapMs) {
        await insertEvent({
          deviceId: meter.deviceId,
          type: 'DATA_GAP',
          severity: elapsed > GAP_WARNING_MINUTES * 60_000 ? 'WARNING' : 'INFO',
          startedAt: previous,
          endedAt: reading.recordedAt,
          lastViolationAt: reading.recordedAt,
          samples: 0,
          minVoltage: null,
          maxVoltage: null,
          maxCurrent: null,
          maxPowerW: null,
        });
        gaps += 1;
      }
    }
    previous = reading.recordedAt;
  }

  return gaps;
}

/** El más tardío de dos instantes ISO. */
function maxInstant(a: string, b: string): string {
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

function emptyAggregates(): Aggregates {
  return { samples: 0, minVoltage: null, maxVoltage: null, maxCurrent: null, maxPowerW: null };
}

function accumulate(agg: Aggregates, reading: RawReading): Aggregates {
  return {
    samples: agg.samples + 1,
    minVoltage: min(agg.minVoltage, reading.voltage),
    maxVoltage: max(agg.maxVoltage, reading.voltage),
    maxCurrent: max(agg.maxCurrent, reading.current),
    maxPowerW: max(agg.maxPowerW, reading.powerW),
  };
}

function min(a: number | null, b: number | null) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function max(a: number | null, b: number | null) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
