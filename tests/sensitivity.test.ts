/**
 * Tests del grado de sensibilidad y del cargo fijo por rol. Dominio puro.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSelectableSensitivity,
  isSensitivity,
  rangeFor,
  sensitivityOf,
  suggestedFor,
  SELECTABLE_SENSITIVITIES,
  SENSITIVITY_RANGES,
} from '../src/domain/sensitivity.ts';
import { estimateEnergyCost } from '../src/domain/tariffs.ts';
import { includesFixedCharge } from '../src/domain/meter-role.ts';

// ------------------------------------------------------- la sensibilidad

test('a mayor sensibilidad, más estrecho el rango aceptable', () => {
  // Es la regla que ordena los tres grados: si alguien quiere enterarse de
  // desviaciones chicas, el margen de tolerancia tiene que ser menor.
  const alta = SENSITIVITY_RANGES.alta;
  const media = SENSITIVITY_RANGES.media;
  const baja = SENSITIVITY_RANGES.baja;

  const ancho = (r: typeof alta) => r.highVoltageV - r.lowVoltageV;
  assert.ok(ancho(alta) < ancho(media), 'alta tiene que ser más estrecha que media');
  assert.ok(ancho(media) < ancho(baja), 'media tiene que ser más estrecha que baja');
});

test('los tres grados tienen los rangos acordados', () => {
  assert.deepEqual(SENSITIVITY_RANGES.alta, { lowVoltageV: 210, highVoltageV: 230 });
  assert.deepEqual(SENSITIVITY_RANGES.media, { lowVoltageV: 205, highVoltageV: 235 });
  assert.deepEqual(SENSITIVITY_RANGES.baja, { lowVoltageV: 200, highVoltageV: 240 });
});

test('todos los rangos encierran la tensión nominal de 220 V', () => {
  for (const grado of SELECTABLE_SENSITIVITIES) {
    const r = rangeFor(grado)!;
    assert.ok(r.lowVoltageV < 220 && r.highVoltageV > 220, `${grado} no contiene 220 V`);
  }
});

test('"personalizada" no impone ningún rango', () => {
  // Es para quien ya ajustó los umbrales a mano: un preset no debe pisarlos.
  assert.equal(rangeFor('personalizada'), null);
});

test('"personalizada" no se puede elegir, solo se hereda', () => {
  assert.equal(isSelectableSensitivity('personalizada'), false);
  assert.equal(isSensitivity('personalizada'), true);
});

test('un grado inventado se rechaza', () => {
  assert.equal(isSelectableSensitivity('altisima'), false);
  assert.equal(isSensitivity('altisima'), false);
  assert.equal(isSensitivity(3), false);
});

test('unos umbrales que coinciden con un preset se reconocen como ese grado', () => {
  // Para no mostrar "personalizada" en una configuración que en realidad es
  // uno de los tres grados.
  assert.equal(sensitivityOf({ lowVoltageV: 210, highVoltageV: 230 }), 'alta');
  assert.equal(sensitivityOf({ lowVoltageV: 205, highVoltageV: 235 }), 'media');
  assert.equal(sensitivityOf({ lowVoltageV: 200, highVoltageV: 240 }), 'baja');
});

test('unos umbrales que no coinciden con ninguno son personalizados', () => {
  // El valor histórico por defecto (±8% sobre 220 V, la tolerancia de ENRE)
  // no es ninguno de los tres grados.
  assert.equal(sensitivityOf({ lowVoltageV: 202.4, highVoltageV: 237.6 }), 'personalizada');
});

test('ida y vuelta: el grado de sus propios umbrales es él mismo', () => {
  for (const grado of SELECTABLE_SENSITIVITIES) {
    assert.equal(sensitivityOf(rangeFor(grado)!), grado);
  }
});

test('una clínica arranca con la sensibilidad más alta', () => {
  // Una caída de tensión en terapia intensiva no es lo mismo que en un
  // depósito: donde hay equipamiento crítico conviene enterarse antes.
  assert.equal(suggestedFor('clinica'), 'alta');
  assert.equal(suggestedFor('sector_clinico'), 'alta');
});

test('un taller arranca con la más baja', () => {
  // Las máquinas grandes producen caídas momentáneas al arrancar: avisar de
  // cada una llenaría la casilla de ruido.
  assert.equal(suggestedFor('taller'), 'baja');
});

test('el resto arranca en media', () => {
  assert.equal(suggestedFor('casa'), 'media');
  assert.equal(suggestedFor('area_oficina'), 'media');
  assert.equal(suggestedFor('cualquier_cosa'), 'media');
});

// ---------------------------------------------- el cargo fijo por rol

test('un medidor central lleva cargo fijo y uno de área no', () => {
  assert.equal(includesFixedCharge('central'), true);
  assert.equal(includesFixedCharge('area'), false);
});

test('sin cargo fijo, el total es solo la energía consumida', () => {
  const sinFijo = estimateEnergyCost(100, 30, false);
  assert.equal(sinFijo.fixedCharge, 0);
  assert.equal(sinFijo.total, sinFijo.variableCharge);
});

test('el tramo tarifario se elige igual, haya o no cargo fijo', () => {
  // Lo que cambia es si se suma el cargo fijo, no a qué precio se paga la
  // energía.
  const con = estimateEnergyCost(150, 30, true);
  const sin = estimateEnergyCost(150, 30, false);
  assert.deepEqual(con.tier, sin.tier);
  assert.equal(con.variableCharge, sin.variableCharge);
});

test('la diferencia entre ambos es exactamente el cargo fijo prorrateado', () => {
  const con = estimateEnergyCost(100, 30, true);
  const sin = estimateEnergyCost(100, 30, false);
  assert.equal(con.total - sin.total, 15000);
});

test('por defecto el cargo fijo se incluye: no rompe lo que ya existía', () => {
  assert.deepEqual(estimateEnergyCost(100, 30), estimateEnergyCost(100, 30, true));
});

test('la lista de grados elegibles no incluye "personalizada"', () => {
  // Si la incluyera, buscar su rango daría undefined: no tiene.
  for (const grado of SELECTABLE_SENSITIVITIES) {
    assert.notEqual(grado, 'personalizada');
    assert.ok(rangeFor(grado), `${grado} debería tener un rango`);
  }
});
