/**
 * Resolvedor de imports para los tests.
 *
 * El código fuente importa como lo espera Next: sin extensión (`./tariffs`) y
 * con el alias `@/` para `src/`. El runner de Node, en cambio, resuelve con
 * las reglas de ESM y necesita la ruta exacta con extensión.
 *
 * Este hook traduce una cosa en la otra en memoria, solo mientras corren los
 * tests. Así los tests se ejecutan sobre el código REAL, sin compilarlo ni
 * modificarlo: si tocáramos los imports del código para que los tests anden,
 * estaríamos probando algo distinto de lo que se despliega.
 */
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

const esArchivo = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Agrega la extensión que corresponda a una ruta sin ella. */
function conExtension(rutaAbsoluta) {
  const candidatas = [
    rutaAbsoluta,
    `${rutaAbsoluta}.ts`,
    `${rutaAbsoluta}.tsx`,
    path.join(rutaAbsoluta, 'index.ts'),
  ];
  return candidatas.find(esArchivo) ?? null;
}

/**
 * `server-only` es un centinela de Next: existe para que el build falle si un
 * módulo de servidor termina en el bundle del navegador. Fuera de Next lanza
 * una excepción al importarse, así que acá se reemplaza por un módulo vacío.
 * No altera la lógica bajo prueba: ese paquete no aporta comportamiento.
 */
const SERVER_ONLY = 'data:text/javascript,export{}';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: SERVER_ONLY, shortCircuit: true };
    }

    // Alias `@/loquesea` -> `<repo>/src/loquesea`
    if (specifier.startsWith('@/')) {
      const resuelta = conExtension(path.join(SRC, specifier.slice(2)));
      if (resuelta) return { url: pathToFileURL(resuelta).href, shortCircuit: true };
    }

    // Import relativo sin extensión: `./tariffs` -> `./tariffs.ts`
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const base = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : process.cwd();
      const resuelta = conExtension(path.resolve(base, specifier));
      if (resuelta) return { url: pathToFileURL(resuelta).href, shortCircuit: true };
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // Paquetes sin mapa de exportaciones (`next` es uno) dependen de que
      // quien importa agregue la extensión. El bundler de Next lo hace; Node,
      // con reglas ESM estrictas, no. Se reintenta con `.js` antes de rendirse.
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && !/\.[cm]?js$/.test(specifier)) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw error;
    }
  },
});
