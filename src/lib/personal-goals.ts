import {billingContext} from './tariff-profile';
import 'server-only';
import { supabase } from './supabase';
import { goalStorageError } from './goal-storage-error';
import { convertGoal, TARIFF_VERSION, type GoalChoice } from '@/domain/monthly-projection';
import type { Meter } from './meters';
export async function personalGoal(userId:string,meter:Meter):Promise<GoalChoice>{
 const {data,error}=await supabase().from('user_meter_goals').select('input_mode,input_value,tariff_version').eq('user_id',userId).eq('device_id',meter.deviceId).maybeSingle();
 if(error && !['42P01','PGRST205'].includes(error.code))throw goalStorageError(error);
 if(data)return data.input_value===null?null:{mode:data.input_mode,value:Number(data.input_value),tariffVersion:data.tariff_version};
 // Legacy database discarded the original ARS amount. Preserve the stored energy, never invent the original budget.
 return meter.ownerId===userId&&meter.goalKwh!==null?{mode:'kwh',value:meter.goalKwh,tariffVersion:'legacy-kwh'}:null;
}
export async function savePersonalGoal(userId:string,meter:Meter,choice:GoalChoice){
 const context=await billingContext(userId,meter.deviceId,new Date().toISOString());
 const {error}=await supabase().from('user_meter_goals').upsert({user_id:userId,device_id:meter.deviceId,input_mode:choice?.mode??'kwh',input_value:choice?.value??null,tariff_version:context.definition?.id??TARIFF_VERSION,updated_at:new Date().toISOString()},{onConflict:'user_id,device_id'});
 if(error)throw goalStorageError(error);
}
export async function withPersonalGoal(userId:string,meter:Meter):Promise<Meter>{
 const choice=await personalGoal(userId,meter);const context=await billingContext(userId,meter.deviceId,new Date().toISOString());return {...meter,goalKwh:choice?convertGoal(choice.mode,choice.value,meter.role==='central',process.env.ENERGY_TARIFF_ENABLED!=='false'&&!!context.definition,context).kwh:null,goalInputMode:choice?.mode??'kwh'};
}
