import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { buildForecast } from '@/domain/forecast';
import { buildGoalProgress, monthBoundsArgentina } from '@/domain/goal';
import {
  getDailyEnergy,
  getForecastBasis,
  getHourlyProfile,
  getPeriodConsumption,
} from '@/lib/readings';
import { buildRecommendations } from '@/domain/recommendations';

/**
 * Ventana de historia que alimenta la proyección. Más allá de tres meses, un
 * cambio de hábitos o de estación pesa más que el volumen de datos.
 */
const LOOKBACK_DAYS = 90;

/**
 * El perfil horario necesita varios días para no ser el retrato de una sola
 * jornada. Por debajo de esto no se devuelve: es preferible no mostrarlo a
 * mostrar una "curva típica" construida con unas pocas horas.
 */
const PROFILE_MIN_DAYS = 3;

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function GET() {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    const to = new Date();
    const from = new Date(to.getTime() - LOOKBACK_DAYS * 86_400_000);
    const { start: monthStart } = monthBoundsArgentina(to);

    const [basis, monthConsumption, dailyEnergy] = await Promise.all([
      getForecastBasis(auth.meter.deviceId, from, to),
      getPeriodConsumption(auth.meter.deviceId, monthStart, to),
      getDailyEnergy(auth.meter.deviceId, monthStart, to),
    ]);

    const profile =
      basis.daysWithData >= PROFILE_MIN_DAYS
        ? await getHourlyProfile(auth.meter.deviceId, from, to)
        : null;

    // El consumo del mes sale de la diferencia del contador acumulado, igual
    // que en la vista de Consumo: hacen falta dos lecturas y que no haya
    // retrocedido.
    const consumedThisMonth =
      monthConsumption.samples >= 2 &&
      monthConsumption.firstEnergy !== null &&
      monthConsumption.lastEnergy !== null &&
      monthConsumption.lastEnergy >= monthConsumption.firstEnergy
        ? monthConsumption.lastEnergy - monthConsumption.firstEnergy
        : null;

    const goal = buildGoalProgress({
      goalKwh: auth.meter.goalKwh,
      inputMode: auth.meter.goalInputMode,
      consumedKwh: consumedThisMonth,
      measuredFrom: monthConsumption.firstAt,
      measuredTo: monthConsumption.lastAt,
      now: to,
    });

    return NextResponse.json({
      forecast: buildForecast(basis),
      profile,
      profileMinDays: PROFILE_MIN_DAYS,
      lookbackDays: LOOKBACK_DAYS,
      goal,
      // Curva real del mes: la vista la compara contra el ritmo ideal.
      monthDaily: dailyEnergy.map((point) => ({
        day: point.day,
        consumedKwh:
          point.lastEnergy !== null && monthConsumption.firstEnergy !== null
            ? Math.max(round(point.lastEnergy - monthConsumption.firstEnergy, 3), 0)
            : null,
      })),
      recommendations: buildRecommendations(goal, profile),
    });
  } catch (error) {
    return apiError('api/meter/forecast', error);
  }
}
