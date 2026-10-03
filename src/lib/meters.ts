import 'server-only';

import { supabase } from './supabase';
import type { GoalInputMode } from './goal';
import type { MeterThresholds } from './threshold-types';

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
  /** Hasta qué instante ya se evaluaron anomalías. `null` = nunca. */
  anomaliesEvaluatedAt: string | null;
};

const COLUMNS =
  'device_id, name, low_voltage_v, high_voltage_v, overcurrent_a, gap_minutes, collection_interval_minutes, goal_kwh, goal_input_mode, alerts_enabled, anomalies_evaluated_at';

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
  };
}
