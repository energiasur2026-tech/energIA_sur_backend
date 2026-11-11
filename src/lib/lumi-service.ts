import 'server-only';
import { createHmac } from 'node:crypto';

export class LumiError extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}
export async function lumiService(payload: Record<string, unknown>) {
  const url = process.env.LUMI_SERVICE_URL;
  const secret = process.env.LUMI_SERVICE_SECRET;
  if (!url || !secret || secret.length < 32) throw new LumiError('CONFIGURATION_ERROR', 'Falta configurar el servicio de análisis de Lumi.');
  let target: URL;
  try { target = new URL('/v1/session', url); } catch { throw new LumiError('CONFIGURATION_ERROR', 'La dirección privada del servicio de Lumi no es válida.'); }
  if (target.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(target.hostname)) throw new LumiError('CONFIGURATION_ERROR', 'La dirección privada de Lumi requiere HTTPS.');
  const body = JSON.stringify(payload);
  const stamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(stamp + '\n' + target.pathname + '\n' + body).digest('hex');
  let response: Response;
  try {
    response = await fetch(target, { method: 'POST', body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Lumi-Timestamp': stamp, 'X-Lumi-Signature': signature } });
  } catch { throw new LumiError('SERVICE_UNAVAILABLE', 'Lumi no está disponible temporalmente. Intentá nuevamente.'); }
  if (response.status === 401) throw new LumiError('CONFIGURATION_ERROR', 'La autenticación entre los servicios de Lumi requiere revisión.');
  if (response.status === 404) throw new LumiError('RESOURCE_UNAVAILABLE', 'El recurso de Lumi solicitado no está disponible.', 404);
  if (response.status === 400) throw new LumiError('INVALID_REQUEST', 'Lumi no pudo interpretar la solicitud.', 400);
  if (!response.ok) throw new LumiError('SERVICE_UNAVAILABLE', 'Lumi no está disponible temporalmente.');
  let data;
  try { data = await response.json(); } catch { throw new LumiError('INVALID_SERVICE_RESPONSE', 'El servicio de Lumi devolvió una respuesta inválida.', 502); }
  const context = payload.context as { userId: string; meterId: string };
  if (!data || data.version !== '1' || data.context?.userId !== context.userId || data.context?.meterId !== context.meterId || !Array.isArray(data.events) || !Array.isArray(data.messages)) throw new LumiError('INVALID_SERVICE_RESPONSE', 'La respuesta del servicio de Lumi no es compatible.', 502);
  return data;
}
