import { NextResponse } from 'next/server';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';

import { isKnownApplianceAnywhere } from '@/domain/catalogs';
import {
  contextDefinition,
  contextMatchesRole,
  isValidContextType,
} from '@/domain/installation-types';
import {
  MAX_FLOORS,
  MAX_ROOM_NAME_LENGTH,
  MAX_ROOMS,
  normalizeContext,
  type HomeContext,
  type HomeRoom,
} from '@/domain/home-types';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

export async function GET(request: Request) {
  try {
    const auth = await requireMeter(request);
    if (isErrorResponse(auth)) return auth;

    return NextResponse.json({ home: await repos.home.get(auth.meter.deviceId) });
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
    const auth = await requireMeter(request);
    if (isErrorResponse(auth)) return auth;

    const body = (await request.json().catch(() => null)) as {
      contextType?: unknown;
      /** Nombre anterior, cuando el contexto solo podía ser una vivienda. */
      dwellingType?: unknown;
      floors?: unknown;
      rooms?: unknown;
    } | null;

    if (!body) {
      return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
    }

    // `dwellingType` se acepta como alias mientras el frontend viejo siga
    // desplegado: antes el contexto solo podía ser casa o depto.
    const tipoCrudo = body.contextType ?? body.dwellingType;
    if (!isValidContextType(tipoCrudo)) {
      return NextResponse.json({ error: 'Tipo de lugar no válido.' }, { status: 400 });
    }

    // Un medidor en el tablero no puede declararse "garage", y uno de área no
    // puede declararse "clínica": serían dos formas de decir que mide algo
    // que no mide.
    if (!contextMatchesRole(tipoCrudo, auth.meter.role)) {
      return NextResponse.json(
        {
          error:
            auth.meter.role === 'central'
              ? 'Ese tipo corresponde a un área, y este medidor está en el tablero central.'
              : 'Ese tipo corresponde a una instalación completa, y este medidor cubre un área.',
        },
        { status: 400 }
      );
    }

    const definicion = contextDefinition(tipoCrudo);

    let floorsRaw: number | null = null;
    if (definicion?.hasFloors) {
      const pisos = Number(body.floors);
      if (!Number.isInteger(pisos) || pisos < 1 || pisos > MAX_FLOORS) {
        return NextResponse.json(
          { error: `La cantidad de pisos debe estar entre 1 y ${MAX_FLOORS}.` },
          { status: 400 }
        );
      }
      floorsRaw = pisos;
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
                (id): id is string => typeof id === 'string' && isKnownApplianceAnywhere(id)
              )
            ),
          ]
        : [];

      rooms.push({ name, appliances });
    }

    // Sin ambientes no hay contexto que guardar: se borra lo que hubiera, así
    // "vaciar todo" y "nunca cargué nada" quedan como el mismo estado.
    if (rooms.length === 0) {
      await repos.home.clear(auth.meter.deviceId);
      return NextResponse.json({ home: null });
    }

    const home: HomeContext = normalizeContext({ contextType: tipoCrudo, floors: floorsRaw, rooms });
    await repos.home.save(auth.meter.deviceId, home);

    return NextResponse.json({ home });
  } catch (error) {
    return apiError('api/meter/home', error);
  }
}
