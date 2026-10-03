import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicSupabaseEnv } from './env-public';

/**
 * Cliente Supabase de servidor, para leer la sesión del usuario actual desde
 * las cookies de la request. Respeta RLS (usa la clave anónima, no la
 * service role) — solo sirve para saber "quién es", no para consultar datos:
 * eso lo sigue haciendo `supabase()` (service role) en el resto del código.
 *
 * `setAll` se omite a propósito: el refresco de sesión ya lo resuelve
 * `proxy.ts` en cada request, así que este cliente no necesita poder
 * escribir cookies — solo leerlas.
 */
export async function supabaseServer() {
  const { url, anonKey } = publicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
  });
}
