import test from 'node:test';
import assert from 'node:assert/strict';
import {billingRange} from '../src/domain/billing-cycle.ts';
test('invoice date uses Argentina midnight and actual elapsed period, not rolling 30 days',()=>{
 const r=billingRange('2026-10-20',new Date('2026-11-09T15:00:00Z'));assert.equal(r.from.toISOString(),'2026-10-20T03:00:00.000Z');assert.equal(r.days,20.5);
});
test('invalid and future dates are rejected, leap days supported',()=>{
 for(const d of ['','2026-02-30','2026-13-01','2026-2-01','2027-01-01'])assert.throws(()=>billingRange(d,new Date('2026-11-09T15:00:00Z')));
 assert.equal(billingRange('2028-02-29',new Date('2028-03-01T03:00:00Z')).days,1);
});
