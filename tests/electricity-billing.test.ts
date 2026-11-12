import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTariff,calculateElectricity,cents,type TariffDefinition} from '../src/domain/electricity-billing.ts';
import {compareBill} from '../src/domain/bill-comparison.ts';
import {convertGoal,buildMonthlyProjection} from '../src/domain/monthly-projection.ts';
const subsidized=resolveTariff('SPSE','AR-Santa Cruz','subsidized','2026-10-01')!;
test('SPSE invoice arithmetic is reproduced without allocating global credits or IVA',()=>{
 const invoice={electricity:33747.85,water:15000,publicEnergy:10500,credit:-12213.48,vat:12442.05,total:59476.42};
 const subtotal=cents(invoice.electricity+invoice.water+invoice.publicEnergy);
 assert.equal(subtotal,59247.85);assert.equal(cents(subtotal*.21),invoice.vat);
 assert.equal(cents(subtotal+invoice.credit+invoice.vat),invoice.total);assert.equal(1033-819,214);
 const reference=calculateElectricity(214,30,subsidized);
 assert.equal(reference.variableCharge,15950.49);assert.equal(reference.subtotal,29950.49);
 assert.equal(cents(reference.subtotal-invoice.electricity),-3797.36);
 assert.equal(reference.totalElectricity,null);assert.equal(reference.taxes.length,0);assert.equal(reference.credits.length,0);
 assert.deepEqual(reference.excludedServices,['Agua','Cloaca','Energía pública']);
 assert.equal(compareBill({billedKwh:214,electricityCharge:33747.85},[],reference,15).status,'period_required');
});
test('provider, jurisdiction, historical effective date and subsidy are not interchangeable',()=>{
 assert.equal(resolveTariff('SPSE','AR-Santa Cruz','subsidized','2026-06-30'),null);
 assert.equal(resolveTariff('OTHER','AR-Santa Cruz','subsidized','2026-10-01'),null);
 assert.equal(resolveTariff('SPSE','AR-Other','subsidized','2026-10-01'),null);
 assert.equal(resolveTariff('SPSE','AR-Santa Cruz','unknown','2026-10-01'),null);
 const other=resolveTariff('SPSE','AR-Santa Cruz','unsubsidized','2026-10-01')!;
 assert.equal(calculateElectricity(214,30,other).subtotal,43583.94);
 assert.equal(other.tiers[3].rate,127.271);
});
test('generic tax bases use only verified electric concepts and explicit credit treatment',()=>{
 const tariff:TariffDefinition={...subsidized,id:'synthetic-only',rulesConfirmed:true,adjustmentsComplete:true,taxesComplete:true,tiers:[{maxKwh:Infinity,fixed:100,rate:2}],credits:[{id:'benefit',label:'Verified electric credit',amount:20,verified:true,reducesTaxBase:true}],taxes:[{id:'iva',label:'IVA on explicit base',rate:.21,baseIds:['fixed','variable','benefit'],verified:true}]};
 const quote=calculateElectricity(10,30,tariff);assert.equal(quote.subtotal,120);assert.equal(quote.taxes[0].amount,21);assert.equal(quote.totalElectricity,121);
 assert.throws(()=>calculateElectricity(10,30,{...tariff,taxes:[{...tariff.taxes[0],baseIds:['water']}]}),/Base/);
 assert.throws(()=>calculateElectricity(10,30,{...tariff,credits:[{...tariff.credits[0],reducesTaxBase:false}]}),/crédito/);
});
test('area, missing coverage, gaps and counter resets do not create a matching bill',()=>{
 assert.equal(calculateElectricity(214,30,subsidized,false).fixedCharge,0);
 const reference={from:'2026-09-18T03:00:00Z',to:'2026-10-18T03:00:00Z',billedKwh:214,electricityCharge:33747.85};
 const complete=[{recorded_at:reference.from,total_energy_kwh:100},{recorded_at:reference.to,total_energy_kwh:314}];
 const result=compareBill(reference,complete,calculateElectricity(214,30,subsidized),15);
 assert.equal(result.appKwh,214);assert.equal(result.deltaKwh,0);assert.equal(result.coverage,0);assert.equal(result.gaps,1);assert.equal(result.totalElectricity,null);
 const partial=compareBill(reference,[{...complete[0],recorded_at:'2026-09-19T03:00:00Z'},complete[1]],null,15);assert.equal(partial.status,'partial_data');
 const reset=compareBill(reference,[complete[1],{...complete[0],total_energy_kwh:500}],null,15);assert.equal(reset.appKwh,null);
});
test('projection and goal conversion use the same selected version and preserve no-tariff kWh goals',()=>{
 const context={definition:subsidized,configured:true,from:'2026-10-01',to:'2026-10-31'};
 const quote=convertGoal('kwh',214,true,true,context);assert.equal(quote.ars,29950.49);
 const rows=[{recorded_at:'2026-10-01T03:00:00Z',total_energy_kwh:10},{recorded_at:'2026-10-10T03:00:00Z',total_energy_kwh:100}];
 const projection=buildMonthlyProjection({rows,month:'2026-10',now:new Date('2026-10-10T03:00:00Z'),choice:{mode:'kwh',value:214},tariffContext:context,intervalMinutes:1440});
 assert.equal(projection.goal.goalCostArs,quote.ars);assert.equal(projection.tariff.version,subsidized.id);
 const absent={...context,definition:null};assert.equal(convertGoal('kwh',214,true,true,absent).kwh,214);assert.equal(convertGoal('kwh',214,true,true,absent).ars,null);
});

test('historical versions are retained and a crossing period requires explicit splitting',()=>{
 const newer={...subsidized,id:'synthetic-next-version',effectiveFrom:'2026-11-01',tiers:subsidized.tiers.map(t=>({...t,rate:t.rate*2}))};
 const registry=[subsidized,newer];
 assert.equal(resolveTariff('SPSE','AR-Santa Cruz','subsidized','2026-10-01','2026-10-31',registry)?.id,subsidized.id);
 assert.equal(resolveTariff('SPSE','AR-Santa Cruz','subsidized','2026-11-01','2026-11-30',registry)?.id,newer.id);
 assert.equal(resolveTariff('SPSE','AR-Santa Cruz','subsidized','2026-10-01','2026-11-02',registry),null);
});
