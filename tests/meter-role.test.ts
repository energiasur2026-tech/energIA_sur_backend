/**
 * Tests de dónde está instalado un medidor y de la taxonomía de contextos.
 * Dominio puro.
 *
 * La regla que gobierna todo: **los medidores no se relacionan entre sí**. Un
 * central y un área pueden convivir en la misma infraestructura y cada uno
 * mide lo suyo. De ahí se desprende cómo se presenta cada uno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billsAgainstInvoice,
  includesFixedCharge,
  parsePlacement,
  MAX_AREA_LABEL_LENGTH,
  METER_ROLES,
} from '../src/domain/meter-role.ts';
import { normalizeContext } from '../src/domain/home-types.ts';
import {
  CONTEXTS,
  contextDefinition,
  contextMatchesRole,
  contextsForRole,
  isValidContextType,
  isValidPhases,
  PHASE_LABEL,
} from '../src/domain/installation-types.ts';

// ------------------------------------------------- dónde está el medidor

test('un medidor en el tablero central no lleva nombre de área', () => {
  const r = parsePlacement({ role: 'central' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.placement, { role: 'central', areaLabel: null });
});

test('un medidor de área declara dónde está instalado', () => {
  const r = parsePlacement({ role: 'area', areaLabel: 'Terapia intensiva' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.placement, { role: 'area', areaLabel: 'Terapia intensiva' });
});

test('un área no necesita ningún otro medidor para existir', () => {
  // El producto también avisa de problemas eléctricos: para eso alcanza con
  // un medidor en el lugar que importa, sin instrumentar el tablero.
  const r = parsePlacement({ role: 'area', areaLabel: 'Garage' });
  assert.equal(r.ok, true);
});

test('el nombre del área se limpia de espacios', () => {
  const r = parsePlacement({ role: 'area', areaLabel: '  Oficina  ' });
  assert.equal(r.ok && r.placement.areaLabel, 'Oficina');
});

test('un rol inventado se rechaza', () => {
  assert.equal(parsePlacement({ role: 'principal' }).ok, false);
});

test('un central con nombre de área se rechaza', () => {
  const r = parsePlacement({ role: 'central', areaLabel: 'Garage' });
  assert.equal(r.ok === false && r.error, 'central_sin_area');
});

test('un área sin nombre se rechaza', () => {
  const r = parsePlacement({ role: 'area' });
  assert.equal(r.ok === false && r.error, 'area_sin_nombre');
});

test('un nombre de área demasiado largo se rechaza', () => {
  const r = parsePlacement({ role: 'area', areaLabel: 'x'.repeat(MAX_AREA_LABEL_LENGTH + 1) });
  assert.equal(r.ok === false && r.error, 'area_nombre_largo');
});

// ------------------------------------------- qué significa cada rol

test('solo el central se contrasta contra la factura del mes', () => {
  assert.equal(billsAgainstInvoice('central'), true);
  assert.equal(billsAgainstInvoice('area'), false, 'un área es parte de un todo');
});

test('el cargo fijo solo se suma en el central', () => {
  // Se paga una vez por instalación: sumarlo en cada área daría un número
  // inventado.
  assert.equal(includesFixedCharge('central'), true);
  assert.equal(includesFixedCharge('area'), false);
});

// --------------------------------------------------- tipos de contexto

test('cada contexto pertenece a un solo rol', () => {
  for (const c of CONTEXTS) {
    assert.ok(METER_ROLES.includes(c.role), `${c.type} tiene un rol desconocido`);
  }
});

test('un medidor central elige entre infraestructuras completas', () => {
  const tipos = contextsForRole('central').map((c) => c.type);
  for (const esperado of ['casa', 'depto', 'clinica', 'taller', 'comercio', 'concesionaria']) {
    assert.ok(tipos.includes(esperado as never), `falta ${esperado}`);
  }
  assert.ok(!tipos.includes('area_garage' as never), 'un tablero no es un garage');
});

test('un medidor de área elige entre áreas', () => {
  const tipos = contextsForRole('area').map((c) => c.type);
  for (const esperado of ['ambiente_unico', 'area_oficina', 'area_taller', 'sector_clinico']) {
    assert.ok(tipos.includes(esperado as never), `falta ${esperado}`);
  }
  assert.ok(!tipos.includes('clinica' as never), 'un área no es una clínica entera');
});

test('un contexto no se puede usar con el rol equivocado', () => {
  assert.equal(contextMatchesRole('casa', 'central'), true);
  assert.equal(contextMatchesRole('casa', 'area'), false);
  assert.equal(contextMatchesRole('area_garage', 'area'), true);
  assert.equal(contextMatchesRole('area_garage', 'central'), false);
});

test('solo las viviendas y el edificio de oficinas preguntan por pisos', () => {
  const conPisos = CONTEXTS.filter((c) => c.hasFloors).map((c) => c.type);
  assert.deepEqual(conPisos.sort(), ['casa', 'depto', 'oficina_edificio']);
});

test('las subdivisiones se llaman distinto según el contexto', () => {
  // Llamarle "ambiente" al quirófano de una clínica haría que el formulario
  // se sienta ajeno, y un formulario ajeno se abandona.
  assert.equal(contextDefinition('casa')?.subdivision.plural, 'Ambientes');
  assert.equal(contextDefinition('clinica')?.subdivision.plural, 'Sectores');
  assert.equal(contextDefinition('taller')?.subdivision.plural, 'Sectores');
});

test('cada contexto ofrece el catálogo de aparatos que le corresponde', () => {
  assert.equal(contextDefinition('casa')?.catalog, 'vivienda');
  assert.equal(contextDefinition('area_oficina')?.catalog, 'oficina');
  assert.equal(contextDefinition('area_taller')?.catalog, 'taller');
  assert.equal(contextDefinition('sector_clinico')?.catalog, 'clinica');
  assert.equal(contextDefinition('area_garage')?.catalog, 'garage');
  assert.equal(contextDefinition('area_cocina')?.catalog, 'cocina_comercial');
});

test('un área de un solo ambiente no se subdivide', () => {
  // Pedirle sectores a una oficina sería una pregunta sin sentido.
  assert.equal(contextDefinition('area_oficina')?.hasSubdivisions, false);
  assert.equal(contextDefinition('ambiente_unico')?.hasSubdivisions, false);
  assert.equal(contextDefinition('dos_ambientes')?.hasSubdivisions, true);
});

test('no hay tipos de contexto repetidos', () => {
  const tipos = CONTEXTS.map((c) => c.type);
  assert.equal(new Set(tipos).size, tipos.length);
});

test('un tipo inventado se rechaza', () => {
  assert.equal(isValidContextType('casa'), true);
  assert.equal(isValidContextType('mansion'), false);
  assert.equal(isValidContextType(7), false);
});

// ----------------------------------------------------------- las fases

test('el equipo es monofásico o trifásico, nada más', () => {
  assert.equal(isValidPhases(1), true);
  assert.equal(isValidPhases(3), true);
  assert.equal(isValidPhases(2), false);
  assert.equal(isValidPhases('3'), false);
});

test('cada cantidad de fases tiene su nombre', () => {
  assert.equal(PHASE_LABEL[1], 'Monofásico');
  assert.equal(PHASE_LABEL[3], 'Trifásico');
});

// --------------------------------------- normalización del contexto

test('una oficina no guarda pisos: la pregunta no aplica', () => {
  const n = normalizeContext({ contextType: 'area_oficina', floors: 3, rooms: [] });
  assert.equal(n.floors, null);
});

test('una casa conserva sus pisos', () => {
  const n = normalizeContext({ contextType: 'casa', floors: 2, rooms: [] });
  assert.equal(n.floors, 2);
});

test('una casa sin pisos declarados asume uno', () => {
  const n = normalizeContext({ contextType: 'casa', floors: null, rooms: [] });
  assert.equal(n.floors, 1);
});

test('un contexto que no se subdivide guarda una sola subdivisión', () => {
  // Pedirle sectores a una oficina sería una pregunta sin sentido; si el
  // formulario manda varias, se queda con la primera en vez de inventar.
  const n = normalizeContext({
    contextType: 'area_oficina',
    floors: null,
    rooms: [
      { name: 'Oficina', appliances: ['computadora'] },
      { name: 'De más', appliances: [] },
    ],
  });
  assert.equal(n.rooms.length, 1);
  assert.equal(n.rooms[0].name, 'Oficina');
});

test('una clínica conserva todos sus sectores', () => {
  const n = normalizeContext({
    contextType: 'clinica',
    floors: null,
    rooms: [
      { name: 'Terapia intensiva', appliances: [] },
      { name: 'Quirófano', appliances: [] },
      { name: 'Guardia', appliances: [] },
    ],
  });
  assert.equal(n.rooms.length, 3);
});

test('un tipo desconocido se devuelve sin tocar', () => {
  const entrada = { contextType: 'inventado' as never, floors: 9, rooms: [] };
  assert.deepEqual(normalizeContext(entrada), entrada);
});

// ------------------------------- sugerencias propias de cada contexto

test('cada contexto que se subdivide sugiere nombres de su actividad', () => {
  // Ofrecerle "Dormitorio 1" al encargado de un depósito es exactamente el
  // formulario ajeno que hay que evitar.
  assert.ok(contextDefinition('casa')?.subdivision.suggestions.includes('Cocina'));
  assert.ok(contextDefinition('clinica')?.subdivision.suggestions.includes('Terapia intensiva'));
  assert.ok(contextDefinition('taller')?.subdivision.suggestions.includes('Playa'));
  assert.ok(contextDefinition('comercio')?.subdivision.suggestions.includes('Vidriera'));
  assert.ok(contextDefinition('deposito')?.subdivision.suggestions.includes('Carga y descarga'));
});

test('ningún contexto sugiere nombres de otra actividad', () => {
  assert.ok(!contextDefinition('deposito')?.subdivision.suggestions.includes('Dormitorio 1'));
  assert.ok(!contextDefinition('clinica')?.subdivision.suggestions.includes('Living'));
});

test('todo contexto conocido que se subdivide trae sugerencias propias', () => {
  // "Otra" es la excepción legítima: si no se sabe qué lugar es, inventar
  // nombres sería peor que dejar el campo en blanco.
  const genericos = ['otra_infraestructura', 'otra_area'];

  for (const c of CONTEXTS) {
    if (!c.hasSubdivisions || genericos.includes(c.type)) continue;
    assert.ok(
      c.subdivision.suggestions.length > 0,
      `${c.type} se subdivide pero no sugiere ningún nombre`
    );
  }
});
