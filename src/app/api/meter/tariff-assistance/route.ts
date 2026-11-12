import {NextResponse} from 'next/server';
import {requireMeter,isErrorResponse} from '@/lib/api-auth';
import {PROVINCES} from '@/domain/supply-profile';
import {categoryAssistance,type AssistanceContext} from '@/domain/tariff-categories';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function POST(request:Request){
 const auth=await requireMeter(request);if(isErrorResponse(auth)){auth.headers.set('Cache-Control','private, no-store');return auth;}
 const origin=request.headers.get('origin');if(!origin||![new URL(request.url).origin,...(process.env.LUMI_ALLOWED_ORIGINS??'').split(',')].includes(origin))return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
 const raw=await request.text();if(raw.length>2048)return NextResponse.json({error:'Copiá solo el campo tarifario, sin datos personales.'},{status:413,headers});
 const b=await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null),ctx=b?.context;
 if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['context','text'].includes(k))||!ctx||Array.isArray(ctx)||Object.keys(ctx).some(k=>!['province','locality','provider'].includes(k))||['province','locality','provider'].some(k=>typeof ctx[k]!=='string')||ctx.province&&!PROVINCES.includes(ctx.province)||ctx.locality.length>100||/[<>\x00-\x1f]/.test(ctx.locality)||!['','SPSE','other'].includes(ctx.provider)||ctx.provider==='SPSE'&&ctx.province!=='Santa Cruz'||b.text!==undefined&&(typeof b.text!=='string'||b.text.length>160||/[<>\x00-\x1f]/.test(b.text)))return NextResponse.json({error:'Ingresá solo el campo de categoría y el contexto del suministro seleccionado.'},{status:400,headers});
 // Draft context is declarative, never used for identity, data access or a write.
 return NextResponse.json({...categoryAssistance(ctx as AssistanceContext,b.text??''),meterId:auth.meter.deviceId},{headers});
}
