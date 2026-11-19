import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateElectricity,cents,resolveTariff} from '../src/domain/electricity-billing.ts';
import {COOPRG,COOPRG_TARIFFS,COOPRG_GUIDE} from '../src/domain/rio-grande.ts';
import {parseSupply,supplyResolution} from '../src/domain/supply-profile.ts';
import {categoryAssistance} from '../src/domain/tariff-categories.ts';
import {lumiBillingQuote} from '../src/domain/lumi-billing.ts';

const july = COOPRG_TARIFFS.find(tariff=>tariff.id==='cooprg-tr1-2026-07-01')!;
const profile = {provider:COOPRG,province:'Tierra del Fuego',locality:'Río Grande',
  jurisdiction:july.jurisdiction,providerConfirmed:true,segment:'unsubsidized',category:'TR1',
  bonus:'',supplyType:'single-phase',constructionCharge:'yes'};

test('scope, confirmation, declarations and invoice code',()=>{
  assert.deepEqual(parseSupply(profile),profile);
  assert.equal(parseSupply({...profile,locality:'Ushuaia'}),null);
  assert.equal(parseSupply({...profile,category:'TR2'}),null);
  assert.equal(parseSupply({...profile,constructionCharge:'enabled'}),null);
  assert.equal(supplyResolution({...profile,providerConfirmed:false},'2026-07-15').definition,null);
  assert.equal(supplyResolution(profile,'2026-07-15').definition?.id,july.id);
  assert.ok(supplyResolution(profile,'2026-07-15').definition?.pendingNotes?.[0].includes('luz de obra'));
  assert.equal(categoryAssistance(profile,'TR1 - Uso Residencial').proposal?.code,'TR1');
  assert.equal(categoryAssistance(profile,'T 1-R2').proposal?.code,'TR2');
});

test('progressive boundaries including usage above 300',()=>{
  for(const [kwh,energy] of [[0,0],[150,23566.50],[151,23736.60],[279,45509.40],[300,49081.50],[301,49267.74],[500,86329.50]]){
    const quote = calculateElectricity(kwh,30,july);
    assert.equal(quote.variableCharge,energy);
    assert.equal(quote.fixedCharge,8437.77);
    assert.equal(quote.lines.find(line=>line.id==='capitalization')?.amount,kwh*25);
    assert.equal(quote.totalElectricity,null);
  }
  const quote=calculateElectricity(279,30,july);
  assert.deepEqual(quote.blocks.map(({quantity,amount})=>[quantity,amount]),[[150,23566.5],[129,21942.9]]);
  assert.equal(calculateElectricity(150,30,july).marginalRate,170.10);
});

test('official simulator references and subsidized thresholds by month',()=>{
  const expected = [75581.27,71230.09,72226.59,72871.50];
  for(const [index,month] of ['07','08','09','10'].entries()){
    const tariff=resolveTariff(COOPRG,july.jurisdiction,'unsubsidized','2026-'+month+'-01')!;
    assert.equal(calculateElectricity(350,30,tariff).knownTotal,expected[index]);
  }
  const august=resolveTariff(COOPRG,july.jurisdiction,'subsidized','2026-08-15')!;
  const september=resolveTariff(COOPRG,july.jurisdiction,'subsidized','2026-09-15')!;
  assert.equal(calculateElectricity(201,30,august).variableCharge,cents(150*87.37+51*104.02));
  assert.equal(calculateElectricity(201,30,september).variableCharge,cents(200*81.77+160.26));
  assert.equal(resolveTariff(COOPRG,july.jurisdiction,'unsubsidized','2026-11-01'),null);
  assert.equal(resolveTariff(COOPRG,july.jurisdiction,'unsubsidized','2026-08-01T02:59:59Z')?.id,july.id);
  assert.equal(resolveTariff(COOPRG,july.jurisdiction,'unsubsidized','2026-06-02','2026-07-02'),null);
});

test('historical bill reproduces the recorded total with invoice-specific charges',()=>{
  const historical={...july,
    additionalCharges:[...july.additionalCharges!,
      {id:'firefighters',label:'Bomberos',perKwh:0.1006,source:COOPRG_GUIDE},
      {id:'lighting',label:'Alumbrado',amount:6354.86,source:'Importe declarado en factura histórica'}],
    credits:[{id:'fund',label:'Fondo compensador',amount:70,verified:true,reducesTaxBase:false}],
    taxes:[{id:'construction',label:'Luz de obra',verified:true,rate:0.30,baseIds:['fixed','variable'],kind:'surcharge' as const}],
    adjustmentsComplete:true,taxesComplete:true};
  const quote=calculateElectricity(279,30,historical);
  assert.equal(quote.subtotal,53947.17);
  assert.equal(quote.lines.find(line=>line.id==='firefighters')?.amount,28.07);
  assert.equal(quote.lines.find(line=>line.id==='construction')?.amount,16184.15);
  assert.equal(quote.totalElectricity,83419.25);
  assert.equal(calculateElectricity(279,30,{...historical,taxes:[]}).totalElectricity,67235.10);
  const history=[269,330,273,288,284,279];
  assert.equal((history.reduce((sum,kwh)=>sum+kwh,0)/history.length).toFixed(1),'287.2');
});

test('Lumi receives scoped energy, blocks and charges from readings',()=>{
  const from='2026-07-02T03:00:00Z',to='2026-07-03T03:00:00Z';
  const context={definition:july,from,to,configured:true,category:'TR1'};
  const quote=lumiBillingQuote(context,[{recorded_at:from,total_energy_kwh:100},{recorded_at:to,total_energy_kwh:106}],'central',15);
  assert.equal('energyArs' in quote&&quote.energyArs,cents(5*157.11)+170.10);
  assert.equal('blocks' in quote&&quote.blocks?.length,2);
  assert.equal('finalElectricity' in quote&&quote.finalElectricity,null);
});

test('simulator compares scenarios and includes only explicitly declared construction amounts',async()=>{
  const {POST}=await import('../src/app/api/meter/tariff-simulator/route.ts');
  const simulate=(options:object)=>POST(new Request('http://localhost/api/meter/tariff-simulator',{
    method:'POST',body:JSON.stringify({id:july.id,jurisdiction:july.jurisdiction,scenarios:[279,350],...options}),
  }));
  const ordinary=await (await simulate({})).json();
  assert.equal(ordinary.quotes[0].knownTotal,60922.17);
  assert.equal(ordinary.quotes[1].knownTotal,75581.27);
  assert.equal(ordinary.difference,14659.10);
  const toggled=await (await simulate({construction:true})).json();
  assert.match(toggled.quotes[0].pending.join(' '),/base y alícuota/);
  const declared=await (await simulate({construction:true,constructionAmount:16184.15})).json();
  assert.equal(declared.quotes[0].knownTotal,77106.32);
  assert.equal(declared.quotes[0].totalElectricity,null);
  assert.equal((await simulate({constructionAmount:16184.15})).status,400);
  assert.equal((await simulate({id:'cooprg-tr1-2026-11-01'})).status,400);
  const demand=await (await simulate({id:'cooprg-t2p-2026-07-01',contractedKw:20})).json();
  assert.equal(demand.quotes[0].lines.find((line:{id:string})=>line.id==='contracted-power').amount,738844.40);
  assert.equal((await simulate({id:'cooprg-t2p-2026-07-01',contractedKw:50})).status,400);
});
