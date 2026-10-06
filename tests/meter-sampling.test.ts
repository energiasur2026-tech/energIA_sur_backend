/**
 * Tests de las decisiones de muestreo y de los avisos, ahora que son dominio
 * puro. Ninguno necesita base de datos, red ni sustitutos de módulos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPersistDueAt, interpretStatus } from '../src/domain/meter-sampling.ts';
import { selectNotifiable, cuentaComoAvisado } from '../src/domain/notify-anomalies.ts';
import type { EventRecord } from '../src/domain/event-types.ts';

const AHORA = new Date('2026-03-01T12:00:00Z');
const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString();

// ------------------------------------------------- cuándo toca guardar

test('sin lectura previa siempre toca guardar', () => {
  assert.equal(
    isPersistDueAt({ lastReadingAt: null, intervalMinutes: 360, now: AHORA }),
    true
  );
});

test('recién guardado, no toca', () => {
  assert.equal(
    isPersistDueAt({ lastReadingAt: haceMinutos(1), intervalMinutes: 5, now: AHORA }),
    false
  );
});

test('cumplido el intervalo, toca', () => {
  assert.equal(
    isPersistDueAt({ lastReadingAt: haceMinutos(5), intervalMinutes: 5, now: AHORA }),
    true
  );
});

test('la tolerancia evita que el guardado se vaya corriendo ciclo a ciclo', () => {
  // El cron dispara cada 5 minutos. Con un intervalo de 6 h y sin tolerancia,
  // a las 5 h 58 min diría "todavía no" y recién guardaría a las 6 h 05,
  // corriéndose un poco más en cada vuelta. Con media tolerancia (2.5 min)
  // entra en el primer disparo a partir del intervalo.
  assert.equal(
    isPersistDueAt({ lastReadingAt: haceMinutos(358), intervalMinutes: 360, now: AHORA }),
    true,
    'a 2 minutos del intervalo ya entra'
  );
  assert.equal(
    isPersistDueAt({ lastReadingAt: haceMinutos(355), intervalMinutes: 360, now: AHORA }),
    false,
    'a 5 minutos todavía no'
  );
});

test('un intervalo largo no guarda a cada rato', () => {
  assert.equal(
    isPersistDueAt({ lastReadingAt: haceMinutos(60), intervalMinutes: 1440, now: AHORA }),
    false
  );
});

// --------------------------------------- interpretar la respuesta de Tuya

/** Arma el data point crudo tal como lo manda el medidor. */
function phaseA(v: number, a: number, w: number): string {
  const b = Buffer.alloc(10);
  b.writeUInt16BE(v, 0);
  b.writeUIntBE(a, 2, 3);
  b.writeUIntBE(w, 5, 3);
  return b.toString('base64');
}

test('traduce la respuesta completa del medidor', () => {
  const r = interpretStatus([
    { code: 'phase_a', value: phaseA(2210, 1500, 330) },
    { code: 'total_forward_energy', value: 6401 },
    { code: 'otro_dp', value: 'ignorado' },
  ]);
  assert.equal(r.voltage, 221);
  assert.equal(r.current, 1.5);
  assert.equal(r.powerW, 330);
  assert.equal(r.totalEnergyKwh, 64.01, 'el medidor reporta centésimas de kWh');
});

test('guarda el data point crudo para poder reinterpretarlo después', () => {
  const crudo = phaseA(2200, 1000, 220);
  assert.equal(interpretStatus([{ code: 'phase_a', value: crudo }]).rawPhaseA, crudo);
});

test('un data point ausente queda en null, nunca en cero', () => {
  const r = interpretStatus([]);
  assert.deepEqual(r, {
    voltage: null,
    current: null,
    powerW: null,
    totalEnergyKwh: null,
    rawPhaseA: null,
  });
});

test('una energía no numérica queda en null', () => {
  const r = interpretStatus([{ code: 'total_forward_energy', value: 'sin-datos' }]);
  assert.equal(r.totalEnergyKwh, null);
});

test('una energía nula queda en null', () => {
  const r = interpretStatus([{ code: 'total_forward_energy', value: null }]);
  assert.equal(r.totalEnergyKwh, null);
});

test('la energía se redondea a centésimas antes de convertir', () => {
  assert.equal(interpretStatus([{ code: 'total_forward_energy', value: 6401.7 }]).totalEnergyKwh, 64.02);
});

test('energía cero es un dato real, no un faltante', () => {
  assert.equal(interpretStatus([{ code: 'total_forward_energy', value: 0 }]).totalEnergyKwh, 0);
});

// --------------------------------------------------------- qué se avisa

function evento(id: number, severity: EventRecord['severity']): EventRecord {
  return {
    id,
    type: 'LOW_VOLTAGE',
    severity,
    startedAt: '2026-03-01T00:00:00Z',
    endedAt: null,
    lastViolationAt: '2026-03-01T00:00:00Z',
    samples: 1,
    minVoltage: 200,
    maxVoltage: 200,
    maxCurrent: 1,
    maxPowerW: 220,
  };
}

test('los eventos informativos no generan aviso', () => {
  // Llenar la casilla de ruido es la forma más rápida de que se ignoren
  // también los avisos que importan.
  const elegidos = selectNotifiable([evento(1, 'INFO'), evento(2, 'WARNING'), evento(3, 'CRITICAL')]);
  assert.deepEqual(elegidos.map((e) => e.id), [2, 3]);
});

test('sin eventos pendientes no hay nada que avisar', () => {
  assert.deepEqual(selectNotifiable([]), []);
});

test('un envío exitoso cierra el asunto', () => {
  assert.equal(cuentaComoAvisado('sent'), true);
});

test('sin proveedor configurado también se da por cerrado', () => {
  // Sin credenciales el reintento nunca prosperaría y la cola crecería para
  // siempre.
  assert.equal(cuentaComoAvisado('skipped'), true);
});

test('un envío fallido se reintenta en el ciclo siguiente', () => {
  assert.equal(cuentaComoAvisado('failed'), false);
});
