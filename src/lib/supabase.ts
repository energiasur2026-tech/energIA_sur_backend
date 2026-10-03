import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase de servidor.
 *
 * Usa la service role key, que evita RLS: nunca debe exponerse al navegador ni
 * importarse desde un componente cliente ('server-only' lo garantiza en build).
 */
export function supabase(): SupabaseClient {
  if (client) return client;

  const { url, serviceRoleKey } = supabaseEnv();
  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
