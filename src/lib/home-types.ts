/**
 * Tipos del contexto del hogar, compartidos por el navegador y el servidor.
 *
 * Sin `server-only`: el asistente de carga los usa para armar el cuerpo del
 * PUT, y la ruta de API los usa para validarlo. Tenerlos en un solo lugar es
 * lo que hace que las dos puntas no se desincronicen.
 */

export type DwellingType = 'casa' | 'depto';

export type HomeRoom = {
  /** Nombre que escribió el usuario: "Cocina", "Dormitorio 1". */
  name: string;
  /** Ids del catálogo fijo (ver home-catalog.ts). */
  appliances: string[];
};

export type HomeContext = {
  dwellingType: DwellingType;
  floors: number;
  rooms: HomeRoom[];
};

/** Lo que ve una cuenta que todavía no cargó nada. */
export const EMPTY_HOME: HomeContext = {
  dwellingType: 'casa',
  floors: 1,
  rooms: [],
};

/**
 * Límites, replicados en el servidor para no confiar en el formulario.
 * Son holgados a propósito: atrapan el disparate, no al usuario real.
 */
export const MAX_FLOORS = 50;
export const MAX_ROOMS = 40;
export const MAX_ROOM_NAME_LENGTH = 40;

/** Resumen para la tarjeta de "Mis medidores". */
export type HomeSummary = {
  configured: boolean;
  rooms: number;
  appliances: number;
};

export function summarizeHome(home: HomeContext | null): HomeSummary {
  if (!home || home.rooms.length === 0) {
    return { configured: false, rooms: 0, appliances: 0 };
  }

  return {
    configured: true,
    rooms: home.rooms.length,
    appliances: home.rooms.reduce((total, room) => total + room.appliances.length, 0),
  };
}
