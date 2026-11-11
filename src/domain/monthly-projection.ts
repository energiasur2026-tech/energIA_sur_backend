import { estimateEnergyCost, RESIDENCIAL_SIN_SUBSIDIO } from './tariffs';
import type { GoalProgress, GoalInputMode } from './goal';
export type GoalChoice = { mode: GoalInputMode; value: number; tariffVersion?: string | null } | null;
export const TARIFF_VERSION = 'spse-v1:'+RESIDENCIAL_SIN_SUBSIDIO.map(t=>[t.maxKwh,t.cargoFijo,t.valorTramo].join(':')).join('|');
export function tariffInfo(includeFixed = true, valid = true) {
 return { valid, version:TARIFF_VERSION, effectiveDate:null as string|null, category:'SPSE · Residencial sin subsidio', includeFixed,
 included:includeFixed?['Cargo fijo mensual','Cargo variable según tramo del consumo total']:['Cargo variable según tramo del consumo total'],
 excluded:['Impuestos no configurados','Agua','Cloaca','Alumbrado y otros conceptos'], note:'Fecha de vigencia no registrada. Verificá el cuadro configurado; no es una factura total.' };
}
export function convertGoal(mode:GoalInputMode, value:number, fixed=true, valid=true) {
 if (!Number.isFinite(value)||value<=0) return {kwh:null,ars:null,error:'Ingresá un número mayor a cero.'};
 if (!valid) return {kwh:mode==='kwh'?value:null,ars:null,error:mode==='ars'?'No hay una tarifa válida. Podés guardar el objetivo en kWh.':null};
 if(mode==='kwh') return {kwh:value,ars:estimateEnergyCost(value,30,fixed).total,error:null};
 if(value<=estimateEnergyCost(0,30,fixed).total) return {kwh:null,ars:value,error:'El presupuesto no supera los cargos fijos incluidos; no deja margen para consumo.'};
 // Invert the SAME monotone, discontinuous tariff, returning the largest affordable consumption.
 let low=0,high=1;
 while(high<1e9&&estimateEnergyCost(high,30,fixed).total<=value)high*=2;
 for(let i=0;i<70;i++){const mid=(low+high)/2;if(estimateEnergyCost(mid,30,fixed).total<=value)low=mid;else high=mid;}
 return {kwh:low,ars:value,error:null};
}
export function calendarMonth(month:string, now=new Date()) {
 if(!/^\d{4}-\d{2}$/.test(month))throw new Error('Mes inválido');
 const [year,m]=month.split('-').map(Number);if(m<1||m>12||year<2000||year>2100)throw new Error('Mes inválido');
 const start=new Date(Date.UTC(year,m-1,1,3)),end=new Date(Date.UTC(year,m,1,3));
 return {month,start,end,days:(+end-+start)/86400000,elapsed:Math.max(0,Math.min((+now-+start)/86400000,(+end-+start)/86400000))};
}
export function argentinaMonth(now=new Date()){return new Date(+now-10800000).toISOString().slice(0,7);}
export type StoredPoint = { recorded_at: string; total_energy_kwh?: unknown; power_w?: unknown; voltage?:unknown; current?:unknown };
export function buildMonthlyProjection(input:{rows:StoredPoint[];month:string;now?:Date;choice:GoalChoice;fixed?:boolean;tariffValid?:boolean;intervalMinutes?:number;truncated?:boolean}) {
 const now=input.now??new Date(), c=calendarMonth(input.month,now), valid=input.tariffValid!==false, fixed=input.fixed!==false;
 const resolved=input.choice?convertGoal(input.choice.mode,input.choice.value,fixed,valid):null;
 const target=resolved?.kwh??null;
 const rows=input.rows.filter(r=>Number.isFinite(Date.parse(r.recorded_at))&&Date.parse(r.recorded_at)<=Math.min(+now,+c.end)&&typeof r.total_energy_kwh==='number'&&Number.isFinite(r.total_energy_kwh)&&Number(r.total_energy_kwh)>=0)
 .sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)).filter((r,i,a)=>!i||r.recorded_at!==a[i-1].recorded_at);
 const inside=rows.filter(r=>Date.parse(r.recorded_at)>=+c.start&&Date.parse(r.recorded_at)<+c.end);
 const before=rows.filter(r=>Date.parse(r.recorded_at)<=+c.start).at(-1);
 const boundary=before && Date.parse(before.recorded_at)===+c.start?before:undefined;
 const first=boundary??inside[0], last=inside.at(-1);
 let measured=0,resets=0,gaps=0,observedSeconds=0;
 const maxGap=Math.max(900,(input.intervalMinutes??15)*60*2.5);
 const used=first?rows.filter(r=>Date.parse(r.recorded_at)>=Date.parse(first.recorded_at)&&Date.parse(r.recorded_at)<=Date.parse(last?.recorded_at??first.recorded_at)):[];
 const points:{day:string;at:string;x:number;consumedKwh:number|null}[]=[];
 const completeDays=new Set<string>();
 const gapDays=new Set<string>();
 for(let i=0;i<used.length;i++){
  const r=used[i],t=Date.parse(r.recorded_at);
  if(i){const p=used[i-1],s=(t-Date.parse(p.recorded_at))/1000,d=Number(r.total_energy_kwh)-Number(p.total_energy_kwh);
   if(d<0)resets++;else measured+=d;
   if(s>maxGap){gaps++;for(let gt=Date.parse(p.recorded_at);gt<=t;gt+=86400000)gapDays.add(new Date(gt-10800000).toISOString().slice(0,10));}
   else observedSeconds+=s;
  }
  if(t>=+c.start){const day=new Date(t-10800000).toISOString().slice(0,10);const point={day,at:r.recorded_at,x:1+(t-+c.start)/86400000,consumedKwh:resets?null:measured};
   if(points.at(-1)?.day===day)points[points.length-1]=point;else points.push(point);}
 }
 for(let day=0;day<Math.floor(c.elapsed);day++){const a=+c.start+day*86400000,b=a+86400000,key=new Date(a-10800000).toISOString().slice(0,10);
 if(first&&last&&Date.parse(first.recorded_at)<=a+maxGap*1000&&Date.parse(last.recorded_at)>=b-maxGap*1000&&!gapDays.has(key))completeDays.add(key);}
 const span=first&&last?(Date.parse(last.recorded_at)-Date.parse(first.recorded_at))/86400000:0;
 const stale=last?Math.min(+now,+c.end)-Date.parse(last.recorded_at)>maxGap*1000:true;
 const measuredKwh=used.length>=2&&!resets?measured:null;
 const rate=measuredKwh!==null&&span>=1&&!input.truncated?measuredKwh/span:null;
 const missingStart=!boundary && (!first||Date.parse(first.recorded_at)>+c.start);
 const estimatedBefore=rate!==null&&first?rate*Math.max(0,(Date.parse(first.recorded_at)-+c.start)/86400000):null;
 const projected=rate!==null&&!stale&&!resets?measuredKwh!+(estimatedBefore??0)+rate*Math.max(0,(+c.end-Date.parse(last!.recorded_at))/86400000):null;
 const estimateNow=rate!==null&&last&&measuredKwh!==null?measuredKwh+(estimatedBefore??0)+rate*Math.max(0,(Math.min(+now,+c.end)-Date.parse(last.recorded_at))/86400000):null;
 const remainingDays=c.days-c.elapsed;
 const remaining=target!==null&&estimateNow!==null&&remainingDays>0?Math.max(0,target-estimateNow)/remainingDays:null;
 const difference=target!==null&&projected!==null?projected-target:null;
 const coverage=span>0?Math.min(1,observedSeconds/(span*86400)):0;
 const warnings:string[]=[];
 if(missingStart)warnings.push('Faltan mediciones al comienzo del mes: el acumulado observado no es el total real mensual.');
 if(gaps)warnings.push('Hay huecos de muestreo. Un contador continuo conserva energía entre extremos, pero no permite localizarla en los días sin muestras.');
 if(stale)warnings.push('La última lectura está desactualizada para este período; no se estima el cierre.');
 if(resets)warnings.push('El contador retrocedió: no se publica un consumo mensual ni una proyección inconsistentes.');
 if(input.truncated)warnings.push('Historial limitado: no se publica proyección con una serie truncada.');
 if(span<1)warnings.push('Se necesita al menos un día observado para extrapolar el ritmo.');
 const goal:GoalProgress={status:target===null?'no_goal':projected===null?'no_data':projected<=target?'on_track':projected<=target*1.15?'at_risk':'over',goalKwh:target,goalCostArs:resolved?.ars??null,inputMode:input.choice?.mode??'kwh',allowedPerDayKwh:target===null?null:target/c.days,allowedPerWeekKwh:target===null?null:target/c.days*7,daysInMonth:c.days,elapsedDays:c.elapsed,measuredDays:span,coverage,consumedKwh:measuredKwh,dailyRateKwh:rate,expectedKwh:target===null?null:target/c.days*span,projectedMonthKwh:projected,projectedCostArs:projected!==null&&valid?estimateEnergyCost(projected,30,fixed).total:null,deviationKwh:difference,deviationPct:difference!==null&&target?difference/target*100:null,remainingPerDayKwh:remaining};
 const references=Array.from({length:c.days+1},(_,day)=>({x:day+1,pace:target===null?null:target*day/c.days,target}));
 const observed:{x:number;real:number|null}[]=points.map(p=>({x:p.x,real:p.consumedKwh}));
 if(first&&Date.parse(first.recorded_at)>=+c.start)observed.unshift({x:1+(Date.parse(first.recorded_at)-+c.start)/86400000,real:0});
 for(let i=1;i<used.length;i++){const a=Date.parse(used[i-1].recorded_at),b=Date.parse(used[i].recorded_at);if((b-a)/1000>maxGap)observed.push({x:1+((a+b)/2-+c.start)/86400000,real:null});}
 observed.sort((a,b)=>a.x-b.x);
 const estimated=last&&projected!==null?[{x:1+(Date.parse(last.recorded_at)-+c.start)/86400000,projected:measured+(estimatedBefore??0)},{x:c.days+1,projected}]:[];
 return {chart:{references,observed,estimated},goal,choice:input.choice,tariff:tariffInfo(fixed,valid),month:c.month,daysInMonth:c.days,todayX:input.month===argentinaMonth(now)?1+c.elapsed:null,monthStart:c.start.toISOString(),monthEnd:c.end.toISOString(),measuredFrom:first?.recorded_at??null,measuredTo:last?.recorded_at??null,measuredKwh,estimatedToDateKwh:estimateNow,missingStart,exceededKwh:target!==null&&measuredKwh!==null?Math.max(0,measuredKwh-target):null,remainingDays,quality:{coverage,gaps,resets,stale,completeDays:completeDays.size,samples:inside.length,truncated:!!input.truncated},warnings,monthDaily:points,gapDays:[...gapDays],method:'Estimación basada en el ritmo observado: energía entre extremos / duración exacta observada; consumo observado + inicio no medido estimado + ritmo × tiempo restante.'};
}
export type MonthlyProjection = ReturnType<typeof buildMonthlyProjection>;
