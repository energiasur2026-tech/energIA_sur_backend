/**
 * Caso de uso: avisar por email las anomalías nuevas de un medidor.
 *
 * Se llama al final de cada ciclo del recolector, después de detectar. La
 * marca de "ya avisado" vive en la fila del evento, así que un envío fallido
 * simplemente se reintenta en el ciclo siguiente en vez de perderse.
 *
 * El aviso va a una única casilla compartida, no al email de login de cada
 * cuenta con acceso al medidor. Quién puede ENTRAR a verlo y quién se ENTERA
 * de un problema son cosas separadas a propósito.
 */
import type { EventRecord } from './event-types';
import type { MailerPort, NotificationsPort } from './ports';

export type MeterForNotification = {
  deviceId: string;
  name: string;
  alertsEnabled: boolean;
};

export type NotifyDeps = {
  notifications: NotificationsPort;
  mailer: MailerPort;
  /** Casilla que recibe los avisos. `null` = no configurada. */
  recipient: string | null;
};

/**
 * Cuáles de los eventos pendientes merecen un aviso. **Función pura.**
 *
 * Los informativos (huecos cortos de datos) quedan afuera: llenar la casilla
 * de ruido es la forma más rápida de que se ignoren también los avisos que
 * importan.
 */
export function selectNotifiable(events: EventRecord[]): EventRecord[] {
  return events.filter((event) => event.severity !== 'INFO');
}

/**
 * Si un resultado de envío cierra el asunto para ese evento. **Pura.**
 *
 * `skipped` (sin proveedor configurado) también se da por cerrado: sin
 * credenciales el reintento nunca prosperaría y la cola crecería para siempre.
 */
export function cuentaComoAvisado(resultado: 'sent' | 'skipped' | 'failed'): boolean {
  return resultado === 'sent' || resultado === 'skipped';
}

export async function notifyNewAnomaliesWith(
  meter: MeterForNotification,
  deps: NotifyDeps
): Promise<number> {
  if (!meter.alertsEnabled) return 0;

  const pendientes = selectNotifiable(await deps.notifications.pending(meter.deviceId));
  if (pendientes.length === 0) return 0;

  if (!deps.recipient) return 0;

  const avisados: number[] = [];
  for (const event of pendientes) {
    const resultado = await deps.mailer.sendAnomaly({
      to: deps.recipient,
      meterName: meter.name,
      event,
    });
    if (cuentaComoAvisado(resultado)) avisados.push(event.id);
  }

  if (avisados.length > 0) await deps.notifications.markNotified(avisados);

  return avisados.length;
}
