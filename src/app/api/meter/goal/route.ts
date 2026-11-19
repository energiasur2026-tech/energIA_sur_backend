import {billingContext} from '@/lib/tariff-profile';
import { NextResponse } from 'next/server';
import { requireMeter,isErrorResponse,meterIdFrom } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { argentinaMonth, calendarMonth, convertGoal, tariffInfo } from '@/domain/monthly-projection';
import { personalGoal,savePersonalGoal } from '@/lib/personal-goals';
import { getBillingClose } from '@/lib/billing-cycle';
import { estimatedBillingCycle } from '@/domain/billing-cycle';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
async function conversionContext(request:Request,userId:string,deviceId:string){
 const now=new Date();
 if(new URL(request.url).searchParams.get('period')!=='billing'){
  return {context:await billingContext(userId,deviceId,now.toISOString()),days:30};
 }
 const close=await getBillingClose(userId,deviceId);
 if(!close){
  const month=calendarMonth(argentinaMonth(now),now);
  return {context:await billingContext(userId,deviceId,month.start.toISOString(),new Date(+month.end-1).toISOString()),days:30};
 }
 const cycle=estimatedBillingCycle(close,now);
 if(+now>=+cycle.end)return null;
 return {context:await billingContext(userId,deviceId,cycle.start.toISOString(),new Date(+cycle.end-1).toISOString()),days:cycle.days};
}
export async function GET(request:Request){
 try{const auth=await requireMeter(meterIdFrom(request));if(isErrorResponse(auth))return auth;
 const q=new URL(request.url).searchParams,mode=q.get('mode'),value=Number(q.get('value'));
 if(!['ars','kwh'].includes(mode??''))return NextResponse.json({error:'Unidad inválida.'},{status:400,headers});
 const conversion=await conversionContext(request,auth.userId,auth.meter.deviceId);
 if(!conversion)return NextResponse.json({error:'Actualizá el cierre de factura para convertir el objetivo del ciclo.'},{status:400,headers});
 const {context,days}=conversion;
 const valid=process.env.ENERGY_TARIFF_ENABLED!=='false'&&!!context.definition,fixed=auth.meter.role==='central';
 return NextResponse.json({...convertGoal(mode as 'ars'|'kwh',value,fixed,valid,context,days),tariff:tariffInfo(fixed,valid,context)},{headers});
 }catch(e){return apiError('goal/preview',e);}
}
export async function PUT(request:Request){
 try{const auth=await requireMeter(meterIdFrom(request));if(isErrorResponse(auth))return auth;
 const body=await request.json().catch(()=>null);
 if(!body||!['ars','kwh'].includes(body.mode)||Object.keys(body).some(k=>!['mode','value'].includes(k)))return NextResponse.json({error:'Objetivo inválido.'},{status:400,headers});
 if(body.value===null){await savePersonalGoal(auth.userId,auth.meter,null);return NextResponse.json({goalKwh:null,goalCostArs:null,inputMode:body.mode},{headers});}
 if(typeof body.value!=='number')return NextResponse.json({error:'Ingresá un número válido.'},{status:400,headers});
 const conversion=await conversionContext(request,auth.userId,auth.meter.deviceId);
 if(!conversion)return NextResponse.json({error:'Actualizá el cierre de factura para convertir el objetivo del ciclo.'},{status:400,headers});
 const {context,days}=conversion;
 const quote=convertGoal(body.mode,body.value,auth.meter.role==='central',process.env.ENERGY_TARIFF_ENABLED!=='false'&&!!context.definition,context,days);
 if(quote.error||(quote.kwh!==null&&quote.kwh>20000))return NextResponse.json({error:quote.error??'El objetivo no puede superar 20.000 kWh.'},{status:400,headers});
 await savePersonalGoal(auth.userId,auth.meter,{mode:body.mode,value:body.value});
 return NextResponse.json({goalKwh:quote.kwh,goalCostArs:quote.ars,inputMode:body.mode,choice:await personalGoal(auth.userId,auth.meter)},{headers});
 }catch(e){return apiError('goal/save',e);}
}
