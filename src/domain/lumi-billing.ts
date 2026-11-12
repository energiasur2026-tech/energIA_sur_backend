import {compareBill} from './bill-comparison';
import {estimateEnergyCost} from './tariffs';
import type {BillingContext} from './electricity-billing';
export function lumiBillingQuote(context:BillingContext,rows:{recorded_at:string;total_energy_kwh?:unknown}[],role:string,interval:number,truncated=false){
 const usage=compareBill({from:context.from,to:context.to,billedKwh:0,electricityCharge:0},rows,null,interval,truncated);
 const base={from:context.from,to:context.to,status:context.code,reason:context.reason,scope:role,coverage:usage.coverage??0,gaps:usage.gaps??0,resets:usage.resets??0,truncated};
 if(!context.definition||usage.appKwh===null||truncated)return base;
 const cost=estimateEnergyCost(usage.appKwh,(Date.parse(context.to)-Date.parse(context.from))/86400000,role==='central',context);
 return {...base,kwh:usage.appKwh,referenceArs:cost.total,version:context.definition.id,firstAt:usage.firstAt,lastAt:usage.lastAt,source:context.definition.source,finalElectricity:cost.breakdown?.totalElectricity??null};
}
