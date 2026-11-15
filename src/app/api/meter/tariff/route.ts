import {NextResponse} from 'next/server';
import {requireMeter,isErrorResponse} from '@/lib/api-auth';
import {tariffProfile,saveTariffProfile} from '@/lib/tariff-profile';
import {parseSupply,SUPPLY_CATALOG,supplyResolution} from '@/domain/supply-profile';
import {TARIFFS} from '@/domain/electricity-billing';
import {SupplyStorageError} from '@/lib/supply-storage-error';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){const auth=await requireMeter(request);if(isErrorResponse(auth))return auth;try{const profile=await tariffProfile(auth.userId,auth.meter.deviceId);return NextResponse.json({profile,catalog:SUPPLY_CATALOG,resolution:supplyResolution(profile,new Date().toISOString()),versions:TARIFFS.map(({id,provider,jurisdiction,segment,effectiveFrom,source})=>({id,provider,jurisdiction,segment,effectiveFrom,source}))},{headers});}catch{return NextResponse.json({error:'No se pudo consultar el suministro. Reintentá.'},{status:503,headers});}}
export async function PUT(request:Request){
 const auth=await requireMeter(request);if(isErrorResponse(auth))return auth;
 if(request.headers.get('origin')!==new URL(request.url).origin&&!((process.env.LUMI_ALLOWED_ORIGINS??'').split(',').includes(request.headers.get('origin')??'invalid')))return NextResponse.json({error:'Origen no autorizado.'},{status:403,headers});
 const raw=await request.text();if(raw.length>4096)return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413,headers});
 const body=parseSupply(await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null));
 if(!body)return NextResponse.json({error:'La configuración del suministro es incompatible o contiene campos inválidos.'},{status:400,headers});
 try{await saveTariffProfile(auth.userId,auth.meter.deviceId,body);return NextResponse.json({profile:body,resolution:supplyResolution(body,new Date().toISOString())},{headers});}catch(error){return NextResponse.json({code:error instanceof SupplyStorageError?error.code:'SUPPLY_SAVE_FAILED',error:error instanceof SupplyStorageError?error.message:'No se pudo guardar el suministro. Reintentá; tus cambios siguen en el formulario.'},{status:error instanceof SupplyStorageError?error.status:503,headers});}
}
