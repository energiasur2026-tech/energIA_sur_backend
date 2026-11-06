/**
 * Dónde está instalado un medidor. **Dominio puro.**
 *
 * Un medidor va en el **tablero central** de una infraestructura, y entonces
 * cuantifica todo lo que esa infraestructura consume; o va en un **área**
 * dentro de ella —una oficina, un garage, un sector clínico— y cuantifica
 * solo lo que se usa ahí.
 *
 * **Los medidores no se relacionan entre sí.** Un usuario puede tener uno en
 * el tablero y otro en su oficina, y cada uno mide lo suyo: ninguno resta del
 * otro ni se desglosa contra el otro. Que compartan la infraestructura es una
 * circunstancia, no un vínculo.
 *
 * De ahí se desprende cómo se presenta cada uno:
 *
 * - **Central**: su consumo es el de la instalación y se contrasta contra la
 *   factura del mes, con cargo fijo incluido.
 * - **Área**: se mide en energía. El costo se puede informar como referencia
 *   —cuánto de la factura explica ese lugar— pero **sin cargo fijo**, porque
 *   el cargo fijo se paga una vez por instalación, no por área. Y el objetivo
 *   mensual de un área es de energía, no de plata.
 */

export type MeterRole = 'central' | 'area';

export const METER_ROLES: MeterRole[] = ['central', 'area'];

export const ROLE_LABEL: Record<MeterRole, string> = {
  central: 'Tablero central',
  area: 'Área específica',
};

/** Lo que distingue a un medidor dentro de su instalación. */
export type MeterPlacement =
  | { role: 'central'; areaLabel: null }
  | { role: 'area'; areaLabel: string };

export const MAX_AREA_LABEL_LENGTH = 40;

export type PlacementError =
  | 'role_invalido'
  | 'central_sin_area'
  | 'area_sin_nombre'
  | 'area_nombre_largo';

export const PLACEMENT_ERROR_MESSAGE: Record<PlacementError, string> = {
  role_invalido: 'El tipo de medidor debe ser "central" o "area".',
  central_sin_area: 'Un medidor en el tablero central no lleva nombre de área.',
  area_sin_nombre: 'Un medidor de área tiene que indicar dónde está instalado.',
  area_nombre_largo: `El nombre del área no puede superar los ${MAX_AREA_LABEL_LENGTH} caracteres.`,
};

/**
 * Valida y normaliza dónde está instalado un medidor.
 *
 * Se valida acá además de en la base porque el formulario no es la única
 * puerta de entrada: la ruta de API también recibe cuerpos armados a mano.
 */
export function parsePlacement(input: {
  role: unknown;
  areaLabel?: unknown;
}): { ok: true; placement: MeterPlacement } | { ok: false; error: PlacementError } {
  if (input.role !== 'central' && input.role !== 'area') {
    return { ok: false, error: 'role_invalido' };
  }

  const etiqueta = typeof input.areaLabel === 'string' ? input.areaLabel.trim() : null;

  if (input.role === 'central') {
    if (etiqueta) return { ok: false, error: 'central_sin_area' };
    return { ok: true, placement: { role: 'central', areaLabel: null } };
  }

  if (!etiqueta) return { ok: false, error: 'area_sin_nombre' };
  if (etiqueta.length > MAX_AREA_LABEL_LENGTH) return { ok: false, error: 'area_nombre_largo' };

  return { ok: true, placement: { role: 'area', areaLabel: etiqueta } };
}

/**
 * Si el consumo de este medidor se contrasta contra la factura del mes.
 *
 * Solo el central: es lo que mide la distribuidora. Un área explica una parte
 * del total, pero no es una factura aparte.
 */
export function billsAgainstInvoice(role: MeterRole): boolean {
  return role === 'central';
}

/**
 * Si corresponde sumar el cargo fijo al costo que se muestra.
 *
 * El cargo fijo se paga una vez por instalación. Sumarlo en cada área daría
 * un número inventado.
 */
export function includesFixedCharge(role: MeterRole): boolean {
  return role === 'central';
}
