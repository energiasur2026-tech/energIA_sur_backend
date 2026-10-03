import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { detectAnomalies } from '@/lib/anomalies';
import { apiError } from '@/lib/api-error';
import { collectorSecret } from '@/lib/env';
import { isPersistDue, readAndStoreMeter } from '@/lib/meter-reading';
import { getAllMeters } from '@/lib/meters';
import { notifyNewAnomalies } from '@/lib/notify';

// Debe coincidir con el header que envía netlify/functions/collect-reading.mts.
// Se repite como literal en ambos lados a propósito: la función programada se
// empaqueta por separado y no comparte el alias `@/` de Next.
const COLLECTOR_HEADER = 'x-collector-secret';

/**
 * Recolección programada: lee todos los medidores registrados y persiste una
 * muestra de cada uno.
 *
 * Solo lo invoca la función programada de Netlify, autenticada con un secreto
 * compartido — no hay usuario logueado en este camino, por eso itera todos
 * los medidores en vez de resolver uno por sesión. Es POST porque escribe, y
 * así ningún crawler lo dispara por seguir un enlace.
 */
export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const meters = await getAllMeters();

    // El cron corre cada 5 minutos, que es el piso; cada medidor guarda según
    // su propio intervalo. Los que todavía no cumplen el suyo se saltean sin
    // tocar Tuya ni la base — que es justamente el ahorro de recursos.
    const due = await Promise.all(
      meters.map(async (meter) => ({ meter, due: await isPersistDue(meter, 'scheduled') }))
    );
    const pending = due.filter((entry) => entry.due).map((entry) => entry.meter);

    const results = await Promise.allSettled(
      pending.map((meter) => readAndStoreMeter(meter, 'scheduled'))
    );

    // La detección corre después de guardar, sobre la serie persistida — no
    // sobre la muestra recién tomada. Así también evalúa las lecturas que
    // escribió el sondeo del dashboard entre dos ciclos del recolector.
    const detections = await Promise.allSettled(pending.map((meter) => detectAnomalies(meter)));

    // El aviso va después de detectar, sobre lo que quedó registrado. Si falla
    // el envío, el evento queda sin marcar y se reintenta en el próximo ciclo.
    const notifications = await Promise.allSettled(
      pending.map((meter) => notifyNewAnomalies(meter))
    );

    const collected = results.map((result, i) => {
      const detection = detections[i];
      return {
        deviceId: pending[i].deviceId,
        ...(result.status === 'fulfilled'
          ? { persisted: result.value.persisted, online: result.value.online }
          : { persisted: 'failed' as const, online: false, error: String(result.reason) }),
        ...(detection.status === 'fulfilled'
          ? { events: { opened: detection.value.opened, closed: detection.value.closed, gaps: detection.value.gaps } }
          : { events: null, detectionError: String(detection.reason) }),
        notified:
          notifications[i].status === 'fulfilled'
            ? (notifications[i] as PromiseFulfilledResult<number>).value
            : null,
      };
    });

    return NextResponse.json({
      meters: meters.length,
      collected: collected.length,
      skipped: meters.length - pending.length,
      results: collected,
    });
  } catch (error) {
    return apiError('api/meter/collect', error);
  }
}

function isAuthorized(request: Request): boolean {
  const provided = request.headers.get(COLLECTOR_HEADER);
  if (!provided) return false;

  const expected = collectorSecret();
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual exige longitudes iguales; compararlas antes evita la
  // excepción y ya revela nada más que el largo, que no es secreto.
  return (
    providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf)
  );
}
