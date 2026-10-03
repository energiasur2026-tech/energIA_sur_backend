import 'server-only';

import { listUnnotifiedEvents, markEventsNotified } from './events';
import { sendAnomalyEmail } from './mailer';
import type { Meter } from './meters';

/**
 * Avisa por email las anomalías nuevas de un medidor.
 *
 * Se llama al final de cada ciclo del recolector, después de detectar. La
 * marca `notified_at` vive en la fila del evento, así que un envío fallido
 * simplemente se reintenta en el ciclo siguiente en vez de perderse.
 *
 * Los eventos informativos (huecos cortos de datos) no generan aviso: llenar
 * la casilla de correo con ruido es la forma más rápida de que se ignoren
 * también los avisos que importan.
 *
 * Va a una única casilla compartida (`ALERT_EMAIL_TO`), no al email de login
 * de cada cuenta con acceso al medidor. El acceso compartido (quién puede
 * ENTRAR a ver el medidor) y el aviso por anomalías (quién se ENTERA de un
 * problema) son cosas separadas a propósito: la primera vive en `meters.ts`
 * vía `meter_members`, la segunda es una casilla que las personas que
 * comparten el medidor deciden revisar juntas.
 */
export async function notifyNewAnomalies(meter: Meter): Promise<number> {
  if (!meter.alertsEnabled) return 0;

  const pending = (await listUnnotifiedEvents(meter.deviceId)).filter(
    (event) => event.severity !== 'INFO'
  );

  if (pending.length === 0) return 0;

  const to = process.env.ALERT_EMAIL_TO;
  if (!to) return 0;

  const notified: number[] = [];

  for (const event of pending) {
    const result = await sendAnomalyEmail({ to, meterName: meter.name, event });

    // `skipped` (sin proveedor configurado) también se marca: sin credenciales
    // el reintento nunca prosperaría y la cola crecería para siempre.
    if (result === 'sent' || result === 'skipped') notified.push(event.id);
  }

  if (notified.length > 0) await markEventsNotified(notified);

  return notified.length;
}
