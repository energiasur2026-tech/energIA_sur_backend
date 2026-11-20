import {eventBounds} from '@/domain/event-period';
import {NextResponse} from 'next/server';
import {isErrorResponse,requireMeter} from '@/lib/api-auth';
import {getBillingClose} from '@/lib/billing-cycle';
import {billingSpend,detectorIsCurrent,periodAnomalies} from '@/lib/monitor-period';
import {apiError} from '@/lib/api-error';

export async function GET(request:Request) {
  try {
    const auth=await requireMeter(request);
    if(isErrorResponse(auth))return auth;
    const now=new Date(),close=await getBillingClose(auth.userId,auth.meter.deviceId);
    const from=eventBounds('current',now).from;
    const [spend,anomalies]=await Promise.allSettled([
      billingSpend(auth.userId,auth.meter,close,now),
      periodAnomalies(auth.meter.deviceId,from,now,false,auth.meter.thresholds,false,detectorIsCurrent(auth.meter,now)),
    ]);
    if(spend.status==='rejected')console.error('[api/meter/monitor-period] Error al calcular gasto:',spend.reason);
    if(anomalies.status==='rejected')console.error('[api/meter/monitor-period] Error al calcular anomalías:',anomalies.reason);
    return NextResponse.json({spend:spend.status==='fulfilled'?spend.value:null,anomalies:anomalies.status==='fulfilled'?anomalies.value:null},
      {headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
  }catch(error){return apiError('monitor-period',error);}
}
