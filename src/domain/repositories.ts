/**
 * Puertos de acceso a datos.
 *
 * Las rutas pedían sus datos llamando directo a los módulos de Supabase. Eso
 * funcionaba, pero ataba cada ruta al proveedor: para probar una ruta había
 * que levantar una base, y cambiar de proveedor obligaba a tocar las trece.
 *
 * Acá se declara **qué** necesita cada parte del sistema, agrupado por aquello
 * que representa —medidores, lecturas, eventos, hogar, perfil, sesión—, sin
 * decir cómo se obtiene. Los adaptadores de `src/infrastructure` lo resuelven
 * contra Supabase.
 *
 * Las firmas replican las que ya existían: el objetivo es invertir la
 * dependencia, no rediseñar las consultas.
 */
import type {
  DailyEnergyPoint,
  HourlyProfilePoint,
  LatestReading,
  PeriodConsumption,
} from './data-types';
import type { PeriodSummary, SeriesPoint } from './types';
import type { ForecastBasis } from './forecast';
import type { EventRecord } from './event-types';
import type { HomeContext } from './home-types';
import type { GoalInputMode } from './goal';
import type { MeterPlacement, MeterRole } from './meter-role';
import type { MeterPhases } from './installation-types';
import type { AccessLevel } from './device-linking';
import type { ParsedThresholds, Sensitivity } from './sensitivity';
import type { Profile } from './profile-types';

/** El medidor completo, tal como lo usan las rutas y los casos de uso. */
export type MeterRecord = {
  deviceId: string;
  name: string;
  thresholds: {
    lowVoltageV: number;
    highVoltageV: number;
    overcurrentA: number;
    gapMinutes: number;
  };
  collectionIntervalMinutes: number;
  alertsEnabled: boolean;
  goalKwh: number | null;
  goalInputMode: GoalInputMode;
  anomaliesEvaluatedAt: string | null;
  /** `central` = tablero principal; `area` = un lugar dentro de la instalación. */
  role: MeterRole;
  /** Dónde está instalado, si es de área: "Garage", "Oficina". */
  areaLabel: string | null;
  /** Cuántas fases mide el equipo: 1 monofásico, 3 trifásico. */
  phases: MeterPhases;
  /** Grado de sensibilidad de las alertas de tensión. */
  sensitivity: Sensitivity;
  /** Quién lo vinculó. No se expone en la API: deriva permisos, nada más. */
  ownerId: string;
};

export interface MetersRepository {
  /** Qué acceso tiene una cuenta sobre un medidor: dueña, invitada o ninguno. */
  accessLevel(userId: string, deviceId: string): Promise<AccessLevel>;
  /** Si el medidor ya pertenece a alguna cuenta. No dice a cuál, a propósito. */
  isLinked(deviceId: string): Promise<boolean>;
  link(params: {
    deviceId: string;
    ownerId: string;
    name: string;
    phases: MeterPhases;
  }): Promise<MeterRecord>;
  /** Borra el medidor y, en cascada, su contexto e invitados. Las lecturas quedan. */
  unlink(deviceId: string): Promise<void>;
  /** Lecturas guardadas de un medidor, esté vinculado o no. */
  countReadings(deviceId: string): Promise<number>;
  /** Todos los medidores del sistema. Lo usa el recolector programado. */
  all(): Promise<MeterRecord[]>;
  /** Los medidores a los que accede una cuenta: propios y compartidos. */
  forOwner(userId: string): Promise<MeterRecord[]>;
  setCollectionInterval(deviceId: string, minutes: number): Promise<void>;
  setAlertsEnabled(deviceId: string, enabled: boolean): Promise<void>;
  setGoal(deviceId: string, goalKwh: number | null, mode: GoalInputMode): Promise<void>;
  /** Cambia si el medidor es el central de la instalación o cubre un área. */
  setPlacement(deviceId: string, placement: MeterPlacement): Promise<void>;
  /** Monofásico o trifásico. */
  setPhases(deviceId: string, phases: MeterPhases): Promise<void>;
  /** Grado de sensibilidad. Reescribe también los umbrales de tensión. */
  setSensitivity(deviceId: string, sensitivity: Sensitivity): Promise<void>;
  /** Umbrales escritos a mano. Fija también el grado que representan. */
  setThresholds(deviceId: string, thresholds: ParsedThresholds): Promise<void>;
}

export interface ReadingsRepository {
  /** Serie agregada por Postgres según el rango y el tamaño de cubeta. */
  series(deviceId: string, from: Date, to: Date, bucketSeconds: number): Promise<SeriesPoint[]>;
  summary(deviceId: string, from: Date, to: Date): Promise<PeriodSummary>;
  periodConsumption(deviceId: string, from: Date, to: Date): Promise<PeriodConsumption>;
  forecastBasis(deviceId: string, from: Date, to: Date): Promise<ForecastBasis>;
  hourlyProfile(deviceId: string, from: Date, to: Date): Promise<HourlyProfilePoint[]>;
  dailyEnergy(deviceId: string, from: Date, to: Date): Promise<DailyEnergyPoint[]>;
  latest(deviceId: string): Promise<LatestReading>;
  /** Última lectura del recolector programado, para el indicador de actividad. */
  lastScheduledAt(deviceId: string): Promise<string | null>;
}

export interface EventsRepository {
  list(deviceId: string, limit?: number): Promise<EventRecord[]>;
  countActive(deviceId: string): Promise<number>;
}

export interface HomeRepository {
  get(deviceId: string): Promise<HomeContext | null>;
  save(deviceId: string, home: HomeContext): Promise<void>;
  clear(deviceId: string): Promise<void>;
}

export interface ProfilesRepository {
  get(userId: string): Promise<Profile>;
  save(userId: string, profile: Profile): Promise<void>;
}

export interface SessionPort {
  /** La cuenta de la sesión en curso, o `null` sin sesión válida. */
  currentUser(): Promise<{ id: string; email: string | null } | null>;
}

/** Todo el acceso a datos, en un solo objeto para componer en un lugar. */
export type Repositories = {
  meters: MetersRepository;
  readings: ReadingsRepository;
  events: EventsRepository;
  home: HomeRepository;
  profiles: ProfilesRepository;
  session: SessionPort;
};
