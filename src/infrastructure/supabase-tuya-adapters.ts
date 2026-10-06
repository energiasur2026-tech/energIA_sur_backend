import 'server-only';

/**
 * Adaptadores de los puertos de muestreo y de aviso.
 *
 * Acá viven las únicas menciones a Tuya, a Supabase y a Resend en este
 * camino. El dominio habla con las interfaces de `ports.ts` y no sabe que
 * ninguno de los tres existe.
 */
import { listUnnotifiedEvents, markEventsNotified } from '../lib/events';
import { sendAnomalyEmail } from '../lib/mailer';
import { getLastReadingAt, saveReading } from '../lib/readings';
import { getDeviceDetails, getDeviceStatus } from '../lib/tuya';
import type {
  DevicePort,
  MailerPort,
  NotificationsPort,
  ReadingsStorePort,
} from '../domain/ports';

export const tuyaDevice: DevicePort = {
  details: (deviceId) => getDeviceDetails(deviceId),
  status: (deviceId) => getDeviceStatus(deviceId),
};

export const supabaseReadingsStore: ReadingsStorePort = {
  lastReadingAt: (deviceId, source) => getLastReadingAt(deviceId, source),
  save: (reading) => saveReading(reading),
};

export const supabaseNotifications: NotificationsPort = {
  pending: (deviceId) => listUnnotifiedEvents(deviceId),
  markNotified: (ids) => markEventsNotified(ids),
};

export const resendMailer: MailerPort = {
  sendAnomaly: ({ to, meterName, event }) => sendAnomalyEmail({ to, meterName, event }),
};
