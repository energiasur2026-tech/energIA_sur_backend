import { NextResponse } from 'next/server';
import { requireMeter, isErrorResponse } from '@/lib/api-auth';
import { BillingStorageError, getBillingClose, setBillingClose } from '@/lib/billing-cycle';
import { billingRange } from '@/domain/billing-cycle';

const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
function storageFailure(operation:'read'|'write',error:unknown) {
  const code=error instanceof BillingStorageError&&/^[A-Z0-9]{5,12}$/.test(error.storageCode)
    ?error.storageCode:'UNAVAILABLE';
  console.error('Billing cycle operation failed',{operation,code});
  return NextResponse.json({error:operation==='read'
    ?'No pudimos consultar la fecha de cierre. Intentá nuevamente.'
    :'No pudimos guardar la fecha de cierre. Intentá nuevamente.'},{status:503,headers});
}

export async function GET(request:Request) {
  try{
    const auth=await requireMeter(request);
    if(isErrorResponse(auth))return auth;
    return NextResponse.json({closedOn:await getBillingClose(auth.userId,auth.meter.deviceId,true)},{headers});
  }catch(error){return storageFailure('read',error);}
}

export async function PUT(request:Request) {
  try{
    const auth=await requireMeter(request);
    if(isErrorResponse(auth))return auth;
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin&&!(process.env.LUMI_ALLOWED_ORIGINS??'').split(',').map(value=>value.trim()).includes(origin)){
      return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
    }
    const body=await request.json().catch(()=>null);
    if(!body||typeof body.closedOn!=='string'||Object.keys(body).some(key=>key!=='closedOn')){
      return NextResponse.json({error:'Ingresá una fecha de cierre válida.'},{status:400,headers});
    }
    try{billingRange(body.closedOn);}
    catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Fecha inválida.'},{status:400,headers});}
    await setBillingClose(auth.userId,auth.meter.deviceId,body.closedOn);
    return NextResponse.json({closedOn:body.closedOn},{headers});
  }catch(error){return storageFailure('write',error);}
}
