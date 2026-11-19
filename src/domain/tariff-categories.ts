import {COOPRG,COOPRG_CATEGORIES,COOPRG_GUIDE,isRioGrande} from './rio-grande';
import {EDESUR_CATEGORIES,EDESUR_PROVINCES} from './edesur';

/** Verified classification, not a recommendation or an inference about a customer's contract. */
export const CATEGORY_SOURCE='https://spse.ar/atencion-cliente#calcularConsumo';
const groups=[{label:'Residencial',codes:['1','3','4','5'],pricingAvailable:true},{label:'Comercial',codes:['11','22','91'],pricingAvailable:false},{label:'General',codes:['31','41','51'],pricingAvailable:false}];
export const SPSE_CATEGORIES=groups.flatMap(g=>g.codes.map(code=>({code,label:g.label+' · código '+code,group:g.label,pricingAvailable:g.pricingAvailable,source:CATEGORY_SOURCE,effectiveFrom:'2026-07-01',reviewedOn:'2026-11-11'})));
export type AssistanceContext={province:string;locality:string;provider:string};
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function categoryAssistance(context:AssistanceContext,text=''){
 const input=text.trim(),q=normalize(input),supported=context.provider==='SPSE'&&context.province==='Santa Cruz';
 const guide='Te ayudo a encontrarla. ¿Tenés una factura de este suministro? Busquemos un campo como «Tarifa», «Categoría tarifaria» o «Tipo de usuario». La ubicación y el nombre pueden variar según el proveedor.';
 const common={context,inputText:input,source:supported?CATEGORY_SOURCE:null,reviewedOn:'2026-11-11',attachmentsAvailable:false,proposal:null as null|{code:string;label:string;inputText:string;pricingAvailable:boolean},message:guide,status:'guide'};
 if(context.provider===COOPRG&&isRioGrande(context.province,context.locality)){
  const message='En la factura de la Cooperativa buscá el apartado Suministro. Ahí figura tu categoría, por ejemplo TR1 - Uso Residencial. Copiá solo ese campo.';
  const token=q.match(/^(?:tarifa[: ]+)?(tr[12]|t\s*1\s*-?\s*r[12]|t\s*1\s*-?\s*[ge]|t2p|tm1)(?:\s*[-–·]\s*[a-z ]+)?$/)?.[1];
  const code=token?.replace(/[ -]/g,'').replace(/^t1r/,'tr').toUpperCase();
  const category=COOPRG_CATEGORIES.find(c=>c.code===code);
  const metadata={source:COOPRG_GUIDE,reviewedOn:'2026-11-18'};
  if(!category)return {...common,...metadata,status:input?'unknown':'guide',message};
  return {...common,...metadata,status:'recognized',message:'La categoría indicada es '+category.label+'.',proposal:{code:category.code,label:category.label,inputText:input,pricingAvailable:category.pricingAvailable}};
 }
 if(context.provider==='EDESUR'&&EDESUR_PROVINCES.includes(context.province)){
  const message='En la sección de datos del suministro de Edesur, buscá «Tarifa», por ejemplo «T1 R Residencial 1 M». Copiá solo ese campo o su código (por ejemplo R1).';
  const code=/^[rg][1-6]$/.test(q)?q.toUpperCase():q.match(/^(?:tarifa[: ]+)?t1\s+r\s+residencial\s+([1-6])(?:\s+m)?$/)?.[1];
  const category=EDESUR_CATEGORIES.find(c=>c.code===(code?.length===1?'R'+code:code));
  const metadata={source:EDESUR_CATEGORIES[0].source,reviewedOn:EDESUR_CATEGORIES[0].reviewedOn};
  if(!category)return {...common,...metadata,status:input?'unknown':'guide',message};
  return {...common,...metadata,status:'recognized',message:'Ese campo corresponde a '+category.label+'.',proposal:{code:category.code,label:category.label,inputText:input,pricingAvailable:true}};
 }
 if(!input)return {...common,message:guide+(supported?' SPSE publica códigos residenciales, comerciales y generales; copiá el código tal como figura. La condición de subsidio se confirma por separado.':' Confirmá el proveedor de la factura; no puedo asignar una categoría solo por la ubicación.')};
 if(/recomend|conviene|cambiar.*categor|elegi.*por mi/.test(q))return {...common,status:'not_recommendation',message:'Debés registrar la categoría que corresponde a tu suministro y figura en la factura. No te recomiendo una categoría arbitraria. Para cambiarla hay que consultar los requisitos del proveedor; es un trámite distinto de configurar la actual.'};
 if(/donde|como.*(?:encuentro|ubico|localizo|busco)|no encuentro (?:el campo|la categor)/.test(q))return {...common,status:'guide',message:guide+' No tengo verificada una posición fija en la factura de este proveedor. Si no aparece, consultá su atención comercial.'};
 if(/no (?:tengo|encuentro|hay).*factura|sin factura|no la tengo|no cuento con.*factura|no se (?:mi|la) categor/.test(q))return {...common,status:'invoice_needed',message:'Podés guardar el suministro con «No sé mi categoría» y completar después. Cuando tengas una factura, copiá solo el campo de categoría o consultalo con el proveedor. Mientras tanto siguen disponibles los kWh; no asignaré un código por tu ubicación o consumo.'};
 if(!supported)return {...common,status:'provider_unavailable',message:'No tengo un catálogo verificado de categorías para ese proveedor y jurisdicción. Podés registrar el texto exacto como «Conozco mi categoría, pero no aparece», sin asignarle una tarifa ni calcular pesos.'};
 const numbers=[...q.matchAll(/\b\d+\b/g)].map(m=>m[0]);
 if(/subsid|nivel|segment|bonific|tarifa social|\bn[123]\b/.test(q)&&!/(?:categor(?:ia)?|tarifa)\s*[:#-]?\s*\d/.test(q))return {...common,status:'subsidy_not_category',message:'Eso parece indicar el nivel o condición de subsidio, que es un dato distinto de la categoría tarifaria. Buscá el campo «Categoría» o «Tarifa» y copiá su código; no voy a convertir un nivel de subsidio en una categoría.'};
 const mentions=groups.filter(g=>q.includes(normalize(g.label))||q.includes(normalize(g.label)+'es'));
 if(numbers.length!==1){return {...common,status:numbers.length>1||mentions.length?'ambiguous':'unknown',message:numbers.length>1?'Hay más de un código posible. Copiá solo el campo de categoría de esta factura; no puedo elegir entre ellos.':mentions.length?'Esa denominación agrupa varios códigos oficiales de SPSE. Me falta el código exacto de tu factura; no alcanza con indicar el uso residencial, comercial o general.':'No reconozco una categoría oficial en ese texto. Copiá únicamente el campo tarifario. Si conocés el dato pero no aparece en el catálogo, podés registrarlo como categoría no catalogada, sin cálculo en pesos.'};}
 const match=SPSE_CATEGORIES.find(c=>c.code===numbers[0]);
 if(!match)return {...common,status:'unknown',message:'Ese código no está en el catálogo verificado de SPSE. No le asigné una equivalencia. Podés consultar al proveedor o registrarlo como «Conozco mi categoría, pero no aparece», sin cálculo en pesos.'};
 if(/(?:^|[:\s])[-−]\d/.test(q))return {...common,status:'unknown',message:'No encontré ese código exacto en el catálogo. No voy a quitar signos ni modificar el dato para asignarle una categoría.'};
 const isCodeOnly=/^\d+$/.test(q),hasField=/(?:categor(?:ia)?|tarifa|tipo de usuario)\s*[:#-]?\s*\d+\b/.test(q);
 const groupAndCodeOnly=/^(?:(?:categoria|tarifa|tipo de usuario)\s*[:#-]?\s*)?(?:residencial(?:es)?|comercial(?:es)?|general(?:es)?)\s*[·:-]?\s*\d+$/.test(q);
 if(!isCodeOnly&&!hasField&&!groupAndCodeOnly)return {...common,status:'ambiguous',message:'Veo un número, pero no puedo asegurar que sea la categoría. Copiá el campo «Categoría» o «Tarifa», o escribí solo su código. No uses el número de cliente, el consumo ni el subsidio.'};
 if(mentions.some(g=>g.label!==match.group))return {...common,status:'inconsistent',message:'La denominación y el código no coinciden con los grupos publicados por SPSE. Revisá el campo completo con el proveedor; no aplicaré una equivalencia.'};
 return {...common,status:'recognized',proposal:{code:match.code,label:match.label,inputText:input,pricingAvailable:match.pricingAvailable},message:'El texto que ingresaste es «'+input+'», que corresponde a «'+match.label+'» en el catálogo de SPSE. ¿Querés aplicarla a este suministro?'+(!match.pricingAvailable?' El código puede guardarse, pero todavía no hay una regla de cálculo verificada cargada para esta categoría.':' Aplicarla no confirma el subsidio ni completa los datos que puedan faltar.')};
}
