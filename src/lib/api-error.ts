import 'server-only';

import { NextResponse } from 'next/server';
import { MissingEnvError } from './env';
import { TuyaError } from './tuya';

/**
 * Traduce un error interno en una respuesta HTTP.
 *
 * El detalle tecnico va al log del servidor; al cliente solo se le envia un
 * mensaje explicativo, nunca credenciales ni trazas.
 */
export function apiError(scope: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${detail}`);

  if (error instanceof MissingEnvError) {
    return NextResponse.json(
      { error: 'El servidor no esta configurado.', missingEnv: error.keys },
      { status: 503 }
    );
  }

  if (error instanceof TuyaError) {
    return NextResponse.json(
      { error: 'No fue posible comunicarse con el medidor.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
}
