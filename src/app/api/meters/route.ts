import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';

import { summarizeHome } from '@/domain/home-types';
import { buildMonthlyProjection,argentinaMonth } from '@/domain/monthly-projection';
import { getLumiReadings } from '@/lib/readings';
import { personalGoal } from '@/lib/personal-goals';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

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
    return await repos.home.get(deviceId);
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
    const user = await repos.session.currentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const meters = await repos.meters.forOwner(user.id);
    const now = new Date();
    const month=argentinaMonth(now);
    const monthStart=new Date(month+'-01T03:00:00Z');

    const summaries = await Promise.all(
      meters.map(async (meter) => {
        const [latest, monthData, activeEvents, home, choice] = await Promise.all([
          repos.readings.latest(meter.deviceId),
          getLumiReadings(meter.deviceId,new Date(+monthStart-86400000),now),
          repos.events.countActive(meter.deviceId),
          safeHomeContext(meter.deviceId),
          personalGoal(user.id,meter),
        ]);

        const result=buildMonthlyProjection({rows:monthData.readings as Parameters<typeof buildMonthlyProjection>[0]['rows'],month,now,choice,fixed:meter.role==='central',tariffValid:process.env.ENERGY_TARIFF_ENABLED!=='false',intervalMinutes:meter.collectionIntervalMinutes,truncated:monthData.truncated});

        return {
          deviceId: meter.deviceId,
          name: meter.name,
          // Sin esto la tarjeta no puede distinguir un medidor del tablero de
          // uno de área, que es justo lo que cambia cómo se presenta.
          role: meter.role,
          areaLabel: meter.areaLabel,
          phases: meter.phases,
          latest,
          activeEvents,
          home: summarizeHome(home),
          goal:result.goal,
        };
      })
    );

    return NextResponse.json({ meters: summaries });
  } catch (error) {
    return apiError('api/meters', error);
  }
}
