/** Perfil del titular de la cuenta. Sin 'server-only': lo usa el formulario. */
export type Profile = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
};

export const EMPTY_PROFILE: Profile = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
};

/** Longitudes máximas, replicadas en el servidor para no confiar en el formulario. */
export const PROFILE_MAX_LENGTH = 120;
