import 'server-only';
import {argentinaMonth,buildMonthlyProjection,calendarMonth} from '@/domain/monthly-projection';
import {estimatedBillingCycle} from '@/domain/billing-cycle';
import {estimateEnergyCost} from '@/domain/tariffs';
import type {EventRecord,EventType} from '@/domain/event-types';
import type {MeterThresholds} from '@/domain/threshold-types';
import {
  countActiveEvents,
  countHistoricalEvents,
  countPeriodEvents,
  latestEvent,
  listPeriodEvents,
} from './events';
import {personalGoal} from './personal-goals';
import {getLumiReadings} from './readings';
import {billingContext} from './tariff-profile';
import type {Meter} from './meters';

export type SpendMissingReason =
  | 'readings'
  | 'tariff'
  | 'counter_reset'
  | 'truncated'
  | 'tariff_disabled'
  | null;

export function monitorBounds(closedOn: string | null, now: Date) {
  return closedOn ? estimatedBillingCycle(closedOn, now) : calendarMonth(argentinaMonth(now), now);
}

export function detectorIsCurrent(meter: Meter, now: Date): boolean {
  const evaluatedAt = Date.parse(meter.anomaliesEvaluatedAt ?? '');
  const minutes = (+now - evaluatedAt) / 60000;
  return minutes >= 0 && minutes <= Math.max(meter.thresholds.gapMinutes, Math.ceil(meter.collectionIntervalMinutes * 1.5));
}

export async function billingSpend(userId:string,meter:Meter,closedOn:string|null,now:Date) {
  const choice=await personalGoal(userId,meter);
  const base={
    closedOn,
    provisional: closedOn === null,
    periodFrom:null as string|null,
    periodTo:now.toISOString(),
    cycleEnd:null as string|null,
    currentCycle:false,
    goalMode:choice?.mode??null as 'ars'|'kwh'|null,
    goalArs:choice?.mode==='ars'?choice.value:null as number|null,
    goalKwh:choice?.mode==='kwh'?choice.value:null as number|null,
    spentArs:null as number|null,
    projectedArs:null as number|null,
    measuredKwh:null as number|null,
    measuredFragment:null as {from:string;to:string;kwh:number}|null,
    costBreakdown:null as ReturnType<typeof estimateEnergyCost>['breakdown']|null,
    partial:false,
    tariffValid:false,
    missing:null as SpendMissingReason,
  };
  const bounds=monitorBounds(closedOn,now);
  const from=bounds.start;
  const currentCycle=now<bounds.end;
  const withDates={
    ...base,
    periodFrom:from.toISOString(),
    cycleEnd:bounds.end.toISOString(),
    currentCycle,
  };
  if(+from===+now){
    return {
      ...withDates,
      missing:'readings' as SpendMissingReason,
      reason:'El período comenzó hoy; todavía faltan lecturas para calcular el consumo.',
      projectionReason:null,
    };
  }
  // Once the estimated end passes, retain the observed range and ask for the real new close.
  const observedBounds={...bounds,end:new Date(+now+1),days:(+now-+from+1)/86400000,elapsed:(+now-+from)/86400000};
  const [{readings,truncated},cycleTariff]=await Promise.all([
    getLumiReadings(meter.deviceId,from,now),
    currentCycle?billingContext(userId,meter.deviceId,from.toISOString(),new Date(+bounds.end-1).toISOString()):null,
  ]);
  const input={rows:readings as Parameters<typeof buildMonthlyProjection>[0]['rows'],month:argentinaMonth(now),now,choice,
    fixed:meter.role==='central',intervalMinutes:meter.collectionIntervalMinutes,truncated};
  const enabled=process.env.ENERGY_TARIFF_ENABLED!=='false';
  const observed=buildMonthlyProjection({...input,billingBounds:!currentCycle?observedBounds:closedOn?bounds:undefined,
    tariffContext:cycleTariff??undefined,tariffValid:enabled&&!!cycleTariff?.definition});
  const goalArs=choice?.mode==='ars'
    ?choice.value
    :choice?.mode==='kwh'&&enabled&&cycleTariff?.definition
      ?observed.goal.goalCostArs
      :null;
  const goalKwh=choice?.mode==='kwh'
    ?choice.value
    :choice?.mode==='ars'&&enabled&&cycleTariff?.definition
      ?observed.goal.goalKwh
      :null;
  const fragment=observed.measuredFragment;
  const measuredFrom=fragment?.from??observed.measuredFrom;
  const measuredTo=fragment?.to??observed.measuredTo;
  const result={
    ...withDates,
    goalArs,
    goalKwh,
    measuredKwh:truncated?null:(fragment?.kwh??observed.measuredKwh),
    partial:!!fragment||observed.missingStart||observed.quality.stale,
    measuredFragment:truncated?null:fragment,
  };
  const missingData:SpendMissingReason=truncated
    ?'truncated'
    :observed.quality.resets&&!fragment
      ?'counter_reset'
      :result.measuredKwh===null
        ?'readings'
        :null;
  const reason=truncated
    ?'El historial está incompleto para este período.'
    :observed.quality.resets&&!fragment
      ?'El contador se reinició durante el período.'
      :result.measuredKwh===null
        ?'Faltan al menos dos lecturas válidas en este período.'
        :null;
  if(reason||!measuredFrom||!measuredTo||result.measuredKwh===null){
    return {...result,missing:missingData,reason,projectionReason:null};
  }
  const days=(Date.parse(measuredTo)-Date.parse(measuredFrom))/86400000;
  if(days<=0){
    return {
      ...result,
      missing:'readings' as SpendMissingReason,
      reason:'Las lecturas disponibles del período corresponden al mismo instante; faltan más mediciones.',
      projectionReason:null,
    };
  }
  const tariff=await billingContext(userId,meter.deviceId,measuredFrom,measuredTo);
  const tariffValid=enabled&&!!tariff.definition;
  const cost=tariffValid?estimateEnergyCost(result.measuredKwh,days,input.fixed,tariff):null;
  const spentArs=cost?.total??null;
  const costBreakdown=cost?.breakdown??null;
  const spendMissing:SpendMissingReason=spentArs!==null
    ?null
    :!enabled
      ?'tariff_disabled'
      :'tariff';
  return {
    ...result,
    spentArs,
    costBreakdown,
    partial:result.partial||(costBreakdown!==null&&costBreakdown.totalElectricity===null),
    tariffValid,
    missing:spendMissing,
    projectedArs:currentCycle?observed.goal.projectedCostArs:null,
    reason:spentArs===null
      ?(enabled
        ?(tariff.reason??'No hay una tarifa vigente configurada para las lecturas de este período.')
        :'La estimación monetaria está deshabilitada.')
      :null,
    projectionReason:!currentCycle
      ?'Actualizá la fecha de cierre para proyectar el ciclo vigente.'
      :fragment
        ?'Los reinicios del contador impiden proyectar el período completo.'
        :!enabled
        ?'La estimación monetaria está deshabilitada.'
        :!cycleTariff?.definition
          ?'Falta una tarifa verificada para proyectar todo el ciclo.'
          :observed.goal.projectedCostArs==null
            ?'Se necesita al menos un día de lecturas recientes para proyectar el fin del período.'
            :null,
  };
}

export type PeriodAnomalyBreakdown = Record<EventType, number>;

export type PeriodAnomaliesSummary = {
  from: string | null;
  to: string;
  provisional: boolean;
  detectionCurrent: boolean;
  count: number | null;
  active: number;
  totalActive: number;
  resolved: number | null;
  historicalCount: number;
  byType: PeriodAnomalyBreakdown | null;
  latest: (EventRecord & { inPeriod: boolean | null }) | null;
  thresholds: MeterThresholds | null;
};

export async function periodAnomalies(
  deviceId: string,
  from: string | null,
  now: Date,
  voltageOnly = false,
  thresholds: MeterThresholds | null = null,
  provisional = false,
  detectionCurrent = false
): Promise<PeriodAnomaliesSummary> {
  const to = now.toISOString();
  const [activeMatching, totalActive, periodList, count, historicalCount, latestItem] = await Promise.all([
    countActiveEvents(deviceId, voltageOnly),
    voltageOnly ? countActiveEvents(deviceId, false) : Promise.resolve(-1),
    from ? listPeriodEvents(deviceId, from, to, voltageOnly) : Promise.resolve(null),
    from ? countPeriodEvents(deviceId, from, to, voltageOnly) : Promise.resolve(null),
    countHistoricalEvents(deviceId, from, voltageOnly),
    latestEvent(deviceId, voltageOnly),
  ]);

  let byType: PeriodAnomalyBreakdown | null = null;
  let resolved: number | null = null;
  if (periodList !== null && count === periodList.length) {
    byType = { LOW_VOLTAGE: 0, HIGH_VOLTAGE: 0, OVERCURRENT: 0, DATA_GAP: 0 };
    let activeInPeriod = 0;
    for (const ev of periodList) {
      byType[ev.type] = (byType[ev.type] ?? 0) + 1;
      if (ev.endedAt === null) activeInPeriod += 1;
    }
    resolved = Math.max(0, count - activeInPeriod);
  }

  const inPeriod =
    latestItem && from
      ? Date.parse(latestItem.startedAt) >= Date.parse(from) && Date.parse(latestItem.startedAt) < Date.parse(to)
      : null;

  return {
    from,
    to,
    count,
    provisional,
    detectionCurrent,
    active: activeMatching,
    totalActive: voltageOnly ? totalActive : activeMatching,
    resolved,
    historicalCount,
    byType,
    latest: latestItem ? { ...latestItem, inPeriod } : null,
    thresholds,
  };
}
