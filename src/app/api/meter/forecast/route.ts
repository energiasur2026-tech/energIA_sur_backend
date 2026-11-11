import { NextResponse } from 'next/server';
import { requireMeter,isErrorResponse,meterIdFrom } from '@/lib/api-auth';
import { apiError } from '@/lib/api-error';
import { buildMonthlyProjection, argentinaMonth, calendarMonth } from '@/domain/monthly-projection';
import { buildRecommendations } from '@/domain/recommendations';
import { getLumiReadings } from '@/lib/readings';
import { personalGoal } from '@/lib/personal-goals';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';
export async function GET(request:Request){
 try{const auth=await requireMeter(meterIdFrom(request));if(isErrorResponse(auth))return auth;
 const now=new Date(),month=new URL(request.url).searchParams.get('month')??argentinaMonth(now);
 let bounds;try{bounds=calendarMonth(month,now);}catch{return NextResponse.json({error:'Mes inválido.'},{status:400});}
 if(+bounds.start>+now)return NextResponse.json({error:'Seleccioná el mes actual o uno anterior.'},{status:400});
 const end=new Date(Math.min(+bounds.end,+now));
 const [{readings,truncated},choice,profile]=await Promise.all([
  getLumiReadings(auth.meter.deviceId,new Date(+bounds.start-86400000),end),personalGoal(auth.userId,auth.meter),
  repos.readings.hourlyProfile(auth.meter.deviceId,bounds.start,end),
 ]);
 const projection=buildMonthlyProjection({rows:readings as Parameters<typeof buildMonthlyProjection>[0]['rows'],month,now,choice,fixed:auth.meter.role==='central',tariffValid:process.env.ENERGY_TARIFF_ENABLED!=='false',intervalMinutes:auth.meter.collectionIntervalMinutes,truncated});
 return NextResponse.json({...projection,role:auth.meter.role,meterName:auth.meter.name,profile:projection.quality.completeDays>=3?profile:null,profileMinDays:3,lookbackDays:bounds.days,recommendations:buildRecommendations(projection.goal,projection.quality.completeDays>=3?profile:null,{from:bounds.start.toISOString(),to:end.toISOString()})},{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 }catch(e){return apiError('forecast',e);}
}
