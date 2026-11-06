/**
 * Cuadro tarifario SPSE · Residencial sin subsidio.
 *
 * Categoría confirmada para este medidor (vivienda de uso particular, sin
 * inscripción en el segmento de subsidio energético). Solo se factura el
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

const DAYS_PER_MONTH = 30;

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
  includeFixedCharge = true
): EnergyCost {
  // Los tramos del cuadro se expresan en enteros (0-100, 101-200, ...), así
  // que entre uno y el siguiente queda un hueco: 100.5 kWh no pertenecía a
  // ninguno. Buscar por ambos extremos hacía que esos consumos cayeran en el
  // tramo de reserva —el más caro— y un consumo de 100.5 kWh terminaba
  // costando más que uno de 150.
  //
  // Como los tramos están ordenados y son consecutivos, alcanza con el tope:
  // el primero cuyo máximo no se supera es el que corresponde. Los bordes
  // exactos (100, 101, 200, ...) siguen cayendo donde caían antes.
  const tier =
    RESIDENCIAL_SIN_SUBSIDIO.find((t) => consumedKwh <= t.maxKwh) ??
    RESIDENCIAL_SIN_SUBSIDIO[RESIDENCIAL_SIN_SUBSIDIO.length - 1];

  const fixedCharge = includeFixedCharge
    ? round2((tier.cargoFijo * periodDays) / DAYS_PER_MONTH)
    : 0;
  const variableCharge = round2(tier.valorTramo * consumedKwh);

  return {
    tier,
    fixedCharge,
    variableCharge,
    total: round2(fixedCharge + variableCharge),
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
