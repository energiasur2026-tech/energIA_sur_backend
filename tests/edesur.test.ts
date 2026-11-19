import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateElectricity, cents, resolveTariff, tariffForLocality} from '../src/domain/electricity-billing.ts';
import {categoryAssistance} from '../src/domain/tariff-categories.ts';
import {parseSupply, SUPPLY_CATALOG, supplyResolution} from '../src/domain/supply-profile.ts';
import {lumiBillingQuote} from '../src/domain/lumi-billing.ts';
import {buildMonthlyProjection} from '../src/domain/monthly-projection.ts';

const profile = {
  province: 'Buenos Aires', locality: 'Quilmes', provider: 'EDESUR',
  jurisdiction: 'AR-Buenos Aires', category: 'R1', segment: 'unsubsidized',
  bonus: '', providerConfirmed: true,
};
const november = resolveTariff('EDESUR', profile.jurisdiction, profile.segment, '2026-11-01')!;

test('Edesur requires confirmation and validates the category against the provider', () => {
  assert.equal(SUPPLY_CATALOG.localities['Buenos Aires'].length, 12);
  assert.deepEqual(parseSupply(profile), profile);
  assert.equal(parseSupply({...profile, category: '1'}), null);
  assert.equal(parseSupply({...profile, province: 'Santa Cruz', jurisdiction: 'AR-Santa Cruz'}), null);
  assert.equal(supplyResolution({...profile, providerConfirmed: false}, '2026-11-15').definition, null);
  assert.equal(supplyResolution(profile, '2026-11-15').definition?.id, november.id);
  assert.equal(categoryAssistance(profile, 'Tarifa T1 R Residencial 1 M').proposal?.code, 'R1');
  assert.equal(categoryAssistance(profile, 'Consumo 1 kWh').proposal, null);
});

test('monthly-equivalent Edesur tiers apply the category rate across consumption', () => {
  for (const [kwh, code] of [[150, 'R1'], [151, 'R2'], [401, 'R3'], [501, 'R4'], [601, 'R5'], [701, 'R6']] as const) {
    assert.equal(calculateElectricity(kwh, 30, november).category, code);
  }
  const r2 = calculateElectricity(151, 30, november);
  assert.equal(r2.fixedCharge, 3833.37);
  assert.equal(r2.variableCharge, 24424.4);
  assert.equal(r2.totalElectricity, null);
  assert.equal(r2.averageTotalPerKwh, null);
  assert.equal(calculateElectricity(80, 15, november).category, 'R2');
  assert.equal(calculateElectricity(151, 30, november, false).fixedCharge, 0);
});

test('subsidy applies only to base energy and general service needs no residential segment', () => {
  const subsidized = resolveTariff('EDESUR', profile.jurisdiction, 'subsidized', '2026-11-01')!;
  const quote = calculateElectricity(200, 30, subsidized);
  assert.equal(quote.variableCharge, cents(150 * 63.411 + 50 * 161.751));
  assert.equal(quote.marginalRate, 161.751);
  const general = supplyResolution({...profile, category: 'G1', segment: ''}, '2026-11-01').definition!;
  assert.equal(calculateElectricity(801, 30, general).category, 'G2');
});

test('local tariff dates respect midnight in Argentina and recorded bounds', () => {
  const resolve = (from: string, to?: string) => resolveTariff('EDESUR', profile.jurisdiction, profile.segment, from, to);
  assert.equal(resolve('2026-11-01T02:59:59Z')?.effectiveFrom, '2026-10-01');
  assert.equal(resolve('2026-11-01T03:00:00Z')?.effectiveFrom, '2026-11-01');
  assert.equal(resolve('2026-10-31', '2026-11-01'), null);
  assert.equal(resolve('2026-12-01'), null);
});

test('October invoice reconciles internally and preserves differences from the reference tariff', () => {
  const october = resolveTariff('EDESUR', profile.jurisdiction, profile.segment, '2026-10-01')!;
  const quote = calculateElectricity(68, 29, october);
  const invoice = {fixed: 1654.74, energy: 10656.35, vat: 2585.33, municipal: 785.82, credit: 520.82};
  const subtotal = cents(invoice.fixed + invoice.energy);
  assert.equal(subtotal, 12311.09);
  assert.equal(cents(subtotal * 0.21), invoice.vat);
  assert.equal(cents(subtotal * 0.06383), invoice.municipal);
  assert.equal(cents(subtotal + invoice.vat + invoice.municipal), 15682.24);
  assert.equal(cents(subtotal + invoice.vat + invoice.municipal - invoice.credit), 15161.42);
  assert.equal(cents(15225.05 - 15161.42), 63.63);
  assert.equal(cents(quote.fixedCharge - invoice.fixed), 57.28);
  assert.equal(cents(quote.variableCharge - invoice.energy), 27.54);
  assert.deepEqual(quote.taxes, []);
  assert.deepEqual(quote.credits, []);
});

test('a configured municipal charge is scoped to its locality and applies only to electricity', () => {
  const tariff = {...november, taxes: [
    {id: 'example', label: 'Impuesto sintético de prueba', verified: true, rate: 0.01,
      locality: 'Quilmes', baseIds: ['fixed', 'variable']},
  ]};
  const quote = calculateElectricity(68, 30, tariffForLocality(tariff, 'Quilmes'));
  assert.equal(quote.taxes[0].amount, cents(quote.subtotal * 0.01));
  assert.deepEqual(calculateElectricity(68, 30, tariffForLocality(tariff, 'Lanús')).taxes, []);
  assert.deepEqual(calculateElectricity(68, 30, tariffForLocality(tariff, 'Quilmes'), false).taxes, []);
});

test('Lumi uses measured energy and the declared category for short periods', () => {
  const from = '2026-11-02T03:00:00Z', to = '2026-11-03T03:00:00Z';
  const rows = [{recorded_at: from, total_energy_kwh: 100}, {recorded_at: to, total_energy_kwh: 120}];
  const context = {configured: true, definition: november, from, to, category: 'R1'};
  const quote = lumiBillingQuote(context, rows, 'central', 15);
  assert.equal('energyArs' in quote && quote.energyArs, cents(20 * 161.157));
  const projection = buildMonthlyProjection({rows, month: '2026-11', now: new Date(to), choice: null, tariffContext: context});
  assert.equal(projection.goal.projectedMonthKwh, 600);
  assert.equal(projection.goal.projectedCostArs, calculateElectricity(600, 30, november).knownTotal);
});
