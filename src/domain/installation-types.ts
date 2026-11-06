/**
 * Tipos de instalación y de área. **Dominio puro.**
 *
 * Un medidor se instala en el **tablero central** de una infraestructura —una
 * casa, una clínica, un taller, un comercio— o en un **área** dentro de ella
 * —una oficina, un garage, un sector clínico—.
 *
 * Los dos recorridos del alta son distintos, y de ahí sale casi todo lo de
 * este archivo: qué pregunta viene después de elegir el tipo, cómo se llaman
 * las subdivisiones en pantalla, y qué aparatos se ofrecen.
 *
 * **Los medidores no se relacionan entre sí.** Un central y un área pueden
 * convivir en el mismo lugar y cada uno mide lo suyo: ninguno resta del otro,
 * ninguno se desglosa contra el otro. Que estén en la misma infraestructura es
 * una circunstancia, no un vínculo.
 */
import type { MeterRole } from './meter-role';

// --------------------------------------------------------------- los tipos

/** Infraestructuras completas. Solo para un medidor central. */
export type SiteType =
  | 'casa'
  | 'depto'
  | 'clinica'
  | 'taller'
  | 'comercio'
  | 'concesionaria'
  | 'oficina_edificio'
  | 'deposito'
  | 'otra_infraestructura';

/** Áreas dentro de una infraestructura. Solo para un medidor de área. */
export type AreaType =
  | 'ambiente_unico'
  | 'dos_ambientes'
  | 'area_oficina'
  | 'area_taller'
  | 'area_garage'
  | 'area_deposito'
  | 'sector_clinico'
  | 'area_cocina'
  | 'otra_area';

export type ContextType = SiteType | AreaType;

/**
 * Cómo se llama una subdivisión en cada contexto.
 *
 * Es solo la etiqueta: la estructura guardada es la misma en todos los casos.
 * Pero llamarle "ambiente" al quirófano de una clínica haría que el
 * formulario se sienta ajeno, y un formulario ajeno se abandona.
 */
export type SubdivisionLabel = {
  /** "Ambiente", "Sector", "Oficina". */
  singular: string;
  plural: string;
  /** Lo que se le pregunta al usuario al agregar una. */
  prompt: string;
};

export type ContextDefinition = {
  type: ContextType;
  label: string;
  /** Si lo puede elegir un medidor central, uno de área, o solo uno de ellos. */
  role: MeterRole;
  /** Si tiene sentido preguntar por pisos. Solo las viviendas. */
  hasFloors: boolean;
  /** Si se subdivide en lugares con aparatos. */
  hasSubdivisions: boolean;
  subdivision: SubdivisionLabel;
  /** Qué catálogo de aparatos se ofrece en este contexto. */
  catalog: CatalogId;
};

/** Los catálogos de aparatos disponibles. */
export type CatalogId =
  | 'vivienda'
  | 'oficina'
  | 'taller'
  | 'comercio'
  | 'clinica'
  | 'garage'
  | 'deposito'
  | 'cocina_comercial';

const AMBIENTES: SubdivisionLabel = {
  singular: 'Ambiente',
  plural: 'Ambientes',
  prompt: '¿Qué ambientes tiene?',
};
const SECTORES: SubdivisionLabel = {
  singular: 'Sector',
  plural: 'Sectores',
  prompt: '¿Qué sectores tiene?',
};
const ESPACIOS: SubdivisionLabel = {
  singular: 'Espacio',
  plural: 'Espacios',
  prompt: '¿Qué espacios querés registrar?',
};

export const CONTEXTS: ContextDefinition[] = [
  // ------------------------------------------- infraestructuras (central)
  {
    type: 'casa',
    label: 'Casa',
    role: 'central',
    hasFloors: true,
    hasSubdivisions: true,
    subdivision: AMBIENTES,
    catalog: 'vivienda',
  },
  {
    type: 'depto',
    label: 'Departamento',
    role: 'central',
    hasFloors: true,
    hasSubdivisions: true,
    subdivision: AMBIENTES,
    catalog: 'vivienda',
  },
  {
    type: 'clinica',
    label: 'Clínica',
    role: 'central',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: SECTORES,
    catalog: 'clinica',
  },
  {
    type: 'taller',
    label: 'Taller',
    role: 'central',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: SECTORES,
    catalog: 'taller',
  },
  {
    type: 'comercio',
    label: 'Comercio',
    role: 'central',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: SECTORES,
    catalog: 'comercio',
  },
  {
    type: 'concesionaria',
    label: 'Concesionaria',
    role: 'central',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: SECTORES,
    catalog: 'comercio',
  },
  {
    type: 'oficina_edificio',
    label: 'Edificio de oficinas',
    role: 'central',
    hasFloors: true,
    hasSubdivisions: true,
    subdivision: SECTORES,
    catalog: 'oficina',
  },
  {
    type: 'deposito',
    label: 'Depósito',
    role: 'central',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: SECTORES,
    catalog: 'deposito',
  },
  {
    type: 'otra_infraestructura',
    label: 'Otra',
    role: 'central',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: ESPACIOS,
    catalog: 'vivienda',
  },

  // --------------------------------------------------- áreas (medidor de área)
  {
    type: 'ambiente_unico',
    label: 'Un ambiente',
    role: 'area',
    hasFloors: false,
    // Un solo ambiente no se subdivide: los aparatos se cargan directo.
    hasSubdivisions: false,
    subdivision: AMBIENTES,
    catalog: 'vivienda',
  },
  {
    type: 'dos_ambientes',
    label: 'Dos ambientes',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: true,
    subdivision: AMBIENTES,
    catalog: 'vivienda',
  },
  {
    type: 'area_oficina',
    label: 'Oficina',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: ESPACIOS,
    catalog: 'oficina',
  },
  {
    type: 'area_taller',
    label: 'Taller',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: ESPACIOS,
    catalog: 'taller',
  },
  {
    type: 'area_garage',
    label: 'Garage',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: ESPACIOS,
    catalog: 'garage',
  },
  {
    type: 'area_deposito',
    label: 'Depósito',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: ESPACIOS,
    catalog: 'deposito',
  },
  {
    type: 'sector_clinico',
    label: 'Sector clínico',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: SECTORES,
    catalog: 'clinica',
  },
  {
    type: 'area_cocina',
    label: 'Cocina',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: ESPACIOS,
    catalog: 'cocina_comercial',
  },
  {
    type: 'otra_area',
    label: 'Otra',
    role: 'area',
    hasFloors: false,
    hasSubdivisions: false,
    subdivision: ESPACIOS,
    catalog: 'vivienda',
  },
];

const POR_TIPO: ReadonlyMap<ContextType, ContextDefinition> = new Map(
  CONTEXTS.map((c) => [c.type, c])
);

export function contextDefinition(type: ContextType): ContextDefinition | null {
  return POR_TIPO.get(type) ?? null;
}

/** Los contextos que puede elegir un medidor, según dónde esté instalado. */
export function contextsForRole(role: MeterRole): ContextDefinition[] {
  return CONTEXTS.filter((c) => c.role === role);
}

export function isValidContextType(value: unknown): value is ContextType {
  return typeof value === 'string' && POR_TIPO.has(value as ContextType);
}

/**
 * Si un contexto le corresponde al rol del medidor.
 *
 * Un medidor en el tablero no puede declararse "garage", y uno de área no
 * puede declararse "clínica": serían dos formas distintas de decir que mide
 * algo que no mide.
 */
export function contextMatchesRole(type: ContextType, role: MeterRole): boolean {
  return POR_TIPO.get(type)?.role === role;
}

// ------------------------------------------------------- fases del medidor

export type MeterPhases = 1 | 3;

export const PHASE_LABEL: Record<MeterPhases, string> = {
  1: 'Monofásico',
  3: 'Trifásico',
};

export function isValidPhases(value: unknown): value is MeterPhases {
  return value === 1 || value === 3;
}
