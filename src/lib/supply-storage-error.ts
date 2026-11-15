/** Safe public diagnostics; never forward database messages, identities or credentials. */
export class SupplyStorageError extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}

export function supplyStorageError(error: { code?: string; message?: string }): SupplyStorageError {
  if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) {
    return new SupplyStorageError('SUPPLY_SCHEMA_MISSING', 'La base de datos no tiene completa la configuración de suministros. Aplicá las migraciones 0021–0023 o el SQL de reparación de suministros. Tus cambios siguen en el formulario.');
  }
  if (error.code === '23514') {
    return new SupplyStorageError('SUPPLY_SCHEMA_CONSTRAINT', 'La base de datos rechazó esta configuración por una restricción. Revisá las migraciones de suministros y los valores enviados. Tus cambios siguen en el formulario.', 409);
  }
  if (['42501', '28000', 'PGRST301'].includes(error.code ?? '')) {
    return new SupplyStorageError('SUPPLY_STORAGE_PERMISSION', 'El backend no tiene acceso para guardar el suministro. Revisá su configuración de Supabase. Tus cambios siguen en el formulario.');
  }
  if (/fetch failed|network|eacces|timeout|timed out/i.test(error.message ?? '')) {
    return new SupplyStorageError('SUPPLY_STORAGE_UNAVAILABLE', 'El servidor no pudo conectarse a Supabase para guardar. Reintentá cuando se restablezca la conexión. Tus cambios siguen en el formulario.');
  }
  return new SupplyStorageError('SUPPLY_SAVE_FAILED', 'No se pudo guardar el suministro. Reintentá; tus cambios siguen en el formulario.');
}
