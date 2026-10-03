import 'server-only';

import { supabase } from './supabase';
import type { DwellingType, HomeContext, HomeRoom } from './home-types';

/**
 * Contexto del hogar de un medidor.
 *
 * `null` significa "el usuario todavía no lo cargó", que es un estado
 * esperado y no un error: la app funciona igual sin esta información, solo
 * que las recomendaciones salen más genéricas.
 */
export async function getHomeContext(deviceId: string): Promise<HomeContext | null> {
  const client = supabase();

  const { data: context, error: contextError } = await client
    .from('home_contexts')
    .select('dwelling_type, floors')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (contextError) {
    throw new Error(`No se pudo leer el contexto del hogar: ${contextError.message}`);
  }
  if (!context) return null;

  const { data: rooms, error: roomsError } = await client
    .from('home_rooms')
    .select('id, name, position')
    .eq('device_id', deviceId)
    .order('position', { ascending: true });

  if (roomsError) {
    throw new Error(`No se pudieron leer los ambientes: ${roomsError.message}`);
  }

  const roomIds = (rooms ?? []).map((room) => room.id);

  // Una sola consulta para todos los aparatos, no una por ambiente: son
  // pocas filas y así el costo no crece con la cantidad de ambientes.
  const appliancesByRoom = new Map<number, string[]>();

  if (roomIds.length > 0) {
    const { data: appliances, error: appliancesError } = await client
      .from('home_appliances')
      .select('room_id, appliance_id')
      .in('room_id', roomIds);

    if (appliancesError) {
      throw new Error(`No se pudieron leer los aparatos: ${appliancesError.message}`);
    }

    for (const row of appliances ?? []) {
      const list = appliancesByRoom.get(Number(row.room_id)) ?? [];
      list.push(String(row.appliance_id));
      appliancesByRoom.set(Number(row.room_id), list);
    }
  }

  return {
    dwellingType: context.dwelling_type as DwellingType,
    floors: Number(context.floors),
    rooms: (rooms ?? []).map<HomeRoom>((room) => ({
      name: String(room.name),
      appliances: appliancesByRoom.get(Number(room.id)) ?? [],
    })),
  };
}

/**
 * Guarda el contexto completo, reemplazando lo anterior.
 *
 * Es un reemplazo y no una fusión porque el asistente siempre envía el estado
 * completo: intentar deducir altas y bajas ambiente por ambiente daría el
 * mismo resultado con mucha más superficie para equivocarse.
 *
 * Los ambientes se borran y se vuelven a crear, y el `on delete cascade` de
 * `home_appliances` se lleva sus aparatos. Eso significa que los ids de
 * ambiente cambian en cada guardado — es aceptable porque nada afuera los
 * referencia; el día que algo lo haga, esto tiene que pasar a hacer altas y
 * bajas selectivas.
 */
export async function saveHomeContext(deviceId: string, home: HomeContext): Promise<void> {
  const client = supabase();

  const { error: contextError } = await client.from('home_contexts').upsert(
    {
      device_id: deviceId,
      dwelling_type: home.dwellingType,
      floors: home.floors,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' }
  );

  if (contextError) {
    throw new Error(`No se pudo guardar la vivienda: ${contextError.message}`);
  }

  const { error: deleteError } = await client
    .from('home_rooms')
    .delete()
    .eq('device_id', deviceId);

  if (deleteError) {
    throw new Error(`No se pudieron reemplazar los ambientes: ${deleteError.message}`);
  }

  if (home.rooms.length === 0) return;

  const { data: inserted, error: insertError } = await client
    .from('home_rooms')
    .insert(
      home.rooms.map((room, index) => ({
        device_id: deviceId,
        name: room.name,
        position: index,
      }))
    )
    .select('id, name');

  if (insertError) {
    throw new Error(`No se pudieron guardar los ambientes: ${insertError.message}`);
  }

  // El insert devuelve las filas en el orden en que se enviaron, pero
  // emparejar por nombre no depende de eso. Los nombres son únicos por
  // medidor (índice en la migración), así que la correspondencia es exacta.
  const idByName = new Map((inserted ?? []).map((row) => [String(row.name), Number(row.id)]));

  const applianceRows = home.rooms.flatMap((room) => {
    const roomId = idByName.get(room.name);
    if (roomId === undefined) return [];

    return room.appliances.map((applianceId) => ({
      room_id: roomId,
      appliance_id: applianceId,
    }));
  });

  if (applianceRows.length === 0) return;

  const { error: appliancesError } = await client.from('home_appliances').insert(applianceRows);

  if (appliancesError) {
    throw new Error(`No se pudieron guardar los aparatos: ${appliancesError.message}`);
  }
}

/** Borra todo el contexto de un medidor. El cascade se lleva ambientes y aparatos. */
export async function clearHomeContext(deviceId: string): Promise<void> {
  const client = supabase();

  const { error: roomsError } = await client.from('home_rooms').delete().eq('device_id', deviceId);
  if (roomsError) {
    throw new Error(`No se pudieron borrar los ambientes: ${roomsError.message}`);
  }

  const { error } = await client.from('home_contexts').delete().eq('device_id', deviceId);
  if (error) {
    throw new Error(`No se pudo borrar el contexto del hogar: ${error.message}`);
  }
}
