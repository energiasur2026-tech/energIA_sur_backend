import 'server-only';

/**
 * Punto de entrada de los avisos por email.
 *
 * La lógica vive en `src/domain/notify-anomalies.ts`. Acá solo se resuelven
 * la casilla destino y los adaptadores concretos.
 */
import { notifyNewAnomaliesWith } from '../domain/notify-anomalies';
import { resendMailer, supabaseNotifications } from '../infrastructure/supabase-tuya-adapters';
import type { Meter } from './meters';

/**
 * Avisa por email las anomalías nuevas de un medidor.
 *
 * Va a una única casilla compartida (`ALERT_EMAIL_TO`), no al email de login
 * de cada cuenta con acceso al medidor: quién puede ENTRAR a verlo y quién se
 * ENTERA de un problema son cosas separadas a propósito.
 */
export async function notifyNewAnomalies(meter: Meter): Promise<number> {
  return notifyNewAnomaliesWith(
    { deviceId: meter.deviceId, name: meter.name, alertsEnabled: meter.alertsEnabled },
    {
      notifications: supabaseNotifications,
      mailer: resendMailer,
      recipient: process.env.ALERT_EMAIL_TO ?? null,
    }
  );
}
