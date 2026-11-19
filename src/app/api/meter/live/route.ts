import { NextResponse } from 'next/server';
import { detectAnomalies } from '@/lib/anomalies';
import { apiError } from '@/lib/api-error';
import { isErrorResponse, meterIdFrom, requireMeter } from '@/lib/api-auth';
import { readAndStoreMeter } from '@/lib/meter-reading';

/** Lectura viva del medidor del usuario logueado. Persiste la muestra y evalúa anomalías al guardar. */
export async function GET(request: Request) {
  try {
    const meter = await requireMeter(meterIdFrom(request));
    if (isErrorResponse(meter)) return meter;

    const reading = await readAndStoreMeter(meter.meter, 'dashboard');
    if (reading.persisted === 'saved') {
      try {
        await detectAnomalies(meter.meter);
      } catch (detectionError) {
        console.error('[api/meter/live] Error al evaluar anomalías tras persistir lectura:', detectionError);
      }
    }

    return NextResponse.json(reading);
  } catch (error) {
    return apiError('api/meter/live', error);
  }
}
