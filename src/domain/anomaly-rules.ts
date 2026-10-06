/**
 * Motor de detección de anomalías. **Dominio puro: no toca la base de datos,
 * ni la red, ni el reloj.**
 *
 * Recibe las lecturas nuevas, los umbrales del medidor y los eventos que
 * quedaron abiertos de corridas anteriores, y devuelve un *plan*: qué eventos
 * hay que abrir, actualizar, cerrar y registrar como huecos. Quién persiste
 * ese plan es problema de otra capa.
 *
 * Separarlo así tiene una consecuencia práctica inmediata: estas reglas se
 * pueden probar con un array de lecturas, sin sustituir ningún módulo.
 */
import type { EventSeverity, EventType } from '../lib/event-types';
import type { MeterThresholds } from '../lib/threshold-types';
import type { RawReading } from './reading-types';

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

/** Valores observados a lo largo de un episodio. */
export type Aggregates = {
  samples: number;
  minVoltage: number | null;
  maxVoltage: number | null;
  maxCurrent: number | null;
  maxPowerW: number | null;
};

/** Lo mínimo que hace falta saber de un evento ya abierto para continuarlo. */
export type OpenEventSnapshot = {
  id: number;
  startedAt: string;
  lastViolationAt: string;
} & Aggregates;

/**
 * Un episodio de anomalía detectado en esta tanda.
 *
 * `existingId` indica que continúa un evento ya abierto en la base; si es
 * `null`, es un episodio nuevo. `endedAt` en `null` significa que la anomalía
 * seguía activa al terminar las lecturas evaluadas.
 */
export type Episode = {
  type: Exclude<EventType, 'DATA_GAP'>;
  existingId: number | null;
  startedAt: string;
  lastViolationAt: string;
  endedAt: string | null;
  severity: EventSeverity;
  aggregates: Aggregates;
  /**
   * Estado del episodio en el instante de su PRIMERA violación, para los
   * episodios nuevos (`existingId === null`).
   *
   * Existe porque el evento se registra apenas se detecta la primera lectura
   * en falta, no al final: si el proceso se corta a mitad de la tanda, el
   * evento ya quedó asentado con lo que se sabía hasta ahí, en vez de
   * perderse. Los agregados definitivos se escriben después.
   */
  opening: { severity: EventSeverity; aggregates: Aggregates } | null;
};

/** Un intervalo sin lecturas. Nace y muere en la misma detección. */
export type Gap = {
  startedAt: string;
  endedAt: string;
  severity: EventSeverity;
};

export type AnomalyPlan = {
  episodes: Episode[];
  gaps: Gap[];
  /** Hasta dónde quedaron evaluadas las lecturas. `null` = no había ninguna. */
  watermark: string | null;
  readingsEvaluated: number;
};

type Rule = {
  type: Exclude<EventType, 'DATA_GAP'>;
  /** Valor evaluado de una lectura, o `null` si esa lectura no lo trae. */
  value: (reading: RawReading) => number | null;
  violates: (value: number, t: MeterThresholds) => boolean;
  recovered: (value: number, t: MeterThresholds) => boolean;
  severity: (agg: Aggregates, t: MeterThresholds) => EventSeverity;
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

/**
 * Calcula qué hay que hacer con los eventos de un medidor, a partir de sus
 * lecturas nuevas. Función pura: mismas entradas, mismas salidas, siempre.
 */
export function planAnomalies(input: {
  readings: RawReading[];
  thresholds: MeterThresholds;
  openEvents: Map<EventType, OpenEventSnapshot>;
  /** Último instante ya evaluado. `null` = el medidor no tiene historia previa. */
  evaluatedAt: string | null;
}): AnomalyPlan {
  const { readings, thresholds, openEvents, evaluatedAt } = input;

  if (readings.length === 0) {
    return { episodes: [], gaps: [], watermark: null, readingsEvaluated: 0 };
  }

  const episodes = RULES.flatMap((rule) =>
    planRule(rule, readings, thresholds, openEvents.get(rule.type) ?? null)
  );

  return {
    episodes,
    gaps: planGaps(readings, thresholds, evaluatedAt),
    watermark: readings[readings.length - 1].recordedAt,
    readingsEvaluated: readings.length,
  };
}

/** Estado de un episodio mientras se recorre la serie. */
type Episodio = {
  existingId: number | null;
  startedAt: string;
  lastViolationAt: string;
  aggregates: Aggregates;
  opening: { severity: EventSeverity; aggregates: Aggregates } | null;
};

function planRule(
  rule: Rule,
  readings: RawReading[],
  t: MeterThresholds,
  existing: OpenEventSnapshot | null
): Episode[] {
  const cerrados: Episode[] = [];

  let actual: Episodio | null = existing
    ? {
        existingId: existing.id,
        startedAt: existing.startedAt,
        lastViolationAt: existing.lastViolationAt,
        aggregates: {
          samples: existing.samples,
          minVoltage: existing.minVoltage,
          maxVoltage: existing.maxVoltage,
          maxCurrent: existing.maxCurrent,
          maxPowerW: existing.maxPowerW,
        },
        opening: null,
      }
    : null;

  for (const reading of readings) {
    const value = rule.value(reading);
    if (value === null) continue;

    // Una lectura anterior al inicio del episodio ya está contemplada por él.
    // Puede aparecer si se reprocesa historia (marca de agua reiniciada): sin
    // este filtro, el evento retrocedería su fin hasta antes de su comienzo.
    if (actual && reading.recordedAt < actual.startedAt) continue;

    if (rule.violates(value, t)) {
      if (actual) {
        actual.aggregates = accumulate(actual.aggregates, reading);
        // Monotónico: la última violación solo puede avanzar en el tiempo.
        actual.lastViolationAt = maxInstant(actual.lastViolationAt, reading.recordedAt);
      } else {
        const inicial = accumulate(emptyAggregates(), reading);
        actual = {
          existingId: null,
          startedAt: reading.recordedAt,
          lastViolationAt: reading.recordedAt,
          aggregates: inicial,
          opening: { severity: rule.severity(inicial, t), aggregates: inicial },
        };
      }
      continue;
    }

    // Entre `violates` y `recovered` está la banda muerta: no abre ni cierra.
    if (actual && rule.recovered(value, t)) {
      cerrados.push(terminar(rule, actual, t, maxInstant(actual.startedAt, actual.lastViolationAt)));
      actual = null;
    }
  }

  // El episodio seguía activo al final de la tanda.
  if (actual) cerrados.push(terminar(rule, actual, t, null));

  return cerrados;
}

function terminar(
  rule: Rule,
  e: Episodio,
  t: MeterThresholds,
  endedAt: string | null
): Episode {
  return {
    type: rule.type,
    existingId: e.existingId,
    startedAt: e.startedAt,
    lastViolationAt: e.lastViolationAt,
    endedAt,
    severity: rule.severity(e.aggregates, t),
    aggregates: e.aggregates,
    opening: e.opening,
  };
}

/**
 * Huecos en la serie: intervalos sin ninguna lectura más largos que el umbral
 * del medidor.
 */
function planGaps(
  readings: RawReading[],
  t: MeterThresholds,
  evaluatedAt: string | null
): Gap[] {
  const gapMs = t.gapMinutes * 60_000;
  const gaps: Gap[] = [];
  let previous = evaluatedAt;

  for (const reading of readings) {
    if (previous) {
      const elapsed = new Date(reading.recordedAt).getTime() - new Date(previous).getTime();
      if (elapsed > gapMs) {
        gaps.push({
          startedAt: previous,
          endedAt: reading.recordedAt,
          severity: elapsed > GAP_WARNING_MINUTES * 60_000 ? 'WARNING' : 'INFO',
        });
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

export function emptyAggregates(): Aggregates {
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
