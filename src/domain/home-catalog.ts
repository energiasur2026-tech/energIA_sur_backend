/**
 * Catálogo fijo de aparatos del hogar.
 *
 * Sin `server-only`: lo usa tanto el selector en el navegador como la
 * validación en el servidor. Que sea la MISMA lista en los dos lados es el
 * punto — la base guarda estas claves, así que un `id` que no esté acá es un
 * dato inválido, no una preferencia del usuario.
 *
 * Es deliberadamente cerrado. Un campo de texto libre daría "heladera",
 * "Heladera", "heladera grande" y "frigorífico" como cuatro cosas distintas,
 * y ningún análisis podría agruparlas después. Si falta algo importante, se
 * agrega acá y queda disponible para todos.
 *
 * Los `typicalWatts` son órdenes de magnitud de referencia para uso doméstico
 * en Argentina, NO mediciones. Sirven para ordenar sugerencias por impacto
 * probable ("el termotanque pesa más que el router"), nunca para calcular un
 * consumo: para eso está el medidor, que mide de verdad.
 */

import type { LucideIcon } from 'lucide-react';
import {
  AirVent,
  Bath,
  BedDouble,
  Coffee,
  CookingPot,
  Droplets,
  Fan,
  Gamepad2,
  Heater,
  Laptop,
  Lightbulb,
  Microwave,
  Monitor,
  Plug,
  Refrigerator,
  Router,
  Snowflake,
  Sofa,
  Speaker,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Wind,
} from 'lucide-react';

export type Appliance = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Potencia típica de referencia, en watts. Ver nota del encabezado. */
  typicalWatts: number;
};

export type ApplianceCategory = {
  id: string;
  label: string;
  items: Appliance[];
};

export const APPLIANCE_CATEGORIES: ApplianceCategory[] = [
  {
    id: 'cocina',
    label: 'Cocina',
    items: [
      { id: 'heladera', label: 'Heladera', icon: Refrigerator, typicalWatts: 150 },
      { id: 'freezer', label: 'Freezer', icon: Snowflake, typicalWatts: 200 },
      { id: 'horno_electrico', label: 'Horno eléctrico', icon: CookingPot, typicalWatts: 2000 },
      { id: 'microondas', label: 'Microondas', icon: Microwave, typicalWatts: 1200 },
      { id: 'pava_electrica', label: 'Pava eléctrica', icon: UtensilsCrossed, typicalWatts: 2000 },
      { id: 'cafetera', label: 'Cafetera', icon: Coffee, typicalWatts: 900 },
    ],
  },
  {
    id: 'climatizacion',
    label: 'Climatización',
    items: [
      { id: 'aire_acondicionado', label: 'Aire acondicionado', icon: AirVent, typicalWatts: 1400 },
      { id: 'ventilador', label: 'Ventilador', icon: Fan, typicalWatts: 70 },
      { id: 'calefactor', label: 'Calefactor eléctrico', icon: Heater, typicalWatts: 1500 },
      { id: 'termotanque', label: 'Termotanque eléctrico', icon: Droplets, typicalWatts: 1500 },
    ],
  },
  {
    id: 'entretenimiento',
    label: 'Entretenimiento',
    items: [
      { id: 'televisor', label: 'Televisor', icon: Tv, typicalWatts: 100 },
      { id: 'consola', label: 'Consola de videojuegos', icon: Gamepad2, typicalWatts: 160 },
      { id: 'equipo_audio', label: 'Equipo de audio', icon: Speaker, typicalWatts: 60 },
    ],
  },
  {
    id: 'tecnologia',
    label: 'Tecnología',
    items: [
      { id: 'computadora', label: 'Computadora', icon: Laptop, typicalWatts: 120 },
      { id: 'monitor', label: 'Monitor', icon: Monitor, typicalWatts: 35 },
      { id: 'router', label: 'Router wifi', icon: Router, typicalWatts: 10 },
      { id: 'cargadores', label: 'Cargadores', icon: Plug, typicalWatts: 15 },
    ],
  },
  {
    id: 'limpieza',
    label: 'Limpieza',
    items: [
      { id: 'lavarropas', label: 'Lavarropas', icon: WashingMachine, typicalWatts: 500 },
      { id: 'secarropas', label: 'Secarropas', icon: Wind, typicalWatts: 2000 },
      { id: 'plancha', label: 'Plancha', icon: Lightbulb, typicalWatts: 1200 },
    ],
  },
];

/** Índice plano por id, para resolver un aparato sin recorrer categorías. */
export const APPLIANCES_BY_ID: ReadonlyMap<string, Appliance> = new Map(
  APPLIANCE_CATEGORIES.flatMap((category) => category.items).map((item) => [item.id, item])
);

export function isKnownAppliance(id: string): boolean {
  return APPLIANCES_BY_ID.has(id);
}

export function applianceLabel(id: string): string {
  return APPLIANCES_BY_ID.get(id)?.label ?? id;
}

/**
 * Ambientes sugeridos para el alta rápida.
 *
 * No son una lista cerrada — el usuario escribe el nombre que quiera. Están
 * para que el caso común (una casa con los ambientes de siempre) se resuelva
 * tocando, sin teclear.
 */
export const SUGGESTED_ROOMS = [
  { name: 'Cocina', icon: UtensilsCrossed },
  { name: 'Living', icon: Sofa },
  { name: 'Dormitorio 1', icon: BedDouble },
  { name: 'Dormitorio 2', icon: BedDouble },
  { name: 'Baño', icon: Bath },
  { name: 'Garage', icon: Plug },
] as const;
