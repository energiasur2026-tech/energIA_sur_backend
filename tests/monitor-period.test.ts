import {mock,test} from 'node:test';
import assert from 'node:assert/strict';
import {TARIFFS} from '../src/domain/electricity-billing.ts';
import type {EventRecord} from '../src/domain/event-types.ts';
import type {Meter} from '../src/lib/meters.ts';

const now=new Date('2026-11-18T03:00:00Z');
let valid=true, hasReadings=true;
let goalChoice:{mode:'ars'|'kwh';value:number}|null={mode:'ars',value:50000};
let customReadings:{recorded_at:string;total_energy_kwh:number}[]|null=null;
const requests:string[][]=[];
const goalRequests:string[][]=[];

mock.module('../src/lib/personal-goals.ts',{namedExports:{
  personalGoal:async(userId:string,meter:Meter)=>{
    goalRequests.push([userId,meter.deviceId]);
    return goalChoice;
  },
}});
mock.module('../src/lib/tariff-profile.ts',{namedExports:{billingContext:async(
  _user:string,_device:string,from:string,to:string,
)=>({definition:valid?TARIFFS[0]:null,configured:true,from,to,reason:'Falta una tarifa para ese período.'})}});
mock.module('../src/lib/readings.ts',{namedExports:{getLumiReadings:async(id:string,from:Date,to:Date)=>{
  requests.push([id,from.toISOString(),to.toISOString()]);
  return {readings:customReadings??(hasReadings?[
    {recorded_at:from.toISOString(),total_energy_kwh:500},
    {recorded_at:to.toISOString(),total_energy_kwh:521},
  ]:[]),truncated:false};
}}});

const filters:string[][]=[];
let mockEventsByDevice:Record<string,EventRecord[]>={
  'meter-a':[
    {id:41,type:'HIGH_VOLTAGE',severity:'WARNING',startedAt:'2026-10-15T12:00:00Z',endedAt:'2026-10-15T12:20:00Z',lastViolationAt:'2026-10-15T12:20:00Z',samples:3,minVoltage:239,maxVoltage:241,maxCurrent:2,maxPowerW:500},
    {id:42,type:'LOW_VOLTAGE',severity:'CRITICAL',startedAt:'2026-11-17T23:00:00Z',endedAt:null,lastViolationAt:'2026-11-18T02:55:00Z',samples:5,minVoltage:191,maxVoltage:199,maxCurrent:3,maxPowerW:600},
  ],
  'meter-b':[
    {id:51,type:'LOW_VOLTAGE',severity:'WARNING',startedAt:'2026-10-10T10:00:00Z',endedAt:'2026-10-10T10:15:00Z',lastViolationAt:'2026-10-10T10:15:00Z',samples:2,minVoltage:199,maxVoltage:201,maxCurrent:2,maxPowerW:400},
    {id:52,type:'HIGH_VOLTAGE',severity:'WARNING',startedAt:'2026-11-05T14:00:00Z',endedAt:'2026-11-05T14:30:00Z',lastViolationAt:'2026-11-05T14:30:00Z',samples:4,minVoltage:238,maxVoltage:242,maxCurrent:4,maxPowerW:900},
    {id:53,type:'DATA_GAP',severity:'INFO',startedAt:'2026-11-08T08:00:00Z',endedAt:'2026-11-08T08:40:00Z',lastViolationAt:'2026-11-08T08:40:00Z',samples:0,minVoltage:null,maxVoltage:null,maxCurrent:null,maxPowerW:null},
    {id:54,type:'HIGH_VOLTAGE',severity:'CRITICAL',startedAt:'2026-11-17T20:00:00Z',endedAt:null,lastViolationAt:'2026-11-18T02:50:00Z',samples:6,minVoltage:240,maxVoltage:251,maxCurrent:3,maxPowerW:700},
  ],
};

function matchesVoltage(ev:EventRecord,voltageOnly:boolean){
  return !voltageOnly||ev.type==='LOW_VOLTAGE'||ev.type==='HIGH_VOLTAGE';
}

mock.module('../src/lib/events.ts',{namedExports:{
  countActiveEvents:async(id:string,voltageOnly=false)=>{
    filters.push([id,'active',String(voltageOnly)]);
    return (mockEventsByDevice[id]??[]).filter(e=>e.endedAt===null&&matchesVoltage(e,voltageOnly)).length;
  },
  countPeriodEvents:async(id:string,from:string,to:string,voltageOnly=false)=>{
    filters.push([id,from,to,String(voltageOnly)]);
    const f=Date.parse(from), t=Date.parse(to);
    return (mockEventsByDevice[id]??[]).filter(e=>matchesVoltage(e,voltageOnly)&&Date.parse(e.startedAt)<t&&Date.parse(e.startedAt)>=f).length;
  },
  countHistoricalEvents:async(id:string,before:string|null,voltageOnly=false)=>{
    const b=before?Date.parse(before):null;
    return (mockEventsByDevice[id]??[]).filter(e=>matchesVoltage(e,voltageOnly)&&e.endedAt!==null&&(b===null||Date.parse(e.startedAt)<b)).length;
  },
  listPeriodEvents:async(id:string,from:string,to:string,voltageOnly=false)=>{
    const f=Date.parse(from), t=Date.parse(to);
    return (mockEventsByDevice[id]??[]).filter(e=>matchesVoltage(e,voltageOnly)&&Date.parse(e.startedAt)<t&&Date.parse(e.startedAt)>=f)
      .sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
  },
  latestEvent:async(id:string,voltageOnly=false)=>{
    const list=(mockEventsByDevice[id]??[]).filter(e=>matchesVoltage(e,voltageOnly))
      .sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
    return list[0]??null;
  },
  listEvents:async(id:string,limit:number)=>{
    filters.push([id,String(limit)]);
    return (mockEventsByDevice[id]??[]).slice().sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,limit);
  },
}});

const {billingSpend,periodAnomalies}=await import('../src/lib/monitor-period.ts');
const meter={deviceId:'private-meter',role:'central',collectionIntervalMinutes:15} as Meter;
const otherMeter={deviceId:'second-meter',role:'area',collectionIntervalMinutes:15} as Meter;

test('spending uses counter difference (never cumulative total), ARS goal and saved closed-on date',async()=>{
  valid=true;hasReadings=true;goalChoice={mode:'ars',value:50000};
  const summary=await billingSpend('owner',meter,'2026-10-28',now);
  assert.deepEqual(requests[0],['private-meter','2026-10-28T03:00:00.000Z',now.toISOString()]);
  assert.equal(summary.measuredKwh,21);
  assert.equal(summary.goalArs,50000);
  assert.equal(summary.goalMode,'ars');
  assert.equal(summary.periodFrom,'2026-10-28T03:00:00.000Z');
  assert.equal(summary.missing,null);
  assert.ok(summary.spentArs!==null&&summary.spentArs>0);
  assert.ok(summary.projectedArs!==null&&summary.projectedArs>summary.spentArs);
});

test('kWh goal converts consistently to ARS when tariff is verified',async()=>{
  valid=true;hasReadings=true;goalChoice={mode:'kwh',value:250};
  const summary=await billingSpend('owner',meter,'2026-10-28',now);
  assert.equal(summary.goalMode,'kwh');
  assert.equal(summary.goalKwh,250);
  assert.ok(summary.goalArs!==null&&summary.goalArs>0);
});

test('missing close, insufficient readings, missing tariffs and unconfigured goal stay distinct and never fake $0',async()=>{
  valid=true;hasReadings=true;goalChoice={mode:'ars',value:50000};
  const missing=await billingSpend('owner',meter,null,now);
  assert.ok(missing.spentArs!==null&&missing.spentArs>0);
  assert.equal(missing.provisional,true);
  assert.equal(missing.periodFrom,'2026-11-01T03:00:00.000Z');
  assert.equal(missing.missing,null);
  assert.equal(missing.goalArs,50000);
  assert.equal(missing.reason,null);

  hasReadings=false;
  const readings=await billingSpend('owner',meter,'2026-10-28',now);
  assert.equal(readings.spentArs,null);
  assert.equal(readings.missing,'readings');
  assert.equal(readings.goalArs,50000);
  assert.match(readings.reason??'',/dos lecturas/);

  hasReadings=true;valid=false;goalChoice=null;
  const tariff=await billingSpend('other-user',otherMeter,'2026-11-01',now);
  assert.equal(tariff.goalArs,null);
  assert.equal(tariff.goalKwh,null);
  assert.equal(tariff.measuredKwh,21);
  assert.equal(tariff.spentArs,null);
  assert.equal(tariff.missing,'tariff');
  assert.match(tariff.reason??'',/tarifa/);
  assert.equal(requests.at(-1)?.[0],'second-meter');
  assert.equal(requests.at(-1)?.[1],'2026-11-01T03:00:00.000Z');
  assert.deepEqual(goalRequests.at(-1),['other-user','second-meter']);
});

test('period anomalies separate active, resolved, historical, voltage-only and unconfigured period',async()=>{
  const missing=await periodAnomalies('meter-a',null,now);
  assert.equal(missing.count,null);
  assert.equal(missing.active,1);
  assert.equal(missing.resolved,null);
  assert.equal(missing.historicalCount,1);

  const from='2026-11-01T03:00:00.000Z';
  const allPeriod=await periodAnomalies('meter-b',from,now,false,{lowVoltageV:205,highVoltageV:235,overcurrentA:15,gapMinutes:15});
  assert.equal(allPeriod.count,3);
  assert.equal(allPeriod.active,1);
  assert.equal(allPeriod.resolved,2);
  assert.equal(allPeriod.historicalCount,1);
  assert.equal(allPeriod.byType?.HIGH_VOLTAGE,2);
  assert.equal(allPeriod.byType?.DATA_GAP,1);
  assert.equal(allPeriod.latest?.id,54);
  assert.equal(allPeriod.latest?.inPeriod,true);
  assert.equal(allPeriod.thresholds?.highVoltageV,235);

  const voltageOnly=await periodAnomalies('meter-b',from,now,true,{lowVoltageV:205,highVoltageV:235,overcurrentA:15,gapMinutes:15});
  assert.equal(voltageOnly.count,2);
  assert.equal(voltageOnly.active,1);
  assert.equal(voltageOnly.resolved,1);
  assert.equal(voltageOnly.historicalCount,1);
  assert.deepEqual(filters.at(-1),['meter-b',from,now.toISOString(),'true']);
});

test('crossing episodes stay active without increasing the new period count',async()=>{
  const from='2026-11-18T00:00:00Z';
  const summary=await periodAnomalies('meter-b',from,now,false,null,true,false);
  assert.equal(summary.count,0);
  assert.equal(summary.active,1);
  assert.equal(summary.resolved,0);
  assert.equal(summary.provisional,true);
  assert.equal(summary.detectionCurrent,false);
  assert.equal(summary.latest?.inPeriod,false);
});

test('a reset returns only a measured continuous fragment and no extrapolation',async()=>{
  valid=true;
  customReadings=[
    {recorded_at:'2026-11-17T01:00:00Z',total_energy_kwh:540},
    {recorded_at:'2026-11-17T01:15:00Z',total_energy_kwh:541},
    {recorded_at:'2026-11-17T01:30:00Z',total_energy_kwh:10},
    {recorded_at:'2026-11-17T01:45:00Z',total_energy_kwh:11},
    {recorded_at:'2026-11-17T02:00:00Z',total_energy_kwh:12},
    {recorded_at:'2026-11-17T03:00:00Z',total_energy_kwh:90},
  ];
  try {
    const summary=await billingSpend('owner',meter,null,now);
    assert.deepEqual(summary.measuredFragment,{from:'2026-11-17T01:30:00Z',to:'2026-11-17T02:00:00Z',kwh:2});
    assert.equal(summary.measuredKwh,2);
    assert.ok(summary.spentArs!==null&&summary.spentArs>0);
    assert.equal(summary.partial,true);
    assert.equal(summary.projectedArs,null);
  } finally {
    customReadings=null;
  }
});
