import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { readAndStoreMeter } from '@/lib/meter-reading';

/** Lectura viva del medidor del usuario logueado. Persiste la muestra al pasar. */
export async function GET() {
  try {
    const meter = await requireMeter();
    if (isErrorResponse(meter)) return meter;

    return NextResponse.json(await readAndStoreMeter(meter.meter, 'dashboard'));
  } catch (error) {
    return apiError('api/meter/live', error);
  }
}
