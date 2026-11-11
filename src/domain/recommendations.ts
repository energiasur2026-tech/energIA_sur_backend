import type { GoalProgress } from './goal';

/**
 * Recomendaciones para llegar al objetivo.
 *
 * Se construyen a partir de lo que el medidor efectivamente midió — consumo
 * en espera, franjas de mayor uso, cuánto falta recortar — y no de una lista
 * fija de consejos. Un consejo genérico ("apagá las luces") no dice nada que
 * el usuario no sepa; decirle que sus equipos en espera se comen 18 kWh al
 * mes es un dato suyo, medido en su casa.
 */

export type Recommendation = {
  id: string;
  title: string;
  detail: string;
  /** Magnitud estimada del ahorro, cuando se puede cuantificar honestamente. */
  impact: string | null;
  tone: 'good' | 'action' | 'info';
};

export type HourlyPoint = { hour: number; samples: number; avgPowerW: number | null };

/** Horas consideradas de madrugada para estimar el consumo en espera. */
const NIGHT_HOURS = [1, 2, 3, 4, 5];

/** Por debajo de esto, el consumo en espera no justifica una recomendación. */
const STANDBY_SHARE_THRESHOLD = 0.15;

export function buildRecommendations(
  goal: GoalProgress,
  profile: HourlyPoint[] | null,
  period?: {from:string;to:string}
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (goal.status === 'no_goal' || goal.status === 'no_data') return recommendations;

  const gap = goal.projectedMonthKwh !== null && goal.goalKwh !== null
    ? goal.projectedMonthKwh - goal.goalKwh
    : null;

  // 1. Cuánto hay que recortar, en términos concretos y diarios.
  if (gap !== null && gap > 0 && goal.remainingPerDayKwh !== null) {
    const dailyCut = round(Math.max(0,(goal.dailyRateKwh ?? 0)-goal.remainingPerDayKwh), 2);
    recommendations.push({
      id: 'required-cut',
      title: goal.consumedKwh !== null && goal.goalKwh !== null && goal.consumedKwh > goal.goalKwh ? `Ya superaste el objetivo en ${formatKwh(goal.consumedKwh-goal.goalKwh)} kWh observados` : `Revisá el ritmo: diferencia diaria estimada de ${formatKwh(dailyCut)} kWh`,
      detail:
        `Al ritmo actual vas a terminar el mes en ${formatKwh(goal.projectedMonthKwh!)} kWh, ` +
        `${formatKwh(gap)} kWh por encima de tu objetivo. De acá en adelante te quedan ` +
        `${formatKwh(goal.remainingPerDayKwh)} kWh por día según el tiempo restante. Superar lo ya consumido no puede revertirse; revisá los usos posibles sin afectar equipos necesarios.`,
      impact: `${formatKwh(gap)} kWh/mes`,
      tone: 'action',
    });
  }

  // 2. Consumo en espera: lo que se gasta incluso sin nadie usando nada.
  const standby = estimateStandbyWatts(profile);
  if (standby !== null && goal.goalKwh !== null) {
    const standbyMonthlyKwh = round((standby * 24 * goal.daysInMonth) / 1000, 1);
    const share = standbyMonthlyKwh / goal.goalKwh;

    if (share >= STANDBY_SHARE_THRESHOLD) {
      recommendations.push({
        id: 'standby',
        title: `Detectamos un consumo base nocturno cercano a ${Math.round(standby)} W`,
        detail:
          `Es la menor potencia media entre las franjas de 01 a 05 h con muestras. Período analizado: ${period?new Date(period.from).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hourCycle:'h23'})+' a '+new Date(period.to).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hourCycle:'h23'}):'el historial consultado'}. ` +
          `Si esta potencia se mantuviera las 24 horas, equivaldría aproximadamente a ${formatKwh(standbyMonthlyKwh)} kWh al mes. ` +
          'Es un escenario, no ahorro garantizado ni consumo totalmente evitable. No identifica aparatos y puede incluir equipos necesarios.',
        impact: null,
        tone: 'action',
      });
    }
  }

  // 3. Franja de mayor consumo: dónde mirar primero.
  const peak = findPeakWindow(profile);
  if (peak !== null) {
    recommendations.push({
      id: 'peak-window',
      title: `Tu mayor consumo es entre las ${pad(peak.startHour)} y las ${pad(peak.endHour)} h`,
      detail:
        `En esa franja promediás ${Math.round(peak.avgPowerW)} W, bastante más que el resto del día. ` +
        `Revisá qué usos coinciden con ese horario antes de atribuirlo a un aparato. Mover un consumo de horario no reduce por sí solo su energía.`,
      impact: null,
      tone: 'info',
    });
  }

  // 4. Si viene bien, decirlo — el silencio no confirma nada.
  if (goal.status === 'on_track' && goal.projectedMonthKwh !== null && goal.goalKwh !== null) {
    const margin = round(goal.goalKwh - goal.projectedMonthKwh, 1);
    recommendations.push({
      id: 'on-track',
      title: 'Vas bien encaminado',
      detail:
        `Al ritmo actual terminás el mes en ${formatKwh(goal.projectedMonthKwh)} kWh, ` +
        `${formatKwh(margin)} kWh por debajo de tu objetivo. Manteniendo este consumo, llegás.`,
      impact: null,
      tone: 'good',
    });
  }

  return recommendations;
}

/**
 * Consumo en espera: la potencia mínima de madrugada, cuando el uso
 * voluntario es prácticamente nulo. Requiere que esas horas tengan muestras;
 * si el medidor nunca midió de madrugada, no se inventa el dato.
 */
function estimateStandbyWatts(profile: HourlyPoint[] | null): number | null {
  if (!profile) return null;

  const nightValues = profile
    .filter((point) => NIGHT_HOURS.includes(point.hour) && point.samples >= 3)
    .map((point) => point.avgPowerW)
    .filter((value): value is number => value !== null);

  if (nightValues.length < 3) return null;

  const minimum = Math.min(...nightValues);
  return minimum > 0 ? minimum : null;
}

/** Ventana de 3 horas consecutivas con mayor potencia media. */
function findPeakWindow(
  profile: HourlyPoint[] | null
): { startHour: number; endHour: number; avgPowerW: number } | null {
  if (!profile || profile.length < 6) return null;

  const byHour = new Map(profile.map((point) => [point.hour, point.avgPowerW]));
  let best: { startHour: number; endHour: number; avgPowerW: number } | null = null;

  for (let start = 0; start < 24; start += 1) {
    const values: number[] = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const value = byHour.get((start + offset) % 24);
      if (typeof value === 'number') values.push(value);
    }

    if (values.length < 3) continue;

    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (best === null || average > best.avgPowerW) {
      best = { startHour: start, endHour: (start + 3) % 24, avgPowerW: average };
    }
  }

  // Sin un pico claro contra el promedio general, señalar una franja sería
  // arbitrario.
  if (best === null) return null;

  const all = profile.map((p) => p.avgPowerW).filter((v): v is number => v !== null);
  const overallAverage = all.reduce((sum, value) => sum + value, 0) / all.length;
  if (best.avgPowerW < overallAverage * 1.2) return null;

  return best;
}

function formatKwh(value: number) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function pad(hour: number) {
  return String(hour).padStart(2, '0');
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
