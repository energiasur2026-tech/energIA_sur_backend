import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
let calls: unknown[][] = [];
let pageCap = 1000, totalRows = 1001;
const query = {
 select(...args: unknown[]){calls.push(['select',...args]);return this;},
 eq(...args: unknown[]){calls.push(['eq',...args]);return this;},
 gte(...args: unknown[]){calls.push(['gte',...args]);return this;},
 lt(...args: unknown[]){calls.push(['lt',...args]);return this;},
 order(...args: unknown[]){calls.push(['order',...args]);return this;},
 async range(start:number,end:number){calls.push(['range',start,end]);return {error:null,data:Array.from({length:Math.max(0,Math.min(pageCap,end-start+1,totalRows-start))},(_,i)=>({recorded_at:String(2000-start-i)}))};},
};
mock.module('../src/lib/supabase.ts',{namedExports:{supabase:()=>({from:(table:string)=>{calls.push(['from',table]);return query;}})}});
const { getLumiReadings } = await import('../src/lib/readings.ts');
test('stored readings always filter authorized device and window, page past Supabase 1000-row default',async()=>{
 calls=[];const from=new Date('2026-11-01T00:00:00Z'),to=new Date('2026-11-02T00:00:00Z');
 const data=await getLumiReadings('authorized-device',from,to);
 assert.equal(data.readings.length,1001);assert.equal(data.truncated,false);
 assert.equal(data.readings[0].recorded_at,'1000');
 assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','device_id','authorized-device'],['eq','device_id','authorized-device'],['eq','device_id','authorized-device']]);
 assert.equal(calls.filter(x=>x[0]==='gte'&&x[2]===from.toISOString()).length,3);
 assert.equal(calls.filter(x=>x[0]==='lt'&&x[2]===to.toISOString()).length,3);
 assert.deepEqual(calls.filter(x=>x[0]==='range'),[['range',0,999],['range',1000,1999],['range',1001,2000]]);
});


test('a REST page capped at 100 is not mistaken for the end of the month',async()=>{
 calls=[];pageCap=100;totalRows=1500;
 try {
  const result=await getLumiReadings('authorized-device',new Date('2026-11-01T00:00:00Z'),new Date('2026-11-17T00:00:00Z'));
  assert.equal(result.readings.length,1500);
  assert.equal(result.truncated,false);
  assert.equal(result.readings.at(-1)?.recorded_at,'2000');
  assert.equal(calls.filter(call=>call[0]==='range').length,16);
 } finally {pageCap=1000;totalRows=1001;}
});
