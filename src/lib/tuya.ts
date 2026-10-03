import 'server-only';

import crypto from 'crypto';
import { tuyaEnv } from './env';

type TuyaResponse<T> = {
  success: boolean;
  msg?: string;
  code?: string | number;
  result: T;
};

export type TuyaStatusItem = { code: string; value: unknown };
export type TuyaDeviceDetails = { online?: boolean; name?: string; category?: string };

type TokenCache = { accessToken: string; expiresAt: number };

// El token vive en globalThis para sobrevivir al hot reload de desarrollo.
// En serverless cada instancia mantiene su propia copia, que es el comportamiento deseado.
const globalForTuya = globalThis as unknown as { tuyaToken?: TokenCache };

export class TuyaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TuyaError';
  }
}

/**
 * Firma HMAC-SHA256 exigida por Tuya Cloud.
 *
 * stringToSign = METHOD \n sha256(body) \n headers \n path
 * Sin headers firmados, la seccion queda vacia (dos saltos de linea seguidos).
 * El prefijo incluye el access_token solo cuando la llamada lo usa.
 */
function sign(
  clientId: string,
  secret: string,
  method: string,
  path: string,
  body: string,
  accessToken: string,
  timestamp: string
): string {
  const contentSha256 = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = `${method.toUpperCase()}\n${contentSha256}\n\n${path}`;
  const payload = accessToken
    ? `${clientId}${accessToken}${timestamp}${stringToSign}`
    : `${clientId}${timestamp}${stringToSign}`;

  return crypto.createHmac('sha256', secret).update(payload).digest('hex').toUpperCase();
}

async function getAccessToken(): Promise<string> {
  const { clientId, clientSecret, baseUrl } = tuyaEnv();
  const now = Date.now();
  const cached = globalForTuya.tuyaToken;

  // Se renueva 5 minutos antes del vencimiento para evitar carreras.
  if (cached && cached.expiresAt > now + 5 * 60 * 1000) return cached.accessToken;

  const path = '/v1.0/token?grant_type=1';
  const timestamp = String(now);
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      client_id: clientId,
      sign: sign(clientId, clientSecret, 'GET', path, '', '', timestamp),
      t: timestamp,
      sign_method: 'HMAC-SHA256',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new TuyaError(`No se pudo obtener el token de Tuya (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as TuyaResponse<{ access_token: string; expire_time: number }>;
  if (!data.success) {
    throw new TuyaError(`Tuya rechazo la solicitud de token: ${data.msg} (${data.code}).`);
  }

  globalForTuya.tuyaToken = {
    accessToken: data.result.access_token,
    expiresAt: now + data.result.expire_time * 1000,
  };

  return data.result.access_token;
}

async function request<T>(method: 'GET' | 'POST', path: string, body = ''): Promise<T> {
  const { clientId, clientSecret, baseUrl } = tuyaEnv();
  const accessToken = await getAccessToken();
  const timestamp = String(Date.now());

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      client_id: clientId,
      sign: sign(clientId, clientSecret, method, path, body, accessToken, timestamp),
      t: timestamp,
      sign_method: 'HMAC-SHA256',
      access_token: accessToken,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new TuyaError(`La API de Tuya respondio HTTP ${response.status}.`);
  }

  const data = (await response.json()) as TuyaResponse<T>;
  if (!data.success) {
    throw new TuyaError(`Error de Tuya: ${data.msg} (${data.code}).`);
  }

  return data.result;
}

/** Estado general del dispositivo (online / offline). */
export function getDeviceDetails(deviceId: string) {
  return request<TuyaDeviceDetails>('GET', `/v1.0/devices/${deviceId}`);
}

/** Data points crudos publicados por el medidor. */
export function getDeviceStatus(deviceId: string) {
  return request<TuyaStatusItem[]>('GET', `/v1.0/devices/${deviceId}/status`);
}
