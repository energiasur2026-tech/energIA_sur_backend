/**
 * Catálogos de aparatos por contexto.
 *
 * El catálogo nació pensado solo para viviendas. Ahora un medidor puede estar
 * en una clínica, un taller, un comercio o una oficina, y ofrecerle "pava
 * eléctrica" al encargado de un depósito hace que el formulario se sienta
 * ajeno. Un formulario ajeno se abandona.
 *
 * Cada contexto declara qué catálogo usa (ver `installation-types.ts`) y acá
 * está el contenido de cada uno.
 *
 * **Los `typicalWatts` son órdenes de magnitud de referencia, NO mediciones.**
 * Sirven para ordenar los aparatos por impacto probable —el compresor pesa más
 * que el router— nunca para calcular un consumo: para eso está el medidor,
 * que mide de verdad.
 *
 * Los ids son globales: un mismo aparato en dos catálogos comparte id, así un
 * análisis puede agrupar "heladera" sin importar dónde esté instalada.
 */
import {
  AirVent,
  BatteryCharging,
  Car,
  Cctv,
  Coffee,
  CookingPot,
  Cross,
  Container,
  Drill,
  DoorOpen,
  Fan,
  Flame,
  Forklift,
  Hammer,
  Heater,
  HeartPulse,
  Laptop,
  Lightbulb,
  Microwave,
  Monitor,
  Package,
  Printer,
  Refrigerator,
  Router,
  Server,
  Snowflake,
  Stethoscope,
  Store,
  Syringe,
  Thermometer,
  Utensils,
  WashingMachine,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  APPLIANCE_CATEGORIES,
  type Appliance,
  type ApplianceCategory,
} from './home-catalog';
import type { CatalogId } from './installation-types';

/** Climatización e iluminación aparecen en casi todos los contextos. */
const CLIMATIZACION_COMERCIAL: ApplianceCategory = {
  id: 'climatizacion',
  label: 'Climatización',
  items: [
    { id: 'aire_acondicionado', label: 'Aire acondicionado', icon: AirVent, typicalWatts: 2200 },
    { id: 'calefactor', label: 'Calefactor eléctrico', icon: Heater, typicalWatts: 1500 },
    { id: 'ventilador', label: 'Ventilador', icon: Fan, typicalWatts: 70 },
    { id: 'extractor', label: 'Extractor de aire', icon: Wind, typicalWatts: 250 },
  ],
};

const ILUMINACION: ApplianceCategory = {
  id: 'iluminacion',
  label: 'Iluminación',
  items: [
    { id: 'panel_led', label: 'Panel LED', icon: Lightbulb, typicalWatts: 20 },
    { id: 'tubo_led', label: 'Tubo LED', icon: Lightbulb, typicalWatts: 18 },
    { id: 'proyector_led', label: 'Proyector LED', icon: Lightbulb, typicalWatts: 100 },
  ],
};

const OFICINA: ApplianceCategory[] = [
  {
    id: 'tecnologia',
    label: 'Tecnología',
    items: [
      { id: 'computadora', label: 'Computadora', icon: Monitor, typicalWatts: 150 },
      { id: 'notebook', label: 'Notebook', icon: Laptop, typicalWatts: 60 },
      { id: 'monitor', label: 'Monitor', icon: Monitor, typicalWatts: 35 },
      { id: 'impresora_laser', label: 'Impresora láser', icon: Printer, typicalWatts: 600 },
      { id: 'multifuncion', label: 'Multifunción', icon: Printer, typicalWatts: 500 },
      { id: 'router', label: 'Router wifi', icon: Router, typicalWatts: 10 },
      { id: 'servidor', label: 'Servidor o NAS', icon: Server, typicalWatts: 80 },
      { id: 'ups', label: 'UPS', icon: BatteryCharging, typicalWatts: 30 },
    ],
  },
  CLIMATIZACION_COMERCIAL,
  {
    id: 'cocina_chica',
    label: 'Cocina chica',
    items: [
      { id: 'microondas', label: 'Microondas', icon: Microwave, typicalWatts: 1200 },
      { id: 'cafetera', label: 'Cafetera', icon: Coffee, typicalWatts: 900 },
      { id: 'dispenser', label: 'Dispenser frío/calor', icon: Container, typicalWatts: 600 },
      { id: 'frigobar', label: 'Frigobar', icon: Refrigerator, typicalWatts: 80 },
    ],
  },
  ILUMINACION,
];

const TALLER: ApplianceCategory[] = [
  {
    id: 'maquinas',
    label: 'Máquinas',
    items: [
      { id: 'compresor', label: 'Compresor', icon: Zap, typicalWatts: 2200 },
      { id: 'soldadora', label: 'Soldadora', icon: Flame, typicalWatts: 4000 },
      { id: 'torno', label: 'Torno', icon: Wrench, typicalWatts: 1500 },
      { id: 'amoladora', label: 'Amoladora', icon: Hammer, typicalWatts: 900 },
      { id: 'taladro_banco', label: 'Taladro de banco', icon: Drill, typicalWatts: 750 },
      { id: 'sierra_circular', label: 'Sierra circular', icon: Hammer, typicalWatts: 1200 },
      { id: 'hidrolavadora', label: 'Hidrolavadora', icon: Zap, typicalWatts: 1800 },
    ],
  },
  {
    id: 'climatizacion',
    label: 'Climatización',
    items: [
      { id: 'aire_acondicionado', label: 'Aire acondicionado', icon: AirVent, typicalWatts: 2200 },
      { id: 'calefactor_industrial', label: 'Calefactor industrial', icon: Heater, typicalWatts: 3000 },
      { id: 'extractor', label: 'Extractor de aire', icon: Wind, typicalWatts: 250 },
    ],
  },
  ILUMINACION,
  {
    id: 'tecnologia',
    label: 'Tecnología',
    items: [
      { id: 'computadora', label: 'Computadora', icon: Monitor, typicalWatts: 120 },
      { id: 'impresora_laser', label: 'Impresora láser', icon: Printer, typicalWatts: 500 },
    ],
  },
];

const COMERCIO: ApplianceCategory[] = [
  {
    id: 'refrigeracion',
    label: 'Refrigeración',
    items: [
      { id: 'heladera_exhibidora', label: 'Heladera exhibidora', icon: Refrigerator, typicalWatts: 350 },
      { id: 'freezer_exhibidor', label: 'Freezer exhibidor', icon: Snowflake, typicalWatts: 400 },
      { id: 'camara_frigorifica', label: 'Cámara frigorífica', icon: Snowflake, typicalWatts: 1500 },
    ],
  },
  {
    id: 'climatizacion',
    label: 'Climatización',
    items: [
      { id: 'aire_acondicionado', label: 'Aire acondicionado', icon: AirVent, typicalWatts: 2200 },
      { id: 'cortina_aire', label: 'Cortina de aire', icon: Wind, typicalWatts: 1000 },
    ],
  },
  {
    id: 'iluminacion',
    label: 'Iluminación',
    items: [
      { id: 'cartel_led', label: 'Cartel LED', icon: Lightbulb, typicalWatts: 80 },
      { id: 'iluminacion_vitrina', label: 'Iluminación de vitrina', icon: Lightbulb, typicalWatts: 60 },
      { id: 'iluminacion_salon', label: 'Iluminación de salón', icon: Lightbulb, typicalWatts: 200 },
    ],
  },
  {
    id: 'punto_venta',
    label: 'Punto de venta',
    items: [
      { id: 'terminal_pos', label: 'Terminal POS', icon: Store, typicalWatts: 50 },
      { id: 'computadora', label: 'Computadora', icon: Monitor, typicalWatts: 120 },
      { id: 'impresora_fiscal', label: 'Impresora fiscal', icon: Printer, typicalWatts: 60 },
    ],
  },
  {
    id: 'otros',
    label: 'Otros',
    items: [
      { id: 'porton_electrico', label: 'Portón eléctrico', icon: DoorOpen, typicalWatts: 500 },
      { id: 'elevador_vehiculos', label: 'Elevador de vehículos', icon: Car, typicalWatts: 2200 },
      { id: 'camaras_seguridad', label: 'Cámaras de seguridad', icon: Cctv, typicalWatts: 40 },
    ],
  },
];

const CLINICA: ApplianceCategory[] = [
  {
    id: 'equipamiento_medico',
    label: 'Equipamiento médico',
    items: [
      { id: 'respirador', label: 'Respirador', icon: HeartPulse, typicalWatts: 300 },
      { id: 'monitor_multiparametrico', label: 'Monitor multiparamétrico', icon: Stethoscope, typicalWatts: 150 },
      { id: 'bomba_infusion', label: 'Bomba de infusión', icon: Syringe, typicalWatts: 40 },
      { id: 'electrobisturi', label: 'Electrobisturí', icon: Zap, typicalWatts: 400 },
      { id: 'autoclave', label: 'Autoclave', icon: Thermometer, typicalWatts: 2000 },
      { id: 'rayos_portatil', label: 'Equipo de rayos portátil', icon: Cross, typicalWatts: 1500 },
    ],
  },
  {
    id: 'refrigeracion',
    label: 'Refrigeración',
    items: [
      { id: 'heladera_medicamentos', label: 'Heladera de medicamentos', icon: Refrigerator, typicalWatts: 200 },
      { id: 'freezer_muestras', label: 'Freezer de muestras', icon: Snowflake, typicalWatts: 300 },
    ],
  },
  {
    id: 'climatizacion',
    label: 'Climatización',
    items: [
      { id: 'aire_acondicionado', label: 'Aire acondicionado', icon: AirVent, typicalWatts: 2200 },
      { id: 'purificador', label: 'Purificador de aire', icon: Wind, typicalWatts: 60 },
    ],
  },
  {
    id: 'tecnologia',
    label: 'Tecnología e iluminación',
    items: [
      { id: 'computadora', label: 'Computadora', icon: Monitor, typicalWatts: 120 },
      { id: 'panel_led', label: 'Panel LED', icon: Lightbulb, typicalWatts: 20 },
    ],
  },
];

const GARAGE: ApplianceCategory[] = [
  {
    id: 'garage',
    label: 'Garage',
    items: [
      { id: 'porton_automatico', label: 'Portón automático', icon: DoorOpen, typicalWatts: 500 },
      { id: 'cargador_auto', label: 'Cargador de auto eléctrico', icon: BatteryCharging, typicalWatts: 7000 },
      { id: 'compresor', label: 'Compresor', icon: Zap, typicalWatts: 1500 },
      { id: 'herramientas', label: 'Herramientas eléctricas', icon: Drill, typicalWatts: 800 },
      { id: 'freezer', label: 'Freezer', icon: Snowflake, typicalWatts: 200 },
      { id: 'panel_led', label: 'Panel LED', icon: Lightbulb, typicalWatts: 20 },
    ],
  },
];

const DEPOSITO: ApplianceCategory[] = [
  {
    id: 'deposito',
    label: 'Depósito',
    items: [
      { id: 'camara_frigorifica', label: 'Cámara frigorífica', icon: Snowflake, typicalWatts: 1500 },
      { id: 'cargador_montacargas', label: 'Cargador de montacargas', icon: Forklift, typicalWatts: 1500 },
      { id: 'extractor', label: 'Extractor de aire', icon: Wind, typicalWatts: 250 },
      { id: 'proyector_led', label: 'Proyector LED', icon: Lightbulb, typicalWatts: 100 },
      { id: 'cintas_transportadoras', label: 'Cinta transportadora', icon: Package, typicalWatts: 750 },
    ],
  },
];

const COCINA_COMERCIAL: ApplianceCategory[] = [
  {
    id: 'cocina_comercial',
    label: 'Cocina comercial',
    items: [
      { id: 'horno_industrial', label: 'Horno industrial', icon: CookingPot, typicalWatts: 3500 },
      { id: 'freidora', label: 'Freidora', icon: Utensils, typicalWatts: 3000 },
      { id: 'campana_extractora', label: 'Campana extractora', icon: Wind, typicalWatts: 400 },
      { id: 'lavavajillas_industrial', label: 'Lavavajillas industrial', icon: WashingMachine, typicalWatts: 1800 },
      { id: 'heladera_exhibidora', label: 'Heladera exhibidora', icon: Refrigerator, typicalWatts: 350 },
      { id: 'cafetera_industrial', label: 'Cafetera industrial', icon: Coffee, typicalWatts: 1500 },
    ],
  },
  ILUMINACION,
];

/**
 * El catálogo de vivienda es el original, más el cargador de auto eléctrico:
 * es el consumo más grande que puede tener una casa hoy y cambia la factura
 * de forma notoria, así que omitirlo sesgaría cualquier recomendación.
 */
const VIVIENDA: ApplianceCategory[] = [
  ...APPLIANCE_CATEGORIES,
  {
    id: 'vehiculo',
    label: 'Vehículo',
    items: [
      { id: 'cargador_auto', label: 'Cargador de auto eléctrico', icon: BatteryCharging, typicalWatts: 7000 },
    ],
  },
];

export const CATALOGS: Record<CatalogId, ApplianceCategory[]> = {
  vivienda: VIVIENDA,
  oficina: OFICINA,
  taller: TALLER,
  comercio: COMERCIO,
  clinica: CLINICA,
  garage: GARAGE,
  deposito: DEPOSITO,
  cocina_comercial: COCINA_COMERCIAL,
};

/**
 * Índice plano de TODOS los aparatos de TODOS los catálogos.
 *
 * La validación del servidor usa este índice, no el del catálogo que
 * corresponde al contexto: si el usuario cambia el tipo de lugar después de
 * cargar sus aparatos, los que ya estaban no se pierden por un cambio de
 * pantalla.
 */
export const ALL_APPLIANCES_BY_ID: ReadonlyMap<string, Appliance> = new Map(
  Object.values(CATALOGS)
    .flat()
    .flatMap((category) => category.items)
    .map((item) => [item.id, item])
);

export function catalogFor(id: CatalogId): ApplianceCategory[] {
  return CATALOGS[id];
}

export function isKnownApplianceAnywhere(id: string): boolean {
  return ALL_APPLIANCES_BY_ID.has(id);
}

export function applianceLabelAnywhere(id: string): string {
  return ALL_APPLIANCES_BY_ID.get(id)?.label ?? id;
}
