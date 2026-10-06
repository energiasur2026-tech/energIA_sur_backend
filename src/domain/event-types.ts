/** Tipos compartidos entre servidor y navegador. Sin 'server-only'. */

export type EventType = 'LOW_VOLTAGE' | 'HIGH_VOLTAGE' | 'OVERCURRENT' | 'DATA_GAP';
export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type EventRecord = {
  id: number;
  type: EventType;
  severity: EventSeverity;
  startedAt: string;
  /** `null` = el evento sigue activo. */
  endedAt: string | null;
  lastViolationAt: string;
  samples: number;
  minVoltage: number | null;
  maxVoltage: number | null;
  maxCurrent: number | null;
  maxPowerW: number | null;
};

export const EVENT_LABEL: Record<EventType, string> = {
  LOW_VOLTAGE: 'Tensión baja',
  HIGH_VOLTAGE: 'Tensión alta',
  OVERCURRENT: 'Sobrecorriente',
  DATA_GAP: 'Sin lecturas',
};

export const EVENT_DESCRIPTION: Record<EventType, string> = {
  LOW_VOLTAGE:
    'La tensión estuvo por debajo del umbral. Sostenida, puede afectar el arranque de motores y la vida útil de electrodomésticos.',
  HIGH_VOLTAGE:
    'La tensión estuvo por encima del umbral. Sostenida, puede dañar equipos electrónicos.',
  OVERCURRENT:
    'La corriente superó el umbral configurado para la instalación.',
  DATA_GAP:
    'No se registraron lecturas durante este intervalo. Puede deberse a un corte de suministro, a que el medidor perdió conexión, o a una interrupción del monitoreo — con estos datos no se puede distinguir cuál.',
};
