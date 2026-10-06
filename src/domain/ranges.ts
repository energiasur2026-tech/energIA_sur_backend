/**
 * Rangos de consulta del historico y tamano de cubeta de cada uno.
 *
 * El tamano se elige para que cada rango rinda entre 60 y 170 puntos: suficiente
 * detalle para el grafico sin traer miles de filas desde la base.
 */
export const RANGES = {
  '1h': { seconds: 3600, bucket: 60, label: 'Última hora' },
  '6h': { seconds: 6 * 3600, bucket: 300, label: 'Últimas 6 horas' },
  '24h': { seconds: 24 * 3600, bucket: 900, label: 'Últimas 24 horas' },
  '7d': { seconds: 7 * 24 * 3600, bucket: 3600, label: 'Últimos 7 días' },
} as const;

export type RangeKey = keyof typeof RANGES;

export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

export const DEFAULT_RANGE: RangeKey = '24h';

export function resolveRange(value: string | null): RangeKey {
  return value !== null && value in RANGES ? (value as RangeKey) : DEFAULT_RANGE;
}
