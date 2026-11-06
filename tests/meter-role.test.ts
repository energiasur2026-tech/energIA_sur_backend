/**
 * Tests del rol del medidor dentro de la instalación. Dominio puro.
 *
 * La regla que gobierna todo: el medidor de área está eléctricamente aguas
 * abajo del central, así que su energía ya pasó por los dos. El total de la
 * instalación es el central; **nunca se suman**.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBreakdown,
  parsePlacement,
  MAX_AREA_LABEL_LENGTH,
  type MeasuredMeter,
} from '../src/domain/meter-role.ts';

// ------------------------------------------------------------- validación

test('un medidor central no cuelga de nadie ni lleva nombre de área', () => {
  const r = parsePlacement({ deviceId: 'abc', role: 'central' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.placement, { role: 'central', areaLabel: null, parentDeviceId: null });
});

test('un medidor de área declara dónde está y de qué central depende', () => {
  const r = parsePlacement({
    deviceId: 'abc',
    role: 'area',
    areaLabel: 'Terapia intensiva',
    parentDeviceId: 'central-1',
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.placement, {
    role: 'area',
    areaLabel: 'Terapia intensiva',
    parentDeviceId: 'central-1',
  });
});

test('el nombre del área se limpia de espacios', () => {
  const r = parsePlacement({
    deviceId: 'abc',
    role: 'area',
    areaLabel: '  Garage  ',
    parentDeviceId: 'c1',
  });
  assert.equal(r.ok && r.placement.areaLabel, 'Garage');
});

test('un rol inventado se rechaza', () => {
  const r = parsePlacement({ deviceId: 'abc', role: 'principal' });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error, 'role_invalido');
});

test('un central con padre se rechaza', () => {
  const r = parsePlacement({ deviceId: 'abc', role: 'central', parentDeviceId: 'otro' });
  assert.equal(r.ok === false && r.error, 'central_no_cuelga');
});

test('un central con nombre de área se rechaza', () => {
  const r = parsePlacement({ deviceId: 'abc', role: 'central', areaLabel: 'Garage' });
  assert.equal(r.ok === false && r.error, 'central_sin_area');
});

test('un área sin padre se rechaza', () => {
  const r = parsePlacement({ deviceId: 'abc', role: 'area', areaLabel: 'Garage' });
  assert.equal(r.ok === false && r.error, 'area_sin_padre');
});

test('un área sin nombre se rechaza', () => {
  const r = parsePlacement({ deviceId: 'abc', role: 'area', parentDeviceId: 'c1' });
  assert.equal(r.ok === false && r.error, 'area_sin_nombre');
});

test('un área que cuelga de sí misma se rechaza', () => {
  const r = parsePlacement({
    deviceId: 'abc',
    role: 'area',
    areaLabel: 'Garage',
    parentDeviceId: 'abc',
  });
  assert.equal(r.ok === false && r.error, 'area_cuelga_de_si_misma');
});

test('un nombre de área demasiado largo se rechaza', () => {
  const r = parsePlacement({
    deviceId: 'abc',
    role: 'area',
    areaLabel: 'x'.repeat(MAX_AREA_LABEL_LENGTH + 1),
    parentDeviceId: 'c1',
  });
  assert.equal(r.ok === false && r.error, 'area_nombre_largo');
});

// --------------------------------------------------------------- desglose

function central(consumedKwh: number | null): MeasuredMeter {
  return {
    deviceId: 'tablero',
    name: 'Tablero principal',
    role: 'central',
    areaLabel: null,
    parentDeviceId: null,
    consumedKwh,
  };
}

function area(id: string, label: string, consumedKwh: number | null, padre = 'tablero'): MeasuredMeter {
  return {
    deviceId: id,
    name: label,
    role: 'area',
    areaLabel: label,
    parentDeviceId: padre,
    consumedKwh,
  };
}

test('el total de la instalación es el central, NO la suma', () => {
  // Es la regla central: el área ya está contada dentro del tablero.
  const b = buildBreakdown(central(100), [area('a1', 'Oficina', 30)]);
  assert.equal(b.totalKwh, 100, 'no 130');
});

test('cada área informa qué parte del total representa', () => {
  const b = buildBreakdown(central(200), [area('a1', 'Oficina', 50), area('a2', 'Taller', 100)]);
  assert.deepEqual(
    b.areas.map((a) => [a.areaLabel, a.consumedKwh, a.shareOfTotalPct]),
    [
      ['Oficina', 50, 25],
      ['Taller', 100, 50],
    ]
  );
});

test('lo que no cubre ningún área se informa como consumo sin desglosar', () => {
  // Dice cuánto de la instalación falta instrumentar.
  const b = buildBreakdown(central(200), [area('a1', 'Oficina', 50), area('a2', 'Taller', 100)]);
  assert.equal(b.unmeasuredKwh, 50);
});

test('sin áreas, todo el consumo está sin desglosar', () => {
  const b = buildBreakdown(central(80), []);
  assert.equal(b.unmeasuredKwh, 80);
  assert.deepEqual(b.areas, []);
});

test('solo se consideran las áreas que cuelgan de ESE central', () => {
  const ajena = area('a9', 'De otra instalación', 40, 'otro-tablero');
  const b = buildBreakdown(central(100), [area('a1', 'Oficina', 30), ajena]);
  assert.equal(b.areas.length, 1);
  assert.equal(b.unmeasuredKwh, 70);
});

test('si un área no tiene datos, el resto no se afirma', () => {
  // Decir "sin desglosar: 70" cuando falta medir un área sería inventar.
  const b = buildBreakdown(central(100), [area('a1', 'Oficina', 30), area('a2', 'Taller', null)]);
  assert.equal(b.unmeasuredKwh, null);
  assert.equal(b.areas.length, 1, 'solo se listan las que sí tienen datos');
});

test('sin datos del central no hay total ni resto', () => {
  const b = buildBreakdown(central(null), [area('a1', 'Oficina', 30)]);
  assert.equal(b.totalKwh, null);
  assert.equal(b.unmeasuredKwh, null);
  assert.equal(b.areas[0].shareOfTotalPct, 0, 'sin total no hay porcentaje que calcular');
});

test('si las áreas suman más que el central, se marca como inconsistente', () => {
  // No debería pasar: indica un área que no cuelga realmente de ese central,
  // o períodos desalineados entre medidores.
  const b = buildBreakdown(central(50), [area('a1', 'Oficina', 40), area('a2', 'Taller', 30)]);
  assert.equal(b.inconsistent, true);
  assert.equal(b.unmeasuredKwh, 0, 'el resto nunca es negativo');
});

test('una instalación coherente no se marca como inconsistente', () => {
  const b = buildBreakdown(central(100), [area('a1', 'Oficina', 30)]);
  assert.equal(b.inconsistent, false);
});

test('las áreas que cubren exactamente el total dejan resto cero', () => {
  const b = buildBreakdown(central(100), [area('a1', 'Oficina', 60), area('a2', 'Taller', 40)]);
  assert.equal(b.unmeasuredKwh, 0);
  assert.equal(b.inconsistent, false);
});
