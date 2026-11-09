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
export const SELECTABLE_SENSITIVITIES: Exclude<Sensitivity, 'personalizada'>[] = [
  'alta',
  'media',
  'baja',
];

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
    const preset = SENSITIVITY_RANGES[grado];
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

// ------------------------------------------------- umbrales explícitos

/**
 * Límites de lo que se acepta como umbral.
 *
 * Son holgados a propósito: atrapan el disparate —una tensión de 2000 V, una
 * corriente de 5000 A— y no discuten la preferencia de nadie.
 */
export const THRESHOLD_LIMITS = {
  voltage: { min: 150, max: 300 },
  /**
   * Separación mínima entre el umbral bajo y el alto.
   *
   * La histéresis es de 2 V de cada lado: un evento de tensión baja abre por
   * debajo del umbral y cierra 2 V por encima. Con una banda más angosta que
   * eso, las zonas de recuperación de los dos eventos se pisarían y una
   * anomalía nunca podría cerrar. Seis volts deja margen.
   */
  minSpanV: 6,
  current: { min: 1, max: 200 },
  gapMinutes: { min: 1, max: 1440 },
} as const;

export type ThresholdsInput = {
  lowVoltageV: number;
  highVoltageV: number;
  overcurrentA?: number;
  gapMinutes?: number;
};

export type ThresholdsError =
  | 'faltan_tensiones'
  | 'tension_no_numerica'
  | 'tension_fuera_de_rango'
  | 'tension_invertida'
  | 'banda_demasiado_angosta'
  | 'corriente_fuera_de_rango'
  | 'intervalo_fuera_de_rango';

export const THRESHOLDS_ERROR_MESSAGE: Record<ThresholdsError, string> = {
  faltan_tensiones: 'Hay que indicar los dos umbrales de tensión.',
  tension_no_numerica: 'Los umbrales de tensión tienen que ser números.',
  tension_fuera_de_rango: `Los umbrales de tensión deben estar entre ${THRESHOLD_LIMITS.voltage.min} y ${THRESHOLD_LIMITS.voltage.max} V.`,
  tension_invertida: 'El umbral bajo tiene que ser menor que el alto.',
  banda_demasiado_angosta: `Entre un umbral y otro tiene que haber al menos ${THRESHOLD_LIMITS.minSpanV} V, o una anomalía nunca podría cerrar.`,
  corriente_fuera_de_rango: `El umbral de corriente debe estar entre ${THRESHOLD_LIMITS.current.min} y ${THRESHOLD_LIMITS.current.max} A.`,
  intervalo_fuera_de_rango: `El intervalo sin lecturas debe estar entre ${THRESHOLD_LIMITS.gapMinutes.min} y ${THRESHOLD_LIMITS.gapMinutes.max} minutos.`,
};

export type ParsedThresholds = {
  lowVoltageV: number;
  highVoltageV: number;
  overcurrentA: number | null;
  gapMinutes: number | null;
  /**
   * El grado que representan. Si coinciden con un preset se informa ese, no
   * `personalizada`: unos umbrales de 210–230 V **son** sensibilidad alta,
   * los haya escrito el usuario o elegido de la lista.
   */
  sensitivity: Sensitivity;
};

/**
 * Valida unos umbrales escritos a mano.
 *
 * Existe para que `personalizada` deje de ser una puerta de ida: sin esto, un
 * medidor que elige un grado no tiene forma de volver a sus umbrales propios
 * desde la aplicación, y recuperarlos exige una consulta SQL.
 */
export function parseThresholds(
  input: unknown
): { ok: true; thresholds: ParsedThresholds } | { ok: false; error: ThresholdsError } {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'faltan_tensiones' };
  }

  const raw = input as Record<string, unknown>;
  const { min, max } = THRESHOLD_LIMITS.voltage;

  if (raw.lowVoltageV === undefined || raw.highVoltageV === undefined) {
    return { ok: false, error: 'faltan_tensiones' };
  }

  const low = Number(raw.lowVoltageV);
  const high = Number(raw.highVoltageV);

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return { ok: false, error: 'tension_no_numerica' };
  }
  if (low < min || low > max || high < min || high > max) {
    return { ok: false, error: 'tension_fuera_de_rango' };
  }
  if (low >= high) {
    return { ok: false, error: 'tension_invertida' };
  }
  if (high - low < THRESHOLD_LIMITS.minSpanV) {
    return { ok: false, error: 'banda_demasiado_angosta' };
  }

  let overcurrentA: number | null = null;
  if (raw.overcurrentA !== undefined) {
    const a = Number(raw.overcurrentA);
    if (!Number.isFinite(a) || a < THRESHOLD_LIMITS.current.min || a > THRESHOLD_LIMITS.current.max) {
      return { ok: false, error: 'corriente_fuera_de_rango' };
    }
    overcurrentA = a;
  }

  let gapMinutes: number | null = null;
  if (raw.gapMinutes !== undefined) {
    const g = Number(raw.gapMinutes);
    if (
      !Number.isInteger(g) ||
      g < THRESHOLD_LIMITS.gapMinutes.min ||
      g > THRESHOLD_LIMITS.gapMinutes.max
    ) {
      return { ok: false, error: 'intervalo_fuera_de_rango' };
    }
    gapMinutes = g;
  }

  return {
    ok: true,
    thresholds: {
      lowVoltageV: low,
      highVoltageV: high,
      overcurrentA,
      gapMinutes,
      sensitivity: sensitivityOf({ lowVoltageV: low, highVoltageV: high }),
    },
  };
}
