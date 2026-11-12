import { calculateElectricity, type BillingContext, type ElectricityBreakdown, type TariffDefinition } from './electricity-billing';
/**
 * Cuadro tarifario SPSE · Residencial sin subsidio.
 *
 * Cuadro heredado SIN categoría ni vigencia confirmadas para el cliente.
 * Solo se conserva como referencia explícita; nunca valida una factura. Solo se factura el
 * cargo de energía: agua, cloaca y alumbrado quedan fuera de esta etapa por
 * decisión explícita, no por omisión.
 *
 * cargoFijo es un cargo mensual; se prorratea según la duración real del
 * período consultado. valorTramo se cobra sobre el total de kWh consumidos
 * en el período, al tramo que corresponda según ese total (no es progresivo
 * por tramo, como categoriza la distribuidora).
 */
export interface TariffTier {
  minKwh: number;
  maxKwh: number;
  cargoFijo: number;
  valorTramo: number;
}



export const RESIDENCIAL_SIN_SUBSIDIO: TariffTier[] = [
  { minKwh: 0, maxKwh: 100, cargoFijo: 15000, valorTramo: 116.053 },
  { minKwh: 101, maxKwh: 200, cargoFijo: 16000, valorTramo: 120.293 },
  { minKwh: 201, maxKwh: 300, cargoFijo: 17000, valorTramo: 124.224 },
  { minKwh: 301, maxKwh: 400, cargoFijo: 18000, valorTramo: 127.211 },
  { minKwh: 401, maxKwh: 99999, cargoFijo: 22000, valorTramo: 128.78 },
];

export type EnergyCost = {
  tier: TariffTier;
  fixedCharge: number;
  variableCharge: number;
  total: number;
  breakdown?: ElectricityBreakdown;
  warning?: string;
};

/**
 * Costo estimado de energía para un consumo dado.
 *
 * `periodDays` es la duración del período consultado, usada para prorratear
 * el cargo fijo mensual (p. ej. 1 día -> cargoFijo / 30).
 *
 * `includeFixedCharge` en `false` devuelve **solo el cargo de energía**. Es lo
 * que corresponde a un medidor de área: el cargo fijo se paga una vez por
 * instalación, no por lugar, así que sumarlo en cada área daría un número
 * inventado. El tramo tarifario se sigue eligiendo igual, según el consumo.
 */
export function estimateEnergyCost(
  consumedKwh: number,
  periodDays: number,
  includeFixedCharge = true,
  context?: BillingContext
): EnergyCost {
  if(context&&!context.definition)throw new Error('No hay una versión tarifaria para ese proveedor, categoría y período.');
  const legacy:TariffDefinition={id:'spse-legacy-unverified',provider:'SPSE',jurisdiction:'AR-Santa Cruz',category:'Categoría sin confirmar · referencia heredada sin subsidio',segment:'unconfirmed',effectiveFrom:null,effectiveTo:null,source:'legacy-unverified',reviewedOn:'2026-11-11',rule:'selected-tier-all-kwh',referenceDays:30,tiers:RESIDENCIAL_SIN_SUBSIDIO.map((t,i)=>({maxKwh:i===RESIDENCIAL_SIN_SUBSIDIO.length-1?Infinity:t.maxKwh,fixed:t.cargoFijo,rate:t.valorTramo})),adjustmentsComplete:false,taxesComplete:false,credits:[],taxes:[]};
  const quote=calculateElectricity(consumedKwh,periodDays,context?.definition??legacy,includeFixedCharge);
  const selected=quote.tier;const index=(context?.definition??legacy).tiers.indexOf(selected);
  return {tier:{minKwh:index?Math.floor((context?.definition??legacy).tiers[index-1].maxKwh)+1:0,maxKwh:Number.isFinite(selected.maxKwh)?selected.maxKwh:99999,cargoFijo:selected.fixed,valorTramo:selected.rate},fixedCharge:quote.fixedCharge,variableCharge:quote.variableCharge,total:quote.knownTotal,breakdown:quote,warning:context?'Importe parcial: no incluye ajustes ni tributos sin confirmar.':'Proveedor/categoría/vigencia sin confirmar. Referencia heredada; no valida una factura.'};
}
