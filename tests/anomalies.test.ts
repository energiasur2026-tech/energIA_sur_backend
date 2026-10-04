/**
 * Tests de caracterización del motor de detección de anomalías.
 *
 * Es la pieza más delicada del sistema y la que más cuesta probar: la lógica
 * (umbrales, histéresis, agrupación, severidad) está hoy entrelazada con las
 * consultas a la base. Para poder ejercitarla sin una base real, se sustituyen
 * los módulos de datos por equivalentes en memoria que registran lo que se les
 * pidió hacer.
 *
 * Esa incomodidad es, justamente, el argumento para separar lógica de
 * infraestructura. Estos tests tienen que seguir pasando después de hacerlo.
 */
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { EventRecord, EventType } from '../src/lib/event-types.ts';

// --------------------------------------------------- sustitutos en memoria

type EventoAbierto = EventRecord & { deviceId: string };

/** Lo que la detección le pidió a la "base". Es lo que verifican los tests. */
const db = {
  lecturas: [] as Array<{
    recordedAt: string;
    voltage: number | null;
    current: number | null;
    powerW: number | null;
  }>,
  abiertos: new Map<EventType, EventRecord>(),
  creados: [] as Array<Record<string, unknown>>,
  insertados: [] as Array<Record<string, unknown>>,
  actualizados: [] as Array<{ id: number; update: Record<string, unknown> }>,
  cerrados: [] as Array<{ id: number; endedAt: string }>,
  marcaDeAgua: null as string | null,
  siguienteId: 1,
};

function reiniciar() {
  db.lecturas = [];
  db.abiertos = new Map();
  db.creados = [];
  db.insertados = [];
  db.actualizados = [];
  db.cerrados = [];
  db.marcaDeAgua = null;
  db.siguienteId = 1;
}

mock.module('../src/lib/readings.ts', {
  namedExports: {
    getReadingsAfter: async () => db.lecturas,
  },
});

mock.module('../src/lib/events.ts', {
  namedExports: {
    getOpenEvents: async () => db.abiertos,
    openOrGetEvent: async (e: Record<string, unknown>) => {
      db.creados.push(e);
      return { ...e, id: db.siguienteId++, endedAt: null } as unknown as EventoAbierto;
    },
    insertEvent: async (e: Record<string, unknown>) => {
      db.insertados.push(e);
      return { ...e, id: db.siguienteId++ } as unknown as EventoAbierto;
    },
    updateOpenEvent: async (id: number, update: Record<string, unknown>) => {
      db.actualizados.push({ id, update });
    },
    closeEvent: async (id: number, endedAt: string) => {
      db.cerrados.push({ id, endedAt });
    },
  },
});

mock.module('../src/lib/meters.ts', {
  namedExports: {
    setAnomaliesEvaluatedAt: async (_d: string, at: string) => {
      db.marcaDeAgua = at;
    },
  },
});

const { detectAnomalies } = await import('../src/lib/anomalies.ts');

// ------------------------------------------------------------- utilidades

const UMBRALES = {
  lowVoltageV: 202.4,
  highVoltageV: 237.6,
  overcurrentA: 15,
  gapMinutes: 15,
};

function medidor(extra: Record<string, unknown> = {}) {
  return {
    deviceId: 'medidor-de-prueba',
    name: 'Prueba',
    thresholds: UMBRALES,
    collectionIntervalMinutes: 5,
    alertsEnabled: true,
    goalKwh: null,
    goalInputMode: 'kwh',
    anomaliesEvaluatedAt: null,
    ...extra,
  } as never;
}

const T0 = Date.parse('2026-03-01T00:00:00Z');
/** Lectura en el minuto `min`, con la tensión y corriente dadas. */
function lec(min: number, voltage: number | null, current: number | null = 1, powerW = 220) {
  return {
    recordedAt: new Date(T0 + min * 60_000).toISOString(),
    voltage,
    current,
    powerW,
  };
}

beforeEach(reiniciar);

// --------------------------------------------------------- casos básicos

test('sin lecturas nuevas no hace nada y no mueve la marca de agua', async () => {
  const r = await detectAnomalies(medidor());
  assert.deepEqual(
    { opened: r.opened, closed: r.closed, gaps: r.gaps, evaluadas: r.readingsEvaluated },
    { opened: 0, closed: 0, gaps: 0, evaluadas: 0 }
  );
  assert.equal(db.marcaDeAgua, null);
});

test('una serie normal no abre ningún evento', async () => {
  db.lecturas = [lec(0, 220), lec(5, 221), lec(10, 219)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 0);
  assert.equal(db.creados.length, 0);
});

test('la marca de agua avanza hasta la última lectura evaluada', async () => {
  db.lecturas = [lec(0, 220), lec(5, 221), lec(10, 219)];
  await detectAnomalies(medidor());
  assert.equal(db.marcaDeAgua, lec(10, 219).recordedAt);
});

// ------------------------------------------------------ tensión baja/alta

test('abre un evento de tensión baja al cruzar el umbral', async () => {
  db.lecturas = [lec(0, 220), lec(5, 200), lec(10, 199)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1);
  assert.equal(db.creados.length, 1);
  assert.equal(db.creados[0].type, 'LOW_VOLTAGE');
  assert.equal(db.creados[0].startedAt, lec(5, 200).recordedAt);
});

test('abre un evento de tensión alta al cruzar el umbral', async () => {
  db.lecturas = [lec(0, 220), lec(5, 240)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1);
  assert.equal(db.creados[0].type, 'HIGH_VOLTAGE');
});

test('abre un evento de sobrecorriente al cruzar el umbral', async () => {
  db.lecturas = [lec(0, 220, 10), lec(5, 220, 18)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1);
  assert.equal(db.creados[0].type, 'OVERCURRENT');
});

test('justo EN el umbral no es violación: tiene que cruzarlo', async () => {
  db.lecturas = [lec(0, 202.4), lec(5, 237.6), lec(10, 220, 15)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 0);
});

// ---------------------------------------------------------- agrupamiento

test('varias lecturas seguidas en falta forman UN solo evento', async () => {
  db.lecturas = [lec(0, 200), lec(5, 198), lec(10, 199), lec(15, 197)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1, 'un solo evento, no cuatro');
  assert.equal(db.creados.length, 1);
});

test('el evento acumula cuántas muestras y los extremos observados', async () => {
  db.lecturas = [lec(0, 200, 2, 300), lec(5, 195, 3, 500), lec(10, 198, 1, 400)];
  await detectAnomalies(medidor());
  // El último update lleva los agregados finales del evento todavía abierto.
  const ultimo = db.actualizados.at(-1)!.update;
  assert.equal(ultimo.samples, 3);
  assert.equal(ultimo.minVoltage, 195);
  assert.equal(ultimo.maxVoltage, 200);
  assert.equal(ultimo.maxCurrent, 3);
  assert.equal(ultimo.maxPowerW, 500);
});

// ------------------------------------------------------------ histéresis

test('NO cierra si la tensión se recupera sin margen suficiente', async () => {
  // Umbral 202.4, histéresis 2 V: hay que llegar a 204.4 para cerrar.
  db.lecturas = [lec(0, 200), lec(5, 203)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1);
  assert.equal(r.closed, 0, '203 V está en la banda muerta');
});

test('cierra cuando la tensión se recupera CON margen', async () => {
  db.lecturas = [lec(0, 200), lec(5, 205)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.closed, 1);
});

test('la histéresis evita fragmentar un episodio oscilante en muchos eventos', async () => {
  // Tensión bailando alrededor del umbral: sin banda muerta esto generaría
  // un evento por cada cruce. Es el caso que motiva toda la histéresis.
  db.lecturas = [
    lec(0, 200),
    lec(5, 203),
    lec(10, 201),
    lec(15, 203.5),
    lec(20, 200.5),
    lec(25, 203),
  ];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1, 'un episodio, un evento');
  assert.equal(r.closed, 0);
});

test('la histéresis de corriente exige bajar 0.5 A por debajo del umbral', async () => {
  db.lecturas = [lec(0, 220, 18), lec(5, 220, 14.8)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1);
  assert.equal(r.closed, 0, '14.8 A sigue en la banda muerta');

  reiniciar();
  db.lecturas = [lec(0, 220, 18), lec(5, 220, 14.5)];
  const r2 = await detectAnomalies(medidor());
  assert.equal(r2.closed, 1);
});

test('el evento se cierra en la última lectura EN FALTA, no cuando se detecta', async () => {
  // La duración tiene que reflejar cuánto duró la anomalía real.
  db.lecturas = [lec(0, 200), lec(5, 198), lec(30, 210)];
  await detectAnomalies(medidor());
  assert.equal(db.cerrados.length, 1);
  assert.equal(db.cerrados[0].endedAt, lec(5, 198).recordedAt);
});

// -------------------------------------------------------------- severidad

test('una desviación chica es advertencia', async () => {
  db.lecturas = [lec(0, 200)]; // umbral 202.4, crítico por debajo de 194.4
  await detectAnomalies(medidor());
  assert.equal(db.creados[0].severity, 'WARNING');
});

test('una desviación de más de 8 V es crítica', async () => {
  db.lecturas = [lec(0, 190)];
  await detectAnomalies(medidor());
  assert.equal(db.creados[0].severity, 'CRITICAL');
});

test('la tensión alta también escala a crítica con 8 V de margen', async () => {
  db.lecturas = [lec(0, 250)]; // umbral 237.6, crítico por encima de 245.6
  await detectAnomalies(medidor());
  assert.equal(db.creados[0].severity, 'CRITICAL');
});

test('la sobrecorriente es crítica a partir de 1.25 veces el umbral', async () => {
  db.lecturas = [lec(0, 220, 19)]; // 15 * 1.25 = 18.75
  await detectAnomalies(medidor());
  assert.equal(db.creados[0].severity, 'CRITICAL');
});

test('la severidad se recalcula si el evento empeora con lecturas posteriores', async () => {
  db.lecturas = [lec(0, 200), lec(5, 185)];
  await detectAnomalies(medidor());
  assert.equal(db.creados[0].severity, 'WARNING', 'abrió como advertencia');
  assert.equal(db.actualizados.at(-1)!.update.severity, 'CRITICAL', 'escaló a crítica');
});

// ----------------------------------------------------- lecturas sin valor

test('una lectura sin tensión se saltea sin romper el evento en curso', async () => {
  db.lecturas = [lec(0, 200), lec(5, null), lec(10, 198)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 1);
  assert.equal(r.closed, 0, 'un dato ausente no cierra el evento');
  assert.equal(db.actualizados.at(-1)!.update.samples, 2);
});

// ------------------------------------------------------- huecos de datos

test('un intervalo mayor al umbral se registra como hueco', async () => {
  db.lecturas = [lec(0, 220), lec(20, 220)];
  const r = await detectAnomalies(medidor({ anomaliesEvaluatedAt: lec(0, 220).recordedAt }));
  assert.equal(r.gaps, 1);
  assert.equal(db.insertados[0].type, 'DATA_GAP');
});

test('un hueco corto no se registra', async () => {
  db.lecturas = [lec(0, 220), lec(10, 220)];
  const r = await detectAnomalies(medidor({ anomaliesEvaluatedAt: lec(0, 220).recordedAt }));
  assert.equal(r.gaps, 0);
});

test('un hueco de más de una hora es advertencia; uno corto es informativo', async () => {
  db.lecturas = [lec(0, 220), lec(20, 220)];
  await detectAnomalies(medidor({ anomaliesEvaluatedAt: lec(0, 220).recordedAt }));
  assert.equal(db.insertados[0].severity, 'INFO');

  reiniciar();
  db.lecturas = [lec(0, 220), lec(90, 220)];
  await detectAnomalies(medidor({ anomaliesEvaluatedAt: lec(0, 220).recordedAt }));
  assert.equal(db.insertados[0].severity, 'WARNING');
});

test('el hueco nace cerrado: su fin se conoce al detectarlo', async () => {
  db.lecturas = [lec(0, 220), lec(20, 220)];
  await detectAnomalies(medidor({ anomaliesEvaluatedAt: lec(0, 220).recordedAt }));
  assert.equal(db.insertados[0].startedAt, lec(0, 220).recordedAt);
  assert.equal(db.insertados[0].endedAt, lec(20, 220).recordedAt);
});

test('sin marca de agua previa no se inventa un hueco al inicio', async () => {
  // Un medidor recién dado de alta no debe reportar un hueco por no tener
  // historia anterior.
  db.lecturas = [lec(0, 220), lec(120, 220)];
  const r = await detectAnomalies(medidor({ anomaliesEvaluatedAt: null }));
  assert.equal(r.gaps, 1, 'solo el hueco entre las dos lecturas, no uno inicial');
});

// --------------------------------------------- continuidad entre corridas

test('retoma un evento ya abierto en vez de abrir otro', async () => {
  db.abiertos = new Map<EventType, EventRecord>([
    [
      'LOW_VOLTAGE',
      {
        id: 7,
        type: 'LOW_VOLTAGE',
        severity: 'WARNING',
        startedAt: lec(0, 200).recordedAt,
        endedAt: null,
        lastViolationAt: lec(0, 200).recordedAt,
        samples: 1,
        minVoltage: 200,
        maxVoltage: 200,
        maxCurrent: 1,
        maxPowerW: 220,
      },
    ],
  ]);
  db.lecturas = [lec(5, 198), lec(10, 210)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 0, 'no abre uno nuevo');
  assert.equal(r.closed, 1, 'cierra el que ya estaba');
  assert.equal(db.cerrados[0].id, 7);
  assert.equal(db.actualizados.at(-1)!.update.samples, 2, 'acumula sobre lo anterior');
});

test('una lectura anterior al inicio del evento abierto se ignora', async () => {
  // Puede llegar si se reprocesa historia. Sin este filtro, el evento
  // retrocedería su fin hasta antes de su propio comienzo.
  db.abiertos = new Map<EventType, EventRecord>([
    [
      'LOW_VOLTAGE',
      {
        id: 7,
        type: 'LOW_VOLTAGE',
        severity: 'WARNING',
        startedAt: lec(60, 200).recordedAt,
        endedAt: null,
        lastViolationAt: lec(60, 200).recordedAt,
        samples: 1,
        minVoltage: 200,
        maxVoltage: 200,
        maxCurrent: 1,
        maxPowerW: 220,
      },
    ],
  ]);
  db.lecturas = [lec(10, 190), lec(70, 198)];
  await detectAnomalies(medidor());
  assert.equal(db.actualizados.at(-1)!.update.samples, 2, 'solo la posterior al inicio');
  assert.equal(db.actualizados.at(-1)!.update.minVoltage, 198);
});

// -------------------------------------------------- tipos independientes

test('tensión baja y sobrecorriente conviven como eventos separados', async () => {
  db.lecturas = [lec(0, 200, 18)];
  const r = await detectAnomalies(medidor());
  assert.equal(r.opened, 2);
  assert.deepEqual(
    db.creados.map((e) => e.type).sort(),
    ['LOW_VOLTAGE', 'OVERCURRENT']
  );
});

test('los umbrales son por medidor, no fijos en el código', async () => {
  db.lecturas = [lec(0, 210)];
  const r = await detectAnomalies(
    medidor({ thresholds: { ...UMBRALES, lowVoltageV: 215 } })
  );
  assert.equal(r.opened, 1, '210 V viola un umbral de 215 V');
});
