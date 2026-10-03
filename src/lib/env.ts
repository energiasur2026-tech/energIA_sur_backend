import 'server-only';

import { MissingEnvError } from './errors';

/**
 * Acceso centralizado a variables de entorno del servidor.
 *
 * Regla: no hay valores por defecto para credenciales. Si falta una variable
 * el sistema falla de forma visible en vez de apuntar silenciosamente a un
 * recurso equivocado.
 */

export { MissingEnvError };

function read(keys: string[]): string[] {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) throw new MissingEnvError(missing);
  return keys.map((key) => process.env[key] as string);
}

/**
 * Credenciales de Tuya Cloud, compartidas por todos los medidores del
 * proyecto. El device id NO vive acá: cada medidor se resuelve por su dueño
 * en la tabla `meters` (ver lib/meters.ts) — esto es lo que hace posible el
 * multi-medidor.
 */
export function tuyaEnv() {
  const [clientId, clientSecret] = read(['TUYA_CLIENT_ID', 'TUYA_CLIENT_SECRET']);

  return {
    clientId,
    clientSecret,
    baseUrl: process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com',
  };
}

export function supabaseEnv() {
  const [url, serviceRoleKey] = read(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  return { url, serviceRoleKey };
}

/** Secreto compartido entre la función programada y el endpoint de recolección. */
export function collectorSecret() {
  const [secret] = read(['COLLECTOR_SECRET']);
  return secret;
}
