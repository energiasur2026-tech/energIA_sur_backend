/**
 * Contexto de la instalación donde vive un medidor. Compartido por el
 * navegador y el servidor.
 *
 * Sin `server-only`: el asistente de carga los usa para armar el cuerpo del
 * PUT y la ruta de API los usa para validarlo. Tenerlos en un solo lugar es
 * lo que hace que las dos puntas no se desincronicen.
 *
 * Esto nació pensado solo para viviendas —de ahí el nombre "home"— y ahora
 * describe también clínicas, talleres, comercios y áreas sueltas dentro de
 * ellos. La estructura es la misma en todos los casos: un tipo, una lista de
 * subdivisiones y los aparatos de cada una. Lo que cambia es cómo se llaman
 * en pantalla, y eso vive en `installation-types.ts`.
 */
import { contextDefinition, type ContextType } from './installation-types';

/** Una subdivisión del lugar: un ambiente, un sector, una oficina. */
export type HomeRoom = {
  /** Nombre que escribió el usuario: "Cocina", "Terapia intensiva". */
  name: string;
  /** Ids del catálogo de aparatos que corresponde al contexto. */
  appliances: string[];
};

export type HomeContext = {
  /** Qué es el lugar: una casa, una clínica, una oficina dentro de un taller. */
  contextType: ContextType;
  /** Solo en viviendas y edificios. `null` donde la pregunta no aplica. */
  floors: number | null;
  /** Las subdivisiones cargadas. Vacío en un contexto que no se subdivide. */
  rooms: HomeRoom[];
};

/** Lo que ve una cuenta que todavía no cargó nada. */
export const EMPTY_HOME: HomeContext = {
  contextType: 'casa',
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

/**
 * Normaliza el contexto según lo que su tipo admite.
 *
 * Evita guardar datos que no significan nada: pisos en una oficina,
 * subdivisiones en un contexto que no se subdivide. Sin esto, un formulario
 * mal armado dejaría en la base respuestas a preguntas que nunca se hicieron.
 */
export function normalizeContext(home: HomeContext): HomeContext {
  const def = contextDefinition(home.contextType);
  if (!def) return home;

  return {
    contextType: home.contextType,
    floors: def.hasFloors ? (home.floors ?? 1) : null,
    rooms: def.hasSubdivisions ? home.rooms : home.rooms.slice(0, 1),
  };
}

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
