import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { listEvents } from '@/lib/events';

/** Historial de anomalías del medidor del usuario, más reciente primero. */
export async function GET() {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    return NextResponse.json({
      events: await listEvents(auth.meter.deviceId),
      // Los umbrales viajan con la respuesta para que la UI pueda explicar
      // contra qué se comparó, en vez de mostrar un límite implícito.
      thresholds: auth.meter.thresholds,
    });
  } catch (error) {
    return apiError('api/meter/events', error);
  }
}
