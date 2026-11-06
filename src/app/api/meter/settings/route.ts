import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { isValidInterval } from '@/domain/collection-intervals';
import { PLACEMENT_ERROR_MESSAGE, parsePlacement } from '@/domain/meter-role';
import { isValidPhases } from '@/domain/installation-types';
import { isSelectableSensitivity, rangeFor } from '@/domain/sensitivity';
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
      sensitivity: auth.meter.sensitivity,
      role: auth.meter.role,
      areaLabel: auth.meter.areaLabel,
      phases: auth.meter.phases,
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
      phases?: unknown;
      sensitivity?: unknown;
    } | null;

    // Dónde está instalado el medidor: el tablero central de la instalación o
    // un área dentro de ella. Se puede cambiar solo, sin tocar lo demás.
    if (body?.role !== undefined) {
      const resultado = parsePlacement({ role: body.role, areaLabel: body.areaLabel });

      if (!resultado.ok) {
        return NextResponse.json(
          { error: PLACEMENT_ERROR_MESSAGE[resultado.error] },
          { status: 400 }
        );
      }

      await repos.meters.setPlacement(auth.meter.deviceId, resultado.placement);

      if (
        body.collectionIntervalMinutes === undefined &&
        body.alertsEnabled === undefined &&
        body.phases === undefined &&
        body.sensitivity === undefined
      ) {
        return NextResponse.json(resultado.placement);
      }
    }

    // Grado de sensibilidad de las alertas de tensión. Reescribe también los
    // umbrales: el grado es la explicación de esos dos números, y dejarlos
    // desacoplados permitiría que la pantalla diga "alta" y la detección use
    // otro rango.
    if (body?.sensitivity !== undefined) {
      if (!isSelectableSensitivity(body.sensitivity)) {
        return NextResponse.json(
          { error: 'La sensibilidad debe ser "alta", "media" o "baja".' },
          { status: 400 }
        );
      }
      await repos.meters.setSensitivity(auth.meter.deviceId, body.sensitivity);
      if (
        body.collectionIntervalMinutes === undefined &&
        body.alertsEnabled === undefined &&
        body.phases === undefined
      ) {
        return NextResponse.json({
          sensitivity: body.sensitivity,
          thresholds: rangeFor(body.sensitivity),
        });
      }
    }

    // Monofásico o trifásico. Se registra desde el alta aunque el soporte de
    // lecturas trifásicas todavía no esté implementado.
    if (body?.phases !== undefined) {
      if (!isValidPhases(body.phases)) {
        return NextResponse.json(
          { error: 'El equipo debe ser monofásico (1) o trifásico (3).' },
          { status: 400 }
        );
      }
      await repos.meters.setPhases(auth.meter.deviceId, body.phases);
      if (body.collectionIntervalMinutes === undefined && body.alertsEnabled === undefined) {
        return NextResponse.json({ phases: body.phases });
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
