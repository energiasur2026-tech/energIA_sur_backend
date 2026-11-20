import { NextResponse } from 'next/server';
import { isErrorResponse, meterIdFrom, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

import { EVENT_PERIODS, eventBounds, type EventPeriod } from '@/domain/event-period';
import { listPeriodEvents } from '@/lib/events';
import { effectiveGapMinutes } from '@/domain/anomaly-rules';

/** Historial de anomalías del medidor del usuario, más reciente primero. */
export async function GET(request: Request) {
  try {
    const auth = await requireMeter(meterIdFrom(request));
    if (isErrorResponse(auth)) return auth;

    const params = new URL(request.url).searchParams;
    const period = params.get('period') as EventPeriod | null;
    if (period && !EVENT_PERIODS.includes(period)) {
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
    }
    let bounds;
    try {
      bounds = period ? eventBounds(period, new Date(), params.get('from'), params.get('to')) : null;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      events: bounds
        ? await listPeriodEvents(auth.meter.deviceId, bounds.from, bounds.to)
        : await repos.events.list(auth.meter.deviceId),
      bounds,
      effectiveGapMinutes: effectiveGapMinutes(auth.meter.thresholds, auth.meter.collectionIntervalMinutes),
      // Configuración vigente. Cada episodio lleva su propio umbral histórico.
      thresholds: auth.meter.thresholds,
    }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  } catch (error) {
    return apiError('api/meter/events', error);
  }
}
