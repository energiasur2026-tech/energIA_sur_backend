import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { BASE_CRON_MINUTES } from '@/domain/collection-intervals';
import { getLastScheduledReading } from '@/lib/readings';

/**
 * Se considera al recolector "al día" si su última escritura entra dentro del
 * intervalo configurado más un ciclo de margen — así un arranque en frío
 * puntual no lo marca como atrasado. El margen se calcula sobre el intervalo
 * real del medidor, no sobre un número fijo: con guardado cada 6 horas,
 * exigirle una escritura cada 7 minutos sería un falso negativo garantizado.
 */
export async function GET() {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    const intervalMinutes = auth.meter.collectionIntervalMinutes;
    const lastScheduledAt = await getLastScheduledReading(auth.meter.deviceId);

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
