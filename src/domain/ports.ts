/**
 * Puertos: lo que la lógica de negocio necesita del mundo exterior, descrito
 * como contratos y no como implementaciones.
 *
 * El dominio depende de estas interfaces. Supabase, Tuya y Resend las
 * implementan del otro lado (los *adaptadores*). Esa inversión es lo que
 * permite ejercitar la lógica con dobles en memoria, y lo que haría posible
 * cambiar de base de datos tocando un solo archivo.
 *
 * Nada de este archivo importa `server-only`, Next ni Supabase: es a
 * propósito.
 */
import type { EventRecord, EventSeverity, EventType } from './event-types';
import type { Aggregates, OpenEventSnapshot } from './anomaly-rules';
import type { RawReading } from './reading-types';

/** Un evento a persistir por primera vez. */
export type EventToCreate = {
  deviceId: string;
  type: EventType;
  severity: EventSeverity;
  startedAt: string;
  /** Los huecos de datos nacen cerrados: su fin se conoce al detectarlos. */
  endedAt?: string | null;
  lastViolationAt: string;
} & Aggregates;

/** Los campos que se refrescan de un evento que sigue abierto. */
export type EventUpdate = {
  lastViolationAt: string;
  severity: EventSeverity;
} & Aggregates;

export interface ReadingsPort {
  /** Lecturas posteriores a un instante, en orden cronológico. */
  after(deviceId: string, since: string | null): Promise<RawReading[]>;
}

export interface EventsPort {
  /** Eventos activos (sin cerrar) del medidor, indexados por tipo. */
  openByType(deviceId: string): Promise<Map<EventType, OpenEventSnapshot>>;
  /** Abre un evento, o devuelve el que ya existía para ese tipo y medidor. */
  openOrGet(event: EventToCreate): Promise<{ id: number }>;
  /** Inserta un evento ya cerrado (los huecos de datos). */
  insertClosed(event: EventToCreate): Promise<void>;
  update(id: number, update: EventUpdate): Promise<void>;
  close(id: number, endedAt: string): Promise<void>;
}

export interface MetersPort {
  /** Deja marcado hasta qué instante se evaluaron las anomalías. */
  markEvaluated(deviceId: string, at: string): Promise<void>;
}

/** Todo lo que el caso de uso de detección necesita del exterior. */
export type AnomalyDeps = {
  readings: ReadingsPort;
  events: EventsPort;
  meters: MetersPort;
};

// ----------------------------------------------------- lectura del medidor

export type ReadingSource = 'dashboard' | 'scheduled';

/** El medidor físico, visto desde el dominio. Hoy lo implementa Tuya Cloud. */
export interface DevicePort {
  details(deviceId: string): Promise<{ online?: boolean }>;
  status(deviceId: string): Promise<{ code: string; value: unknown }[]>;
}

export type ReadingToStore = {
  deviceId: string;
  recordedAt: Date;
  voltage: number | null;
  current: number | null;
  powerW: number | null;
  totalEnergyKwh: number | null;
  rawPhaseA: string | null;
  source: ReadingSource;
};

export interface ReadingsStorePort {
  /** Instante de la última lectura de ese origen, o `null` si no hay ninguna. */
  lastReadingAt(deviceId: string, source: ReadingSource): Promise<string | null>;
  save(reading: ReadingToStore): Promise<unknown>;
}

// -------------------------------------------------------- avisos por email

export interface NotificationsPort {
  /** Eventos del medidor que todavía no se avisaron. */
  pending(deviceId: string): Promise<EventRecord[]>;
  markNotified(ids: number[]): Promise<void>;
}

export interface MailerPort {
  /** `skipped` = no hay proveedor configurado; no es un fallo. */
  sendAnomaly(params: {
    to: string;
    meterName: string;
    event: EventRecord;
  }): Promise<'sent' | 'skipped' | 'failed'>;
}
