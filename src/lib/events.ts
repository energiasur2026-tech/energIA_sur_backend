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
  /** Umbral aplicado al abrir el episodio (V, A o minutos según el tipo). */
  detectionThreshold?: number | null;
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

    const sameEpisode = await findEpisode(event);
    if (sameEpisode) return sameEpisode;
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

async function findEpisode(event: NewEvent): Promise<EventRecord | null> {
  const { data, error } = await supabase()
    .from('events')
    .select('*')
    .eq('device_id', event.deviceId)
    .eq('type', event.type)
    .eq('started_at', event.startedAt)
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw new Error(`No se pudo buscar el episodio: ${error.message}`);
  return data?.length ? mapEvent(data[0]) : null;
}

export async function insertEvent(event: NewEvent): Promise<EventRecord> {
  const existing = await findEpisode(event);
  if (existing) return existing;

  const { data, error } = await supabase()
    .from('events')
    .insert({
      device_id: event.deviceId,
      detection_threshold: event.detectionThreshold ?? null,
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

  if (error) {
    if (error.code === '23505') {
      const concurrent = await findEpisode(event);
      if (concurrent) return concurrent;
    }
    throw new Error(`No se pudo registrar el evento: ${error.message}`);
  }

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
    .eq('id', id)
    .is('ended_at', null)
    .lte('last_violation_at', update.lastViolationAt);

  if (error) throw new Error(`No se pudo actualizar el evento: ${error.message}`);
}

/**
 * Cierra un evento en el instante de su última violación, no en el momento de
 * la detección: este dato delimita las lecturas observadas.
 */
export async function closeEvent(id: number, endedAt: string) {
  const { error } = await supabase()
    .from('events')
    .update({ ended_at: endedAt, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('ended_at', null)
    .lte('last_violation_at', endedAt);

  if (error) throw new Error(`No se pudo cerrar el evento: ${error.message}`);
}

/** Cuántas anomalías siguen abiertas en un medidor (opcionalmente solo de tensión). */
export async function countActiveEvents(deviceId: string, voltageOnly = false, type?: EventType): Promise<number> {
  const query = supabase()
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .is('ended_at', null);
  if (type) query.eq('type', type);

  const { count, error } = await (voltageOnly
    ? query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE'])
    : query);

  if (error) throw new Error(`No se pudieron contar los eventos activos: ${error.message}`);

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

/** Episodios iniciados en [from, to). El límite superior es exclusivo. */
export async function listPeriodEvents(
  deviceId: string,
  from: string | null,
  to: string | null,
  voltageOnly = false,
  type?: EventType
): Promise<EventRecord[]> {
  const pageSize = 500;
  const events = new Map<string, EventRecord>();
  let beforeId: number | undefined;
  for (;;) {
    let query = supabase().from('events').select('*').eq('device_id', deviceId);
    if (from) query = query.gte('started_at', from);
    if (to) query = query.lt('started_at', to);
    if (voltageOnly) query = query.in('type', ['LOW_VOLTAGE', 'HIGH_VOLTAGE']);
    if (type) query = query.eq('type', type);
    if (beforeId !== undefined) query = query.lt('id', beforeId);
    const { data, error } = await query.order('id', { ascending: false }).limit(pageSize);
    if (error) throw new Error(`No se pudieron leer los episodios: ${error.message}`);
    for (const row of data ?? []) {
      const event = mapEvent(row);
      const key = `${event.type}:${Date.parse(event.startedAt)}`;
      if (!events.has(key) || event.endedAt === null) events.set(key, event);
    }
    if (!data || data.length < pageSize) break;
    beforeId = Number(data[data.length - 1].id);
  }
  return Array.from(events.values()).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.id - a.id);
}

/** Último episodio persistido (opcionalmente restringido a tensión). */
export async function latestEvent(deviceId: string, voltageOnly = false, type?: EventType): Promise<EventRecord | null> {
  const query = supabase()
    .from('events')
    .select('*')
    .eq('device_id', deviceId)
    .order('started_at', { ascending: false })
    .limit(1);
  if (type) query.eq('type', type);
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
    detectionThreshold: num(row.detection_threshold),
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
