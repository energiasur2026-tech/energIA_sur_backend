import 'server-only';

import { withPersonalGoal } from './personal-goals';
import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { getMeterForOwner, getMetersForOwner, type Meter } from './meters';

export type AuthorizedMeter = { userId: string; meter: Meter };

/**
 * Resuelve el medidor del usuario logueado para una ruta de API.
 * Devuelve una `NextResponse` de error lista para retornar cuando no
 * corresponde seguir (sin sesión, o cuenta sin medidor vinculado todavía).
 */
export async function requireMeter(request?: Request): Promise<AuthorizedMeter | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const selected = request ? new URL(request.url).searchParams.get('meterId') : null;
  const meter = selected ? (await getMetersForOwner(user.id)).find(m => m.deviceId === selected) : await getMeterForOwner(user.id);
  if (selected && !meter) return NextResponse.json({ code: 'METER_FORBIDDEN', error: 'No tenés autorización para este medidor.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (!meter) {
    return NextResponse.json(
      { code: 'NO_METER', error: 'Tu cuenta todavía no tiene un medidor vinculado.' },
      { status: 404 }
    );
  }

  return { userId: user.id, meter: await withPersonalGoal(user.id, meter) };
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
