import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

/** Historial de anomalías del medidor del usuario, más reciente primero. */
export async function GET(request: Request) {
  try {
    const auth = await requireMeter(request);
    if (isErrorResponse(auth)) return auth;

    return NextResponse.json({
      events: await repos.events.list(auth.meter.deviceId),
      // Los umbrales viajan con la respuesta para que la UI pueda explicar
      // contra qué se comparó, en vez de mostrar un límite implícito.
      thresholds: auth.meter.thresholds,
    });
  } catch (error) {
    return apiError('api/meter/events', error);
  }
}
