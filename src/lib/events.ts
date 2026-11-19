import 'server-only';

import { supabase } from './supabase';
import type { EventRecord, EventSeverity, EventType } from '../domain/event-types';

export type OpenEventUpdate = {
  lastViolationAt: string;
  samples: number;
  minVoltage: number | null;
  maxVoltage: number | null;
  maxCurrent: number | null;
  maxPowerW: number | null;
  severity: EventSeverity;
};

export type NewEvent = {
  deviceId: string;
  type: EventType;
  severity: EventSeverity;
  startedAt: string;
  /** Los huecos de datos nacen cerrados: su fin se conoce al detectarlos. */
  endedAt?: string | null;
  lastViolationAt: string;
  samples: number;
  minVoltage: number | null;
  maxVoltage: number | null;
  maxCurrent: number | null;
  maxPowerW: number | null;
};

/** Eventos activos (sin cerrar) de un medidor, indexados por tipo. */
export async function getOpenEvents(deviceId: string): Promise<Map<EventType, EventRecord>> {
  const { data, error } = await supabase()
    .from('events')
    .select('*')
    .eq('device_id', deviceId)
    .is('ended_at', null);

  if (error) throw new Error(`No se pudieron leer los eventos abiertos: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.type as EventType, mapEvent(row)]));
}

/**
 * Abre un evento, o devuelve el que ya estuviera abierto de ese tipo.
 *
 * El índice único garantiza un solo evento abierto por tipo y medidor. Si dos
 * ciclos de detección se solapan —o si se reprocesa historia ya evaluada—, el
 * segundo choca contra esa restricción. En vez de fallar, recupera el evento
 * existente y sigue acumulando sobre él: es exactamente el resultado que se
 * buscaba al poner el índice.
 */
export async function openOrGetEvent(event: NewEvent): Promise<EventRecord> {
  try {
    return await insertEvent(event);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const open = await getOpenEvents(event.deviceId);
    const existing = open.get(event.type);
    if (existing) return existing;

    // La restricción saltó pero el evento ya no está: se cerró entre medio.
    // Reintentar una vez es correcto porque ahora el hueco está libre.
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('duplicate key value');
}

export async function insertEvent(event: NewEvent): Promise<EventRecord> {
  if (event.type === 'DATA_GAP' && event.endedAt) {
    const { data: existing, error: lookupError } = await supabase()
      .from('events')
      .select('*')
      .eq('device_id', event.deviceId)
      .eq('type', 'DATA_GAP')
      .eq('started_at', event.startedAt)
      .eq('ended_at', event.endedAt)
      .limit(1);
    if (!lookupError && existing && existing.length > 0) {
      return mapEvent(existing[0]);
    }
  }

  const { data, error } = await supabase()
    .from('events')
    .insert({
      device_id: event.deviceId,
      type: event.type,
      severity: event.severity,
      started_at: event.startedAt,
      ended_at: event.endedAt ?? null,
      last_violation_at: event.lastViolationAt,
      samples: event.samples,
      min_voltage: event.minVoltage,
      max_voltage: event.maxVoltage,
      max_current: event.maxCurrent,
      max_power_w: event.maxPowerW,
    })
    .select()
    .single();

  if (error) throw new Error(`No se pudo registrar el evento: ${error.message}`);

  return mapEvent(data);
}

export async function updateOpenEvent(id: number, update: OpenEventUpdate) {
  const { error } = await supabase()
    .from('events')
    .update({
      last_violation_at: update.lastViolationAt,
      samples: update.samples,
      min_voltage: update.minVoltage,
      max_voltage: update.maxVoltage,
      max_current: update.maxCurrent,
      max_power_w: update.maxPowerW,
      severity: update.severity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(`No se pudo actualizar el evento: ${error.message}`);
}

/**
 * Cierra un evento en el instante de su última violación, no en el momento de
 * la detección: la duración así refleja cuánto duró la anomalía real.
 */
export async function closeEvent(id: number, endedAt: string) {
  const { error } = await supabase()
    .from('events')
    .update({ ended_at: endedAt, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`No se pudo cerrar el evento: ${error.message}`);
}

/** Cuántas anomalías siguen abiertas en un medidor (opcionalmente solo de tensión). */
export async function countActiveEvents(deviceId: string, voltageOnly = false): Promise<number> {
  const query = supabase()
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .is('ended_at', null);

  const { count, error } = await (voltageOnly
    ? query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE'])
    : query);

  if (error) throw new Error(`No se pudieron contar los eventos activos: ${error.message}`);

  return count ?? 0;
}

/** Episodios iniciados en `[from, to)`. Los de arrastre se informan en el contador de activos. */
export async function countPeriodEvents(
  deviceId: string,
  from: string,
  to: string,
  voltageOnly = false
): Promise<number> {
  const query = supabase()
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .gte('started_at', from)
    .lt('started_at', to);
  const { count, error } = await (voltageOnly
    ? query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE'])
    : query);
  if (error) throw new Error('No se pudieron contar los episodios del período.');
  return count ?? 0;
}

/** Episodios cerrados con inicio anterior a `before` (o todos los cerrados si `before` es null). */
export async function countHistoricalEvents(
  deviceId: string,
  before: string | null,
  voltageOnly = false
): Promise<number> {
  let query = supabase()
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .not('ended_at', 'is', null);
  if (before) query = query.lt('started_at', before);
  const { count, error } = await (voltageOnly
    ? query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE'])
    : query);
  if (error) throw new Error('No se pudieron contar los eventos históricos.');
  return count ?? 0;
}

/** Lista de episodios persistidos iniciados en `[from, to)` ordenados del más reciente al más antiguo. */
export async function listPeriodEvents(
  deviceId: string,
  from: string,
  to: string,
  voltageOnly = false
): Promise<EventRecord[]> {
  const query = supabase()
    .from('events')
    .select('*')
    .eq('device_id', deviceId)
    .gte('started_at', from)
    .lt('started_at', to)
    .order('started_at', { ascending: false })
    .limit(500);
  const { data, error } = await (voltageOnly
    ? query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE'])
    : query);
  if (error) throw new Error(`No se pudieron leer los eventos del período: ${error.message}`);
  return (data ?? []).map(mapEvent);
}

/** Último episodio persistido (opcionalmente restringido a tensión). */
export async function latestEvent(deviceId: string, voltageOnly = false): Promise<EventRecord | null> {
  const query = supabase()
    .from('events')
    .select('*')
    .eq('device_id', deviceId)
    .order('started_at', { ascending: false })
    .limit(1);
  const { data, error } = await (voltageOnly
    ? query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE'])
    : query);
  if (error) throw new Error(`No se pudo leer el último evento: ${error.message}`);
  return data && data.length > 0 ? mapEvent(data[0]) : null;
}

/** Eventos que todavía no se avisaron por email. */
export async function listUnnotifiedEvents(deviceId: string): Promise<EventRecord[]> {
  const { data, error } = await supabase()
    .from('events')
    .select('*')
    .eq('device_id', deviceId)
    .is('notified_at', null)
    .order('started_at', { ascending: true })
    // Tope de seguridad: si se acumuló una cola larga (por ejemplo tras
    // reprocesar historia), no se manda una avalancha de correos de una vez.
    .limit(5);

  if (error) throw new Error(`No se pudieron leer los eventos sin notificar: ${error.message}`);

  return (data ?? []).map(mapEvent);
}

export async function markEventsNotified(ids: number[]) {
  if (ids.length === 0) return;

  const { error } = await supabase()
    .from('events')
    .update({ notified_at: new Date().toISOString() })
    .in('id', ids);

  if (error) throw new Error(`No se pudo marcar los eventos como notificados: ${error.message}`);
}

export async function listEvents(deviceId: string, limit = 100): Promise<EventRecord[]> {
  const { data, error } = await supabase()
    .from('events')
    .select('*')
    .eq('device_id', deviceId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`);

  return (data ?? []).map(mapEvent);
}

function mapEvent(row: Record<string, unknown>): EventRecord {
  return {
    id: Number(row.id),
    type: row.type as EventType,
    severity: row.severity as EventSeverity,
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    lastViolationAt: String(row.last_violation_at),
    samples: Number(row.samples),
    minVoltage: num(row.min_voltage),
    maxVoltage: num(row.max_voltage),
    maxCurrent: num(row.max_current),
    maxPowerW: num(row.max_power_w),
  };
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
