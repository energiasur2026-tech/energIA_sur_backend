/** Umbrales de detección. Sin 'server-only': viajan al navegador en la vista de Eventos. */
export type MeterThresholds = {
  lowVoltageV: number;
  highVoltageV: number;
  overcurrentA: number;
  gapMinutes: number;
};
