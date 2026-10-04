/**
 * Tests de caracterización del cálculo de costo de energía (cuadro SPSE,
 * Residencial sin subsidio).
 *
 * Fijan el comportamiento actual antes de refactorizar. Incluyen un caso que
 * documenta un error real del cuadro de tramos: ver el test marcado HALLAZGO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateEnergyCost, RESIDENCIAL_SIN_SUBSIDIO } from '../src/lib/tariffs.ts';

test('el cuadro tiene los 5 tramos esperados', () => {
  assert.equal(RESIDENCIAL_SIN_SUBSIDIO.length, 5);
  assert.deepEqual(
    RESIDENCIAL_SIN_SUBSIDIO.map((t) => [t.minKwh, t.maxKwh]),
    [
      [0, 100],
      [101, 200],
      [201, 300],
      [301, 400],
      [401, 99999],
    ]
  );
});

test('elige el tramo según el consumo total del período', () => {
  assert.equal(estimateEnergyCost(50, 30).tier.valorTramo, 116.053);
  assert.equal(estimateEnergyCost(150, 30).tier.valorTramo, 120.293);
  assert.equal(estimateEnergyCost(250, 30).tier.valorTramo, 124.224);
  assert.equal(estimateEnergyCost(350, 30).tier.valorTramo, 127.211);
  assert.equal(estimateEnergyCost(500, 30).tier.valorTramo, 128.78);
});

test('el cargo variable se cobra sobre TODO el consumo, no por tramos', () => {
  // No es progresivo: 150 kWh se cobran enteros al valor del segundo tramo.
  const c = estimateEnergyCost(150, 30);
  assert.equal(c.variableCharge, round2(120.293 * 150));
});

test('un mes completo cobra el cargo fijo entero', () => {
  const c = estimateEnergyCost(50, 30);
  assert.equal(c.fixedCharge, 15000);
});

test('el cargo fijo se prorratea por los días del período', () => {
  assert.equal(estimateEnergyCost(50, 1).fixedCharge, 500); // 15000 / 30
  assert.equal(estimateEnergyCost(50, 15).fixedCharge, 7500);
  assert.equal(estimateEnergyCost(50, 7).fixedCharge, 3500);
});

test('un período más largo que un mes cobra más que el cargo fijo mensual', () => {
  assert.equal(estimateEnergyCost(50, 60).fixedCharge, 30000);
});

test('el total es la suma de cargo fijo y variable', () => {
  const c = estimateEnergyCost(123.45, 17);
  assert.equal(c.total, round2(c.fixedCharge + c.variableCharge));
});

test('todos los importes vienen redondeados a dos decimales', () => {
  const c = estimateEnergyCost(33.333, 11);
  for (const v of [c.fixedCharge, c.variableCharge, c.total]) {
    assert.equal(v, round2(v), `${v} no está redondeado a 2 decimales`);
  }
});

test('consumo cero cobra solo el cargo fijo prorrateado', () => {
  const c = estimateEnergyCost(0, 30);
  assert.equal(c.variableCharge, 0);
  assert.equal(c.fixedCharge, 15000);
  assert.equal(c.total, 15000);
});

test('los bordes exactos de cada tramo caen donde corresponde', () => {
  assert.equal(estimateEnergyCost(100, 30).tier.cargoFijo, 15000);
  assert.equal(estimateEnergyCost(101, 30).tier.cargoFijo, 16000);
  assert.equal(estimateEnergyCost(200, 30).tier.cargoFijo, 16000);
  assert.equal(estimateEnergyCost(201, 30).tier.cargoFijo, 17000);
  assert.equal(estimateEnergyCost(400, 30).tier.cargoFijo, 18000);
  assert.equal(estimateEnergyCost(401, 30).tier.cargoFijo, 22000);
});

test('CORREGIDO: un consumo entre 100 y 101 kWh cae en el tramo siguiente', () => {
  // Los tramos del cuadro se expresan en enteros, así que entre uno y el
  // siguiente queda un hueco. Antes, un consumo de 100.5 kWh no pertenecía a
  // ninguno y terminaba en el tramo de reserva (el de más de 400 kWh, el más
  // caro): consumir 100.5 kWh costaba MÁS que consumir 150.
  const c = estimateEnergyCost(100.5, 30);
  assert.equal(c.tier.cargoFijo, 16000, 'el tramo de 101 a 200, no el más caro');
  assert.equal(c.tier.valorTramo, 120.293);

  // La propiedad que importa: consumir más nunca puede salir más barato.
  assert.ok(
    c.total < estimateEnergyCost(150, 30).total,
    '100.5 kWh tiene que costar menos que 150 kWh'
  );
});

test('CORREGIDO: los otros tres huecos del cuadro caen donde corresponde', () => {
  assert.equal(estimateEnergyCost(200.5, 30).tier.cargoFijo, 17000);
  assert.equal(estimateEnergyCost(300.5, 30).tier.cargoFijo, 18000);
  assert.equal(estimateEnergyCost(400.5, 30).tier.cargoFijo, 22000);
});

test('el costo nunca baja al consumir más: la función es monótona', () => {
  // Esta es la propiedad que el error rompía, y la que evita que vuelva a
  // romperse si algún día se tocan los tramos.
  let anterior = -1;
  for (let kwh = 0; kwh <= 500; kwh += 0.25) {
    const total = estimateEnergyCost(kwh, 30).total;
    assert.ok(total >= anterior, `consumir ${kwh} kWh salió más barato que ${kwh - 0.25}`);
    anterior = total;
  }
});

test('un consumo enorme usa el último tramo', () => {
  assert.equal(estimateEnergyCost(500000, 30).tier.cargoFijo, 22000);
});

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
