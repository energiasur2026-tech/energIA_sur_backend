import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { getSeries } from '@/lib/readings';

/**
 * Serie de lecturas alrededor de una anomalía puntual.
 *
 * Se pide con las fechas del evento, más un margen a cada lado para que se
 * vea cómo estaba la instalación antes y después: una caída de tensión sin su
 * contexto no dice si fue un pozo aislado o el final de una pendiente.
 */
const PADDING_RATIO = 0.35;
const MIN_PADDING_MS = 5 * 60_000;

/** Cubetas que se buscan en la ventana; define cuán fina sale la curva. */
const TARGET_POINTS = 120;

export async function GET(request: Request) {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    const params = new URL(request.url).searchParams;
    const fromParam = params.get('from');
    const toParam = params.get('to');

    const startMs = Date.parse(fromParam ?? '');
    const endMs = Date.parse(toParam ?? '');

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return NextResponse.json({ error: 'Rango no válido.' }, { status: 400 });
    }

    const padding = Math.max((endMs - startMs) * PADDING_RATIO, MIN_PADDING_MS);
    const from = new Date(startMs - padding);
    const to = new Date(endMs + padding);

    // La cubeta se ajusta al largo de la ventana para devolver un número
    // parejo de puntos, sea un evento de 20 segundos o de dos horas.
    const bucketSeconds = Math.max(
      Math.round((to.getTime() - from.getTime()) / 1000 / TARGET_POINTS),
      5
    );

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      bucketSeconds,
      series: await getSeries(auth.meter.deviceId, from, to, bucketSeconds),
    });
  } catch (error) {
    return apiError('api/meter/event-series', error);
  }
}
