/**
 * Vinculación de un medidor a una cuenta. **Dominio puro.**
 *
 * Hasta ahora vincular un medidor era una operación manual por SQL. Esto
 * define las reglas para que lo haga el usuario desde la aplicación.
 *
 * ## Qué protege
 *
 * El identificador del medidor es el `device_id` de Tuya. Quien lo conoce
 * puede reclamarlo, así que **funciona como un secreto compartido**: está
 * impreso en el equipo y en su caja, y no se publica en ningún lado. No es
 * un esquema de emparejamiento fuerte —Tuya no nos da un código rotativo que
 * se muestre en el dispositivo— y conviene saberlo en vez de suponer que lo
 * es.
 *
 * Sobre esa base, dos reglas que sí son firmes:
 *
 * 1. **Un medidor pertenece a una sola cuenta.** Si ya está vinculado, el
 *    pedido se rechaza, sin decir a quién: confirmarle a un desconocido que
 *    cierto identificador existe y está tomado ya es información de más.
 * 2. **El dispositivo tiene que existir en el proyecto de Tuya.** Un
 *    identificador inventado no se vincula, así que nadie puede llenar la
 *    tabla de medidores fantasma ni reservar identificadores ajenos.
 */

/**
 * Los identificadores de Tuya son cadenas cortas de letras y números, como
 * `eb5095128f6c50f96akbbq`. El rango es holgado a propósito: valida la forma
 * para atrapar un pegado con espacios o una URL entera, no para adivinar el
 * formato exacto de un proveedor que puede cambiarlo.
 */
export const DEVICE_ID_MIN = 8;
export const DEVICE_ID_MAX = 64;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9]+$/;

export const MAX_METER_NAME_LENGTH = 60;

export type DeviceIdError = 'vacio' | 'longitud' | 'caracteres';

export const DEVICE_ID_ERROR_MESSAGE: Record<DeviceIdError, string> = {
  vacio: 'Falta el identificador del medidor.',
  longitud: `El identificador debe tener entre ${DEVICE_ID_MIN} y ${DEVICE_ID_MAX} caracteres.`,
  caracteres: 'El identificador solo puede tener letras y números.',
};

/**
 * Valida y normaliza un identificador de medidor.
 *
 * Limpia espacios al pegar, que es el error más común: el identificador se
 * copia de una etiqueta o de un mail y casi siempre arrastra algo.
 */
export function parseDeviceId(
  value: unknown
): { ok: true; deviceId: string } | { ok: false; error: DeviceIdError } {
  const limpio = typeof value === 'string' ? value.trim() : '';

  if (limpio === '') return { ok: false, error: 'vacio' };
  if (limpio.length < DEVICE_ID_MIN || limpio.length > DEVICE_ID_MAX) {
    return { ok: false, error: 'longitud' };
  }
  if (!DEVICE_ID_PATTERN.test(limpio)) return { ok: false, error: 'caracteres' };

  return { ok: true, deviceId: limpio };
}

/** Nombre con el que el usuario reconoce su medidor. */
export function parseMeterName(value: unknown, fallback = 'Medidor'): string {
  const limpio = typeof value === 'string' ? value.trim() : '';
  if (limpio === '') return fallback;
  return limpio.slice(0, MAX_METER_NAME_LENGTH);
}

/**
 * Cómo accede una cuenta a un medidor.
 *
 * `owner` lo vinculó; `member` fue invitado a verlo. La distinción importa
 * porque **solo el dueño puede desvincular**: un invitado que se va deja de
 * ver el medidor, pero no se lo saca a quien lo instaló.
 */
export type AccessLevel = 'owner' | 'member' | 'none';

export function canUnlink(access: AccessLevel): boolean {
  return access === 'owner';
}

export function canView(access: AccessLevel): boolean {
  return access === 'owner' || access === 'member';
}

/**
 * Qué pasa con los datos al desvincular.
 *
 * Se documenta acá porque es una consecuencia del esquema que no se ve en el
 * código de la ruta, y determina si la operación es reversible:
 *
 * - **Las lecturas y los eventos quedan.** `readings` no depende de `meters`,
 *   así que la historia sobrevive. Volver a vincular el mismo medidor la
 *   recupera entera.
 * - **El contexto y los invitados se borran.** Dependen del medidor con
 *   borrado en cascada: el tipo de lugar, sus subdivisiones, los aparatos y
 *   las cuentas invitadas desaparecen.
 * - **Los ajustes del propio medidor también se borran**, porque se van con
 *   la fila: el intervalo de guardado, los umbrales, la sensibilidad, el
 *   objetivo y la preferencia de avisos. Al revincular se reponen con los
 *   valores iniciales de `meter-defaults.ts`.
 *
 * Es decir: desvincular pierde *la configuración*, no *las mediciones*. Quien
 * lo haga tiene que saberlo antes, no después.
 *
 * Esta lista estaba incompleta y costó caro. Decía solo lo de arriba, pensada
 * desde las tablas con cascada, y se olvidaba de las columnas de la propia
 * fila. Un medidor revinculado quedó guardando cada 6 horas en vez de cada 5
 * minutos y el histórico dejó de crecer; los umbrales se resetearon en el
 * mismo movimiento y no se notó, porque los defaults de la base coincidían
 * con los que tenía ese medidor.
 */
export const UNLINK_CONSEQUENCES = {
  keepsReadings: true,
  keepsEvents: true,
  dropsContext: true,
  dropsMembers: true,
  /** Intervalo, umbrales, sensibilidad, objetivo y avisos. */
  dropsMeterSettings: true,
} as const;
