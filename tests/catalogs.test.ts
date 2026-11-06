/**
 * Tests de los catálogos de aparatos por contexto. Dominio puro.
 *
 * Lo que importa verificar acá no es el contenido —esas listas son una
 * decisión de producto que va a cambiar— sino las invariantes que hacen que
 * los datos guardados sigan significando algo: que todo contexto tenga un
 * catálogo, que un mismo id signifique siempre lo mismo, y que un aparato ya
 * cargado no se pierda si el usuario cambia el tipo de lugar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGS,
  ALL_APPLIANCES_BY_ID,
  catalogFor,
  isKnownApplianceAnywhere,
  applianceLabelAnywhere,
} from '../src/domain/catalogs.ts';
import { CONTEXTS } from '../src/domain/installation-types.ts';

test('todo contexto apunta a un catálogo que existe', () => {
  for (const c of CONTEXTS) {
    assert.ok(CATALOGS[c.catalog], `${c.type} apunta a "${c.catalog}", que no existe`);
  }
});

test('ningún catálogo queda vacío', () => {
  for (const [id, categorias] of Object.entries(CATALOGS)) {
    assert.ok(categorias.length > 0, `el catálogo "${id}" está vacío`);
    for (const cat of categorias) {
      assert.ok(cat.items.length > 0, `la categoría "${cat.id}" de "${id}" está vacía`);
    }
  }
});

test('un mismo id significa lo mismo en todos los catálogos', () => {
  // Si "heladera" fuera una cosa en una casa y otra en un comercio, ningún
  // análisis podría agrupar los datos después.
  const vistos = new Map<string, string>();
  for (const categorias of Object.values(CATALOGS)) {
    for (const cat of categorias) {
      for (const item of cat.items) {
        const previo = vistos.get(item.id);
        if (previo !== undefined) {
          assert.equal(item.label, previo, `el id "${item.id}" tiene dos etiquetas distintas`);
        }
        vistos.set(item.id, item.label);
      }
    }
  }
});

test('ningún aparato declara un consumo imposible', () => {
  for (const [, item] of ALL_APPLIANCES_BY_ID) {
    assert.ok(item.typicalWatts > 0, `${item.id} declara ${item.typicalWatts} W`);
    assert.ok(item.typicalWatts <= 20000, `${item.id} declara ${item.typicalWatts} W, parece un error`);
  }
});

test('todos los aparatos tienen etiqueta e ícono', () => {
  for (const [id, item] of ALL_APPLIANCES_BY_ID) {
    assert.ok(item.label.trim().length > 0, `${id} no tiene etiqueta`);
    assert.ok(item.icon, `${id} no tiene ícono`);
  }
});

test('el índice completo cubre todos los catálogos', () => {
  // La validación del servidor usa este índice, no el del contexto: si el
  // usuario cambia el tipo de lugar, los aparatos ya cargados no se pierden.
  for (const categorias of Object.values(CATALOGS)) {
    for (const cat of categorias) {
      for (const item of cat.items) {
        assert.ok(isKnownApplianceAnywhere(item.id), `${item.id} no está en el índice`);
      }
    }
  }
});

test('un aparato de un catálogo sigue siendo válido en otro contexto', () => {
  // El usuario carga "compresor" como taller y después cambia a garage: el
  // dato no tiene por qué perderse.
  assert.equal(isKnownApplianceAnywhere('compresor'), true);
  assert.equal(isKnownApplianceAnywhere('respirador'), true);
  assert.equal(isKnownApplianceAnywhere('heladera'), true);
});

test('un id inventado se rechaza', () => {
  assert.equal(isKnownApplianceAnywhere('reactor_nuclear'), false);
});

test('un id desconocido se muestra tal cual en vez de romper', () => {
  assert.equal(applianceLabelAnywhere('reactor_nuclear'), 'reactor_nuclear');
  assert.equal(applianceLabelAnywhere('respirador'), 'Respirador');
});

test('cada contexto ofrece lo que corresponde a su actividad', () => {
  const ids = (c: Parameters<typeof catalogFor>[0]) =>
    catalogFor(c).flatMap((cat) => cat.items.map((i) => i.id));

  assert.ok(ids('clinica').includes('respirador'));
  assert.ok(!ids('clinica').includes('soldadora'), 'una clínica no suelda');
  assert.ok(ids('taller').includes('soldadora'));
  assert.ok(!ids('taller').includes('respirador'), 'un taller no tiene respiradores');
  assert.ok(ids('oficina').includes('impresora_laser'));
  assert.ok(ids('garage').includes('cargador_auto'));
});

test('la vivienda incluye el cargador de auto eléctrico', () => {
  // Es el consumo más grande que puede tener una casa hoy: omitirlo sesgaría
  // cualquier recomendación.
  const ids = catalogFor('vivienda').flatMap((c) => c.items.map((i) => i.id));
  assert.ok(ids.includes('cargador_auto'));
  assert.ok(ids.includes('heladera'), 'y conserva todo lo que ya tenía');
});
