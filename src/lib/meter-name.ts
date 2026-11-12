import 'server-only';
import {supabase} from './supabase';
export async function saveMeterName(user:string,device:string,name:string){
 const {data,error}=await supabase().from('meters').update({name}).eq('device_id',device).eq('owner_id',user).select('device_id').maybeSingle();
 if(error||!data)throw new Error('No se pudo guardar el nombre del medidor.');
}
