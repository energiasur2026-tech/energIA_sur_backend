import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { getAccessibleMeter, getMeterForOwner, type Meter } from './meters';

export type AuthorizedMeter = { userId: string; meter: Meter };

/**
 * Resuelve el medidor del usuario logueado para una ruta de API.
 *
 * Con `deviceId`, resuelve ese medidor y verifica que la cuenta tenga acceso
 * —propio o compartido—. Sin él, devuelve el primero accesible, que es el
 * comportamiento de siempre: así una pantalla que todavía no elige medidor
 * sigue funcionando igual.
 *
 * Un medidor ajeno y uno inexistente devuelven lo mismo. Si difirieran,
 * probar identificadores diría cuáles están tomados.
 *
 * Devuelve una `NextResponse` de error lista para retornar cuando no
 * corresponde seguir.
 */
export async function requireMeter(deviceId?: string | null): Promise<AuthorizedMeter | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const meter = deviceId
    ? await getAccessibleMeter(user.id, deviceId)
    : await getMeterForOwner(user.id);
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
