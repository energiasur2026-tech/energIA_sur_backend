import { NextResponse } from 'next/server';
import { requireMeter,isErrorResponse } from '@/lib/api-auth';
import { getBillingClose,setBillingClose } from '@/lib/billing-cycle';
import { billingRange } from '@/domain/billing-cycle';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){try{const auth=await requireMeter(request);if(isErrorResponse(auth))return auth;return NextResponse.json({closedOn:await getBillingClose(auth.userId,auth.meter.deviceId)},{headers});}catch{return NextResponse.json({error:'No se pudo recuperar la fecha de cierre. Verificá que el backend esté actualizado.'},{status:503,headers});}}
export async function PUT(request:Request){try{const auth=await requireMeter(request);if(isErrorResponse(auth))return auth;const body=await request.json().catch(()=>null);
 if(!body||typeof body.closedOn!=='string'||Object.keys(body).some(k=>k!=='closedOn'))return NextResponse.json({error:'Ingresá una fecha de cierre válida.'},{status:400,headers});
 try{billingRange(body.closedOn);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Fecha inválida.'},{status:400,headers});}
 await setBillingClose(auth.userId,auth.meter.deviceId,body.closedOn);return NextResponse.json({closedOn:body.closedOn},{headers});
 }catch{return NextResponse.json({error:'No se pudo guardar el cierre. El backend debe tener aplicada la migración 0020.'},{status:503,headers});}}
