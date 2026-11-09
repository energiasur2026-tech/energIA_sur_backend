/**
 * Tests de la vinculación de medidores. Dominio puro.
 *
 * Lo que se verifica acá son las reglas, no las consultas: qué identificador
 * se acepta, quién puede desvincular y qué se pierde al hacerlo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUnlink,
  canView,
  parseDeviceId,
  parseMeterName,
  DEVICE_ID_MIN,
  DEVICE_ID_MAX,
  MAX_METER_NAME_LENGTH,
  UNLINK_CONSEQUENCES,
} from '../src/domain/device-linking.ts';

// ----------------------------------------------- el identificador

test('acepta un identificador real de Tuya', () => {
  const r = parseDeviceId('eb5095128f6c50f96akbbq');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.deviceId, 'eb5095128f6c50f96akbbq');
});

test('limpia los espacios al pegar', () => {
  // Es el error más común: el identificador se copia de una etiqueta o de un
  // mail y casi siempre arrastra algo.
  const r = parseDeviceId('  eb5095128f6c50f96akbbq\n');
  assert.equal(r.ok && r.deviceId, 'eb5095128f6c50f96akbbq');
});

test('rechaza vacío o ausente', () => {
  for (const v of ['', '   ', null, undefined, 42, {}]) {
    assert.equal(parseDeviceId(v).ok, false, `${JSON.stringify(v)} debería rechazarse`);
  }
});

test('rechaza lo que es claramente otra cosa', () => {
  // Pegar una URL entera o una frase es un error de la persona, no una
  // preferencia: conviene decirlo antes de consultar a Tuya.
  for (const v of [
    'https://iot.tuya.com/devices/eb5095128f6c50f96akbbq',
    'eb509512 8f6c50f96akbbq',
    'eb5095128f6c50f96akbbq;drop table meters',
    'mi-medidor',
  ]) {
    assert.equal(parseDeviceId(v).ok, false, `${v} debería rechazarse`);
  }
});

test('rechaza por longitud en los dos extremos', () => {
  assert.equal(parseDeviceId('a'.repeat(DEVICE_ID_MIN - 1)).ok, false);
  assert.equal(parseDeviceId('a'.repeat(DEVICE_ID_MIN)).ok, true);
  assert.equal(parseDeviceId('a'.repeat(DEVICE_ID_MAX)).ok, true);
  assert.equal(parseDeviceId('a'.repeat(DEVICE_ID_MAX + 1)).ok, false);
});

// ------------------------------------------------------ el nombre

test('un medidor sin nombre recibe uno por defecto', () => {
  assert.equal(parseMeterName(undefined), 'Medidor');
  assert.equal(parseMeterName('   '), 'Medidor');
});

test('el nombre se limpia y se recorta, no se rechaza', () => {
  // Un nombre largo de más es un descuido, no un intento de romper nada:
  // recortarlo molesta menos que devolver un error.
  assert.equal(parseMeterName('  Tablero principal  '), 'Tablero principal');
  assert.equal(parseMeterName('x'.repeat(200)).length, MAX_METER_NAME_LENGTH);
});

// ------------------------------------------------------ los permisos

test('solo el dueño puede desvincular', () => {
  // Un invitado que se va deja de ver el medidor, pero no se lo saca a quien
  // lo instaló.
  assert.equal(canUnlink('owner'), true);
  assert.equal(canUnlink('member'), false);
  assert.equal(canUnlink('none'), false);
});

test('dueño e invitado pueden ver; un desconocido no', () => {
  assert.equal(canView('owner'), true);
  assert.equal(canView('member'), true);
  assert.equal(canView('none'), false);
});

// --------------------------------------- qué se pierde al desvincular

test('desvincular pierde la configuración, no las mediciones', () => {
  // Es la propiedad que hace reversible la operación: volver a vincular el
  // mismo medidor recupera su historia entera.
  assert.equal(UNLINK_CONSEQUENCES.keepsReadings, true);
  assert.equal(UNLINK_CONSEQUENCES.keepsEvents, true);
  assert.equal(UNLINK_CONSEQUENCES.dropsContext, true);
  assert.equal(UNLINK_CONSEQUENCES.dropsMembers, true);
});
