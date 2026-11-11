import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
let user='A';let reads=0;const data=new Map<string,Record<string,unknown>>();
const meters=[{deviceId:'a',ownerId:'A',goalKwh:266,goalInputMode:'kwh',role:'central'},{deviceId:'b',ownerId:'B',goalKwh:999,goalInputMode:'kwh',role:'central'}];
mock.module('../src/lib/auth.ts',{namedExports:{getCurrentUser:async()=>({id:user})}});
mock.module('../src/lib/meters.ts',{namedExports:{getMeterForOwner:async()=>user==='C'?meters[0]:meters.find(m=>m.ownerId===user),getMetersForOwner:async(id:string)=>id==='C'?[meters[0]]:meters.filter(m=>m.ownerId===id)}});
mock.module('../src/lib/supabase.ts',{namedExports:{supabase:()=>({from:()=>{const filter:Record<string,string>={};return {select(){return this;},eq(k:string,v:string){filter[k]=v;return this;},async maybeSingle(){reads++;return {data:data.get(filter.user_id+':'+filter.device_id)??null,error:null};},async upsert(value:Record<string,unknown>){data.set(value.user_id+':'+value.device_id,value);return {error:null};}};}})}});
const {GET,PUT}=await import('../src/app/api/meter/goal/route.ts');
const {requireMeter,isErrorResponse}=await import('../src/lib/api-auth.ts');
const req=(meter:string,body?:object)=>new Request('http://localhost/api/meter/goal?meterId='+meter+'&mode=ars&value=50000',{method:body?'PUT':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('save ARS and kWh preserves chosen value; user/meter isolation and forbidden access',async()=>{
 user='A';let r=await PUT(req('a',{mode:'ars',value:50000}));assert.equal(r.status,200);assert.equal(data.get('A:a')!.input_value,50000);assert.equal(data.get('A:a')!.input_mode,'ars');
 const a=await requireMeter(req('a'));assert.ok(!isErrorResponse(a));if(isErrorResponse(a))return;assert.ok(Math.abs(a.meter.goalKwh!-266)<1);
 user='B';r=await PUT(req('b',{mode:'kwh',value:80}));assert.equal(r.status,200);assert.equal(data.get('B:b')!.input_value,80);assert.equal(data.get('A:a')!.input_value,50000);
 user='C';r=await PUT(req('a',{mode:'kwh',value:40}));assert.equal(r.status,200);assert.equal(data.get('C:a')!.input_value,40);assert.equal(data.get('A:a')!.input_value,50000);
 user='A';reads=0;r=await GET(req('b'));assert.equal(r.status,403);assert.equal(reads,0);
 for(const value of [0,-5,'50000','',null]){r=await PUT(req('a',{mode:'ars',value}));assert.equal(r.status,value===null?200:400);}
 const cleared=await requireMeter(req('a'));assert.ok(!isErrorResponse(cleared));if(!isErrorResponse(cleared))assert.equal(cleared.meter.goalKwh,null);
});

test('tariff change updates equivalence without rewriting a saved ARS amount',async()=>{
 user='A';assert.equal((await PUT(req('a',{mode:'ars',value:50000}))).status,200);
 const {RESIDENCIAL_SIN_SUBSIDIO}=await import('../src/domain/tariffs.ts');
 const before=await (await GET(req('a'))).json();const original=RESIDENCIAL_SIN_SUBSIDIO.map(t=>t.valorTramo);
 try{RESIDENCIAL_SIN_SUBSIDIO.forEach(t=>t.valorTramo*=2);const after=await (await GET(req('a'))).json();assert.ok(after.kwh<before.kwh);assert.equal(data.get('A:a')!.input_value,50000);assert.equal(data.get('A:a')!.input_mode,'ars');}
 finally{RESIDENCIAL_SIN_SUBSIDIO.forEach((t,i)=>t.valorTramo=original[i]);}
});
