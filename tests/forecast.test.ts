/**
 * Tests de caracterización de la proyección de consumo.
 *
 * El criterio central del módulo es que el medidor lleva un contador
 * ACUMULADO: la diferencia entre la primera y la última lectura captura todo
 * el consumo del período aunque no se haya muestreado en el medio. Por eso la
 * confianza depende de cuántos DÍAS abarca la serie, no de cuántas muestras
 * tiene. Varios tests de acá existen para que un refactor no invierta eso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, PROJECTION_DAYS, type ForecastBasis } from '../src/lib/forecast.ts';

const INICIO = '2026-03-01T00:00:00Z';

function base(dias: number, kwhConsumidos: number, extra: Partial<ForecastBasis> = {}): ForecastBasis {
  return {
    samples: 100,
    firstAt: INICIO,
    lastAt: new Date(Date.parse(INICIO) + dias * 86_400_000).toISOString(),
    firstEnergy: 1000,
    lastEnergy: 1000 + kwhConsumidos,
    daysWithData: Math.ceil(dias),
    ...extra,
  };
}

test('proyecta a 30 días', () => {
  assert.equal(PROJECTION_DAYS, 30);
  const f = buildForecast(base(10, 50));
  assert.equal(f.available, true);
  if (!f.available) return;
  assert.equal(f.projectionDays, 30);
});

test('el consumo medido es la diferencia del contador acumulado', () => {
  const f = buildForecast(base(10, 50));
  assert.equal(f.available, true);
  if (!f.available) return;
  assert.equal(f.measuredKwh, 50);
  assert.equal(f.dailyAverageKwh, 5); // 50 kWh / 10 días
  assert.equal(f.projectedKwh, 150); // 5 kWh/día * 30
});

test('la cantidad de muestras NO cambia la proyección, solo los días', () => {
  // Dos series del mismo período y consumo, una con 10 muestras y otra con
  // 10.000: tienen que proyectar exactamente lo mismo. Esto es lo que
  // justifica guardar cada 5 minutos en vez de cada 5 segundos.
  const pocas = buildForecast(base(10, 50, { samples: 10 }));
  const muchas = buildForecast(base(10, 50, { samples: 10_000 }));
  assert.equal(pocas.available && muchas.available, true);
  if (!pocas.available || !muchas.available) return;
  assert.equal(pocas.projectedKwh, muchas.projectedKwh);
  assert.equal(pocas.confidence, muchas.confidence);
});

test('el costo proyectado usa un mes completo de cargo fijo', () => {
  const f = buildForecast(base(10, 50));
  assert.equal(f.available, true);
  if (!f.available) return;
  assert.equal(f.cost.fixedCharge, 16000); // 150 kWh -> segundo tramo, mes entero
  assert.equal(f.cost.total, f.cost.fixedCharge + f.cost.variableCharge);
});

// ------------------------------------------------------------- confianza

test('menos de un día no se proyecta: la muestra no cubre un ciclo diario', () => {
  const f = buildForecast(base(0.5, 3));
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'insufficient_span');
});

test('exactamente un día ya se proyecta, con confianza baja', () => {
  const f = buildForecast(base(1, 5));
  assert.equal(f.available, true);
  if (!f.available) return;
  assert.equal(f.confidence, 'low');
});

test('de 1 a 3 días la confianza es baja', () => {
  for (const dias of [1, 2, 2.99]) {
    const f = buildForecast(base(dias, 10));
    assert.equal(f.available && f.confidence, 'low', `${dias} días`);
  }
});

test('de 3 a 14 días la confianza es media', () => {
  for (const dias of [3, 7, 13.99]) {
    const f = buildForecast(base(dias, 10));
    assert.equal(f.available && f.confidence, 'medium', `${dias} días`);
  }
});

test('desde 14 días la confianza es alta: cubre dos semanas completas', () => {
  for (const dias of [14, 30, 90]) {
    const f = buildForecast(base(dias, 10));
    assert.equal(f.available && f.confidence, 'high', `${dias} días`);
  }
});

// ------------------------------------------------- cuándo NO se proyecta

test('una sola muestra no alcanza', () => {
  const f = buildForecast(base(10, 50, { samples: 1 }));
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'no_data');
});

test('sin lecturas no se proyecta', () => {
  const f = buildForecast({
    samples: 0,
    firstAt: null,
    lastAt: null,
    firstEnergy: null,
    lastEnergy: null,
    daysWithData: 0,
  });
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'no_data');
  assert.equal(f.spanDays, 0);
});

test('sin valores de energía no se proyecta aunque haya muestras', () => {
  const f = buildForecast(base(10, 50, { firstEnergy: null }));
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'no_data');
});

test('si el contador retrocedió no se proyecta: el medidor se reinició', () => {
  const f = buildForecast(base(10, 0, { firstEnergy: 5000, lastEnergy: 100 }));
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'counter_decreased');
});

test('el contador que no se movió sí proyecta, con consumo cero', () => {
  // Consumo nulo es un dato real, distinto de un medidor reiniciado.
  const f = buildForecast(base(10, 0));
  assert.equal(f.available, true);
  if (!f.available) return;
  assert.equal(f.measuredKwh, 0);
  assert.equal(f.projectedKwh, 0);
});

test('el contador retrocedido se detecta ANTES que el span insuficiente', () => {
  // Importa el orden: un medidor reiniciado en media hora informa el reinicio,
  // que es la causa real, y no "faltan datos".
  const f = buildForecast(base(0.2, 0, { firstEnergy: 900, lastEnergy: 100 }));
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'counter_decreased');
});

test('un rango invertido se informa como falta de datos', () => {
  const f = buildForecast({
    samples: 50,
    firstAt: '2026-03-10T00:00:00Z',
    lastAt: '2026-03-01T00:00:00Z',
    firstEnergy: 100,
    lastEnergy: 200,
    daysWithData: 9,
  });
  assert.equal(f.available, false);
  if (f.available) return;
  assert.equal(f.reason, 'no_data');
});

test('los datos de contexto se informan siempre, se proyecte o no', () => {
  const f = buildForecast(base(10, 50, { samples: 42, daysWithData: 7 }));
  assert.equal(f.samples, 42);
  assert.equal(f.daysWithData, 7);
  assert.equal(f.spanDays, 10);
  assert.equal(f.firstAt, INICIO);

  const sin = buildForecast(base(0.5, 1, { samples: 9, daysWithData: 1 }));
  assert.equal(sin.samples, 9);
  assert.equal(sin.daysWithData, 1);
  assert.equal(sin.spanDays, 0.5);
});

test('el span se redondea a tres decimales', () => {
  const f = buildForecast(base(10.123456, 50));
  assert.equal(f.spanDays, 10.123);
});
