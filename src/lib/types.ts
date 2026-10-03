import type { RangeKey } from './ranges';
import type { PeriodKey } from './periods';
import type { EnergyCost } from './tariffs';

/** Formas de datos que viajan del servidor al navegador. */

export type LiveReading = {
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

export type SeriesPoint = {
  bucket: string;
  samples: number;
  avgVoltage: number | null;
  minVoltage: number | null;
  maxVoltage: number | null;
  avgCurrent: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  lastEnergy: number | null;
};

export type PeriodSummary = {
  samples: number;
  firstAt: string | null;
  lastAt: string | null;
  avgVoltage: number | null;
  minVoltage: number | null;
  maxVoltage: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  maxCurrent: number | null;
};

export type HistoryPayload = {
  range: RangeKey;
  label: string;
  bucketSeconds: number;
  from: string;
  to: string;
  summary: PeriodSummary;
  series: SeriesPoint[];
};

export type ApiErrorPayload = {
  error: string;
  missingEnv?: string[];
};

export type ConsumptionReason = 'insufficient_readings' | 'meter_counter_decreased';

export type ConsumptionPayload = {
  period: PeriodKey;
  label: string;
  from: string;
  to: string;
  samples: number;
  firstAt: string | null;
  lastAt: string | null;
} & (
  | { available: true; reason: null; consumedKwh: number; cost: EnergyCost }
  | { available: false; reason: ConsumptionReason; consumedKwh: null; cost: null }
);
