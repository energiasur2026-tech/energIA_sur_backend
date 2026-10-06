import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { clearHomeContext, getHomeContext, saveHomeContext } from '@/lib/home';
import { isKnownAppliance } from '@/domain/home-catalog';
import {
  MAX_FLOORS,
  MAX_ROOM_NAME_LENGTH,
  MAX_ROOMS,
  type DwellingType,
  type HomeContext,
  type HomeRoom,
} from '@/domain/home-types';

export async function GET() {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    return NextResponse.json({ home: await getHomeContext(auth.meter.deviceId) });
  } catch (error) {
    return apiError('api/meter/home', error);
  }
}

/**
 * Guarda el contexto completo del hogar.
 *
 * El cuerpo llega del asistente, pero esta ruta es alcanzable sin él: todo lo
 * que entra se valida acá de nuevo. Los aparatos desconocidos se descartan en
 * silencio en lugar de rechazar el guardado entero — si el catálogo cambia y
 * una pantalla vieja manda un id retirado, es preferible guardar el resto que
 * perder toda la carga del usuario.
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireMeter();
    if (isErrorResponse(auth)) return auth;

    const body = (await request.json().catch(() => null)) as {
      dwellingType?: unknown;
      floors?: unknown;
      rooms?: unknown;
    } | null;

    if (!body) {
      return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
    }

    const dwellingType: DwellingType = body.dwellingType === 'depto' ? 'depto' : 'casa';

    const floorsRaw = Number(body.floors);
    if (!Number.isInteger(floorsRaw) || floorsRaw < 1 || floorsRaw > MAX_FLOORS) {
      return NextResponse.json(
        { error: `La cantidad de pisos debe estar entre 1 y ${MAX_FLOORS}.` },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.rooms)) {
      return NextResponse.json({ error: 'Faltan los ambientes.' }, { status: 400 });
    }

    if (body.rooms.length > MAX_ROOMS) {
      return NextResponse.json(
        { error: `Se pueden cargar hasta ${MAX_ROOMS} ambientes.` },
        { status: 400 }
      );
    }

    const rooms: HomeRoom[] = [];
    const seen = new Set<string>();

    for (const raw of body.rooms) {
      const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
      if (name === '') continue;

      if (name.length > MAX_ROOM_NAME_LENGTH) {
        return NextResponse.json(
          { error: `Cada ambiente admite hasta ${MAX_ROOM_NAME_LENGTH} caracteres.` },
          { status: 400 }
        );
      }

      // La base tiene un índice único sobre (device_id, lower(name)): filtrar
      // acá evita que un duplicado se convierta en un error 500 más adelante.
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const appliances: string[] = Array.isArray(raw?.appliances)
        ? [
            ...new Set(
              (raw.appliances as unknown[]).filter(
                (id): id is string => typeof id === 'string' && isKnownAppliance(id)
              )
            ),
          ]
        : [];

      rooms.push({ name, appliances });
    }

    // Sin ambientes no hay contexto que guardar: se borra lo que hubiera, así
    // "vaciar todo" y "nunca cargué nada" quedan como el mismo estado.
    if (rooms.length === 0) {
      await clearHomeContext(auth.meter.deviceId);
      return NextResponse.json({ home: null });
    }

    const home: HomeContext = { dwellingType, floors: floorsRaw, rooms };
    await saveHomeContext(auth.meter.deviceId, home);

    return NextResponse.json({ home });
  } catch (error) {
    return apiError('api/meter/home', error);
  }
}
