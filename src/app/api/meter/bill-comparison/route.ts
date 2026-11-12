import {NextResponse} from 'next/server';
import {requireMeter,isErrorResponse} from '@/lib/api-auth';
import {getLumiReadings} from '@/lib/readings';
import {billingContext} from '@/lib/tariff-profile';
import {calculateElectricity} from '@/domain/electricity-billing';
import {compareBill} from '@/domain/bill-comparison';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function POST(request:Request){
 const auth=await requireMeter(request);if(isErrorResponse(auth))return auth;
 if(auth.meter.role!=='central')return NextResponse.json({error:'Un medidor de área no representa la factura eléctrica completa. Seleccioná el medidor central para reconciliarla.'},{status:400,headers});
 const origin=request.headers.get('origin');if(!origin||![new URL(request.url).origin,...(process.env.LUMI_ALLOWED_ORIGINS??'').split(',')].includes(origin))return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
 const text=await request.text();if(text.length>4096)return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413,headers});
 let data;try{data=JSON.parse(text);}catch{return NextResponse.json({error:'Solicitud inválida.'},{status:400,headers});}
 if(!data||Object.keys(data).some(k=>!['from','to','billedKwh','electricityCharge'].includes(k))||!['billedKwh','electricityCharge'].every(k=>typeof data[k]==='number'&&Number.isFinite(data[k])&&data[k]>=0))return NextResponse.json({error:'Importes o consumo inválidos.'},{status:400,headers});
 const from=new Date(data.from),to=new Date(data.to);if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>=to||+to>Date.now()||+to-+from>370*86400000)return NextResponse.json({error:'Indicá ambas fechas/horas del intervalo real, hasta 370 días.'},{status:400,headers});
 try{
  const [{readings,truncated},context]=await Promise.all([getLumiReadings(auth.meter.deviceId,from,new Date(+to+1)),billingContext(auth.userId,auth.meter.deviceId,from.toISOString(),to.toISOString())]);
  const points=readings.filter((row):row is Record<string,unknown>&{recorded_at:string}=>typeof row.recorded_at==='string');
  const basic=compareBill(data,points, null,auth.meter.collectionIntervalMinutes,truncated);
  const quote=context.definition&&basic.appKwh!==null?calculateElectricity(basic.appKwh,(+to-+from)/86400000,context.definition,auth.meter.role==='central'):null;
  return NextResponse.json({comparison:compareBill(data,points,quote,auth.meter.collectionIntervalMinutes,truncated),breakdown:quote},{headers});
 }catch{return NextResponse.json({error:'No se pudo obtener el historial para la comparación.'},{status:503,headers});}
}
