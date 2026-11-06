import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { isValidInterval } from '@/domain/collection-intervals';
import { PLACEMENT_ERROR_MESSAGE, parsePlacement } from '@/domain/meter-role';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

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
      role: auth.meter.role,
      areaLabel: auth.meter.areaLabel,
      parentDeviceId: auth.meter.parentDeviceId,
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
      role?: unknown;
      areaLabel?: unknown;
      parentDeviceId?: unknown;
    } | null;

    // Dónde está instalado el medidor: el tablero central de la instalación o
    // un área dentro de ella. Se puede cambiar solo, sin tocar lo demás.
    if (body?.role !== undefined) {
      const resultado = parsePlacement({
        deviceId: auth.meter.deviceId,
        role: body.role,
        areaLabel: body.areaLabel,
        parentDeviceId: body.parentDeviceId,
      });

      if (!resultado.ok) {
        return NextResponse.json(
          { error: PLACEMENT_ERROR_MESSAGE[resultado.error] },
          { status: 400 }
        );
      }

      await repos.meters.setPlacement(auth.meter.deviceId, resultado.placement);

      if (body.collectionIntervalMinutes === undefined && body.alertsEnabled === undefined) {
        return NextResponse.json(resultado.placement);
      }
    }

    // El interruptor de avisos se puede cambiar solo, sin tocar el intervalo.
    if (typeof body?.alertsEnabled === 'boolean') {
      await repos.meters.setAlertsEnabled(auth.meter.deviceId, body.alertsEnabled);
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

    await repos.meters.setCollectionInterval(auth.meter.deviceId, minutes);

    return NextResponse.json({ collectionIntervalMinutes: minutes });
  } catch (error) {
    return apiError('api/meter/settings', error);
  }
}
