import 'server-only';

/**
 * Punto de entrada de la detección de anomalías.
 *
 * La lógica vive en `src/domain`: las reglas puras en `anomaly-rules.ts` y la
 * orquestación en `detect-anomalies.ts`. Acá solo se le enchufan los
 * adaptadores de Supabase, para que quien llama no tenga que saber nada de
 * eso.
 *
 * Antes este archivo mezclaba las dos cosas y no se podía probar sin una base
 * de datos.
 */
import { detectAnomaliesWith, type DetectionResult } from '../domain/detect-anomalies';
import { supabaseAnomalyDeps } from '../infrastructure/supabase-anomaly-adapters';
import type { Meter } from './meters';

export type { DetectionResult };

/**
 * Evalúa las lecturas nuevas de un medidor y mantiene el registro de eventos.
 *
 * Avanza sobre la serie con una marca de agua, así que es reentrante: correrla
 * dos veces no duplica eventos ni reevalúa lo ya visto. Agrupa lecturas
 * consecutivas que violan la misma condición en un solo evento, en vez de
 * emitir una alerta por muestra.
 */
export async function detectAnomalies(meter: Meter): Promise<DetectionResult> {
  return detectAnomaliesWith(
    {
      deviceId: meter.deviceId,
      thresholds: meter.thresholds,
      anomaliesEvaluatedAt: meter.anomaliesEvaluatedAt,
    },
    supabaseAnomalyDeps
  );
}
