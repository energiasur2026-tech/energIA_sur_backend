import type {TariffDefinition} from './electricity-billing';

export const COOPRG = 'COOPRG';
export const COOPRG_PROVINCE = 'Tierra del Fuego';
export const COOPRG_SOURCE = 'https://www.cooprg.org.ar/clientes/cuadro-tarifario-y-resoluciones/';
export const COOPRG_SIMULATOR = 'https://www.cooprg.org.ar/simuladoryleerfactura/simulador-tarifas.html';
export const COOPRG_GUIDE = 'https://www.cooprg.org.ar/simuladoryleerfactura/como-leer-tu-factura.html';
const reviewedOn = '2026-11-18';
export const COOPRG_CATEGORIES = [
  {code:'TR1', label:'TR1 · Residencial sin subsidio', segment:'unsubsidized', group:'Residencial'},
  {code:'TR2', label:'TR2 · Residencial subsidiado', segment:'subsidized', group:'Residencial'},
  {code:'T1G', label:'T1G · Uso general', segment:'general', group:'General'},
  {code:'T1E', label:'T1E · Entidades de bien público', segment:'public-interest', group:'General'},
  {code:'T2P', label:'T2P · Mediana demanda con contrato', segment:'demand', group:'Potencia'},
  {code:'TM1', label:'TM1 · Gran demanda', segment:'large-demand', group:'Potencia'},
].map(category=>({...category, pricingAvailable:category.code!=='TM1',
  source:COOPRG_SOURCE, reviewedOn, effectiveFrom:category.code==='T1E'?'2026-09-01':'2026-07-01'}));

export function isRioGrande(province:string, locality:string) {
  return province===COOPRG_PROVINCE && locality.localeCompare('Río Grande','es',{sensitivity:'base'})===0;
}

type Rates = [fixed:number, first:number, second:number, third:number];
type Table = {month:string; path:string; residential:Rates; subsidized:Rates; general:Rates; publicInterest?:Rates; demand:[fixed:number,energyRate:number,contractedRate:number]; subsidizedLimit:number; capitalization:number};
const tables: Table[] = [
  {month:'07', path:'2026-07 Julio/Cuadro Tarifario Reso SEN 109-2026 - desde 1-07-2026.pdf',
    residential:[8437.77,157.11,170.10,186.24], subsidized:[5208.62,90.37,106.67,186.24],
    general:[9793,189.87,205.81,228.04], demand:[43795.49,148.30,36942.22], subsidizedLimit:150, capitalization:25},
  {month:'08', path:'2026-08 Agosto/Cuadro Tarifario Reso SEN 190-2026 - desde 1-08-2026.pdf',
    residential:[8138.09,145.33,158.59,175.08], subsidized:[5159.72,87.37,104.02,175.08],
    general:[9522.37,178.78,195.07,217.77], demand:[44734.41,136.33,36796.50], subsidizedLimit:150, capitalization:25},
  {month:'09', path:'2026-09 Septiembre/Cuadro Tarifario Res SEN 190-2026 - desde 01-Sep-2026.pdf',
    residential:[8228.09,146.69,160.26,177.12], subsidized:[4896.63,81.77,160.26,177.12],
    general:[9643.52,180.90,197.55,220.77], demand:[45741.15,137.50,37442.85], publicInterest:[6539.23,119.43,136.08,159.30],
    subsidizedLimit:200, capitalization:26},
  {month:'10', path:'2026-10 Octubre/Cuadro Tarifario Reso SEN 190-2026 - desde 1-10-2026.pdf',
    residential:[8317.50,148.06,161.92,179.14], subsidized:[4981.07,83.05,161.92,179.14],
    general:[9763.88,183.01,200.03,223.75], demand:[46741.34,138.65,38085], publicInterest:[6659.59,121.54,138.56,162.28],
    subsidizedLimit:200, capitalization:26},
];

export const COOPRG_TARIFFS: TariffDefinition[] = tables.flatMap(table => {
  const effectiveFrom = '2026-'+table.month+'-01';
  const effectiveTo = new Date(Date.UTC(2026,Number(table.month),1)).toISOString().slice(0,10);
  function define(code:string, [fixed,...rates]:Rates, limits:number[]):TariffDefinition {
    const category = COOPRG_CATEGORIES.find(item=>item.code===code)!;
    return {
      id:'cooprg-'+code.toLowerCase()+'-'+effectiveFrom, provider:COOPRG, jurisdiction:'AR-'+COOPRG_PROVINCE,
      category:code, segment:category.segment, effectiveFrom,effectiveTo,
      source:'https://www.cooprg.org.ar/resoluciones/'+encodeURI(table.path), reviewedOn,
      rule:'progressive', referenceDays:30, prorateBlocks:true, rulesConfirmed:true,
      tiers:rates.map((rate,index)=>({rate,fixed,maxKwh:limits[index]})),
      additionalCharges:[{id:'capitalization',label:'Cuota de capitalización',perKwh:table.capitalization,source:COOPRG_SIMULATOR}],
      credits:[], taxes:[], taxesComplete:false, adjustmentsComplete:false,
    };
  }
  const [fixed,powerEnergy,contractedPowerRate]=table.demand;
  const demand=define('T2P',[fixed,powerEnergy,0,0],[Infinity,Infinity,Infinity]);
  return [
    {...demand,tiers:[demand.tiers[0]],contractedPowerRate,pendingNotes:['Falta potencia contratada para calcular ese cargo.']},
    define('TR1',table.residential,[150,300,Infinity]),
    define('TR2',table.subsidized,[table.subsidizedLimit,300,Infinity]),
    define('T1G',table.general,[800,2300,Infinity]),
    ...(table.publicInterest?[define('T1E',table.publicInterest,[800,2300,Infinity])]:[]),
  ];
});
