import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimatedBillingCycle} from '../src/domain/billing-cycle.ts';
import {buildMonthlyProjection,convertGoal} from '../src/domain/monthly-projection.ts';
import {resolveTariff} from '../src/domain/electricity-billing.ts';

test('estimated cycle starts at Argentine midnight and clamps short months',()=>{
  const now=new Date('2026-11-18T12:00:00Z');
  const cycle=estimatedBillingCycle('2026-10-28',now);
  assert.equal(cycle.start.toISOString(),'2026-10-28T03:00:00.000Z');
  assert.equal(cycle.end.toISOString(),'2026-11-28T03:00:00.000Z');
  assert.equal(cycle.days,31);
  assert.equal(estimatedBillingCycle('2026-10-31',now).end.toISOString(),'2026-11-30T03:00:00.000Z');
  assert.equal(estimatedBillingCycle('2028-01-31',new Date('2028-02-10')).end.toISOString(),'2028-02-29T03:00:00.000Z');
});

test('projection and target use the same period and cost conversion',()=>{
  const now=new Date('2026-11-18T03:00:00.000Z');
  const bounds=estimatedBillingCycle('2026-10-28',now);
  const rows=[{recorded_at:bounds.start.toISOString(),total_energy_kwh:100},
    {recorded_at:now.toISOString(),total_energy_kwh:121}];
  const definition=resolveTariff('SPSE','AR-Santa Cruz','unsubsidized','2026-10-28');
  const tariffContext={definition,configured:true,from:bounds.start.toISOString(),to:bounds.end.toISOString()};
  const projection=buildMonthlyProjection({month:'2026-11',now,rows,choice:{mode:'kwh',value:31},billingBounds:bounds,tariffContext});
  assert.equal(projection.measuredKwh,21);
  assert.equal(projection.goal.projectedMonthKwh,31);
  assert.equal(projection.goal.projectedCostArs,convertGoal('kwh',31,true,true,tariffContext,31).ars);
  assert.equal(projection.monthStart,bounds.start.toISOString());
});
