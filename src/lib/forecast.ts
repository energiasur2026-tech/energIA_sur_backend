import { estimateEnergyCost, type EnergyCost } from './tariffs';

/**
 * Proyección de consumo. Sin 'server-only': el cálculo es puro y los tipos
 * los usa también la vista.
 *
 * Criterio central: el medidor expone un contador de energía **acumulado**,
 * así que la diferencia entre la primera y la última lectura captura toda la
 * energía consumida en el medio, aunque no hayamos muestreado en el medio.
 * La confianza depende entonces de cuántos días abarca la serie, no de cada
 * cuánto se muestrea.
 */

/** Días que proyecta la estimación. Coincide con el mes que prorratea el tarifario. */
export const PROJECTION_DAYS = 30;

export type ForecastConfidence = 'low' | 'medium' | 'high';

export type ForecastBasis = {
  samples: number;
  firstAt: string | null;
  lastAt: string | null;
  firstEnergy: number | null;
  lastEnergy: number | null;
  daysWithData: number;
};

export type ForecastUnavailableReason =
  | 'no_data'
  | 'insufficient_span'
  | 'counter_decreased';

export type Forecast =
  | {
      available: false;
      reason: ForecastUnavailableReason;
      spanDays: number;
      daysWithData: number;
      samples: number;
      firstAt: string | null;
      lastAt: string | null;
    }
  | {
      available: true;
      spanDays: number;
      daysWithData: number;
      samples: number;
      firstAt: string | null;
      lastAt: string | null;
      measuredKwh: number;
      dailyAverageKwh: number;
      projectionDays: number;
      projectedKwh: number;
      cost: EnergyCost;
      confidence: ForecastConfidence;
    };

/**
 * Span mínimo para proyectar. Por debajo de un día entero la muestra no
 * cubre siquiera un ciclo diario completo (día y noche), y extrapolarla a un
 * mes multiplicaría por 30 el sesgo de la franja horaria observada.
 */
const MIN_SPAN_DAYS = 1;

/** Un mes de datos ya cubre variación semanal; dos semanas es un punto intermedio razonable. */
const HIGH_CONFIDENCE_DAYS = 14;
const MEDIUM_CONFIDENCE_DAYS = 3;

export function buildForecast(basis: ForecastBasis): Forecast {
  const spanDays = computeSpanDays(basis.firstAt, basis.lastAt);

  const common = {
    spanDays,
    daysWithData: basis.daysWithData,
    samples: basis.samples,
    firstAt: basis.firstAt,
    lastAt: basis.lastAt,
  };

  if (
    basis.samples < 2 ||
    basis.firstEnergy === null ||
    basis.lastEnergy === null ||
    spanDays <= 0
  ) {
    return { available: false, reason: 'no_data', ...common };
  }

  // El contador solo puede crecer. Si retrocedió, el medidor se reinició o se
  // reemplazó, y la diferencia dejó de representar consumo.
  if (basis.lastEnergy < basis.firstEnergy) {
    return { available: false, reason: 'counter_decreased', ...common };
  }

  if (spanDays < MIN_SPAN_DAYS) {
    return { available: false, reason: 'insufficient_span', ...common };
  }

  const measuredKwh = round(basis.lastEnergy - basis.firstEnergy, 3);
  const dailyAverageKwh = round(measuredKwh / spanDays, 3);
  const projectedKwh = round(dailyAverageKwh * PROJECTION_DAYS, 2);

  return {
    available: true,
    ...common,
    measuredKwh,
    dailyAverageKwh,
    projectionDays: PROJECTION_DAYS,
    projectedKwh,
    cost: estimateEnergyCost(projectedKwh, PROJECTION_DAYS),
    confidence: confidenceFor(spanDays),
  };
}

function confidenceFor(spanDays: number): ForecastConfidence {
  if (spanDays >= HIGH_CONFIDENCE_DAYS) return 'high';
  if (spanDays >= MEDIUM_CONFIDENCE_DAYS) return 'medium';
  return 'low';
}

function computeSpanDays(firstAt: string | null, lastAt: string | null): number {
  if (!firstAt || !lastAt) return 0;
  const ms = new Date(lastAt).getTime() - new Date(firstAt).getTime();
  return round(ms / 86_400_000, 3);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
