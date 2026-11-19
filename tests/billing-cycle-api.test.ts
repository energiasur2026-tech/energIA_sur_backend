import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
let user='A',storageCode='';const saved=new Map<string,string>();const queried:string[]=[];
const meters=[{deviceId:'a',ownerId:'A',role:'central'},{deviceId:'b',ownerId:'B',role:'area'}];
mock.module('../src/lib/auth.ts',{namedExports:{getCurrentUser:async()=>({id:user})}});
mock.module('../src/lib/meters.ts',{namedExports:{getMeterForOwner:async()=>meters.find(m=>m.ownerId===user),getAccessibleMeter:async(id:string,deviceId:string)=>meters.find(m=>m.ownerId===id&&m.deviceId===deviceId)}});
mock.module('../src/lib/personal-goals.ts',{namedExports:{withPersonalGoal:async(_id:string,m:unknown)=>m}});
mock.module('../src/lib/supabase.ts',{namedExports:{supabase:()=>({from:()=>{const filter:Record<string,string>={};return {select(){return this;},eq(k:string,v:string){filter[k]=v;return this;},async maybeSingle(){return {data:saved.has(filter.user_id+':'+filter.device_id)?{closed_on:saved.get(filter.user_id+':'+filter.device_id)}:null,error:storageCode?{code:storageCode}:null};},async upsert(row:{user_id:string;device_id:string;closed_on:string}){if(storageCode)return {error:{code:storageCode}};saved.set(row.user_id+':'+row.device_id,row.closed_on);return {error:null};}};}})}});
mock.module('../src/infrastructure/supabase-repositories.ts',{namedExports:{supabaseRepositories:{readings:{periodConsumption:async(id:string,from:Date,to:Date)=>{queried.push(id);return {samples:2,firstAt:from.toISOString(),lastAt:to.toISOString(),firstEnergy:100,lastEnergy:125};}}}}});
const billing=await import('../src/app/api/meter/billing-cycle/route.ts');
const consumption=await import('../src/app/api/meter/consumption/route.ts');
const request=(id:string,body?:object)=>new Request('http://localhost/api/meter/billing-cycle?meterId='+id,{method:body?'PUT':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('billing date is user/meter scoped; consumption uses stored close and rejects foreign meter',async()=>{
 const date=new Date(Date.now()-86400000).toISOString().slice(0,10);
 assert.equal((await billing.PUT(request('a',{closedOn:date}))).status,200);
 user='B';assert.equal((await (await billing.GET(request('b'))).json()).closedOn,null);
 const missing=await consumption.GET(new Request('http://localhost/api/meter/consumption?period=billing&meterId=b'));assert.equal((await missing.json()).reason,'billing_date_required');
 user='A';const r=await consumption.GET(new Request('http://localhost/api/meter/consumption?period=billing&meterId=a'));const p=await r.json();assert.equal(p.period,'billing');assert.equal(p.from,date+'T03:00:00.000Z');assert.equal(p.consumedKwh,25);assert.deepEqual(queried,['a']);
 assert.equal((await billing.PUT(request('b',{closedOn:date}))).status,403);assert.equal((await billing.PUT(request('a',{closedOn:'2026-02-30'}))).status,400);
 assert.equal(saved.get('A:a'),date);assert.equal(saved.has('B:b'),false);
});

test('28 October survives a fresh read and saves a changed date independently',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-18T12:00:00Z')});
 try {
  user='A';
  assert.equal((await billing.PUT(request('a',{closedOn:'2026-10-28'}))).status,200);
  assert.equal((await (await billing.GET(request('a'))).json()).closedOn,'2026-10-28');
  user='B';
  assert.equal((await billing.GET(request('a'))).status,403);
  assert.equal((await billing.PUT(request('b',{closedOn:'2026-11-01'}))).status,200);
  user='A';
  assert.equal((await (await billing.GET(request('a'))).json()).closedOn,'2026-10-28');
  assert.equal((await billing.PUT(request('a',{closedOn:'2026-10-31'}))).status,200);
  assert.equal((await (await billing.GET(request('a'))).json()).closedOn,'2026-10-31');
  assert.equal(saved.get('B:b'),'2026-11-01');
 } finally {user='A';}
});

test('storage diagnostics are safe, neutral and never return success',async t=>{
 const log=t.mock.method(console,'error',()=>{});
 try {
  for(const code of ['PGRST205','42501']){
   storageCode=code;
   const result=await billing.PUT(request('a',{closedOn:'2026-10-28'}));
   assert.equal(result.status,503);
   assert.equal((await result.json()).error,'No pudimos guardar la fecha de cierre. Intentá nuevamente.');
   assert.deepEqual(log.mock.calls.at(-1)?.arguments,['Billing cycle operation failed',{operation:'write',code}]);
   assert.equal((await billing.GET(request('a'))).status,503);
  }
 } finally {storageCode='';}
});
