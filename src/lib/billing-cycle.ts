import 'server-only';
import { supabase } from './supabase';
export class BillingStorageError extends Error {
 constructor(public readonly storageCode:string){
  super('Billing cycle storage failed');
 }
}
export async function getBillingClose(userId:string,deviceId:string,strict=false):Promise<string|null>{
 const {data,error}=await supabase().from('user_meter_billing_cycles').select('closed_on').eq('user_id',userId).eq('device_id',deviceId).maybeSingle();
 if(error){if(!strict&&['42P01','PGRST205'].includes(error.code))return null;throw new BillingStorageError(error.code);}
 return data?.closed_on??null;
}
export async function setBillingClose(userId:string,deviceId:string,closedOn:string){
 const {error}=await supabase().from('user_meter_billing_cycles').upsert({user_id:userId,device_id:deviceId,closed_on:closedOn,updated_at:new Date().toISOString()},{onConflict:'user_id,device_id'});
 if(error)throw new BillingStorageError(error.code);
}
