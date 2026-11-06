/**
 * Formas de los datos que devuelve el almacenamiento. **Dominio puro.**
 *
 * Vivían en `lib/readings.ts`, junto a las consultas. Separarlos permite que
 * los puertos los nombren sin arrastrar el cliente de Supabase.
 */

/** Energía acumulada al inicio y al final del período, según el medidor. */
export type PeriodConsumption = {
  samples: number;
  firstAt: string | null;
  lastAt: string | null;
  firstEnergy: number | null;
  lastEnergy: number | null;
};

/** Última lectura guardada, sin importar el origen. `null` si no hay ninguna. */
export type LatestReading = {
  recordedAt: string;
  voltage: number | null;
  powerW: number | null;
} | null;

/** Promedio de potencia por hora del día, para la curva típica. */
export type HourlyProfilePoint = { hour: number; samples: number; avgPowerW: number | null };

/** Última lectura del contador de cada día, para la curva acumulada. */
export type DailyEnergyPoint = { day: string; lastEnergy: number | null; samples: number };
