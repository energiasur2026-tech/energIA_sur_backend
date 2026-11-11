import 'server-only';
import { supabase } from './supabase';
export async function getBillingClose(userId:string,deviceId:string):Promise<string|null>{
 const {data,error}=await supabase().from('user_meter_billing_cycles').select('closed_on').eq('user_id',userId).eq('device_id',deviceId).maybeSingle();
 if(error){if(['42P01','PGRST205'].includes(error.code))return null;throw new Error('No se pudo leer el cierre de factura.');}
 return data?.closed_on??null;
}
export async function setBillingClose(userId:string,deviceId:string,closedOn:string){
 const {error}=await supabase().from('user_meter_billing_cycles').upsert({user_id:userId,device_id:deviceId,closed_on:closedOn,updated_at:new Date().toISOString()},{onConflict:'user_id,device_id'});
 if(error)throw new Error('No se pudo guardar el cierre. Verificá la migración 0020.');
}
