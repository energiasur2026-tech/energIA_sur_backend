/**
 * Tests de las reglas de detección de anomalías, ahora que son dominio puro.
 *
 * Compará esto con `anomalies.test.ts`: aquel necesita sustituir tres módulos
 * de base de datos para poder correr, porque prueba el camino completo. Este
 * prueba exactamente la misma lógica —umbrales, histéresis, agrupación,
 * severidad, huecos— con un array de lecturas y nada más.
 *
 * Esa diferencia es toda la justificación del refactor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnomalies, type OpenEventSnapshot } from '../src/domain/anomaly-rules.ts';
import type { EventType } from '../src/lib/event-types.ts';
import type { RawReading } from '../src/domain/reading-types.ts';

const UMBRALES = {
  lowVoltageV: 202.4,
  highVoltageV: 237.6,
  overcurrentA: 15,
  gapMinutes: 15,
};

const T0 = Date.parse('2026-03-01T00:00:00Z');
const en = (min: number) => new Date(T0 + min * 60_000).toISOString();

function lec(min: number, voltage: number | null, current: number | null = 1, powerW = 220): RawReading {
  return { recordedAt: en(min), voltage, current, powerW };
}

function plan(
  readings: RawReading[],
  opciones: {
    abiertos?: Map<EventType, OpenEventSnapshot>;
    evaluadoHasta?: string | null;
    umbrales?: typeof UMBRALES;
  } = {}
) {
  return planAnomalies({
    readings,
    thresholds: opciones.umbrales ?? UMBRALES,
    openEvents: opciones.abiertos ?? new Map(),
    evaluatedAt: opciones.evaluadoHasta ?? null,
  });
}

// --------------------------------------------------------------- lo básico

test('sin lecturas no hay nada que hacer', () => {
  const p = plan([]);
  assert.deepEqual(p, { episodes: [], gaps: [], watermark: null, readingsEvaluated: 0 });
});

test('una serie normal no produce ningún episodio', () => {
  const p = plan([lec(0, 220), lec(5, 221), lec(10, 219)]);
  assert.equal(p.episodes.length, 0);
  assert.equal(p.gaps.length, 0);
});

test('la marca de agua queda en la última lectura evaluada', () => {
  const p = plan([lec(0, 220), lec(5, 221), lec(10, 219)]);
  assert.equal(p.watermark, en(10));
  assert.equal(p.readingsEvaluated, 3);
});

test('es una función pura: dos llamadas idénticas dan lo mismo', () => {
  const lecturas = [lec(0, 200), lec(5, 198), lec(10, 210)];
  assert.deepEqual(plan(lecturas), plan(lecturas));
});

test('no modifica las lecturas que recibe', () => {
  const lecturas = [lec(0, 200), lec(5, 198)];
  const copia = structuredClone(lecturas);
  plan(lecturas);
  assert.deepEqual(lecturas, copia);
});

// ------------------------------------------------------------ los umbrales

test('detecta tensión baja, tensión alta y sobrecorriente', () => {
  assert.equal(plan([lec(0, 200)]).episodes[0].type, 'LOW_VOLTAGE');
  assert.equal(plan([lec(0, 240)]).episodes[0].type, 'HIGH_VOLTAGE');
  assert.equal(plan([lec(0, 220, 18)]).episodes[0].type, 'OVERCURRENT');
});

test('estar justo EN el umbral no es violación', () => {
  assert.equal(plan([lec(0, 202.4), lec(5, 237.6), lec(10, 220, 15)]).episodes.length, 0);
});

test('los umbrales son del medidor, no constantes del código', () => {
  const p = plan([lec(0, 210)], { umbrales: { ...UMBRALES, lowVoltageV: 215 } });
  assert.equal(p.episodes.length, 1);
});

test('dos condiciones a la vez producen dos episodios independientes', () => {
  const p = plan([lec(0, 200, 18)]);
  assert.deepEqual(p.episodes.map((e) => e.type).sort(), ['LOW_VOLTAGE', 'OVERCURRENT']);
});

// ------------------------------------------------------------ agrupamiento

test('lecturas consecutivas en falta son UN episodio', () => {
  const p = plan([lec(0, 200), lec(5, 198), lec(10, 199), lec(15, 197)]);
  assert.equal(p.episodes.length, 1);
  assert.equal(p.episodes[0].aggregates.samples, 4);
});

test('el episodio guarda los extremos observados', () => {
  const p = plan([lec(0, 200, 2, 300), lec(5, 195, 3, 500), lec(10, 198, 1, 400)]);
  assert.deepEqual(p.episodes[0].aggregates, {
    samples: 3,
    minVoltage: 195,
    maxVoltage: 200,
    maxCurrent: 3,
    maxPowerW: 500,
  });
});

test('una lectura sin el valor evaluado se saltea sin cortar el episodio', () => {
  const p = plan([lec(0, 200), lec(5, null), lec(10, 198)]);
  assert.equal(p.episodes.length, 1);
  assert.equal(p.episodes[0].aggregates.samples, 2);
  assert.equal(p.episodes[0].endedAt, null, 'un dato ausente no cierra nada');
});

// -------------------------------------------------------------- histéresis

test('recuperarse sin margen NO cierra el episodio', () => {
  // Umbral 202.4 + 2 V de histéresis: hay que llegar a 204.4.
  const p = plan([lec(0, 200), lec(5, 203)]);
  assert.equal(p.episodes[0].endedAt, null);
});

test('recuperarse con margen cierra el episodio', () => {
  const p = plan([lec(0, 200), lec(5, 205)]);
  assert.equal(p.episodes[0].endedAt, en(0));
});

test('una tensión oscilando no se fragmenta en muchos episodios', () => {
  // Es el caso que motiva toda la histéresis: sin banda muerta, cada cruce
  // abriría y cerraría un evento distinto.
  const p = plan([
    lec(0, 200),
    lec(5, 203),
    lec(10, 201),
    lec(15, 203.5),
    lec(20, 200.5),
    lec(25, 203),
  ]);
  assert.equal(p.episodes.length, 1);
  assert.equal(p.episodes[0].endedAt, null);
  assert.equal(p.episodes[0].aggregates.samples, 3, 'solo cuenta las lecturas en falta');
});

test('la histéresis de corriente exige bajar 0.5 A', () => {
  assert.equal(plan([lec(0, 220, 18), lec(5, 220, 14.8)]).episodes[0].endedAt, null);
  assert.equal(plan([lec(0, 220, 18), lec(5, 220, 14.5)]).episodes[0].endedAt, en(0));
});

test('el episodio termina en su última lectura en falta, no al detectarse', () => {
  const p = plan([lec(0, 200), lec(5, 198), lec(30, 210)]);
  assert.equal(p.episodes[0].endedAt, en(5), 'la duración refleja la anomalía real');
});

test('un episodio puede cerrarse y volver a abrirse en la misma tanda', () => {
  const p = plan([lec(0, 200), lec(5, 210), lec(10, 199), lec(15, 210)]);
  assert.equal(p.episodes.length, 2);
  assert.equal(p.episodes[0].startedAt, en(0));
  assert.equal(p.episodes[0].endedAt, en(0));
  assert.equal(p.episodes[1].startedAt, en(10));
  assert.equal(p.episodes[1].endedAt, en(10));
});

// --------------------------------------------------------------- severidad

test('una desviación chica es advertencia y una grande es crítica', () => {
  assert.equal(plan([lec(0, 200)]).episodes[0].severity, 'WARNING');
  assert.equal(plan([lec(0, 190)]).episodes[0].severity, 'CRITICAL'); // umbral - 8 V
  assert.equal(plan([lec(0, 250)]).episodes[0].severity, 'CRITICAL');
  assert.equal(plan([lec(0, 220, 19)]).episodes[0].severity, 'CRITICAL'); // 15 * 1.25
});

test('la severidad final mira todo el episodio, no la primera lectura', () => {
  const p = plan([lec(0, 200), lec(5, 185)]);
  assert.equal(p.episodes[0].severity, 'CRITICAL', 'final: empeoró');
  assert.equal(p.episodes[0].opening?.severity, 'WARNING', 'al abrirse todavía era leve');
});

test('un episodio nuevo registra con qué valores se abrió', () => {
  // El evento se asienta apenas se detecta, para que un corte del proceso a
  // mitad de la tanda no lo pierda.
  const p = plan([lec(0, 200, 2, 300), lec(5, 190, 5, 900)]);
  assert.deepEqual(p.episodes[0].opening?.aggregates, {
    samples: 1,
    minVoltage: 200,
    maxVoltage: 200,
    maxCurrent: 2,
    maxPowerW: 300,
  });
});

// ----------------------------------------------------- continuidad y huecos

function abierto(parcial: Partial<OpenEventSnapshot> = {}) {
  const base: OpenEventSnapshot = {
    id: 7,
    startedAt: en(0),
    lastViolationAt: en(0),
    samples: 1,
    minVoltage: 200,
    maxVoltage: 200,
    maxCurrent: 1,
    maxPowerW: 220,
    ...parcial,
  };
  return new Map<EventType, OpenEventSnapshot>([['LOW_VOLTAGE', base]]);
}

test('continúa un evento ya abierto en vez de empezar otro', () => {
  const p = plan([lec(5, 198), lec(10, 210)], { abiertos: abierto() });
  assert.equal(p.episodes.length, 1);
  assert.equal(p.episodes[0].existingId, 7);
  assert.equal(p.episodes[0].opening, null, 'no se vuelve a abrir');
  assert.equal(p.episodes[0].aggregates.samples, 2, 'acumula sobre lo anterior');
  assert.equal(p.episodes[0].endedAt, en(5));
});

test('una lectura anterior al inicio del evento abierto se ignora', () => {
  // Puede llegar al reprocesar historia. Sin el filtro, el evento cerraría
  // antes de haber empezado.
  const p = plan([lec(10, 190), lec(70, 198)], { abiertos: abierto({ startedAt: en(60), lastViolationAt: en(60) }) });
  assert.equal(p.episodes[0].aggregates.samples, 2);
  assert.equal(p.episodes[0].aggregates.minVoltage, 198, 'la de 190 V quedó afuera');
});

test('un intervalo largo sin lecturas se registra como hueco', () => {
  const p = plan([lec(0, 220), lec(20, 220)], { evaluadoHasta: en(0) });
  assert.deepEqual(p.gaps, [{ startedAt: en(0), endedAt: en(20), severity: 'INFO' }]);
});

test('un intervalo corto no es hueco', () => {
  assert.equal(plan([lec(0, 220), lec(10, 220)], { evaluadoHasta: en(0) }).gaps.length, 0);
});

test('un hueco de más de una hora es advertencia', () => {
  const p = plan([lec(0, 220), lec(90, 220)], { evaluadoHasta: en(0) });
  assert.equal(p.gaps[0].severity, 'WARNING');
});

test('sin historia previa no se inventa un hueco al inicio', () => {
  const p = plan([lec(0, 220), lec(120, 220)], { evaluadoHasta: null });
  assert.equal(p.gaps.length, 1, 'solo el hueco entre las dos lecturas');
  assert.equal(p.gaps[0].startedAt, en(0));
});

test('varios huecos en la misma tanda se registran todos', () => {
  const p = plan([lec(0, 220), lec(20, 220), lec(60, 220)], { evaluadoHasta: en(0) });
  assert.equal(p.gaps.length, 2);
});
