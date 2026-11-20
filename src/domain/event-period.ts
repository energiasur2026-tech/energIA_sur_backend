import { argentinaMonth, calendarMonth } from './monthly-projection';

const DAY = 86400000;
export const EVENT_PERIODS = ['current', '7d', '30d', 'custom', 'all'] as const;
export type EventPeriod = typeof EVENT_PERIODS[number];

function localDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Fecha de evento inválida.');
  const utc = new Date(date);
  if (!Number.isFinite(+utc) || utc.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Fecha de evento inválida.');
  }
  return Date.parse(date + 'T00:00:00-03:00');
}

export function eventBounds(period: EventPeriod, now: Date, since?: string | null, until?: string | null) {
  let from: number | null = null;
  let to: number | null = +now;
  if (period === 'current') {
    from = +calendarMonth(argentinaMonth(now), now).start;
    if (since || until) {
      if (!since || !until) throw new RangeError('El rango de Monitor está incompleto.');
      from = Date.parse(since);
      to = Date.parse(until);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to > +now ||
          from !== +calendarMonth(argentinaMonth(new Date(to)), new Date(to)).start) {
        throw new RangeError('El rango de Monitor es inválido.');
      }
    }
  } else if (period === '7d' || period === '30d') {
    const today = new Date(+now - 3 * 3600000).toISOString().slice(0, 10);
    from = localDay(today) - (period === '7d' ? 6 : 29) * DAY;
  } else if (period === 'custom') {
    from = since ? localDay(since) : null;
    to = until ? localDay(until) + DAY : null;
  } else {
    to = null;
  }
  if (from !== null && to !== null && (from > to || (period === 'custom' && from === to))) {
    throw new RangeError('Revisá el orden de las fechas.');
  }
  return {
    from: from === null ? null : new Date(from).toISOString(),
    to: to === null ? null : new Date(to).toISOString(),
    lastDay: to === null ? null : new Date(to - (period === 'custom' ? 1 : 0)).toISOString(),
  };
}
