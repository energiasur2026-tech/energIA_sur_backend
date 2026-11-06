/**
 * Rol de un medidor dentro de una instalación. **Dominio puro.**
 *
 * Un medidor se instala en el **tablero central** de toda la infraestructura,
 * o en un **área** puntual dentro de ella: el garage de una casa, terapia
 * intensiva de una clínica, la oficina de un taller.
 *
 * La distinción es eléctrica, no cosmética: el medidor de área está aguas
 * abajo del central, así que su energía **ya pasó por los dos**. De ahí sale
 * la regla que gobierna todos los cálculos de este archivo:
 *
 *   El total de la instalación es el CENTRAL.
 *   Las áreas dicen qué parte de ese total corresponde a cada lugar.
 *   **Nunca se suma central + áreas**: sería contar dos veces lo mismo.
 *
 * Por eso la tarifa, el costo estimado y el objetivo mensual se calculan
 * contra el central, que es lo que mide la distribuidora. Las áreas se
 * analizan, no se facturan.
 */

export type MeterRole = 'central' | 'area';

export const METER_ROLES: MeterRole[] = ['central', 'area'];

/** Lo que distingue a un medidor dentro de su instalación. */
export type MeterPlacement =
  | { role: 'central'; areaLabel: null; parentDeviceId: null }
  | { role: 'area'; areaLabel: string; parentDeviceId: string };

export const MAX_AREA_LABEL_LENGTH = 40;

export type PlacementError =
  | 'role_invalido'
  | 'central_no_cuelga'
  | 'central_sin_area'
  | 'area_sin_padre'
  | 'area_sin_nombre'
  | 'area_nombre_largo'
  | 'area_cuelga_de_si_misma';

export const PLACEMENT_ERROR_MESSAGE: Record<PlacementError, string> = {
  role_invalido: 'El tipo de medidor debe ser "central" o "area".',
  central_no_cuelga: 'Un medidor central no puede depender de otro medidor.',
  central_sin_area: 'Un medidor central no lleva nombre de área.',
  area_sin_padre: 'Un medidor de área tiene que indicar de qué central depende.',
  area_sin_nombre: 'Un medidor de área tiene que indicar dónde está instalado.',
  area_nombre_largo: `El nombre del área no puede superar los ${MAX_AREA_LABEL_LENGTH} caracteres.`,
  area_cuelga_de_si_misma: 'Un medidor no puede depender de sí mismo.',
};

/**
 * Valida y normaliza la ubicación declarada para un medidor.
 *
 * Se valida acá además de en la base porque el formulario no es la única
 * puerta de entrada: la ruta de API también recibe cuerpos armados a mano.
 */
export function parsePlacement(input: {
  deviceId: string;
  role: unknown;
  areaLabel?: unknown;
  parentDeviceId?: unknown;
}): { ok: true; placement: MeterPlacement } | { ok: false; error: PlacementError } {
  if (input.role !== 'central' && input.role !== 'area') {
    return { ok: false, error: 'role_invalido' };
  }

  const etiqueta = typeof input.areaLabel === 'string' ? input.areaLabel.trim() : null;
  const padre = typeof input.parentDeviceId === 'string' ? input.parentDeviceId.trim() : null;

  if (input.role === 'central') {
    if (padre) return { ok: false, error: 'central_no_cuelga' };
    if (etiqueta) return { ok: false, error: 'central_sin_area' };
    return { ok: true, placement: { role: 'central', areaLabel: null, parentDeviceId: null } };
  }

  if (!padre) return { ok: false, error: 'area_sin_padre' };
  if (padre === input.deviceId) return { ok: false, error: 'area_cuelga_de_si_misma' };
  if (!etiqueta) return { ok: false, error: 'area_sin_nombre' };
  if (etiqueta.length > MAX_AREA_LABEL_LENGTH) return { ok: false, error: 'area_nombre_largo' };

  return { ok: true, placement: { role: 'area', areaLabel: etiqueta, parentDeviceId: padre } };
}

// --------------------------------------------------------- lectura del total

/** Lo mínimo que hace falta de un medidor para armar el desglose. */
export type MeasuredMeter = {
  deviceId: string;
  name: string;
  role: MeterRole;
  areaLabel: string | null;
  parentDeviceId: string | null;
  /** Consumo del período, en kWh. `null` = sin datos suficientes. */
  consumedKwh: number | null;
};

export type AreaShare = {
  deviceId: string;
  areaLabel: string;
  consumedKwh: number;
  /** Qué porcentaje del total de la instalación representa. */
  shareOfTotalPct: number;
};

export type InstallationBreakdown = {
  /** El consumo de la instalación: el del central, no la suma. */
  totalKwh: number | null;
  areas: AreaShare[];
  /**
   * Consumo del central que todavía no está desglosado por ningún área.
   * `null` si no se puede calcular (falta el central o alguna área sin datos).
   */
  unmeasuredKwh: number | null;
  /**
   * Las áreas suman más que el central. No debería pasar si la instalación
   * está bien declarada: indica un medidor de área que en realidad no cuelga
   * de ese central, o un período desalineado entre medidores.
   */
  inconsistent: boolean;
};

/**
 * Arma el desglose de una instalación a partir de su central y sus áreas.
 *
 * El total es el del central. Lo que no cubre ningún área se informa aparte
 * como consumo sin desglosar, que es información útil: dice cuánto falta
 * instrumentar.
 */
export function buildBreakdown(central: MeasuredMeter, areas: MeasuredMeter[]): InstallationBreakdown {
  const total = central.consumedKwh;

  const propias = areas.filter(
    (a) => a.role === 'area' && a.parentDeviceId === central.deviceId
  );

  const conDatos = propias.filter((a) => a.consumedKwh !== null);
  const sumaAreas = conDatos.reduce((acc, a) => acc + (a.consumedKwh ?? 0), 0);

  const shares: AreaShare[] = conDatos.map((a) => ({
    deviceId: a.deviceId,
    areaLabel: a.areaLabel ?? a.name,
    consumedKwh: round(a.consumedKwh ?? 0, 3),
    shareOfTotalPct: total && total > 0 ? round(((a.consumedKwh ?? 0) / total) * 100, 1) : 0,
  }));

  // Sin total, o con alguna área sin datos, el resto no se puede afirmar.
  const puedeCalcularResto = total !== null && conDatos.length === propias.length;

  return {
    totalKwh: total === null ? null : round(total, 3),
    areas: shares,
    unmeasuredKwh: puedeCalcularResto ? round(Math.max(total - sumaAreas, 0), 3) : null,
    inconsistent: total !== null && sumaAreas > total + 0.001,
  };
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
