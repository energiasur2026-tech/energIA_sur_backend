/**
 * Decisiones sobre el muestreo del medidor. **Dominio puro.**
 *
 * Dos cosas que antes vivían mezcladas con las llamadas a Tuya y a la base:
 * cuándo toca guardar una lectura, y cómo se interpreta la respuesta cruda
 * del medidor.
 */
import { BASE_CRON_MINUTES } from './collection-intervals';
import { decodePhaseA } from './phase-a';

/**
 * Tolerancia al comparar contra el intervalo configurado.
 *
 * El cron dispara cada `BASE_CRON_MINUTES`, así que sin margen un intervalo de
 * 6 h se cumpliría recién en el ciclo siguiente (6 h 5 min) y se iría
 * corriendo un poco más en cada vuelta. Con medio ciclo de tolerancia el
 * guardado cae en el primer disparo a partir del intervalo, sin deriva.
 */
const DUE_TOLERANCE_MS = (BASE_CRON_MINUTES / 2) * 60_000;

/**
 * Si ya pasó el intervalo configurado desde la última lectura de ese origen.
 * Sin lectura previa, siempre toca.
 */
export function isPersistDueAt(params: {
  lastReadingAt: string | null;
  intervalMinutes: number;
  now: Date;
}): boolean {
  if (!params.lastReadingAt) return true;
  const elapsed = params.now.getTime() - new Date(params.lastReadingAt).getTime();
  return elapsed >= params.intervalMinutes * 60_000 - DUE_TOLERANCE_MS;
}

export type TuyaStatusItem = { code: string; value: unknown };

export type SampledValues = {
  voltage: number | null;
  current: number | null;
  powerW: number | null;
  totalEnergyKwh: number | null;
  /** El data point crudo, que se guarda tal cual para poder reinterpretarlo. */
  rawPhaseA: string | null;
};

/**
 * Traduce la respuesta cruda de Tuya a valores con sentido.
 *
 * Si un data point falta o no es numérico, el valor queda en `null`: el
 * criterio del proyecto es no inventar ceros.
 */
export function interpretStatus(status: TuyaStatusItem[]): SampledValues {
  const rawPhaseA = pick(status, 'phase_a');
  const rawEnergy = pick(status, 'total_forward_energy');

  // El medidor reporta la energía acumulada en centésimas de kWh.
  const parsedEnergy = rawEnergy === null ? null : Math.round(Number(rawEnergy)) / 100;
  const totalEnergyKwh = Number.isFinite(parsedEnergy as number) ? parsedEnergy : null;

  const decoded = decodePhaseA(rawPhaseA);

  return {
    voltage: decoded.voltage,
    current: decoded.current,
    powerW: decoded.powerW,
    totalEnergyKwh,
    rawPhaseA,
  };
}

function pick(status: TuyaStatusItem[], code: string): string | null {
  const item = status.find((dp) => dp.code === code);
  return item === undefined || item.value === null ? null : String(item.value);
}
