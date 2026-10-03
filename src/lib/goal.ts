import { estimateEnergyCost, RESIDENCIAL_SIN_SUBSIDIO } from './tariffs';

/**
 * Objetivo mensual de consumo y avance contra él.
 *
 * La meta se guarda siempre en kWh porque es lo que el medidor mide. Si el
 * usuario la piensa en pesos, se convierte con el cuadro tarifario — pero lo
 * que se compara contra la realidad es energía, no dinero.
 */

export type GoalInputMode = 'kwh' | 'ars';

export type GoalStatus = 'no_goal' | 'no_data' | 'on_track' | 'at_risk' | 'over';

export type GoalProgress = {
  status: GoalStatus;
  goalKwh: number | null;
  goalCostArs: number | null;
  inputMode: GoalInputMode;
  /** Cuánto se puede consumir por día y por semana para llegar a la meta. */
  allowedPerDayKwh: number | null;
  allowedPerWeekKwh: number | null;
  daysInMonth: number;
  elapsedDays: number;
  /**
   * Días del mes efectivamente cubiertos por lecturas. Puede ser menor que
   * `elapsedDays` si el medidor se instaló o se cayó a mitad de mes.
   */
  measuredDays: number | null;
  /** `measuredDays / elapsedDays`. Por debajo de 1, parte del mes no se midió. */
  coverage: number | null;
  consumedKwh: number | null;
  /** Consumo diario medido: la base de toda la proyección. */
  dailyRateKwh: number | null;
  /**
   * Lo que debería haber consumido **durante los días medidos**, al ritmo del
   * objetivo. Se calcula sobre los días medidos y no sobre los transcurridos
   * para que la comparación contra lo consumido sea entre las mismas fechas.
   */
  expectedKwh: number | null;
  projectedMonthKwh: number | null;
  projectedCostArs: number | null;
  deviationKwh: number | null;
  deviationPct: number | null;
  /** Consumo diario que queda disponible para el resto del mes. */
  remainingPerDayKwh: number | null;
};

/** Más de un 15% por encima ya no es "ajustado", es desvío. */
const AT_RISK_MARGIN = 1.15;

/**
 * Convierte un presupuesto en pesos al consumo en kWh que lo produce.
 *
 * El costo por tramo es `cargoFijo + valorTramo × kWh`, y el tramo depende del
 * consumo, así que se prueba tramo por tramo y se acepta el que resulte
 * consistente con su propio rango. Devuelve `null` si el presupuesto no
 * alcanza a cubrir el cargo fijo más barato: ahí no hay consumo posible que
 * dé ese importe.
 */
export function budgetToKwh(budgetArs: number): number | null {
  for (const tier of RESIDENCIAL_SIN_SUBSIDIO) {
    const kwh = (budgetArs - tier.cargoFijo) / tier.valorTramo;
    if (kwh >= tier.minKwh && kwh <= tier.maxKwh) return round(kwh, 1);
  }
  return null;
}

/** Costo mensual estimado de una meta en kWh. */
export function kwhToBudget(goalKwh: number): number {
  return estimateEnergyCost(goalKwh, 30).total;
}

export function monthBoundsArgentina(now = new Date()): {
  start: Date;
  daysInMonth: number;
  elapsedDays: number;
} {
  // Argentina es UTC-3 todo el año, sin horario de verano.
  const local = new Date(now.getTime() - 3 * 3_600_000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1, 3, 0, 0, 0));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Mínimo de un día: al principio del mes, dividir por una fracción muy chica
  // dispararía proyecciones absurdas.
  const elapsedDays = Math.max((now.getTime() - start.getTime()) / 86_400_000, 1);

  return { start, daysInMonth, elapsedDays: round(elapsedDays, 3) };
}

export function buildGoalProgress(params: {
  goalKwh: number | null;
  inputMode: GoalInputMode;
  consumedKwh: number | null;
  /** Extremos de las lecturas del mes, para saber cuántos días se midieron. */
  measuredFrom?: string | null;
  measuredTo?: string | null;
  now?: Date;
}): GoalProgress {
  const { daysInMonth, elapsedDays } = monthBoundsArgentina(params.now);

  const base = {
    goalKwh: params.goalKwh,
    goalCostArs: params.goalKwh === null ? null : kwhToBudget(params.goalKwh),
    inputMode: params.inputMode,
    daysInMonth,
    elapsedDays,
  };

  const empty = {
    measuredDays: null,
    coverage: null,
    dailyRateKwh: null,
    expectedKwh: null,
    projectedMonthKwh: null,
    projectedCostArs: null,
    deviationKwh: null,
    deviationPct: null,
    remainingPerDayKwh: null,
  };

  if (params.goalKwh === null) {
    return {
      ...base,
      ...empty,
      status: 'no_goal',
      allowedPerDayKwh: null,
      allowedPerWeekKwh: null,
      consumedKwh: params.consumedKwh,
    };
  }

  const allowedPerDayKwh = round(params.goalKwh / daysInMonth, 3);
  const allowedPerWeekKwh = round(allowedPerDayKwh * 7, 2);

  const measuredDays = spanDays(params.measuredFrom, params.measuredTo);

  if (params.consumedKwh === null || measuredDays === null || measuredDays <= 0) {
    return {
      ...base,
      ...empty,
      status: 'no_data',
      allowedPerDayKwh,
      allowedPerWeekKwh,
      consumedKwh: params.consumedKwh,
    };
  }

  const consumedKwh = round(params.consumedKwh, 3);

  // El ritmo sale de los días REALMENTE medidos. Dividir por los días
  // transcurridos del mes subestimaría el consumo cuando el medidor arrancó a
  // mitad de mes: se repartiría el gasto de 6 días entre 18.
  const dailyRateKwh = round(consumedKwh / measuredDays, 3);
  const projectedMonthKwh = round(dailyRateKwh * daysInMonth, 2);

  // Lo esperado se mide sobre la misma ventana que lo consumido, así la
  // diferencia compara las mismas fechas y no penaliza los días sin datos.
  const expectedKwh = round(allowedPerDayKwh * measuredDays, 3);
  const deviationKwh = round(consumedKwh - expectedKwh, 3);

  const remainingDays = Math.max(daysInMonth - elapsedDays, 0);
  const remainingPerDayKwh =
    remainingDays > 0 ? round(Math.max(params.goalKwh - consumedKwh, 0) / remainingDays, 3) : 0;

  return {
    ...base,
    status:
      projectedMonthKwh <= params.goalKwh
        ? 'on_track'
        : projectedMonthKwh <= params.goalKwh * AT_RISK_MARGIN
          ? 'at_risk'
          : 'over',
    allowedPerDayKwh,
    allowedPerWeekKwh,
    consumedKwh,
    measuredDays,
    coverage: elapsedDays > 0 ? round(Math.min(measuredDays / elapsedDays, 1), 3) : null,
    dailyRateKwh,
    expectedKwh,
    projectedMonthKwh,
    projectedCostArs: kwhToBudget(projectedMonthKwh),
    deviationKwh,
    deviationPct: expectedKwh > 0 ? round((deviationKwh / expectedKwh) * 100, 1) : null,
    remainingPerDayKwh,
  };
}

function spanDays(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  // Un solo día de lecturas cuenta como un día: sin piso, un puñado de horas
  // daría un ritmo diario disparatado al extrapolarlo.
  return ms <= 0 ? null : round(Math.max(ms / 86_400_000, 1), 3);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
