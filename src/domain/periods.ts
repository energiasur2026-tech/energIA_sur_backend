const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Períodos de facturación disponibles para la vista de Consumo.
 * `days` se usa para prorratear el cargo fijo del tarifario, no para acotar
 * la consulta: el rango real de fechas lo calcula `periodRange`.
 */
export const PERIODS = {
  today: { label: 'Hoy', days: 1 },
  week: { label: 'Últimos 7 días', days: 7 },
  month: { label: 'Últimos 30 días', days: 30 },
} as const;

export type PeriodKey = keyof typeof PERIODS;

export const PERIOD_KEYS = Object.keys(PERIODS) as PeriodKey[];

export const DEFAULT_PERIOD: PeriodKey = 'today';

export function resolvePeriod(value: string | null): PeriodKey {
  return value !== null && value in PERIODS ? (value as PeriodKey) : DEFAULT_PERIOD;
}

/** Rango real [from, to) para el período, en huso horario de Argentina. */
export function periodRange(key: PeriodKey, now = new Date()): { from: Date; to: Date; days: number } {
  if (key === 'today') {
    const from = startOfDayArgentina(now);
    const elapsedDays = Math.max((now.getTime() - from.getTime()) / 86_400_000, 1 / 24);
    return { from, to: now, days: elapsedDays };
  }

  const { days } = PERIODS[key];
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from, to: now, days };
}

function startOfDayArgentina(date: Date): Date {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const [year, month, day] = dateStr.split('-').map(Number);
  // Argentina es UTC-3 todo el año (sin horario de verano).
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
}
