import 'server-only';

import { supabase } from './supabase';
import type { GoalInputMode } from '../domain/goal';
import type { MeterPlacement, MeterRole } from '../domain/meter-role';
import type { MeterPhases } from '../domain/installation-types';
import { canView, type AccessLevel } from '../domain/device-linking';
import {
  isSensitivity,
  rangeFor,
  type ParsedThresholds,
  type Sensitivity,
} from '../domain/sensitivity';
import type { MeterThresholds } from '../domain/threshold-types';

export type { MeterThresholds };

export type Meter = {
  deviceId: string;
  name: string;
  thresholds: MeterThresholds;
  /** Cada cuántos minutos se guarda una lectura, por origen. */
  collectionIntervalMinutes: number;
  /** Si el dueño recibe avisos por email de las anomalías de este medidor. */
  alertsEnabled: boolean;
  /** Meta mensual en kWh. `null` = el usuario no fijó objetivo todavía. */
  goalKwh: number | null;
  /** En qué unidad pensó la meta: solo afecta cómo se muestra. */
  goalInputMode: GoalInputMode;
  /** `central` = tablero principal; `area` = un lugar dentro de la instalación. */
  role: MeterRole;
  /** Dónde está instalado, si es de área: "Garage", "Oficina". */
  areaLabel: string | null;
  /** Cuántas fases mide el equipo: 1 monofásico, 3 trifásico. */
  phases: MeterPhases;
  /** Grado de sensibilidad de las alertas de tensión. */
  sensitivity: Sensitivity;
  /** Quién lo vinculó. No se expone en la API: solo se usa para derivar permisos. */
  ownerId: string;
  /** Hasta qué instante ya se evaluaron anomalías. `null` = nunca. */
  anomaliesEvaluatedAt: string | null;
};

const COLUMNS =
  'device_id, owner_id, name, low_voltage_v, high_voltage_v, overcurrent_a, gap_minutes, collection_interval_minutes, goal_kwh, goal_input_mode, alerts_enabled, anomalies_evaluated_at, role, area_label, phases, sensitivity';

/**
 * Ids de los medidores a los que `userId` accede: los que le pertenecen y los
 * que le compartieron (tabla `meter_members`), ese como invitado.
 *
 * Se resuelve en dos pasos porque Supabase no arma bien un OR entre una
 * columna propia y una tabla relacionada en una sola llamada: primero se
 * traen los device_id compartidos, después se filtra `meters` con ambos.
 */
async function accessibleDeviceIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase()
    .from('meter_members')
    .select('device_id')
    .eq('user_id', userId);

  if (error) throw new Error(`No se pudo resolver el acceso compartido: ${error.message}`);

  return (data ?? []).map((row) => String(row.device_id));
}

/**
 * El medidor de un usuario: el propio, o el primero que le hayan compartido
 * si no tiene uno propio. Cada cuenta tiene, hoy, cero o un medidor
 * accesible — no hay autoservicio de alta, se vincula a mano (ver README).
 * `null` significa "cuenta sin medidor todavía", no un error.
 */
export async function getMeterForOwner(ownerId: string): Promise<Meter | null> {
  const owned = await supabase()
    .from('meters')
    .select(COLUMNS)
    .eq('owner_id', ownerId)
    .limit(1)
    .maybeSingle();

  if (owned.error) throw new Error(`No se pudo resolver el medidor del usuario: ${owned.error.message}`);
  if (owned.data) return mapMeter(owned.data);

  const sharedIds = await accessibleDeviceIds(ownerId);
  if (sharedIds.length === 0) return null;

  const { data, error } = await supabase()
    .from('meters')
    .select(COLUMNS)
    .in('device_id', sharedIds)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No se pudo resolver el medidor compartido: ${error.message}`);
  return data ? mapMeter(data) : null;
}

/** Todos los medidores de una cuenta (propios y compartidos), para "Mis medidores". */
export async function getMetersForOwner(ownerId: string): Promise<Meter[]> {
  const sharedIds = await accessibleDeviceIds(ownerId);

  const filter =
    sharedIds.length > 0
      ? `owner_id.eq.${ownerId},device_id.in.(${sharedIds.join(',')})`
      : `owner_id.eq.${ownerId}`;

  const { data, error } = await supabase()
    .from('meters')
    .select(COLUMNS)
    .or(filter)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`No se pudieron listar los medidores: ${error.message}`);

  return (data ?? []).map(mapMeter);
}

/** Todos los medidores registrados, para el recolector programado. */
export async function getAllMeters(): Promise<Meter[]> {
  const { data, error } = await supabase().from('meters').select(COLUMNS);

  if (error) throw new Error(`No se pudo listar los medidores: ${error.message}`);

  return (data ?? []).map(mapMeter);
}

export async function setAnomaliesEvaluatedAt(deviceId: string, instant: string) {
  const { error } = await supabase()
    .from('meters')
    .update({ anomalies_evaluated_at: instant })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudo actualizar la marca de evaluación: ${error.message}`);
}

/** Cambia el intervalo de guardado. El valor ya viene validado por la ruta. */
export async function setCollectionInterval(deviceId: string, minutes: number) {
  const { error } = await supabase()
    .from('meters')
    .update({ collection_interval_minutes: minutes })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudo guardar el intervalo: ${error.message}`);
}

/** Fija o borra (con `null`) la meta mensual del medidor. */
export async function setGoal(deviceId: string, goalKwh: number | null, inputMode: GoalInputMode) {
  const { error } = await supabase()
    .from('meters')
    .update({ goal_kwh: goalKwh, goal_input_mode: inputMode })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudo guardar el objetivo: ${error.message}`);
}

export async function setAlertsEnabled(deviceId: string, enabled: boolean) {
  const { error } = await supabase()
    .from('meters')
    .update({ alerts_enabled: enabled })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudo guardar la preferencia de avisos: ${error.message}`);
}



function mapMeter(row: Record<string, unknown>): Meter {
  return {
    deviceId: String(row.device_id),
    name: String(row.name),
    collectionIntervalMinutes: Number(row.collection_interval_minutes),
    alertsEnabled: row.alerts_enabled !== false,
    goalKwh: row.goal_kwh === null || row.goal_kwh === undefined ? null : Number(row.goal_kwh),
    goalInputMode: (row.goal_input_mode as GoalInputMode) ?? 'kwh',
    thresholds: {
      lowVoltageV: Number(row.low_voltage_v),
      highVoltageV: Number(row.high_voltage_v),
      overcurrentA: Number(row.overcurrent_a),
      gapMinutes: Number(row.gap_minutes),
    },
    anomaliesEvaluatedAt: row.anomalies_evaluated_at ? String(row.anomalies_evaluated_at) : null,
    role: (row.role as MeterRole) ?? 'central',
    areaLabel: row.area_label ? String(row.area_label) : null,
    phases: Number(row.phases) === 3 ? 3 : 1,
    sensitivity: isSensitivity(row.sensitivity) ? row.sensitivity : 'personalizada',
    ownerId: String(row.owner_id),
  };
}

/**
 * Cambia el grado de sensibilidad y, con él, los umbrales de tensión.
 *
 * Se escriben juntos a propósito: el grado es la explicación de esos dos
 * números, y dejarlos desacoplados permitiría estados donde la pantalla dice
 * "alta" y la detección usa otro rango.
 */
export async function setSensitivity(deviceId: string, sensitivity: Sensitivity) {
  const range = rangeFor(sensitivity);

  const { error } = await supabase()
    .from('meters')
    .update(range ? { sensitivity, low_voltage_v: range.lowVoltageV, high_voltage_v: range.highVoltageV } : { sensitivity })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudo cambiar la sensibilidad: ${error.message}`);
}

/**
 * Fija los umbrales a mano.
 *
 * Escribe también la sensibilidad que esos umbrales representan: si coinciden
 * con un preset queda ese grado, y si no, `personalizada`. Así el grado nunca
 * contradice a los números, y `personalizada` deja de ser un estado del que
 * no se puede salir ni al que se puede volver desde la aplicación.
 *
 * `overcurrentA` y `gapMinutes` solo se tocan si vienen: son independientes
 * de la tensión y no tienen por qué reescribirse en cada ajuste.
 */
export async function setThresholds(deviceId: string, t: ParsedThresholds) {
  const cambios: Record<string, unknown> = {
    low_voltage_v: t.lowVoltageV,
    high_voltage_v: t.highVoltageV,
    sensitivity: t.sensitivity,
  };
  if (t.overcurrentA !== null) cambios.overcurrent_a = t.overcurrentA;
  if (t.gapMinutes !== null) cambios.gap_minutes = t.gapMinutes;

  const { error } = await supabase().from('meters').update(cambios).eq('device_id', deviceId);
  if (error) throw new Error(`No se pudieron cambiar los umbrales: ${error.message}`);
}

/** Cambia si el equipo es monofásico o trifásico. */
export async function setPhases(deviceId: string, phases: MeterPhases) {
  const { error } = await supabase().from('meters').update({ phases }).eq('device_id', deviceId);
  if (error) throw new Error(`No se pudo cambiar el tipo de equipo: ${error.message}`);
}

/**
 * Cambia dónde está instalado un medidor: tablero central de la instalación,
 * o un área dentro de ella. Las tres columnas se escriben juntas porque la
 * base exige que sean coherentes entre sí.
 */
export async function setPlacement(deviceId: string, placement: MeterPlacement) {
  const { error } = await supabase()
    .from('meters')
    .update({
      role: placement.role,
      area_label: placement.areaLabel,
    })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudo cambiar la ubicación del medidor: ${error.message}`);
}

/**
 * Qué acceso tiene una cuenta sobre un medidor.
 *
 * Es la base del aislamiento entre clientes: toda ruta que reciba un
 * `deviceId` del exterior tiene que pasar por acá antes de leer o escribir
 * nada. Sin esto, conocer un identificador alcanzaría para ver datos ajenos.
 */
export async function accessLevelFor(userId: string, deviceId: string): Promise<AccessLevel> {
  const owned = await supabase()
    .from('meters')
    .select('device_id')
    .eq('device_id', deviceId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (owned.error) throw new Error(`No se pudo resolver el acceso: ${owned.error.message}`);
  if (owned.data) return 'owner';

  const shared = await supabase()
    .from('meter_members')
    .select('device_id')
    .eq('device_id', deviceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (shared.error) throw new Error(`No se pudo resolver el acceso: ${shared.error.message}`);
  return shared.data ? 'member' : 'none';
}

/**
 * Si un medidor ya está vinculado a alguna cuenta.
 *
 * Deliberadamente **no** devuelve a quién: confirmarle a un desconocido que
 * cierto identificador existe y está tomado ya es información de más.
 */
export async function isLinked(deviceId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from('meters')
    .select('device_id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo verificar el medidor: ${error.message}`);
  return data !== null;
}

/** Vincula un medidor a una cuenta. Falla si ya estaba vinculado. */
export async function linkMeter(params: {
  deviceId: string;
  ownerId: string;
  name: string;
  phases: MeterPhases;
}): Promise<Meter> {
  const { data, error } = await supabase()
    .from('meters')
    .insert({
      device_id: params.deviceId,
      owner_id: params.ownerId,
      name: params.name,
      phases: params.phases,
    })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`No se pudo vincular el medidor: ${error.message}`);
  return mapMeter(data as Record<string, unknown>);
}

/**
 * Desvincula un medidor.
 *
 * El borrado en cascada se lleva el contexto del lugar y las cuentas
 * invitadas. **Las lecturas y los eventos quedan**, porque `readings` no
 * depende de `meters`: volver a vincular el mismo medidor recupera su
 * historia entera.
 */
export async function unlinkMeter(deviceId: string): Promise<void> {
  const { error } = await supabase().from('meters').delete().eq('device_id', deviceId);
  if (error) throw new Error(`No se pudo desvincular el medidor: ${error.message}`);
}

/** Cuántas lecturas hay guardadas de un medidor, esté vinculado o no. */
export async function countReadingsOf(deviceId: string): Promise<number> {
  const { count, error } = await supabase()
    .from('readings')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId);

  if (error) throw new Error(`No se pudieron contar las lecturas: ${error.message}`);
  return count ?? 0;
}

/**
 * Un medidor puntual, si la cuenta tiene acceso.
 *
 * `null` cuando no existe o no es suyo: los dos casos se responden igual
 * afuera, porque si difirieran, probar identificadores diría cuáles están
 * tomados.
 */
export async function getAccessibleMeter(userId: string, deviceId: string): Promise<Meter | null> {
  if (!canView(await accessLevelFor(userId, deviceId))) return null;

  const { data, error } = await supabase()
    .from('meters')
    .select(COLUMNS)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el medidor: ${error.message}`);
  return data ? mapMeter(data as Record<string, unknown>) : null;
}
