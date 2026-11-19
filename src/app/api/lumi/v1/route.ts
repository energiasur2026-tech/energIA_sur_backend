import {lumiSupply,billingContext} from '@/lib/tariff-profile';
import {argentinaMonth,buildMonthlyProjection,calendarMonth} from '@/domain/monthly-projection';
import {calculateElectricity,cents} from '@/domain/electricity-billing';
import {billingRange,estimatedBillingCycle} from '@/domain/billing-cycle';
import {getBillingClose} from '@/lib/billing-cycle';
import {billingSpend,detectorIsCurrent,monitorBounds,periodAnomalies} from '@/lib/monitor-period';
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
      const fields: Record<string, string[]> = { chat: ['action', 'question'], label: ['action', 'eventId', 'labels', 'otherEquipment'], consultation: ['action', 'operation', 'eventId'], read: ['action', 'eventId', 'read'], clear: ['action'], preferences: ['action', 'preferences'], goal: ['action', 'goalKwh'], memory: ['action', 'operation', 'id', 'text'], supplyProfile: ['action', 'profile'], recommendation: ['action', 'kind', 'adopted'] };
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
      if (action.action === 'consultation') {
        const { operation, eventId } = action;
        if (operation === 'skipPending' ? eventId !== undefined
          : !['skip', 'snooze'].includes(String(operation)) || typeof eventId !== 'string' || !/^[a-f0-9]{24}$/.test(eventId)) throw new SyntaxError();
      }
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
    let turnAnchor: number | undefined;
    let comparisonPeriods: {from:string;to:string}[] = [];
    let requestedPeriod:{from:string;to:string}|undefined;
    let billingQuote:Record<string,unknown>|undefined;
    let monthlyCost=false;
    let billingCycle=false;
    let closedOn:string|null=null;
    let reductionKwh=0;
    let scenarioKwh:number|undefined;
    if (action.action === 'chat') {
      // Intent and scoped conversation belong to ML; introductory turns never read measurements.
      const prepared = await lumiService({ ...action, prepare: true, context, meterName: auth.meter.name, period, supplyProfile });
      if (prepared.needsReadings !== true) return reply(prepared);
      if (typeof prepared.turnAnchor==='number'&&Number.isSafeInteger(prepared.turnAnchor)&&prepared.turnAnchor>=0) turnAnchor=prepared.turnAnchor;
      if(['spend','remaining','projection','count','active','goal','latest','why','voltage'].includes(String(prepared.monitorRequest))){
        const kind=String(prepared.monitorRequest), monthly=prepared.monitorCalendar===true;
        const close=await getBillingClose(auth.userId,auth.meter.deviceId);
        const selectedClose=monthly?null:close;
        const from=monitorBounds(selectedClose,to).start.toISOString();
        const monitorSummary=['spend','remaining','projection','goal'].includes(kind)
          ?await billingSpend(auth.userId,auth.meter,selectedClose,to)
          :await periodAnomalies(auth.meter.deviceId,from,to,kind==='voltage',auth.meter.thresholds,!monthly&&close===null,detectorIsCurrent(auth.meter,to));
        return reply(await lumiService({
          ...action,
          context,
          meterName:auth.meter.name,
          supplyProfile,
          timezone:supplyProfile.timezone,
          thresholds:auth.meter.thresholds,
          monitorSummary,turnAnchor,
        }));
      }
      if(Array.isArray(prepared.comparisonPeriods)&&prepared.comparisonPeriods.length===2){
        comparisonPeriods=prepared.comparisonPeriods.filter((interval: {from?:unknown;to?:unknown}|null) =>
          interval && typeof interval.from==='string' && typeof interval.to==='string');
      }
      requestedPeriod=prepared.requestedPeriod as typeof requestedPeriod;
      monthlyCost=prepared.monthlyCost===true;
      billingCycle=prepared.billingCycle===true;
      if(billingCycle){
        closedOn=await getBillingClose(auth.userId,auth.meter.deviceId);
        if(!closedOn)billingQuote={reason:'Guardá la fecha de cierre en Ajustes para consultar el ciclo de factura.'};
        else if(!monthlyCost){
          const opened=billingRange(closedOn,to).from;
          if(opened<from)billingQuote={reason:'El cierre supera los 60 días de historial disponibles en Lumi. Consultá ese período en Consumo.'};
          else requestedPeriod={from:opened.toISOString(),to:to.toISOString()};
        }
      }
      if(typeof prepared.scenarioKwh==='number'&&prepared.scenarioKwh>=0&&prepared.scenarioKwh<=100000)scenarioKwh=prepared.scenarioKwh;
      if(typeof prepared.reductionKwh==='number'&&prepared.reductionKwh>0&&prepared.reductionKwh<=100000)reductionKwh=prepared.reductionKwh;
    }
    const needsData = !['read', 'label', 'consultation', 'memory', 'preferences', 'clear', 'supplyProfile', 'recommendation'].includes(String(action.action));
    let readings: Awaited<ReturnType<typeof getLumiReadings>>['readings'] = [];
    let truncated = false;
    let latest: Awaited<ReturnType<typeof getLatestReading>> = null;
    let dataToolError = false;
    if (needsData && scenarioKwh===undefined) {
      try {
        const [history, last] = await Promise.all([getLumiReadings(auth.meter.deviceId, from, to), getLatestReading(auth.meter.deviceId)]);
        readings = history.readings; truncated = history.truncated; latest = last;
      } catch (error) {
        if (action.action !== 'chat') throw error;
        dataToolError = true;
      }
    }
    const comparisonQuotes=await Promise.all(comparisonPeriods.map(async interval => {
      const start=new Date(interval.from), end=new Date(Math.min(Date.parse(interval.to),+to));
      if(!(start>=from&&start<end&&Date.parse(interval.to)<=+to+60000)||dataToolError)return {costArs:null};
      const tariff=await billingContext(auth.userId,auth.meter.deviceId,start.toISOString(),end.toISOString(),{allowBaseWithoutBonus:true});
      const points=readings.filter((row):row is Record<string,unknown>&{recorded_at:string}=>typeof row.recorded_at==='string');
      const quote=lumiBillingQuote(tariff,points,auth.meter.role,auth.meter.collectionIntervalMinutes,truncated);
      return {costArs:quote.coverage>=0.85&&'referenceArs' in quote?quote.referenceArs??null:null};
    }));
    if(action.action==='chat'&&requestedPeriod){
      const start=new Date(requestedPeriod.from),proposedEnd=new Date(requestedPeriod.to);
      const end=new Date(Math.min(+proposedEnd,+to));
      if(Number.isFinite(+start)&&Number.isFinite(+proposedEnd)&&Number.isFinite(+end)&&start>=from&&+proposedEnd<=+to+60000&&start<end){
        const tariff=await billingContext(auth.userId,auth.meter.deviceId,start.toISOString(),end.toISOString(),{allowBaseWithoutBonus:true});
        const points=readings.filter((row):row is Record<string,unknown>&{recorded_at:string}=>typeof row.recorded_at==='string');
        billingQuote=lumiBillingQuote(tariff,points,auth.meter.role,auth.meter.collectionIntervalMinutes,truncated);
      }
    }
    if(monthlyCost&&(!billingCycle||closedOn)){
      const month=argentinaMonth(to), bounds=closedOn?estimatedBillingCycle(closedOn,to):calendarMonth(month,to);
      const tariff=await billingContext(auth.userId,auth.meter.deviceId,bounds.start.toISOString(),new Date(+bounds.end-1).toISOString());
      const points=readings.filter((row):row is Record<string,unknown>&{recorded_at:string}=>typeof row.recorded_at==='string');
      const fixed=auth.meter.role==='central';
      const projection=buildMonthlyProjection({rows:points,month,now:to,choice:null,fixed,tariffContext:tariff,intervalMinutes:auth.meter.collectionIntervalMinutes,truncated,billingBounds:billingCycle?bounds:undefined});
      const kwh=scenarioKwh??projection.goal.projectedMonthKwh;
      billingQuote={reason:tariff.definition?projection.warnings[0]:tariff.reason};
      if(billingCycle&&+to>=+bounds.end)billingQuote={reason:'Actualizá el cierre de factura para proyectar el ciclo vigente.'};
      else if(kwh!==null&&tariff.definition){
        const days=!billingCycle&&tariff.definition.provider==='COOPRG'?tariff.definition.referenceDays:bounds.days;
        const estimate=calculateElectricity(kwh,days,tariff.definition,fixed);
        const extra=calculateElectricity(kwh+100,days,tariff.definition,fixed);
        const reduced=reductionKwh<=kwh?calculateElectricity(kwh-reductionKwh,days,tariff.definition,fixed):null;
        const nextLimit=tariff.definition.tiers.find(tier=>Number.isFinite(tier.maxKwh)&&tier.maxKwh>=kwh)?.maxKwh;
        billingQuote={energyArs:estimate.variableCharge,fixedArs:estimate.fixedCharge,additionalArs:cents(estimate.knownTotal-estimate.subtotal),
          nextLimit,nextDistance:nextLimit===undefined?null:cents(nextLimit-kwh),savingsArs:reduced?cents(estimate.knownTotal-reduced.knownTotal):null,projectedKwh:kwh,projectedArs:estimate.knownTotal,projectedCategory:estimate.category,
          extraArs:cents(extra.knownTotal-estimate.knownTotal),extraCategory:extra.category};
      }
    }
    const data = await lumiService({ ...action, context, turnAnchor, meterName: auth.meter.name,
      readings, latest, truncated, period, dataToolError, supplyProfile, billingQuote, comparisonQuotes, supply: { phases: auth.meter.phases }, goalKwh: action.action === 'goal' ? action.goalKwh : auth.meter.ownerId === auth.userId ? auth.meter.goalKwh : null, timezone: supplyProfile.timezone, intervalMinutes: auth.meter.collectionIntervalMinutes,
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
