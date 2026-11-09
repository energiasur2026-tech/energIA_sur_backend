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
  parseThresholds,
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

// ------------------------------------------- umbrales escritos a mano

test('unos umbrales válidos se aceptan', () => {
  const r = parseThresholds({ lowVoltageV: 202.4, highVoltageV: 237.6 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.thresholds.lowVoltageV, 202.4);
  assert.equal(r.thresholds.highVoltageV, 237.6);
});

test('"personalizada" deja de ser una puerta de ida', () => {
  // Era el problema: un medidor que elegía un grado no tenía forma de volver
  // a sus umbrales propios sin una consulta SQL.
  const r = parseThresholds({ lowVoltageV: 202.4, highVoltageV: 237.6 });
  assert.equal(r.ok && r.thresholds.sensitivity, 'personalizada');
});

test('unos umbrales que coinciden con un preset SON ese grado', () => {
  // 210-230 es sensibilidad alta, los haya escrito el usuario o elegido de
  // la lista. Marcarlos "personalizada" sería mentirle a la pantalla.
  const r = parseThresholds({ lowVoltageV: 210, highVoltageV: 230 });
  assert.equal(r.ok && r.thresholds.sensitivity, 'alta');
});

test('faltando una de las dos tensiones se rechaza', () => {
  assert.equal(parseThresholds({ lowVoltageV: 200 }).ok, false);
  assert.equal(parseThresholds({}).ok, false);
  assert.equal(parseThresholds(null).ok, false);
});

test('una tensión que no es número se rechaza', () => {
  const r = parseThresholds({ lowVoltageV: 'doscientos', highVoltageV: 240 });
  assert.equal(r.ok === false && r.error, 'tension_no_numerica');
});

test('una tensión disparatada se rechaza', () => {
  assert.equal(
    parseThresholds({ lowVoltageV: 2000, highVoltageV: 2400 }).ok === false,
    true
  );
  assert.equal(
    parseThresholds({ lowVoltageV: 10, highVoltageV: 240 }).ok === false,
    true
  );
});

test('el umbral bajo tiene que ser menor que el alto', () => {
  const r = parseThresholds({ lowVoltageV: 240, highVoltageV: 200 });
  assert.equal(r.ok === false && r.error, 'tension_invertida');
});

test('una banda más angosta que la histéresis se rechaza', () => {
  // La histéresis es de 2 V de cada lado: con una banda de 3 V las zonas de
  // recuperación se pisarían y una anomalía nunca podría cerrar.
  const r = parseThresholds({ lowVoltageV: 219, highVoltageV: 222 });
  assert.equal(r.ok === false && r.error, 'banda_demasiado_angosta');
});

test('la corriente y el intervalo son opcionales', () => {
  const r = parseThresholds({ lowVoltageV: 200, highVoltageV: 240 });
  assert.equal(r.ok && r.thresholds.overcurrentA, null);
  assert.equal(r.ok && r.thresholds.gapMinutes, null);
});

test('si vienen, la corriente y el intervalo se validan', () => {
  const ok = parseThresholds({ lowVoltageV: 200, highVoltageV: 240, overcurrentA: 20, gapMinutes: 30 });
  assert.equal(ok.ok && ok.thresholds.overcurrentA, 20);
  assert.equal(ok.ok && ok.thresholds.gapMinutes, 30);

  assert.equal(
    parseThresholds({ lowVoltageV: 200, highVoltageV: 240, overcurrentA: 9999 }).ok,
    false
  );
  assert.equal(
    parseThresholds({ lowVoltageV: 200, highVoltageV: 240, gapMinutes: 0 }).ok,
    false
  );
  assert.equal(
    parseThresholds({ lowVoltageV: 200, highVoltageV: 240, gapMinutes: 1.5 }).ok,
    false
  );
});

test('ida y vuelta: elegir un grado y volver a los umbrales originales', () => {
  // El recorrido completo del problema reportado.
  const originales = { lowVoltageV: 202.4, highVoltageV: 237.6 };
  assert.equal(sensitivityOf(originales), 'personalizada');

  const preset = rangeFor('alta')!;
  assert.equal(sensitivityOf(preset), 'alta');

  const vuelta = parseThresholds(originales);
  assert.equal(vuelta.ok, true);
  if (!vuelta.ok) return;
  assert.equal(vuelta.thresholds.lowVoltageV, 202.4);
  assert.equal(vuelta.thresholds.sensitivity, 'personalizada');
});
