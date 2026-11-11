import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
let calls: unknown[][] = [];
const query = {
 select(...args: unknown[]){calls.push(['select',...args]);return this;},
 eq(...args: unknown[]){calls.push(['eq',...args]);return this;},
 gte(...args: unknown[]){calls.push(['gte',...args]);return this;},
 lt(...args: unknown[]){calls.push(['lt',...args]);return this;},
 order(...args: unknown[]){calls.push(['order',...args]);return this;},
 async range(start:number,end:number){calls.push(['range',start,end]);return {error:null,data:start===0?Array.from({length:1000},(_,i)=>({recorded_at:String(2000-i)})):[{recorded_at:'1000'}]};},
};
mock.module('../src/lib/supabase.ts',{namedExports:{supabase:()=>({from:(table:string)=>{calls.push(['from',table]);return query;}})}});
const { getLumiReadings } = await import('../src/lib/readings.ts');
test('stored readings always filter authorized device and window, page past Supabase 1000-row default',async()=>{
 calls=[];const from=new Date('2026-11-01T00:00:00Z'),to=new Date('2026-11-02T00:00:00Z');
 const data=await getLumiReadings('authorized-device',from,to);
 assert.equal(data.readings.length,1001);assert.equal(data.truncated,false);
 assert.equal(data.readings[0].recorded_at,'1000');
 assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','device_id','authorized-device'],['eq','device_id','authorized-device']]);
 assert.equal(calls.filter(x=>x[0]==='gte'&&x[2]===from.toISOString()).length,2);
 assert.equal(calls.filter(x=>x[0]==='lt'&&x[2]===to.toISOString()).length,2);
 assert.deepEqual(calls.filter(x=>x[0]==='range'),[['range',0,999],['range',1000,1999]]);
});
