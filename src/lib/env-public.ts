import { MissingEnvError } from './errors';

/**
 * Variables de entorno públicas de Supabase (URL + clave anónima/publicable).
 *
 * A propósito NO importa 'server-only': Next.js inlinea las variables
 * `NEXT_PUBLIC_*` en el bundle del navegador en build time, y este archivo lo
 * usan tanto componentes cliente (formulario de login) como código de
 * servidor que valida la sesión. La clave anónima está diseñada para
 * exponerse — el control de acceso real lo hacen las políticas RLS, no el
 * secreto de esta clave.
 */
export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new MissingEnvError(
      [!url && 'NEXT_PUBLIC_SUPABASE_URL', !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(
        Boolean
      ) as string[]
    );
  }

  return { url, anonKey };
}
