/**
 * Tests de caracterización del decodificador del data point `phase_a`.
 *
 * "De caracterización" significa que fijan el comportamiento que el código
 * tiene HOY, antes de refactorizar. No afirman que ese comportamiento sea el
 * ideal: afirman que no debe cambiar sin que nos enteremos.
 *
 * Esta es la pieza más delicada del sistema: traduce los bytes crudos del
 * medidor a tensión, corriente y potencia. Un error acá contamina todo el
 * histórico y no se nota hasta mucho después.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePhaseA } from '../src/lib/phase-a.ts';

/** Arma el buffer de 10 bytes tal como lo reporta el medidor y lo codifica. */
function encode(rawVoltage: number, rawCurrent: number, rawPower: number): string {
  const b = Buffer.alloc(10);
  b.writeUInt16BE(rawVoltage, 0);
  b.writeUIntBE(rawCurrent, 2, 3);
  b.writeUIntBE(rawPower, 5, 3);
  return b.toString('base64');
}

test('decodifica el ejemplo documentado: 214.0 V, 0.100 A, 19 W', () => {
  const r = decodePhaseA(encode(2140, 100, 19));
  assert.deepEqual(r, { voltage: 214, current: 0.1, powerW: 19 });
});

test('aplica las escalas de cada campo', () => {
  // Tensión en décimas de volt, corriente en milésimas de ampere, potencia en watts.
  const r = decodePhaseA(encode(2205, 12345, 2700));
  assert.equal(r.voltage, 220.5);
  assert.equal(r.current, 12.345);
  assert.equal(r.powerW, 2700);
});

test('redondea la tensión a un decimal y la corriente a tres', () => {
  const r = decodePhaseA(encode(2199, 1, 0));
  assert.equal(r.voltage, 219.9);
  assert.equal(r.current, 0.001);
});

test('tensión cero se reporta como dato ausente, no como cero', () => {
  // Criterio del proyecto: cuando falta un valor se devuelve null, nunca 0,
  // para no graficar un apagón que no ocurrió.
  const r = decodePhaseA(encode(0, 500, 60));
  assert.equal(r.voltage, null);
  assert.equal(r.current, 0.5);
  assert.equal(r.powerW, 60);
});

test('corriente y potencia en cero SÍ son cero (consumo nulo es un dato real)', () => {
  const r = decodePhaseA(encode(2200, 0, 0));
  assert.equal(r.voltage, 220);
  assert.equal(r.current, 0);
  assert.equal(r.powerW, 0);
});

test('entrada vacía o nula devuelve todo en null', () => {
  const vacio = { voltage: null, current: null, powerW: null };
  assert.deepEqual(decodePhaseA(null), vacio);
  assert.deepEqual(decodePhaseA(''), vacio);
});

test('un buffer más corto de 8 bytes se descarta entero', () => {
  const corto = Buffer.alloc(7).toString('base64');
  assert.deepEqual(decodePhaseA(corto), { voltage: null, current: null, powerW: null });
});

test('HOY: una cadena basura NO se rechaza, produce números sin sentido', () => {
  // Hallazgo, no comportamiento deseado. Node no falla ante base64 inválido:
  // ignora los caracteres que no corresponden y decodifica el resto. Si esa
  // basura llega a 8 bytes, el decodificador la toma por buena.
  //
  // Hoy no es un problema real porque la única fuente es Tuya, que manda
  // base64 válido. Pero si algún día cambia el origen del dato, esto escribe
  // lecturas falsas en el histórico sin que nada avise.
  //
  // Este test fija el comportamiento ACTUAL para que el refactor no lo
  // cambie por accidente. Si decidimos arreglarlo, se cambia acá a propósito.
  const r = decodePhaseA('no-es-base64-%%%');
  assert.equal(r.voltage, 4059.1);
  assert.equal(r.current, 10400.742);
  assert.equal(r.powerW, 14332398);
});

test('una cadena basura demasiado corta sí se descarta', () => {
  assert.deepEqual(decodePhaseA('%%%'), { voltage: null, current: null, powerW: null });
});

test('acepta exactamente 8 bytes, sin los dos reservados', () => {
  const b = Buffer.alloc(8);
  b.writeUInt16BE(2300, 0);
  b.writeUIntBE(2000, 2, 3);
  b.writeUIntBE(440, 5, 3);
  const r = decodePhaseA(b.toString('base64'));
  assert.deepEqual(r, { voltage: 230, current: 2, powerW: 440 });
});

test('los dos bytes reservados no alteran la lectura', () => {
  const con = Buffer.alloc(10);
  con.writeUInt16BE(2200, 0);
  con.writeUIntBE(1000, 2, 3);
  con.writeUIntBE(220, 5, 3);
  con.writeUInt16BE(0xffff, 8);
  const r = decodePhaseA(con.toString('base64'));
  assert.deepEqual(r, { voltage: 220, current: 1, powerW: 220 });
});

test('soporta los valores máximos que caben en cada campo', () => {
  const r = decodePhaseA(encode(65535, 16777215, 16777215));
  assert.equal(r.voltage, 6553.5);
  assert.equal(r.current, 16777.215);
  assert.equal(r.powerW, 16777215);
});
