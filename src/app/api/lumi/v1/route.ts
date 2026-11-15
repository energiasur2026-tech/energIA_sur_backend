import {lumiSupply,billingContext} from '@/lib/tariff-profile';
import {lumiBillingQuote} from '@/domain/lumi-billing';
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
      const fields: Record<string, string[]> = { chat: ['action', 'question'], label: ['action', 'eventId', 'labels', 'otherEquipment'], read: ['action', 'eventId', 'read'], clear: ['action'], preferences: ['action', 'preferences'], goal: ['action', 'goalKwh'], memory: ['action', 'operation', 'id', 'text'], supplyProfile: ['action', 'profile'], recommendation: ['action', 'kind', 'adopted'] };
      const permitted = fields[String(action.action)];
      if (!permitted || Object.keys(action).some(k => !permitted.includes(k))) throw new SyntaxError();
      if (action.action === 'memory') {
        if (!['list', 'update', 'delete', 'clearPatterns'].includes(String(action.operation))) throw new SyntaxError();
        if (!['list', 'clearPatterns'].includes(String(action.operation)) && (typeof action.id !== 'string' || !/^[a-f0-9]{24}$/.test(action.id))) throw new SyntaxError();
        if (action.operation === 'update' && (typeof action.text !== 'string' || !action.text.trim() || action.text.length > 1000)) throw new SyntaxError();
      }
      if (action.action === 'recommendation' && (action.kind !== 'kettle-water' || typeof action.adopted !== 'boolean')) throw new SyntaxError();
      if (action.action === 'supplyProfile') {
        if(!action.profile||typeof action.profile!=='object'||Array.isArray(action.profile)||Object.keys(action.profile).some(k=>!['country','province','distributor','timezone'].includes(k)))throw new SyntaxError();
        return reply({error:'Administrá el suministro en Ajustes → Proveedor y tarifa eléctrica.'},409);
      }
      if (action.action === 'chat' && (typeof action.question !== 'string' || !action.question.trim() || action.question.length > 1000)) throw new SyntaxError();
      if (action.action === 'read' || action.action === 'label') {
        if (typeof action.eventId !== 'string' || !/^[a-f0-9]{24}$/.test(action.eventId)) throw new SyntaxError();
      }
      if (action.action === 'read' && action.read !== undefined && typeof action.read !== 'boolean') throw new SyntaxError();
      if (action.action === 'label') {
        const equipment = ['Pava eléctrica', 'Microondas', 'Plancha', 'Lavarropas', 'Calefactor', 'Bomba de agua', 'Otro equipo', 'No recuerdo'];
        if (!Array.isArray(action.labels) || action.labels.length > 8 || action.labels.some(x => typeof x !== 'string' || !equipment.includes(x))) throw new SyntaxError();
        if (action.labels.includes('No recuerdo') && action.labels.some(x => x !== 'No recuerdo')) throw new SyntaxError();
        if (action.otherEquipment !== undefined && (typeof action.otherEquipment !== 'string' || action.otherEquipment.length > 200 || (action.otherEquipment.trim() && !action.labels.includes('Otro equipo')))) throw new SyntaxError();
      }
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
    const context = { userId: auth.userId, meterId: auth.meter.deviceId };
    const supplyProfile=await lumiSupply(auth.userId,auth.meter.deviceId);
    let requestedPeriod:{from:string;to:string}|undefined;
    let billingQuote:Record<string,unknown>|undefined;
    if (action.action === 'chat') {
      // Intent and scoped conversation belong to ML; introductory turns never read measurements.
      const prepared = await lumiService({ ...action, prepare: true, context, meterName: auth.meter.name, period, supplyProfile });
      if (prepared.needsReadings !== true) return reply(prepared);
      requestedPeriod=prepared.requestedPeriod as typeof requestedPeriod;
    }
    const needsData = !['read', 'label', 'memory', 'preferences', 'clear', 'supplyProfile', 'recommendation'].includes(String(action.action));
    let readings: Awaited<ReturnType<typeof getLumiReadings>>['readings'] = [];
    let truncated = false;
    let latest: Awaited<ReturnType<typeof getLatestReading>> = null;
    let dataToolError = false;
    if (needsData) {
      try {
        const [history, last] = await Promise.all([getLumiReadings(auth.meter.deviceId, from, to), getLatestReading(auth.meter.deviceId)]);
        readings = history.readings; truncated = history.truncated; latest = last;
      } catch (error) {
        if (action.action !== 'chat') throw error;
        dataToolError = true;
      }
    }
    if(action.action==='chat'&&requestedPeriod){
      const start=new Date(requestedPeriod.from),proposedEnd=new Date(requestedPeriod.to);
      const end=new Date(Math.min(+proposedEnd,+to));
      if(Number.isFinite(+start)&&Number.isFinite(+proposedEnd)&&Number.isFinite(+end)&&start>=from&&+proposedEnd<=+to+60000&&start<end){
        const tariff=await billingContext(auth.userId,auth.meter.deviceId,start.toISOString(),end.toISOString(),{allowBaseWithoutBonus:true});
        const points=readings.filter((row):row is Record<string,unknown>&{recorded_at:string}=>typeof row.recorded_at==='string');
        billingQuote=lumiBillingQuote(tariff,points,auth.meter.role,auth.meter.collectionIntervalMinutes,truncated);
      }
    }
    const data = await lumiService({ ...action, context, meterName: auth.meter.name,
      readings, latest, truncated, period, dataToolError, supplyProfile, billingQuote, supply: { phases: auth.meter.phases }, goalKwh: action.action === 'goal' ? action.goalKwh : auth.meter.ownerId === auth.userId ? auth.meter.goalKwh : null, timezone: supplyProfile.timezone, intervalMinutes: auth.meter.collectionIntervalMinutes,
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
