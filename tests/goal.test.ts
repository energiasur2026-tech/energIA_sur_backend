/**
 * Tests de caracterización del objetivo mensual de consumo.
 *
 * Fijan el comportamiento actual antes de refactorizar. Varias decisiones de
 * este módulo son sutiles y fáciles de romper sin darse cuenta: el ritmo se
 * calcula sobre los días MEDIDOS y no sobre los transcurridos, lo esperado se
 * compara contra la misma ventana, y el mes se corta en hora argentina.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetToKwh,
  kwhToBudget,
  monthBoundsArgentina,
  buildGoalProgress,
} from '../src/lib/goal.ts';

// ---------------------------------------------------------------- conversión

test('un presupuesto en pesos se convierte al consumo que lo produce', () => {
  // (20000 - 15000) / 116.053 = 43.08 -> cae en el primer tramo
  assert.equal(budgetToKwh(20000), 43.1);
});

test('la conversión elige el tramo coherente con el consumo resultante', () => {
  // (30000 - 16000) / 120.293 = 116.38 -> cae en el segundo tramo
  assert.equal(budgetToKwh(30000), 116.4);
});

test('un presupuesto que no cubre el cargo fijo más barato no tiene solución', () => {
  assert.equal(budgetToKwh(10000), null);
  assert.equal(budgetToKwh(0), null);
});

test('ida y vuelta: convertir a pesos y volver da aproximadamente lo mismo', () => {
  const kwh = 150;
  const pesos = kwhToBudget(kwh);
  const vuelta = budgetToKwh(pesos);
  assert.ok(vuelta !== null && Math.abs(vuelta - kwh) < 0.5, `${vuelta} vs ${kwh}`);
});

test('el costo de una meta usa un mes completo de cargo fijo', () => {
  // 15000 de cargo fijo + 116.053 * 100
  assert.equal(kwhToBudget(100), 26605.3);
});

// ------------------------------------------------------------ límites del mes

test('el mes se corta a medianoche argentina, no UTC', () => {
  const { start } = monthBoundsArgentina(new Date('2026-03-15T12:00:00Z'));
  // Medianoche del 1 de marzo en Argentina (UTC-3) son las 03:00 UTC.
  assert.equal(start.toISOString(), '2026-03-01T03:00:00.000Z');
});

test('cuenta bien los días del mes', () => {
  assert.equal(monthBoundsArgentina(new Date('2026-03-15T12:00:00Z')).daysInMonth, 31);
  assert.equal(monthBoundsArgentina(new Date('2026-04-15T12:00:00Z')).daysInMonth, 30);
  assert.equal(monthBoundsArgentina(new Date('2026-02-15T12:00:00Z')).daysInMonth, 28);
});

test('reconoce febrero de un año bisiesto', () => {
  assert.equal(monthBoundsArgentina(new Date('2028-02-15T12:00:00Z')).daysInMonth, 29);
});

test('los días transcurridos se miden desde el inicio del mes', () => {
  const { elapsedDays } = monthBoundsArgentina(new Date('2026-03-15T12:00:00Z'));
  assert.equal(elapsedDays, 14.375); // 14 días y 9 horas
});

test('el primer día del mes cuenta como un día entero, nunca menos', () => {
  // Sin este piso, dividir por una fracción muy chica dispararía
  // proyecciones absurdas en las primeras horas del mes.
  const { elapsedDays } = monthBoundsArgentina(new Date('2026-03-01T04:00:00Z'));
  assert.equal(elapsedDays, 1);
});

test('las últimas horas del mes ya casi suman el mes entero', () => {
  const { elapsedDays, daysInMonth } = monthBoundsArgentina(new Date('2026-03-31T23:00:00Z'));
  assert.ok(elapsedDays < daysInMonth);
  assert.ok(elapsedDays > daysInMonth - 1);
});

// -------------------------------------------------------------------- avance

const AHORA = new Date('2026-03-15T12:00:00Z'); // marzo, 14.375 días transcurridos

test('sin objetivo definido devuelve "no_goal" y nada calculado', () => {
  const p = buildGoalProgress({ goalKwh: null, inputMode: 'kwh', consumedKwh: 42, now: AHORA });
  assert.equal(p.status, 'no_goal');
  assert.equal(p.goalKwh, null);
  assert.equal(p.goalCostArs, null);
  assert.equal(p.projectedMonthKwh, null);
  assert.equal(p.allowedPerDayKwh, null);
  // El consumo sí se informa aunque no haya meta.
  assert.equal(p.consumedKwh, 42);
});

test('con objetivo pero sin lecturas devuelve "no_data" y el cupo permitido', () => {
  const p = buildGoalProgress({ goalKwh: 300, inputMode: 'kwh', consumedKwh: null, now: AHORA });
  assert.equal(p.status, 'no_data');
  assert.equal(p.allowedPerDayKwh, 9.677); // 300 / 31
  assert.equal(p.allowedPerWeekKwh, 67.74);
  assert.equal(p.dailyRateKwh, null);
});

test('un rango de fechas sin extremos también es "no_data"', () => {
  const p = buildGoalProgress({
    goalKwh: 300,
    inputMode: 'kwh',
    consumedKwh: 100,
    measuredFrom: null,
    measuredTo: null,
    now: AHORA,
  });
  assert.equal(p.status, 'no_data');
});

function conDatos(goalKwh: number, consumedKwh: number, dias: number) {
  const from = '2026-03-01T03:00:00Z';
  const to = new Date(Date.parse(from) + dias * 86_400_000).toISOString();
  return buildGoalProgress({
    goalKwh,
    inputMode: 'kwh',
    consumedKwh,
    measuredFrom: from,
    measuredTo: to,
    now: AHORA,
  });
}

test('el ritmo diario sale de los días MEDIDOS, no de los transcurridos', () => {
  // 100 kWh en 10 días medidos = 10 kWh/día, aunque hayan pasado 14.375 días.
  // Dividir por los transcurridos daría 6.96 y subestimaría el consumo de un
  // medidor que arrancó a mitad de mes.
  const p = conDatos(300, 100, 10);
  assert.equal(p.measuredDays, 10);
  assert.equal(p.dailyRateKwh, 10);
  assert.equal(p.elapsedDays, 14.375);
});

test('la proyección extiende el ritmo medido a todo el mes', () => {
  const p = conDatos(300, 100, 10);
  assert.equal(p.projectedMonthKwh, 310); // 10 kWh/día * 31 días
});

test('lo esperado se mide sobre la misma ventana que lo consumido', () => {
  // Si se comparara contra el mes entero, un medidor con pocos días de datos
  // parecería siempre por debajo de la meta.
  const p = conDatos(300, 100, 10);
  assert.equal(p.expectedKwh, 96.77); // 9.677 kWh/día permitidos * 10 días
  assert.equal(p.deviationKwh, 3.23);
  assert.equal(p.deviationPct, 3.3);
});

test('la cobertura muestra qué parte del mes transcurrido se midió', () => {
  const p = conDatos(300, 100, 10);
  assert.equal(p.coverage, 0.696); // 10 / 14.375
});

test('la cobertura nunca pasa de 1 aunque haya más días medidos que transcurridos', () => {
  const p = conDatos(300, 100, 20);
  assert.equal(p.coverage, 1);
});

test('"on_track" cuando la proyección queda por debajo de la meta', () => {
  const p = conDatos(400, 100, 10); // proyecta 310 contra una meta de 400
  assert.equal(p.status, 'on_track');
});

test('"at_risk" cuando se pasa, pero por menos del 15%', () => {
  const p = conDatos(300, 100, 10); // proyecta 310; el límite es 345
  assert.equal(p.status, 'at_risk');
});

test('"over" cuando se pasa por más del 15%', () => {
  const p = conDatos(250, 100, 10); // proyecta 310; el límite es 287.5
  assert.equal(p.status, 'over');
});

test('justo en la meta todavía es "on_track"', () => {
  const p = conDatos(310, 100, 10); // proyecta exactamente 310
  assert.equal(p.status, 'on_track');
});

test('justo en el límite del 15% todavía es "at_risk", no "over"', () => {
  // meta 269.57 -> 269.57 * 1.15 = 310.0 aprox
  const p = conDatos(269.57, 100, 10);
  assert.equal(p.status, 'at_risk');
});

test('el cupo restante reparte lo que queda de meta entre los días que faltan', () => {
  const p = conDatos(300, 100, 10);
  // (300 - 100) / (31 - 14.375) = 200 / 16.625
  assert.equal(p.remainingPerDayKwh, 12.03);
});

test('si ya se pasó la meta, el cupo restante es cero y no negativo', () => {
  const p = conDatos(300, 500, 10);
  assert.equal(p.remainingPerDayKwh, 0);
  assert.equal(p.status, 'over');
});

test('la meta se informa también convertida a pesos', () => {
  const p = conDatos(300, 100, 10);
  assert.equal(p.goalCostArs, kwhToBudget(300));
  assert.equal(p.projectedCostArs, kwhToBudget(310));
});

test('el modo de carga elegido por el usuario se conserva', () => {
  const p = buildGoalProgress({
    goalKwh: 200,
    inputMode: 'ars',
    consumedKwh: null,
    now: AHORA,
  });
  assert.equal(p.inputMode, 'ars');
});

test('unas pocas horas de lecturas cuentan como un día entero', () => {
  // Sin ese piso, 2 horas de datos darían un ritmo diario disparatado.
  const p = buildGoalProgress({
    goalKwh: 300,
    inputMode: 'kwh',
    consumedKwh: 5,
    measuredFrom: '2026-03-01T03:00:00Z',
    measuredTo: '2026-03-01T05:00:00Z',
    now: AHORA,
  });
  assert.equal(p.measuredDays, 1);
  assert.equal(p.dailyRateKwh, 5);
});

test('un rango invertido o de duración cero se trata como sin datos', () => {
  const p = buildGoalProgress({
    goalKwh: 300,
    inputMode: 'kwh',
    consumedKwh: 100,
    measuredFrom: '2026-03-10T00:00:00Z',
    measuredTo: '2026-03-01T00:00:00Z',
    now: AHORA,
  });
  assert.equal(p.status, 'no_data');
});

// ------------------------------------- huecos entre tramos del tarifario

test('CORREGIDO: un presupuesto en el salto entre tramos ya no es "imposible"', () => {
  // Pasar de 100 a 101 kWh sube el cargo fijo de 15000 a 16000, así que hay
  // un rango de presupuestos que ningún consumo cuesta exactamente. Antes la
  // función devolvía null, como si el presupuesto no sirviera. Ahora informa
  // lo máximo que se puede consumir sin pasarse.
  const costoDe100 = kwhToBudget(100); // 26605.3
  const enElSalto = costoDe100 + 100; // cae en el hueco

  const kwh = budgetToKwh(enElSalto);
  assert.notEqual(kwh, null, 'el presupuesto tiene que tener respuesta');
  assert.equal(kwh, 100, 'lo máximo alcanzable es el tope del tramo anterior');
});

test('el consumo devuelto no se pasa del presupuesto más allá del redondeo', () => {
  // La propiedad que importa: si el usuario dice "quiero gastar X", el
  // consumo devuelto tiene que costar X, no mucho más.
  //
  // El resultado se redondea a un decimal de kWh, y ese redondeo puede subir.
  // Medio escalón de 0.1 kWh al valor de tramo más caro son unos 6.44 pesos:
  // esa es toda la holgura admisible. Si algún día se pasa de ahí, el cálculo
  // se rompió, no es el redondeo.
  const holgura = 0.05 * 128.78;

  for (let presupuesto = 16000; presupuesto <= 80000; presupuesto += 250) {
    const kwh = budgetToKwh(presupuesto);
    if (kwh === null) continue;
    const costo = kwhToBudget(kwh);
    assert.ok(
      costo <= presupuesto + holgura,
      `con $${presupuesto} devolvió ${kwh} kWh, que cuesta ${costo}`
    );
  }
});

test('un presupuesto que no cubre el cargo fijo más barato sigue sin solución', () => {
  assert.equal(budgetToKwh(14999), null);
});
