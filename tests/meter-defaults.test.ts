/**
 * Tests de los valores con los que arranca un medidor vinculado.
 *
 * Existen por un error concreto: `linkMeter` insertaba solo el identificador,
 * el nombre y las fases, y dejaba el resto al `default` de cada columna. Un
 * medidor revinculado quedó guardando cada 6 horas en vez de cada 5 minutos y
 * el histórico dejó de crecer **sin un solo error**: el recolector corría y
 * decidía bien, cada 5 minutos, que todavía no tocaba.
 *
 * Un default de columna no se puede testear desde acá. Estos tests sirven
 * porque ahora el valor vive en el dominio y el alta lo escribe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DEFAULT_COLLECTION_INTERVAL_MINUTES,
  DEFAULT_GAP_MINUTES,
  DEFAULT_SENSITIVITY,
  SAMPLING_INVARIANTS,
  initialMeterSettings,
} from '../src/domain/meter-defaults.ts';
import { BASE_CRON_MINUTES, isValidInterval } from '../src/domain/collection-intervals.ts';
import { SENSITIVITY_RANGES, isSelectableSensitivity } from '../src/domain/sensitivity.ts';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// -------------------------------------------- el intervalo inicial

test('el intervalo inicial es una opción que la pantalla de Ajustes ofrece', () => {
  // Si no lo fuera, el usuario vería un valor que no puede volver a elegir.
  assert.equal(isValidInterval(DEFAULT_COLLECTION_INTERVAL_MINUTES), true);
});

test('el intervalo inicial no es más rápido que el cron', () => {
  // Pedir más seguido que la cadencia del cron no acelera nada: es el piso.
  assert.ok(DEFAULT_COLLECTION_INTERVAL_MINUTES >= BASE_CRON_MINUTES);
  assert.equal(SAMPLING_INVARIANTS.notFasterThanCron, true);
});

test('el intervalo inicial es MENOR que el hueco que se considera falla', () => {
  // Esta es la invariante que estaba rota: con guardado cada 6 horas y huecos
  // de 15 minutos, un medidor recién vinculado se veía caído siempre.
  assert.ok(
    DEFAULT_COLLECTION_INTERVAL_MINUTES < DEFAULT_GAP_MINUTES,
    `guardar cada ${DEFAULT_COLLECTION_INTERVAL_MINUTES} min con huecos de ${DEFAULT_GAP_MINUTES} min marca como falla el muestreo normal`
  );
  assert.equal(SAMPLING_INVARIANTS.shorterThanGap, true);
});

// -------------------------------------------- la sensibilidad inicial

test('un medidor nuevo NO arranca en personalizada', () => {
  // Decir que es personalizada cuando nadie tocó nada fue lo que convirtió
  // ese grado en una puerta de una sola dirección.
  assert.notEqual(DEFAULT_SENSITIVITY, 'personalizada');
  assert.equal(isSelectableSensitivity(DEFAULT_SENSITIVITY), true);
});

test('los umbrales iniciales se derivan del grado inicial, no son números sueltos', () => {
  const inicial = initialMeterSettings();
  const rango = SENSITIVITY_RANGES[DEFAULT_SENSITIVITY as 'media'];
  assert.equal(inicial.lowVoltageV, rango.lowVoltageV);
  assert.equal(inicial.highVoltageV, rango.highVoltageV);
  assert.ok(inicial.lowVoltageV < inicial.highVoltageV);
});

test('un medidor nuevo no arranca con objetivo', () => {
  // El objetivo lo fija el usuario. Inventarle uno sería adivinar su consumo.
  assert.equal(initialMeterSettings().goalKwh, null);
});

// ----------------------------- que el alta los escriba de verdad

/**
 * Mira el CÓDIGO FUENTE. Es inusual y necesita justificación: el error no fue
 * un valor equivocado, fue **no escribir ninguno** y dejar que la base
 * decidiera. Eso no se detecta mirando el dominio, que era correcto, ni
 * corriendo el alta contra una base de prueba, que tiene los mismos defaults
 * que producción y por lo tanto los mismos valores correctos por casualidad.
 */
test('linkMeter escribe cada ajuste explícitamente, sin confiar en la base', () => {
  const fuente = readFileSync(path.join(RAIZ, 'src/lib/meters.ts'), 'utf8');
  const alta = fuente.slice(fuente.indexOf('export async function linkMeter'));
  const insert = alta.slice(0, alta.indexOf('.select('));

  for (const columna of [
    'collection_interval_minutes',
    'gap_minutes',
    'overcurrent_a',
    'low_voltage_v',
    'high_voltage_v',
    'sensitivity',
    'alerts_enabled',
  ]) {
    assert.ok(
      insert.includes(columna),
      `linkMeter no escribe ${columna}: va a quedar el default de la columna, que es invisible desde el código`
    );
  }

  assert.ok(
    insert.includes('initialMeterSettings()'),
    'linkMeter tiene que tomar los valores del dominio, no repetirlos'
  );
});
