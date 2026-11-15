import 'server-only';
import {supabase} from './supabase';
import {supplyStorageError} from './supply-storage-error';
import type {BillingContext} from '@/domain/electricity-billing';
import {supplyResolution,type SupplyProfile} from '@/domain/supply-profile';
export type TariffProfile=Partial<SupplyProfile>&{provider:string;jurisdiction:string;segment:string};
export async function tariffProfile(user:string,meter:string):Promise<TariffProfile|null>{
 const {data,error}=await supabase().from('user_meter_tariff_profiles').select('*').eq('user_id',user).eq('device_id',meter).maybeSingle();
 if(error){if(['42P01','PGRST205'].includes(error.code))return null;throw new Error('No se pudo recuperar el suministro.');}
 if(!data)return null;
 return {province:data.province??'',locality:data.locality??'',provider:data.provider,jurisdiction:data.jurisdiction,category:data.category??'',categoryText:data.category_text??'',segment:data.segment,bonus:data.bonus??'',providerConfirmed:data.provider_confirmed===true};
}
export async function billingContext(user:string,meter:string,from:string,to=from,options?:{allowBaseWithoutBonus?:boolean}):Promise<BillingContext>{
 const profile=await tariffProfile(user,meter),resolution=supplyResolution(profile,from,to);
 // Only Lumi may quote the documented base before extra bonuses are confirmed.
 // This never changes the saved declaration or infers that no bonus exists.
 if(options?.allowBaseWithoutBonus&&profile&&!profile.bonus&&resolution.code==='incomplete_configuration'){
  const base=supplyResolution({...profile,bonus:'none'},from,to);
  if(base.definition)return {configured:true,from,to,...base,code:'base_reference_pending_bonus',reason:'Referencia de energía y cargo fijo sin aplicar bonificaciones adicionales: todavía no están confirmadas en el suministro guardado. No es el total final de la factura.'};
 }
 return {configured:!!profile,from,to,...resolution};
}
export async function saveTariffProfile(user:string,meter:string,p:SupplyProfile){
 const {error}=await supabase().from('user_meter_tariff_profiles').upsert({user_id:user,device_id:meter,provider:p.provider,jurisdiction:p.jurisdiction,segment:p.segment,province:p.province,locality:p.locality,category:p.category,category_text:p.category==='other'?(p.categoryText??''):'',bonus:p.bonus,provider_confirmed:p.providerConfirmed,updated_at:new Date().toISOString()},{onConflict:'user_id,device_id'});
 if(error)throw supplyStorageError(error);
}
export async function lumiSupply(user:string,meter:string){
 const p=await tariffProfile(user,meter);const resolution=supplyResolution(p,new Date().toISOString());
 return {country:p?.province?'AR':'unknown',province:p?.province??'unknown',locality:p?.locality??'',distributor:p?.providerConfirmed?p.provider:'unknown',category:p?.category??'',segment:p?.segment??'',source:'supply_settings',timezone:'America/Argentina/Buenos_Aires',tariffStatus:resolution.code,tariffNote:resolution.reason,tariffVersion:resolution.definition?.id??null};
}
