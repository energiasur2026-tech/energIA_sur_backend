import 'server-only';

import { supabase } from './supabase';
import type { Profile } from './profile-types';

/** Perfil del usuario. Devuelve campos vacíos si todavía no cargó nada. */
export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase()
    .from('profiles')
    .select('first_name, last_name, phone, address')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);

  return {
    firstName: data?.first_name ?? '',
    lastName: data?.last_name ?? '',
    phone: data?.phone ?? '',
    address: data?.address ?? '',
  };
}

export async function saveProfile(userId: string, profile: Profile) {
  const { error } = await supabase()
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        // Un campo vaciado se guarda como NULL, no como cadena vacía: así
        // "sin dato" tiene una sola representación en la base.
        first_name: nullIfBlank(profile.firstName),
        last_name: nullIfBlank(profile.lastName),
        phone: nullIfBlank(profile.phone),
        address: nullIfBlank(profile.address),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw new Error(`No se pudo guardar el perfil: ${error.message}`);
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
