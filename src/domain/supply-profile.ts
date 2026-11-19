import {SPSE_CATEGORIES} from './tariff-categories';
import {resolveTariff,tariffForLocality} from './electricity-billing';
import {EDESUR_CATEGORIES,EDESUR_PARTIDOS,EDESUR_PROVINCES} from './edesur';
import {COOPRG,COOPRG_CATEGORIES,COOPRG_PROVINCE,COOPRG_SOURCE,isRioGrande} from './rio-grande';
export const PROVINCES=['Buenos Aires','Ciudad Autónoma de Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'];
export type SupplyProfile={province:string;locality:string;provider:string;jurisdiction:string;category:string;segment:string;bonus:string;providerConfirmed:boolean;categoryText?:string;providerName?:string;supplyType?:string;constructionCharge?:string};
export const SUPPLY_CATALOG={provinces:PROVINCES,localities:{'Santa Cruz':['Río Gallegos'],'Tierra del Fuego':['Río Grande'],'Buenos Aires':EDESUR_PARTIDOS,'Ciudad Autónoma de Buenos Aires':['Ciudad Autónoma de Buenos Aires']},providers:[{id:'SPSE',name:'Servicios Públicos Sociedad del Estado (SPSE)',province:'Santa Cruz',source:'https://spse.ar/atencion-cliente',reviewedOn:'2026-11-11',categories:SPSE_CATEGORIES.map(c=>c.code),categoryOptions:SPSE_CATEGORIES},{id:'EDESUR',name:'Edesur',legalName:'Empresa Distribuidora Sur S.A.',country:'AR',currency:'ARS',regulator:'ENReGE',website:'https://www.edesur.com.ar/',active:true,provinces:EDESUR_PROVINCES,source:EDESUR_CATEGORIES[0].source,reviewedOn:EDESUR_CATEGORIES[0].reviewedOn,categories:EDESUR_CATEGORIES.map(c=>c.code),categoryOptions:EDESUR_CATEGORIES},{id:COOPRG,name:'Cooperativa Eléctrica de Río Grande',legalName:'Cooperativa Eléctrica y Otros Servicios Públicos de Río Grande Limitada',taxId:'30-54581908-9',province:COOPRG_PROVINCE,locality:'Río Grande',country:'AR',currency:'ARS',website:'https://www.cooprg.org.ar/',emergencyPhone:'0800-222-2452',active:true,source:COOPRG_SOURCE,reviewedOn:'2026-11-18',categories:COOPRG_CATEGORIES.map(c=>c.code),categoryOptions:COOPRG_CATEGORIES}],note:'Catálogo inicial. Otras localidades y proveedores se pueden registrar sin atribuirles una tarifa. La selección del proveedor debe confirmarse con la factura; la provincia no lo determina.'};
export function parseSupply(value:unknown):SupplyProfile|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>,keys=['province','locality','provider','jurisdiction','category','segment','bonus','providerConfirmed'];
 if(Object.keys(v).some(k=>!keys.includes(k)&&!['categoryText','providerName','supplyType','constructionCharge'].includes(k))||keys.some(k=>k!=='providerConfirmed'&&typeof v[k]!=='string')||typeof v.providerConfirmed!=='boolean')return null;
 if(v.categoryText!==undefined&&(typeof v.categoryText!=='string'||v.categoryText.trim().length>120||/[<>\x00-\x1f]/.test(v.categoryText)))return null;
 const p=Object.fromEntries(keys.map(k=>[k,typeof v[k]==='string'?(v[k] as string).trim():v[k]])) as SupplyProfile;
 if(typeof v.categoryText==='string')p.categoryText=v.categoryText.trim();
 if(v.supplyType!==undefined&&(!['','single-phase','three-phase'].includes(String(v.supplyType))||typeof v.supplyType!=='string'))return null;
 if(v.constructionCharge!==undefined&&(!['','yes','no'].includes(String(v.constructionCharge))||typeof v.constructionCharge!=='string'))return null;
 if(v.providerName!==undefined&&(typeof v.providerName!=='string'||v.providerName.length>80||
   (v.providerName.trim()&&!/^[\p{L}][\p{L} .&()-]{2,79}$/u.test(v.providerName.trim()))))return null;
 if(p.provider==='other'&&typeof v.providerName==='string')p.providerName=v.providerName.trim();
 if(typeof v.supplyType==='string')p.supplyType=v.supplyType;
 if(p.provider===COOPRG){
  if(!isRioGrande(p.province,p.locality))return null;
  const category=COOPRG_CATEGORIES.find(c=>c.code===p.category);
  if(category&&p.segment&&category.segment!==p.segment)return null;
  if(typeof v.constructionCharge==='string')p.constructionCharge=v.constructionCharge;
 }
 if(p.province&&!PROVINCES.includes(p.province)||p.locality.length>100||/[<>\x00-\x1f]/.test(p.locality)||!['','SPSE','EDESUR',COOPRG,'other'].includes(p.provider)||!['','unknown','other',...(p.provider===COOPRG?COOPRG_CATEGORIES:p.provider==='EDESUR'?EDESUR_CATEGORIES:SPSE_CATEGORIES).map(c=>c.code)].includes(p.category)||!['','subsidized','unsubsidized'].includes(p.segment)||!['','none','other'].includes(p.bonus)||p.jurisdiction!==(p.province?'AR-'+p.province:''))return null;
 if(p.provider==='EDESUR'&&!EDESUR_PROVINCES.includes(p.province)||p.provider==='SPSE'&&p.province!=='Santa Cruz'||p.provider==='other'&&p.category&&!['unknown','other'].includes(p.category))return null;
 return p;
}
export function supplyResolution(profile:Partial<SupplyProfile>|null,from:string,to=from){
 const result=(code:string,reason:string,definition:ReturnType<typeof resolveTariff>=null)=>({code,reason,definition});
 if(!profile?.province||!profile.locality||!profile.provider)return result('supply_required','Falta configurar la ubicación y el proveedor del suministro.');
 if(!profile.category||profile.category==='unknown')return result('category_required','Falta identificar tu categoría para calcular el costo en pesos.');
 const missing=[!profile.providerConfirmed?'confirmación del proveedor':'',!profile.segment&&!(profile.provider==='EDESUR'&&/^G[1-3]$/.test(profile.category))?'condición de subsidio':'',!profile.bonus?'otras bonificaciones':''].filter(Boolean);
 const extra=missing.length?' Además falta completar: '+missing.join(', ')+'.':'';
 if(profile.category==='other')return result('tariff_unavailable','La categoría puede conservarse como no catalogada; todavía no hay una tarifa verificada para calcular pesos.'+extra);
 if(profile.provider==='SPSE'&&!['1','3','4','5'].includes(profile.category))return result('tariff_unavailable','Categoría identificada, pero todavía no hay una regla de cálculo verificada cargada para ella. Los kWh siguen disponibles.'+extra);
 if(profile.provider===COOPRG){
  if(!isRioGrande(profile.province,profile.locality)||profile.jurisdiction!=='AR-'+COOPRG_PROVINCE)return result('incompatible_configuration','Confirmá la localidad de Río Grande.');
  if(!profile.providerConfirmed)return result('incomplete_configuration','Confirmá la Cooperativa según tu factura.');
  const category=COOPRG_CATEGORIES.find(c=>c.code===profile.category);
  if(!category?.pricingAvailable)return result('tariff_unavailable','Esta categoría requiere datos de potencia contratada o energía por banda.');
  if(profile.segment&&category.segment!==profile.segment)return result('incompatible_configuration','Revisá la condición de subsidio junto a la categoría de la factura.');
  const definition=resolveTariff(COOPRG,profile.jurisdiction,category.segment,from,to);
  if(!definition)return result('tariff_unavailable','No hay un cuadro de Río Grande verificado para todo el período. El último publicado consultado corresponde a octubre de 2026.');
  const construction=profile.constructionCharge==='yes'?['Declaraste cargo luz de obra. Falta verificar la alícuota y su base para esta estimación.']:profile.constructionCharge==='no'?[]:['Confirmá si corresponde cargo luz de obra en tu factura.'];
  return result('reference_only','Referencia de energía por escalones, cargo fijo y cuota de capitalización. El total final requiere los demás conceptos de la factura.',{...definition,pendingNotes:[...(definition.pendingNotes??[]),...construction,'Bomberos, alumbrado, fondo compensador y otros conceptos según factura.']});
 }
 if(profile.provider==='EDESUR'){
  if(!EDESUR_PROVINCES.includes(profile.province)||profile.jurisdiction!=='AR-'+profile.province)return result('incompatible_configuration','Revisá la jurisdicción del suministro de Edesur.');
  const category=EDESUR_CATEGORIES.find(c=>c.code===profile.category);
  const segment=category?.group==='General'?'general':profile.segment;
  if(!profile.providerConfirmed||!segment)return result('incomplete_configuration',!profile.providerConfirmed?'Confirmá Edesur según tu factura.':'Indicá la condición de subsidio de tu suministro.');
  const definition=category?resolveTariff('EDESUR',profile.jurisdiction,segment,from,to):null;
  return definition
   ?result('reference_only','Estimación parcial de cargos eléctricos. La categoría estimada depende del consumo mensual equivalente. Quedan pendientes los impuestos, bonificaciones adicionales y la liquidación definitiva.',tariffForLocality(definition,profile.locality))
   :result('tariff_unavailable','No hay un cuadro de Edesur verificado para toda la categoría y el período solicitados.');
 }
 if(missing.length)return result('incomplete_configuration','Falta completar: '+missing.join(', ')+'. Revisá esos datos en la factura.');
 if(profile.jurisdiction!=='AR-'+profile.province||profile.provider==='SPSE'&&profile.province!=='Santa Cruz')return result('incompatible_configuration','La configuración de provincia y proveedor es incompatible.');
 if(profile.provider!=='SPSE'||!['1','3','4','5'].includes(profile.category)||profile.bonus!=='none')return result('tariff_unavailable','No existe una tarifa verificada para este proveedor, categoría o bonificación.');
 const definition=resolveTariff(profile.provider,profile.jurisdiction,profile.segment??'',from,to);
 if(!definition)return result('tariff_unavailable','No hay una versión documentada que cubra todo el período. Los cambios dentro del intervalo requieren reglas oficiales de liquidación.');
 return result('reference_only','Cuadro de cargos eléctricos documentado. La liquidación, los ajustes y los impuestos pendientes impiden determinar el total final.',definition);
}
