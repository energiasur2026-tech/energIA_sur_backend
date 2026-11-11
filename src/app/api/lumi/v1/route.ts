import { NextResponse } from 'next/server';
import { MissingEnvError } from '@/lib/errors';
import { requireMeter, isErrorResponse } from '@/lib/api-auth';
import { getLumiReadings, getLatestReading } from '@/lib/readings';
import { lumiService, LumiError } from '@/lib/lumi-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

async function handle(request: Request) {
  try {
    const auth = await requireMeter(request);
    if (isErrorResponse(auth)) { auth.headers.set('Cache-Control', 'private, no-store'); return auth; }
    let action: Record<string, unknown> = { action: 'analyze' };
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      const allowed = [new URL(request.url).origin, ...(process.env.LUMI_ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean)];
      if (!origin || !allowed.includes(origin)) return reply({ code: 'ORIGIN_FORBIDDEN', error: 'Origen de solicitud no autorizado.' }, 403);
      const raw = await request.text();
      if (raw.length > 8192) return reply({ code: 'INVALID_REQUEST', error: 'Solicitud demasiado grande.' }, 413);
      action = JSON.parse(raw);
      if (!action || Array.isArray(action) || typeof action !== 'object') throw new SyntaxError();
      const fields: Record<string, string[]> = { chat: ['action', 'question'], label: ['action', 'eventId', 'labels'], read: ['action', 'eventId'], clear: ['action'], preferences: ['action', 'preferences'], goal: ['action', 'goalKwh'] };
      const permitted = fields[String(action.action)];
      if (!permitted || Object.keys(action).some(k => !permitted.includes(k))) throw new SyntaxError();
      if (action.action === 'chat' && (typeof action.question !== 'string' || !action.question.trim() || action.question.length > 1000)) throw new SyntaxError();
    }
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 86400000);
    const query = new URL(request.url).searchParams;
    let period;
    if (query.has('from') || query.has('to')) {
      const start = new Date(query.get('from') ?? ''); const end = new Date(query.get('to') ?? '');
      if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end || start < from || end > to) throw new SyntaxError();
      period = { from: start.toISOString(), to: end.toISOString() };
    }
    const [{ readings, truncated }, latest] = await Promise.all([
      getLumiReadings(auth.meter.deviceId, from, to), getLatestReading(auth.meter.deviceId),
    ]);
    const data = await lumiService({ ...action, context: { userId: auth.userId, meterId: auth.meter.deviceId }, meterName: auth.meter.name,
      readings, latest, truncated, period, goalKwh: action.action === 'goal' ? action.goalKwh : auth.meter.ownerId === auth.userId ? auth.meter.goalKwh : null, timezone: 'America/Argentina/Buenos_Aires', intervalMinutes: auth.meter.collectionIntervalMinutes,
      thresholds: auth.meter.thresholds, window: { from: from.toISOString(), to: to.toISOString() } });
    return reply(data);
  } catch (error) {
    if (error instanceof MissingEnvError) return reply({ code: 'CONFIGURATION_ERROR', error: 'Falta configurar el acceso del backend a los datos.' }, 503);
    if (error instanceof SyntaxError) return reply({ code: 'INVALID_REQUEST', error: 'La solicitud o el período no son válidos (máximo 60 días recientes).' }, 400);
    if (error instanceof LumiError) return reply({ code: error.code, error: error.message }, error.status);
    return reply({ code: 'DATA_UNAVAILABLE', error: 'No se pudieron recuperar las mediciones. Revisá la configuración o intentá nuevamente.' }, 503);
  }
}
export const GET = handle;
export const POST = handle;
