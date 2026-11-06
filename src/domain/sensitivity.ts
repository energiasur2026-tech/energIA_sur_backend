/**
 * Grado de sensibilidad de las alertas de tensión. **Dominio puro.**
 *
 * Los umbrales son dos números con decimales que nadie quiere elegir a mano.
 * Pedírselos al usuario garantiza que no los toque nunca, y entonces las
 * alertas quedan calibradas para un caso que puede no ser el suyo.
 *
 * En su lugar se le ofrece una decisión que sí puede tomar: **cuán seguido
 * quiere enterarse**. De ahí salen los umbrales.
 *
 * A mayor sensibilidad, **más estrecho** el rango aceptable: si alguien
 * quiere enterarse de desviaciones chicas, el margen de tolerancia tiene que
 * ser menor.
 *
 * > Estos son umbrales de **aviso del producto**, no límites normativos. Que
 * > una tensión salga del rango elegido no significa que haya una condición
 * > peligrosa; significa que el usuario pidió enterarse.
 */

export type Sensitivity = 'alta' | 'media' | 'baja' | 'personalizada';

/** Los grados que el usuario puede elegir. `personalizada` no se elige: se hereda. */
export const SELECTABLE_SENSITIVITIES: Sensitivity[] = ['alta', 'media', 'baja'];

export type VoltageRange = { lowVoltageV: number; highVoltageV: number };

export const SENSITIVITY_RANGES: Record<Exclude<Sensitivity, 'personalizada'>, VoltageRange> = {
  alta: { lowVoltageV: 210, highVoltageV: 230 },
  media: { lowVoltageV: 205, highVoltageV: 235 },
  baja: { lowVoltageV: 200, highVoltageV: 240 },
};

export const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  personalizada: 'Personalizada',
};

export const SENSITIVITY_DESCRIPTION: Record<Sensitivity, string> = {
  alta: 'Avisa ante desviaciones chicas. Para equipos delicados.',
  media: 'Un punto intermedio. Sirve para la mayoría de los casos.',
  baja: 'Avisa solo ante desviaciones grandes. Para redes inestables.',
  personalizada: 'Los umbrales se ajustaron a mano.',
};

export function isSelectableSensitivity(value: unknown): value is Exclude<Sensitivity, 'personalizada'> {
  return value === 'alta' || value === 'media' || value === 'baja';
}

export function isSensitivity(value: unknown): value is Sensitivity {
  return isSelectableSensitivity(value) || value === 'personalizada';
}

/** Los umbrales que corresponden a un grado. `null` para `personalizada`. */
export function rangeFor(sensitivity: Sensitivity): VoltageRange | null {
  return sensitivity === 'personalizada' ? null : SENSITIVITY_RANGES[sensitivity];
}

/**
 * Qué grado representan unos umbrales dados.
 *
 * Sirve para mostrar el grado correcto cuando los umbrales vienen de la base
 * y para no marcar como "personalizada" una configuración que en realidad
 * coincide con un preset.
 */
export function sensitivityOf(range: VoltageRange): Sensitivity {
  for (const grado of SELECTABLE_SENSITIVITIES) {
    const preset = SENSITIVITY_RANGES[grado as Exclude<Sensitivity, 'personalizada'>];
    if (preset.lowVoltageV === range.lowVoltageV && preset.highVoltageV === range.highVoltageV) {
      return grado;
    }
  }
  return 'personalizada';
}

/**
 * Sensibilidad sugerida según el contexto donde está el medidor.
 *
 * Una caída de tensión en terapia intensiva no es lo mismo que en un
 * depósito: donde hay equipamiento crítico conviene enterarse antes. Es solo
 * una sugerencia para el alta; el usuario decide.
 */
export function suggestedFor(contextType: string): Exclude<Sensitivity, 'personalizada'> {
  if (contextType === 'clinica' || contextType === 'sector_clinico') return 'alta';
  if (contextType === 'taller' || contextType === 'area_taller') return 'baja';
  return 'media';
}
