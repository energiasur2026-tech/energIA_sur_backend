import {SPSE_CATEGORIES} from './tariff-categories';
import {resolveTariff} from './electricity-billing';
export const PROVINCES=['Buenos Aires','Ciudad Autónoma de Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'];
export type SupplyProfile={province:string;locality:string;provider:string;jurisdiction:string;category:string;segment:string;bonus:string;providerConfirmed:boolean;categoryText?:string};
export const SUPPLY_CATALOG={provinces:PROVINCES,localities:{'Santa Cruz':['Río Gallegos']},providers:[{id:'SPSE',name:'Servicios Públicos Sociedad del Estado (SPSE)',province:'Santa Cruz',source:'https://spse.ar/atencion-cliente',reviewedOn:'2026-11-11',categories:SPSE_CATEGORIES.map(c=>c.code),categoryOptions:SPSE_CATEGORIES}],note:'Catálogo inicial. Otras localidades y proveedores se pueden registrar sin atribuirles una tarifa. La selección del proveedor debe confirmarse con la factura; la provincia no lo determina.'};
export function parseSupply(value:unknown):SupplyProfile|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>,keys=['province','locality','provider','jurisdiction','category','segment','bonus','providerConfirmed'];
 if(Object.keys(v).some(k=>!keys.includes(k)&&k!=='categoryText')||keys.some(k=>k!=='providerConfirmed'&&typeof v[k]!=='string')||typeof v.providerConfirmed!=='boolean')return null;
 if(v.categoryText!==undefined&&(typeof v.categoryText!=='string'||v.categoryText.trim().length>120||/[<>\x00-\x1f]/.test(v.categoryText)))return null;
 const p=Object.fromEntries(keys.map(k=>[k,typeof v[k]==='string'?(v[k] as string).trim():v[k]])) as SupplyProfile;
 if(typeof v.categoryText==='string')p.categoryText=v.categoryText.trim();
 if(p.province&&!PROVINCES.includes(p.province)||p.locality.length>100||/[<>\x00-\x1f]/.test(p.locality)||!['','SPSE','other'].includes(p.provider)||!['','unknown','other',...SPSE_CATEGORIES.map(c=>c.code)].includes(p.category)||!['','subsidized','unsubsidized'].includes(p.segment)||!['','none','other'].includes(p.bonus)||p.jurisdiction!==(p.province?'AR-'+p.province:''))return null;
 if(p.provider==='SPSE'&&p.province!=='Santa Cruz'||p.provider==='other'&&p.category&&!['unknown','other'].includes(p.category))return null;
 return p;
}
export function supplyResolution(profile:Partial<SupplyProfile>|null,from:string,to=from){
 const result=(code:string,reason:string,definition:ReturnType<typeof resolveTariff>=null)=>({code,reason,definition});
 if(!profile?.province||!profile.locality||!profile.provider)return result('supply_required','Falta configurar la ubicación y el proveedor del suministro.');
 if(!profile.category||profile.category==='unknown')return result('category_required','Falta identificar tu categoría para calcular el costo en pesos.');
 const missing=[!profile.providerConfirmed?'confirmación del proveedor':'',!profile.segment?'condición de subsidio':'',!profile.bonus?'otras bonificaciones':''].filter(Boolean);
 const extra=missing.length?' Además falta completar: '+missing.join(', ')+'.':'';
 if(profile.category==='other')return result('tariff_unavailable','La categoría puede conservarse como no catalogada; todavía no hay una tarifa verificada para calcular pesos.'+extra);
 if(profile.provider==='SPSE'&&!['1','3','4','5'].includes(profile.category))return result('tariff_unavailable','Categoría identificada, pero todavía no hay una regla de cálculo verificada cargada para ella. Los kWh siguen disponibles.'+extra);
 if(missing.length)return result('incomplete_configuration','Falta completar: '+missing.join(', ')+'. Revisá esos datos en la factura.');
 if(profile.jurisdiction!=='AR-'+profile.province||profile.provider==='SPSE'&&profile.province!=='Santa Cruz')return result('incompatible_configuration','La configuración de provincia y proveedor es incompatible.');
 if(profile.provider!=='SPSE'||!['1','3','4','5'].includes(profile.category)||profile.bonus!=='none')return result('tariff_unavailable','No existe una tarifa verificada para este proveedor, categoría o bonificación.');
 const definition=resolveTariff(profile.provider,profile.jurisdiction,profile.segment??'',from,to);
 if(!definition)return result('tariff_unavailable','No hay una versión documentada que cubra todo el período. Los cambios dentro del intervalo requieren reglas oficiales de liquidación.');
 return result('reference_only','Cuadro de cargos eléctricos documentado. La liquidación, los ajustes y los impuestos pendientes impiden determinar el total final.',definition);
}
