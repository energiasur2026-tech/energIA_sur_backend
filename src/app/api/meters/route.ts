import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/auth';
import { countActiveEvents } from '@/lib/events';
import { getHomeContext } from '@/lib/home';
import { summarizeHome } from '@/domain/home-types';
import { buildGoalProgress, monthBoundsArgentina } from '@/domain/goal';
import { getMetersForOwner } from '@/lib/meters';
import { getLatestReading, getPeriodConsumption } from '@/lib/readings';

/**
 * El contexto del hogar es informacion complementaria de la tarjeta: si no se
 * puede leer, mostrar los medidores sin ese dato es muchisimo mejor que no
 * mostrar nada. El caso concreto que esto cubre es tener el codigo desplegado
 * y la migracion 0013 todavia sin correr, que dejaria la pantalla entera en
 * error por una seccion opcional.
 *
 * El error se registra igual, para que un problema real no quede invisible.
 */
async function safeHomeContext(deviceId: string) {
  try {
    return await getHomeContext(deviceId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[api/meters] contexto del hogar de ${deviceId}: ${detail}`);
    return null;
  }
}

/**
 * Resumen de los medidores del usuario, uno por tarjeta.
 *
 * Lee de la base y no de Tuya: esta pantalla es un panorama, no un tablero en
 * vivo. Consultar el dispositivo de cada medidor acá multiplicaría las
 * llamadas a Tuya por la cantidad de medidores cada vez que alguien entra.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const meters = await getMetersForOwner(user.id);
    const now = new Date();
    const { start: monthStart } = monthBoundsArgentina(now);

    const summaries = await Promise.all(
      meters.map(async (meter) => {
        const [latest, monthConsumption, activeEvents, home] = await Promise.all([
          getLatestReading(meter.deviceId),
          getPeriodConsumption(meter.deviceId, monthStart, now),
          countActiveEvents(meter.deviceId),
          safeHomeContext(meter.deviceId),
        ]);

        const consumedThisMonth =
          monthConsumption.samples >= 2 &&
          monthConsumption.firstEnergy !== null &&
          monthConsumption.lastEnergy !== null &&
          monthConsumption.lastEnergy >= monthConsumption.firstEnergy
            ? monthConsumption.lastEnergy - monthConsumption.firstEnergy
            : null;

        return {
          deviceId: meter.deviceId,
          name: meter.name,
          latest,
          activeEvents,
          home: summarizeHome(home),
          goal: buildGoalProgress({
            goalKwh: meter.goalKwh,
            inputMode: meter.goalInputMode,
            consumedKwh: consumedThisMonth,
            measuredFrom: monthConsumption.firstAt,
            measuredTo: monthConsumption.lastAt,
            now,
          }),
        };
      })
    );

    return NextResponse.json({ meters: summaries });
  } catch (error) {
    return apiError('api/meters', error);
  }
}
