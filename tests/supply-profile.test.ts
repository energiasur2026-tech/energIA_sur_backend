import test from 'node:test';import assert from 'node:assert/strict';
import {parseSupply,supplyResolution} from '../src/domain/supply-profile.ts';
const p={province:'Santa Cruz',locality:'Río Gallegos',provider:'SPSE',jurisdiction:'AR-Santa Cruz',category:'1',segment:'subsidized',bonus:'none',providerConfirmed:true};
test('supply status separates incomplete category and unsupported tariffs without zero money',()=>{
 assert.equal(supplyResolution(null,'2026-11-01').code,'supply_required');assert.equal(supplyResolution({...p,category:''},'2026-11-01').code,'category_required');assert.equal(supplyResolution({...p,providerConfirmed:false},'2026-11-01').code,'incomplete_configuration');
 assert.equal(supplyResolution({...p,province:'Chubut'},'2026-11-01').code,'incompatible_configuration');
 for(const profile of [{...p,bonus:'other'},{...p,category:'other'},{...p,provider:'other'}]){const r=supplyResolution(profile,'2026-11-01');assert.equal(r.code,'tariff_unavailable');assert.equal(r.definition,null);}
});
test('documented history retains correct version; unknown dates and crossing changes fail closed',()=>{
 const r=supplyResolution(p,'2026-10-01','2026-10-31');assert.equal(r.code,'reference_only');assert.equal(r.definition?.id,'spse-res-subsidized-2026-07-01');assert.equal(supplyResolution(p,'2026-06-01').definition,null);
 assert.equal(supplyResolution(p,'2026-06-30','2026-07-02').definition,null);
});
test('server validates cascading choices, never accepts client identities, rates or province assumptions',()=>{
 assert.ok(parseSupply(p));assert.ok(parseSupply({...p,category:'',segment:'',bonus:'',providerConfirmed:false}));assert.equal(parseSupply({...p,province:'Chubut',jurisdiction:'AR-Chubut'}),null);assert.equal(parseSupply({...p,user_id:'someone'}),null);assert.equal(parseSupply({...p,rate:4}),null);assert.equal(parseSupply({...p,locality:'x'.repeat(101)}),null);
});

test('unknown and noncatalogued categories preserve incomplete progress without assigning prices',()=>{assert.ok(parseSupply({...p,category:'unknown'}));assert.equal(supplyResolution({...p,category:'unknown'},'2026-11-01').code,'category_required');assert.match(supplyResolution({...p,category:'unknown'},'2026-11-01').reason,/Falta identificar tu categoría/);assert.ok(parseSupply({...p,category:'other',categoryText:'Código 999'}));assert.equal(supplyResolution({...p,category:'11'},'2026-11-01').definition,null);assert.ok(parseSupply({...p,category:'11'}));assert.equal(parseSupply({...p,category:'other',categoryText:'x'.repeat(121)}),null);});
