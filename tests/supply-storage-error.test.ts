import test from 'node:test';
import assert from 'node:assert/strict';
import { supplyStorageError } from '../src/lib/supply-storage-error.ts';

test('missing supply schema is distinguished from unavailable network and unknown errors', () => {
  for (const code of ['42P01','42703','PGRST204','PGRST205']) assert.equal(supplyStorageError({code}).code,'SUPPLY_SCHEMA_MISSING');
  const network=supplyStorageError({message:'TypeError: fetch failed (EACCES)'});
  assert.equal(network.code,'SUPPLY_STORAGE_UNAVAILABLE');
  assert.doesNotMatch(network.message,/migraciones|EACCES/);
  assert.equal(supplyStorageError({code:'42501'}).code,'SUPPLY_STORAGE_PERMISSION');
  assert.equal(supplyStorageError({code:'23514'}).status,409);
  const unknown=supplyStorageError({message:'private database details'});
  assert.equal(unknown.code,'SUPPLY_SAVE_FAILED');
  assert.doesNotMatch(unknown.message,/private|migraciones/);
});
