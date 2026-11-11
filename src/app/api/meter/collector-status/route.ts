import { NextResponse } from 'next/server';
import { isErrorResponse, meterIdFrom, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { BASE_CRON_MINUTES } from '@/domain/collection-intervals';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

/**
 * Se considera al recolector "al día" si su última escritura entra dentro del
 * intervalo configurado más un ciclo de margen — así un arranque en frío
 * puntual no lo marca como atrasado. El margen se calcula sobre el intervalo
 * real del medidor, no sobre un número fijo: con guardado cada 6 horas,
 * exigirle una escritura cada 7 minutos sería un falso negativo garantizado.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireMeter(meterIdFrom(request));
    if (isErrorResponse(auth)) return auth;

    const intervalMinutes = auth.meter.collectionIntervalMinutes;
    const lastScheduledAt = await repos.readings.lastScheduledAt(auth.meter.deviceId);

    const minutesAgo = lastScheduledAt
      ? (Date.now() - new Date(lastScheduledAt).getTime()) / 60000
      : null;

    return NextResponse.json({
      lastScheduledAt,
      intervalMinutes,
      active: minutesAgo !== null && minutesAgo <= intervalMinutes + BASE_CRON_MINUTES * 2,
    });
  } catch (error) {
    return apiError('api/meter/collector-status', error);
  }
}
