/**
 * Sin 'server-only' a propósito: la usan tanto lecturas de variables de
 * servidor (env.ts) como las públicas (env-public.ts), y `apiError` necesita
 * poder distinguirla sin importar código exclusivo de servidor.
 */
export class MissingEnvError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Faltan variables de entorno: ${keys.join(', ')}`);
    this.name = 'MissingEnvError';
  }
}
