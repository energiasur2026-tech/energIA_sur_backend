import 'server-only';

import { EVENT_DESCRIPTION, EVENT_LABEL, type EventRecord } from '../domain/event-types';

/**
 * Envío de correo mediante Resend.
 *
 * Se usa la API HTTP directamente en vez del SDK: es una sola llamada POST y
 * evitar la dependencia mantiene liviano el bundle de la función programada.
 *
 * Si faltan las variables, `sendAnomalyEmail` devuelve `skipped` en lugar de
 * fallar: quedarse sin avisar es molesto, pero cortar la recolección de datos
 * por no poder mandar un mail sería peor.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type MailResult = 'sent' | 'skipped' | 'failed';

export async function sendAnomalyEmail(params: {
  to: string;
  meterName: string;
  event: EventRecord;
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey || !from) return 'skipped';

  const label = EVENT_LABEL[params.event.type];
  const severity = params.event.severity === 'CRITICAL' ? 'Crítico' : 'Advertencia';

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: `${severity}: ${label} en ${params.meterName}`,
        html: buildHtml(params.meterName, params.event),
      }),
    });

    if (!response.ok) {
      console.error(`[mailer] Resend respondió HTTP ${response.status}`);
      return 'failed';
    }

    return 'sent';
  } catch (error) {
    console.error('[mailer] Falló el envío:', error);
    return 'failed';
  }
}

function buildHtml(meterName: string, event: EventRecord): string {
  const label = EVENT_LABEL[event.type];
  const detail = EVENT_DESCRIPTION[event.type];
  const started = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(event.startedAt));

  const measurement =
    event.type === 'LOW_VOLTAGE' && event.minVoltage !== null
      ? `<p style="margin:0 0 12px"><strong>Tensión mínima registrada:</strong> ${event.minVoltage} V</p>`
      : event.type === 'HIGH_VOLTAGE' && event.maxVoltage !== null
        ? `<p style="margin:0 0 12px"><strong>Tensión máxima registrada:</strong> ${event.maxVoltage} V</p>`
        : event.type === 'OVERCURRENT' && event.maxCurrent !== null
          ? `<p style="margin:0 0 12px"><strong>Corriente máxima registrada:</strong> ${event.maxCurrent} A</p>`
          : '';

  const siteUrl = process.env.FRONTEND_URL || process.env.URL || 'https://energia-sur.netlify.app';

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f4f6f9;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#16202b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d8e0ea;border-radius:12px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:#5b6b7d">EnergIA Sur</p>
    <h1 style="margin:0 0 16px;font-size:20px">${label} en ${escapeHtml(meterName)}</h1>
    <p style="margin:0 0 12px;line-height:1.6">${detail}</p>
    <p style="margin:0 0 12px"><strong>Comenzó:</strong> ${started}</p>
    ${measurement}
    <a href="${siteUrl}/eventos" style="display:inline-block;margin-top:8px;background:#1e6fd9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Ver el detalle</a>
    <p style="margin:20px 0 0;font-size:12px;color:#5b6b7d;line-height:1.6">
      Este aviso se manda porque el medidor tiene las alertas activadas.
      Se pueden desactivar desde Ajustes.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
