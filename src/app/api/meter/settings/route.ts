import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { isValidInterval } from '@/lib/collection-intervals';
import { setAlertsEnabled, setCollectionInterval } from '@/lib/meters';

export async function GET() {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    return NextResponse.json({
      deviceId: auth.meter.deviceId,
      name: auth.meter.name,
      collectionIntervalMinutes: auth.meter.collectionIntervalMinutes,
      alertsEnabled: auth.meter.alertsEnabled,
      thresholds: auth.meter.thresholds,
    });
  } catch (error) {
    return apiError('api/meter/settings', error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    const body = (await request.json().catch(() => null)) as {
      collectionIntervalMinutes?: unknown;
      alertsEnabled?: unknown;
    } | null;

    // El interruptor de avisos se puede cambiar solo, sin tocar el intervalo.
    if (typeof body?.alertsEnabled === 'boolean') {
      await setAlertsEnabled(auth.meter.deviceId, body.alertsEnabled);
      if (body.collectionIntervalMinutes === undefined) {
        return NextResponse.json({ alertsEnabled: body.alertsEnabled });
      }
    }

    const minutes = Number(body?.collectionIntervalMinutes);

    // La lista de opciones se valida en el servidor además de en la base: el
    // formulario no es la única puerta de entrada a esta ruta.
    if (!Number.isFinite(minutes) || !isValidInterval(minutes)) {
      return NextResponse.json({ error: 'Intervalo no válido.' }, { status: 400 });
    }

    await setCollectionInterval(auth.meter.deviceId, minutes);

    return NextResponse.json({ collectionIntervalMinutes: minutes });
  } catch (error) {
    return apiError('api/meter/settings', error);
  }
}
