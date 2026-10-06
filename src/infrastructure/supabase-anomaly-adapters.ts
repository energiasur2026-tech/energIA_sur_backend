import 'server-only';

/**
 * Adaptadores: conectan los puertos del dominio con Supabase.
 *
 * Es el único archivo de este camino que sabe que la base de datos existe.
 * Si mañana se cambiara de proveedor, se reescribe esto y el dominio no se
 * entera.
 */
import {
  closeEvent,
  getOpenEvents,
  insertEvent,
  openOrGetEvent,
  updateOpenEvent,
} from '../lib/events';
import { setAnomaliesEvaluatedAt } from '../lib/meters';
import { getReadingsAfter } from '../lib/readings';
import type { EventType } from '../lib/event-types';
import type { OpenEventSnapshot } from '../domain/anomaly-rules';
import type { AnomalyDeps } from '../domain/ports';

export const supabaseAnomalyDeps: AnomalyDeps = {
  readings: {
    after: (deviceId, since) => getReadingsAfter(deviceId, since),
  },

  events: {
    async openByType(deviceId) {
      const abiertos = await getOpenEvents(deviceId);
      const salida = new Map<EventType, OpenEventSnapshot>();
      for (const [tipo, e] of abiertos) {
        salida.set(tipo, {
          id: e.id,
          startedAt: e.startedAt,
          lastViolationAt: e.lastViolationAt,
          samples: e.samples,
          minVoltage: e.minVoltage,
          maxVoltage: e.maxVoltage,
          maxCurrent: e.maxCurrent,
          maxPowerW: e.maxPowerW,
        });
      }
      return salida;
    },
    openOrGet: (event) => openOrGetEvent(event),
    insertClosed: async (event) => {
      await insertEvent(event);
    },
    update: (id, update) => updateOpenEvent(id, update),
    close: (id, endedAt) => closeEvent(id, endedAt),
  },

  meters: {
    markEvaluated: (deviceId, at) => setAnomaliesEvaluatedAt(deviceId, at),
  },
};
