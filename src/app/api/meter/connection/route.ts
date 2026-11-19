import {NextResponse} from 'next/server';
import {isErrorResponse,requireMeter} from '@/lib/api-auth';
import {getDeviceDetails} from '@/lib/tuya';

const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request) {
  try {
    const auth=await requireMeter(request);
    if(isErrorResponse(auth))return auth;
    const device=await getDeviceDetails(auth.meter.deviceId);
    return NextResponse.json({online:typeof device.online==='boolean'?device.online:null},{headers});
  } catch {
    return NextResponse.json({error:'No pudimos comprobar la conexión con Tuya.'},{status:502,headers});
  }
}
