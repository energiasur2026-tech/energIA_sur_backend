import {COOPRG,COOPRG_TARIFFS} from './rio-grande';
import {EDESUR_TARIFFS} from './edesur';

/** Versioned electricity-only rules. Never allocate an unknown invoice credit or tax. */
export type Segment='subsidized'|'unsubsidized';
export type TariffLine={id:string;label:string;amount:number;kind:'fixed'|'variable'|'credit'|'tax'|'surcharge';source:string;quantity?:number;unitRate?:number};
type PublishedAdjustment={id:string;label:string;verified:boolean;source?:string;locality?:string};
type Credit=PublishedAdjustment&{amount:number;reducesTaxBase:boolean};
type PercentageCharge=PublishedAdjustment&{rate:number;baseIds:string[];kind?:'tax'|'surcharge'};
export type TariffDefinition={id:string;provider:string;jurisdiction:string;category:string;segment:string;effectiveFrom:string|null;effectiveTo:string|null;source:string;reviewedOn:string;rule:'selected-tier-all-kwh'|'progressive';referenceDays:number;normalizeConsumption?:boolean;prorateBlocks?:boolean;contractedPowerRate?:number;additionalCharges?:{id:string;label:string;source:string;perKwh?:number;amount?:number}[];pendingNotes?:string[];tiers:{maxKwh:number;fixed:number;rate:number;code?:string;baseRate?:number;baseKwh?:number}[];rulesConfirmed?:boolean;adjustmentsComplete:boolean;taxesComplete:boolean;credits:Credit[];taxes:PercentageCharge[]};
const SOURCE='https://spse.ar/atencion-cliente#calcularConsumo';
const common={provider:'SPSE',jurisdiction:'AR-Santa Cruz',category:'Residencial · categorías 1, 3, 4, 5',effectiveFrom:'2026-07-01',effectiveTo:null,source:SOURCE,reviewedOn:'2026-11-11',rule:'selected-tier-all-kwh' as const,referenceDays:30,adjustmentsComplete:false,taxesComplete:false,credits:[],taxes:[]};
export const TARIFFS:readonly TariffDefinition[]=[
 {...common,id:'spse-res-subsidized-2026-07-01',segment:'subsidized',tiers:[{maxKwh:100,fixed:12500,rate:58.027},{maxKwh:150,fixed:13500,rate:60.147},{maxKwh:300,fixed:14000,rate:74.535},{maxKwh:400,fixed:15000,rate:116.053},{maxKwh:Infinity,fixed:17000,rate:120.293}]},
 {...common,id:'spse-res-unsubsidized-2026-07-01',segment:'unsubsidized',tiers:[{maxKwh:100,fixed:15000,rate:116.053},{maxKwh:200,fixed:16000,rate:120.293},{maxKwh:300,fixed:17000,rate:124.224},{maxKwh:400,fixed:18000,rate:127.271},{maxKwh:Infinity,fixed:22000,rate:128.78}]},
 ...EDESUR_TARIFFS,
 ...COOPRG_TARIFFS,
];
export const cents=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function resolveTariff(provider:string,jurisdiction:string,segment:string,from:string,to=from,registry:readonly TariffDefinition[]=TARIFFS):TariffDefinition|null{
 const localDate=(value:string)=>{
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const time=Date.parse(value);
  return Number.isFinite(time)?new Date(time-10800000).toISOString().slice(0,10):'';
 };
 const start=(provider==='EDESUR'||provider===COOPRG)?localDate(from):from.slice(0,10);
 const end=(provider==='EDESUR'||provider===COOPRG)?localDate(to):to.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||start>end)return null;
 const versions=[...registry].filter(t=>t.provider===provider&&t.jurisdiction===jurisdiction&&t.segment===segment&&t.effectiveFrom!==null).sort((a,b)=>a.effectiveFrom!.localeCompare(b.effectiveFrom!));
 const candidate=versions.filter(t=>t.effectiveFrom!<=start).at(-1);if(!candidate)return null;
 const next=versions.find(t=>t.effectiveFrom!>candidate.effectiveFrom!);
 const until=candidate.effectiveTo??next?.effectiveFrom;
 return until&&end>=until?null:candidate;
}
export type BillingContext={definition:TariffDefinition|null;configured:boolean;from:string;to:string;reason?:string;code?:string;category?:string};
export function tariffForLocality(tariff:TariffDefinition,locality:string):TariffDefinition{
 const same=(adjustment:PublishedAdjustment)=>!adjustment.locality||adjustment.locality.localeCompare(locality,'es',{sensitivity:'base'})===0;
 return {...tariff,
  credits:tariff.credits.filter(same).map(credit=>({...credit,locality:undefined})),
  taxes:tariff.taxes.filter(same).map(tax=>({...tax,locality:undefined}))};
}
export function calculateElectricity(kwh:number,days:number,tariff:TariffDefinition,fixed=true,referenceCategory?:string){
 if(!Number.isFinite(kwh)||kwh<0||!Number.isFinite(days)||days<=0)throw new Error('Consumo o duración inválidos.');
 const monthlyKwh=tariff.normalizeConsumption?kwh*tariff.referenceDays/days:kwh;
 const scale=tariff.prorateBlocks?days/tariff.referenceDays:1;
 const tier=tariff.tiers.find(t=>referenceCategory?t.code===referenceCategory:monthlyKwh<=t.maxKwh*scale);if(!tier)throw new Error('Consumo fuera del cuadro.');
 const fixedCharge=fixed?cents(tier.fixed*days/tariff.referenceDays):0;
 let variableCharge=0,lower=0;
 const baseKwh=tier.baseKwh===undefined?0:tier.baseKwh*days/tariff.referenceDays;
 const marginalRate=tariff.rule==='progressive'?(tariff.tiers.find(t=>kwh<t.maxKwh*scale)?.rate??tier.rate):tier.baseRate!==undefined&&kwh<baseKwh?tier.baseRate:tier.rate;
 if(tier.baseRate!==undefined)variableCharge=cents(Math.min(kwh,baseKwh)*tier.baseRate+Math.max(0,kwh-baseKwh)*tier.rate);
 else if(tariff.rule==='selected-tier-all-kwh')variableCharge=cents(kwh*tier.rate);
 const blocks:TariffLine[]=[];
 if(tariff.rule==='progressive'){
  for(const [index,block] of tariff.tiers.entries()){
   const cap=block.maxKwh*scale;
   const quantity=Math.max(0,Math.min(kwh,cap)-lower);
   if(quantity>0)blocks.push({id:'block-'+(index+1),label:'Energía · escalón '+(index+1),
    amount:cents(quantity*block.rate),kind:'variable',source:tariff.source,quantity,unitRate:block.rate});
   lower=cap;
   if(kwh<=cap)break;
  }
  variableCharge=cents(blocks.reduce((sum,line)=>sum+line.amount,0));
 }
 const lines:TariffLine[]=[{id:'fixed',label:'Cargo fijo eléctrico · referencia proporcional',amount:fixedCharge,kind:'fixed',source:tariff.source},{id:'variable',label:'Cargo variable por energía',amount:variableCharge,kind:'variable',source:tariff.source}];
 if(fixed)for(const charge of tariff.additionalCharges??[]){
  if(charge.perKwh!==undefined)lines.push({...charge,quantity:kwh,unitRate:charge.perKwh,amount:cents(kwh*charge.perKwh),kind:'surcharge'});
  else if(charge.amount!==undefined)lines.push({...charge,amount:cents(charge.amount),kind:'surcharge'});
 }
 for(const credit of tariff.credits)if(fixed&&credit.verified&&!credit.locality)lines.push({id:credit.id,label:credit.label,amount:-Math.abs(credit.amount),kind:'credit',source:credit.source??tariff.source});
 for(const tax of tariff.taxes){
  if(!fixed||!tax.verified||tax.locality)continue;
  if(!Number.isFinite(tax.rate)||tax.rate<0||tax.rate>1)throw new Error('Tasa inválida.');
  if(tax.baseIds.some(id=>tariff.credits.some(c=>c.id===id&&!c.reducesTaxBase)))throw new Error('El crédito no reduce esa base tributaria.');
  if(tax.baseIds.some(id=>!lines.some(line=>line.id===id)))throw new Error('Base tributaria incompleta.');
  const base=tax.baseIds.reduce((sum,id)=>sum+lines.find(line=>line.id===id)!.amount,0);
  lines.push({id:tax.id,label:tax.label,amount:cents(base*tax.rate),kind:tax.kind??'tax',source:tax.source??tariff.source});
 }
 const subtotal=cents(fixedCharge+variableCharge),knownTotal=cents(lines.reduce((sum,l)=>sum+l.amount,0));
 const pending=tariff.rulesConfirmed?[]:['Confirmar regla de liquidación y prorrateo con el período real.'];
 pending.push(...(tariff.pendingNotes??[]));
 if(!tariff.adjustmentsComplete)pending.push('Créditos/subsidios adicionales: alcance no confirmado.');
 if(!tariff.taxesComplete)pending.push('Impuestos eléctricos y su base: pendientes de confirmar; no se aplica el IVA global.');
 return {version:tariff.id,provider:tariff.provider,jurisdiction:tariff.jurisdiction,category:tier.code??tariff.category,reviewedOn:tariff.reviewedOn,marginalRate,averageTotalPerKwh:kwh>0&&fixed&&tariff.adjustmentsComplete&&tariff.taxesComplete&&tariff.rulesConfirmed?cents(knownTotal/kwh):null,segment:tariff.segment,effectiveFrom:tariff.effectiveFrom,source:tariff.source,blocks,scope:fixed?'household-electricity' as const:'area-electricity-reference' as const,lines,fixedCharge,variableCharge,subtotal,knownTotal,totalElectricity:fixed&&tariff.adjustmentsComplete&&tariff.taxesComplete&&tariff.rulesConfirmed?knownTotal:null,credits:lines.filter(l=>l.kind==='credit'),taxes:lines.filter(l=>l.kind==='tax'),pending,status:tariff.rulesConfirmed&&tariff.adjustmentsComplete&&tariff.taxesComplete?'complete' as const:'partial' as const,excludedServices:['Agua','Cloaca','Energía pública'],tier};
}
export type ElectricityBreakdown=ReturnType<typeof calculateElectricity>;
