/**
 * Tests del CONTRATO de la API.
 *
 * El frontend vive en otro repo y depende de que estas rutas, estos métodos y
 * estos formatos de respuesta no cambien. Un refactor interno puede reorganizar
 * todo lo que quiera por dentro; lo que no puede es mover una ruta, perder un
 * método o cambiar el cuerpo de un error.
 *
 * Estos tests son la frontera: si alguno se pone en rojo, el frontend se rompe.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// Sin sesión: así responde el guardia cuando no hay cookie válida.
mock.module('../src/lib/auth.ts', {
  namedExports: { getCurrentUser: async () => null },
});

const { requireMeter, isErrorResponse } = await import('../src/lib/api-auth.ts');
const { apiError } = await import('../src/lib/api-error.ts');
const { MissingEnvError } = await import('../src/lib/errors.ts');
const { TuyaError } = await import('../src/lib/tuya.ts');

// ------------------------------------------------- rutas y métodos esperados

/** El contrato tal como está documentado y tal como lo consume el frontend. */
const CONTRATO: Record<string, string[]> = {
  'meter/live': ['GET'],
  'meter/history': ['GET'],
  'meter/forecast': ['GET'],
  'meter/events': ['GET'],
  'meter/event-series': ['GET'],
  'meter/consumption': ['GET'],
  'meter/collector-status': ['GET'],
  'meter/home': ['GET', 'PUT'],
  'meter/settings': ['GET', 'PUT'],
  'meter/goal': ['PUT'],
  meters: ['GET'],
  profile: ['GET', 'PUT'],
  'meter/collect': ['POST'],
};

for (const [ruta, metodos] of Object.entries(CONTRATO)) {
  test(`/api/${ruta} expone exactamente ${metodos.join(', ')}`, async () => {
    const modulo = await import(`../src/app/api/${ruta}/route.ts`);
    const expuestos = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter(
      (m) => typeof modulo[m] === 'function'
    );
    assert.deepEqual(
      expuestos.sort(),
      [...metodos].sort(),
      `/api/${ruta} cambió los métodos que expone`
    );
  });
}

test('el contrato tiene las 13 rutas, ni una más ni una menos', () => {
  assert.equal(Object.keys(CONTRATO).length, 13);
});

test('en total son 11 GET, 4 PUT y 1 POST', () => {
  const todos = Object.values(CONTRATO).flat();
  const cuenta = (m: string) => todos.filter((x) => x === m).length;
  assert.equal(cuenta('GET'), 11);
  assert.equal(cuenta('PUT'), 4);
  assert.equal(cuenta('POST'), 1);
});

// ----------------------------------------------------- respuestas de error

test('sin sesión responde 401 con el cuerpo exacto que espera el frontend', async () => {
  const r = await requireMeter();
  assert.equal(isErrorResponse(r), true);
  if (!isErrorResponse(r)) return;
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: 'No autenticado.' });
});

test('una variable de entorno faltante responde 503 y nombra cuáles', async () => {
  const r = apiError('prueba', new MissingEnvError(['SUPABASE_URL']));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), {
    error: 'El servidor no esta configurado.',
    missingEnv: ['SUPABASE_URL'],
  });
});

test('un fallo de Tuya responde 502, no 500', async () => {
  // Importa distinguirlos: 502 es "el medidor no contesta" y es esperable;
  // 500 sería un error nuestro.
  const r = apiError('prueba', new TuyaError('el medidor no responde'));
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'No fue posible comunicarse con el medidor.' });
});

test('un error inesperado responde 500 sin filtrar el detalle técnico', async () => {
  const r = apiError('prueba', new Error('contraseña=secreta en la conexión'));
  assert.equal(r.status, 500);
  const cuerpo = await r.json();
  assert.deepEqual(cuerpo, { error: 'Error interno del servidor.' });
  assert.ok(
    !JSON.stringify(cuerpo).includes('secreta'),
    'el detalle del error no puede viajar al cliente'
  );
});

test('un error que no es Error tampoco filtra nada', async () => {
  const r = apiError('prueba', { token: 'no-debe-salir' });
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'Error interno del servidor.' });
});
