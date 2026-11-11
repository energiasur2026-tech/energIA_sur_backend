import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyProjection,calendarMonth,argentinaMonth,convertGoal } from '../src/domain/monthly-projection.ts';
import { estimateEnergyCost } from '../src/domain/tariffs.ts';
const rows=(from:string,to:string,rate=4)=>{const a=Date.parse(from),b=Date.parse(to);return Array.from({length:Math.floor((b-a)/3600000)+1},(_,i)=>({recorded_at:new Date(a+i*3600000).toISOString(),total_energy_kwh:100+i*rate/24}));};
const base={month:'2026-11',now:new Date('2026-11-09T15:00:00Z'),choice:{mode:'kwh' as const,value:120},intervalMinutes:60};
test('calendar months: 28,29,30,31 days and Argentine midnight',()=>{
 for(const [m,d] of [['2026-02',28],['2028-02',29],['2026-11',30],['2026-12',31]] as const){assert.equal(calendarMonth(m).days,d);assert.equal(calendarMonth(m).start.toISOString(),m+'-01T03:00:00.000Z');}
 assert.equal(argentinaMonth(new Date('2026-12-01T02:59:00Z')),'2026-11');
});
test('partial current day uses exact observed time; calendar estimate is consistent with chart',()=>{
 const p=buildMonthlyProjection({...base,rows:rows('2026-11-01T03:00:00Z','2026-11-09T15:00:00Z')});
 assert.ok(Math.abs(p.goal.dailyRateKwh!-4)<1e-10);assert.ok(Math.abs(p.goal.projectedMonthKwh!-120)<1e-8);
 assert.ok(Math.abs(p.measuredKwh!-34)<1e-8);assert.ok(Math.abs(p.goal.remainingPerDayKwh!-4)<1e-8);
 assert.equal(p.chart.estimated.at(-1)!.projected,p.goal.projectedMonthKwh);
 assert.equal(p.chart.references.length,31);assert.ok(p.chart.observed.every(x=>x.x<=p.todayX!));
});
test('last day remains fractional and exceeded budget never gives negative allowance',()=>{
 const p=buildMonthlyProjection({...base,now:new Date('2026-11-30T15:00:00Z'),choice:{mode:'kwh',value:10},rows:rows('2026-11-01T03:00:00Z','2026-11-30T15:00:00Z')});
 assert.equal(p.remainingDays,0.5);assert.equal(p.goal.remainingPerDayKwh,0);assert.ok(p.exceededKwh!>0);assert.ok(p.goal.projectedMonthKwh!>p.goal.goalKwh!);
});
test('incomplete start is separated from measured energy and gaps are not actual zeroes',()=>{
 const data=rows('2026-11-05T03:00:00Z','2026-11-09T15:00:00Z').filter((_,i)=>i<24||i>48);
 const p=buildMonthlyProjection({...base,rows:data});assert.equal(p.missingStart,true);assert.ok(p.estimatedToDateKwh!>p.measuredKwh!);assert.ok(p.quality.gaps>0);assert.ok(p.chart.observed.some(x=>x.real===null));assert.ok(p.warnings.length);
});
test('stale readings, reset counters, truncated data and short span do not produce false projections',()=>{
 for(const data of [rows('2026-11-01T03:00:00Z','2026-11-02T03:00:00Z'),rows('2026-11-09T14:00:00Z','2026-11-09T15:00:00Z')])assert.equal(buildMonthlyProjection({...base,rows:data}).goal.projectedMonthKwh,null);
 const data=rows('2026-11-01T03:00:00Z','2026-11-09T15:00:00Z');data.at(-1)!.total_energy_kwh=0;
 assert.equal(buildMonthlyProjection({...base,rows:data}).goal.projectedMonthKwh,null);
 assert.equal(buildMonthlyProjection({...base,rows:rows('2026-11-01T03:00:00Z','2026-11-09T15:00:00Z'),truncated:true}).goal.projectedMonthKwh,null);
});
test('nonlinear inverse uses same tariff, including jumps and area charges',()=>{
 for(const fixed of [true,false])for(const value of [1,99.9,100,100.1,200,266,301,500]){
 const cost=estimateEnergyCost(value,30,fixed).total;const inverse=convertGoal('ars',cost,fixed);assert.ok(inverse.kwh!==null);assert.ok(estimateEnergyCost(inverse.kwh!,30,fixed).total<=cost);assert.ok(Math.abs(inverse.kwh!-value)<0.001);}
 assert.equal(convertGoal('ars',15000).kwh,null);assert.equal(convertGoal('ars',10000).kwh,null);
 const jump=convertGoal('ars',27000);assert.equal(jump.kwh,100);
});
test('tariff unavailable keeps kWh goals and suppresses ARS equivalence',()=>{
 assert.deepEqual(convertGoal('kwh',266,true,false),{kwh:266,ars:null,error:null});assert.equal(convertGoal('ars',50000,true,false).kwh,null);
 const p=buildMonthlyProjection({...base,tariffValid:false,rows:rows('2026-11-01T03:00:00Z','2026-11-09T15:00:00Z')});assert.equal(p.goal.projectedCostArs,null);assert.equal(p.goal.goalKwh,120);
 for(const v of [0,-1,NaN,Infinity])assert.equal(convertGoal('kwh',v).kwh,null);
});
