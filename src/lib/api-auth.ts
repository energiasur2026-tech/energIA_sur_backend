import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { getMeterForOwner, type Meter } from './meters';

export type AuthorizedMeter = { userId: string; meter: Meter };

/**
 * Resuelve el medidor del usuario logueado para una ruta de API.
 * Devuelve una `NextResponse` de error lista para retornar cuando no
 * corresponde seguir (sin sesión, o cuenta sin medidor vinculado todavía).
 */
export async function requireMeter(): Promise<AuthorizedMeter | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const meter = await getMeterForOwner(user.id);
  if (!meter) {
    return NextResponse.json(
      { error: 'Tu cuenta todavía no tiene un medidor vinculado.' },
      { status: 404 }
    );
  }

  return { userId: user.id, meter };
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
