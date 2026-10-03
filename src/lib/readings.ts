import 'server-only';

import { supabase } from './supabase';
import type { ForecastBasis } from './forecast';
import type { PeriodSummary, SeriesPoint } from './types';

/** Las lecturas se agrupan en cubetas de 5 s para no duplicar filas por polling. */
export const BUCKET_SECONDS = 5;

export type ReadingSource = 'dashboard' | 'scheduled';

export type ReadingInput = {
  deviceId: string;
  recordedAt: Date;
  voltage: number | null;
  current: number | null;
  powerW: number | null;
  totalEnergyKwh: number | null;
  rawPhaseA: string | null;
  source: ReadingSource;
};

/** Redondea el instante hacia abajo al inicio de su cubeta. */
export function toBucket(date: Date, seconds = BUCKET_SECONDS): Date {
  const ms = seconds * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

export async function saveReading(input: ReadingInput) {
  const { error } = await supabase()
    .from('readings')
    .upsert(
      {
        device_id: input.deviceId,
        recorded_at: toBucket(input.recordedAt).toISOString(),
        voltage: input.voltage,
        current: input.current,
        power_w: input.powerW,
        total_energy_kwh: input.totalEnergyKwh,
        raw_phase_a: input.rawPhaseA,
        source: input.source,
      },
      { onConflict: 'device_id,recorded_at' }
    );

  if (error) throw new Error(`No se pudo guardar la lectura: ${error.message}`);
}

/** Serie agregada por cubeta, calculada en Postgres. */
export async function getSeries(
  deviceId: string,
  from: Date,
  to: Date,
  bucketSeconds: number
): Promise<SeriesPoint[]> {
  const { data, error } = await supabase().rpc('reading_series', {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_bucket_seconds: bucketSeconds,
  });

  if (error) throw new Error(`No se pudo leer el historico: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    bucket: String(row.bucket),
    samples: Number(row.samples),
    avgVoltage: num(row.avg_voltage),
    minVoltage: num(row.min_voltage),
    maxVoltage: num(row.max_voltage),
    avgCurrent: num(row.avg_current),
    avgPowerW: num(row.avg_power_w),
    maxPowerW: num(row.max_power_w),
    lastEnergy: num(row.last_energy),
  }));
}

export async function getSummary(deviceId: string, from: Date, to: Date): Promise<PeriodSummary> {
  const { data, error } = await supabase().rpc('reading_summary', {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw new Error(`No se pudo leer el resumen: ${error.message}`);

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;

  return {
    samples: row ? Number(row.samples) : 0,
    firstAt: row?.first_at ? String(row.first_at) : null,
    lastAt: row?.last_at ? String(row.last_at) : null,
    avgVoltage: num(row?.avg_voltage),
    minVoltage: num(row?.min_voltage),
    maxVoltage: num(row?.max_voltage),
    avgPowerW: num(row?.avg_power_w),
    maxPowerW: num(row?.max_power_w),
    maxCurrent: num(row?.max_current),
  };
}

export type PeriodConsumption = {
  samples: number;
  firstAt: string | null;
  lastAt: string | null;
  firstEnergy: number | null;
  lastEnergy: number | null;
};

/**
 * Energía acumulada al inicio y al final del período, tal como la reporta el
 * medidor. El consumo es su diferencia — más exacto que integrar potencia,
 * porque el contador acumulado del medidor ya es la fuente de verdad.
 */
export async function getPeriodConsumption(
  deviceId: string,
  from: Date,
  to: Date
): Promise<PeriodConsumption> {
  const { data, error } = await supabase().rpc('period_consumption', {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw new Error(`No se pudo calcular el consumo: ${error.message}`);

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;

  return {
    samples: row ? Number(row.samples) : 0,
    firstAt: row?.first_at ? String(row.first_at) : null,
    lastAt: row?.last_at ? String(row.last_at) : null,
    firstEnergy: num(row?.first_energy),
    lastEnergy: num(row?.last_energy),
  };
}

export type RawReading = {
  recordedAt: string;
  voltage: number | null;
  current: number | null;
  powerW: number | null;
};

/**
 * Lecturas posteriores a un instante, en orden cronológico. Las consume el
 * motor de anomalías, que avanza sobre la serie con una marca de agua.
 *
 * El límite acota la memoria de un ciclo: si quedó mucha historia sin
 * evaluar, se procesa por tandas y la marca de agua avanza en cada una.
 */
export async function getReadingsAfter(
  deviceId: string,
  after: string | null,
  limit = 5000
): Promise<RawReading[]> {
  let query = supabase()
    .from('readings')
    .select('recorded_at, voltage, current, power_w')
    .eq('device_id', deviceId);

  if (after) query = query.gt('recorded_at', after);

  const { data, error } = await query.order('recorded_at', { ascending: true }).limit(limit);

  if (error) throw new Error(`No se pudieron leer las lecturas a evaluar: ${error.message}`);

  return (data ?? []).map((row) => ({
    recordedAt: String(row.recorded_at),
    voltage: num(row.voltage),
    current: num(row.current),
    powerW: num(row.power_w),
  }));
}

export type HourlyProfilePoint = { hour: number; samples: number; avgPowerW: number | null };

export type DailyEnergyPoint = { day: string; lastEnergy: number | null; samples: number };

/** Última lectura del contador de cada día, para la curva de consumo acumulado. */
export async function getDailyEnergy(
  deviceId: string,
  from: Date,
  to: Date
): Promise<DailyEnergyPoint[]> {
  const { data, error } = await supabase().rpc('daily_energy', {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw new Error(`No se pudo leer el acumulado diario: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    day: String(row.day),
    lastEnergy: num(row.last_energy),
    samples: Number(row.samples),
  }));
}

/** Insumos para proyectar consumo: extremos del contador y cobertura de la serie. */
export async function getForecastBasis(
  deviceId: string,
  from: Date,
  to: Date
): Promise<ForecastBasis> {
  const { data, error } = await supabase().rpc('forecast_basis', {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw new Error(`No se pudo leer la base de proyección: ${error.message}`);

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;

  return {
    samples: row ? Number(row.samples) : 0,
    firstAt: row?.first_at ? String(row.first_at) : null,
    lastAt: row?.last_at ? String(row.last_at) : null,
    firstEnergy: num(row?.first_energy),
    lastEnergy: num(row?.last_energy),
    daysWithData: row ? Number(row.days_with_data) : 0,
  };
}

/** Potencia media por hora del día (hora local de Argentina). */
export async function getHourlyProfile(
  deviceId: string,
  from: Date,
  to: Date
): Promise<HourlyProfilePoint[]> {
  const { data, error } = await supabase().rpc('hourly_profile', {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw new Error(`No se pudo leer el perfil horario: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    hour: Number(row.hour),
    samples: Number(row.samples),
    avgPowerW: num(row.avg_power_w),
  }));
}

export type LatestReading = {
  recordedAt: string;
  voltage: number | null;
  powerW: number | null;
} | null;

/** Última lectura guardada, sin importar el origen. */
export async function getLatestReading(deviceId: string): Promise<LatestReading> {
  const { data, error } = await supabase()
    .from('readings')
    .select('recorded_at, voltage, power_w')
    .eq('device_id', deviceId)
    .order('recorded_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`No se pudo leer la última medición: ${error.message}`);
  if (!data || data.length === 0) return null;

  return {
    recordedAt: String(data[0].recorded_at),
    voltage: num(data[0].voltage),
    powerW: num(data[0].power_w),
  };
}

/** Instante de la última lectura guardada por un origen dado. */
export async function getLastReadingAt(
  deviceId: string,
  source: ReadingSource
): Promise<string | null> {
  const { data, error } = await supabase()
    .from('readings')
    .select('recorded_at')
    .eq('device_id', deviceId)
    .eq('source', source)
    .order('recorded_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`No se pudo consultar la última lectura: ${error.message}`);

  return data && data.length > 0 ? String(data[0].recorded_at) : null;
}

/** Última lectura escrita por el recolector programado (no por el dashboard). */
export function getLastScheduledReading(deviceId: string): Promise<string | null> {
  return getLastReadingAt(deviceId, 'scheduled');
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
