import test,{mock} from 'node:test';import assert from 'node:assert/strict';
let user='A',missing=false,networkFailure=false;const profiles=new Map<string,unknown>(),queried:string[]=[];
mock.module('../src/lib/auth.ts',{namedExports:{getCurrentUser:async()=>({id:user})}});
mock.module('../src/lib/personal-goals.ts',{namedExports:{withPersonalGoal:async(_user:string,meter:unknown)=>meter}});
const meter=(id:string)=>({deviceId:id,ownerId:id==='a'?'A':'B',role:'central',collectionIntervalMinutes:15});
mock.module('../src/lib/meters.ts',{namedExports:{getMeterForOwner:async()=>meter(user==='A'?'a':'b'),getAccessibleMeter:async(owner:string,id:string)=>(owner==='A'&&id==='a'||owner==='B'&&id==='b')?meter(id):null}});
mock.module('../src/lib/supabase.ts',{namedExports:{supabase:()=>({from:()=>{const filter:Record<string,string>={};return {select(){return this;},eq(k:string,v:string){filter[k]=v;return this;},async maybeSingle(){return missing?{data:null,error:{code:'PGRST205'}}:{data:profiles.get(filter.user_id+':'+filter.device_id)??null,error:null};},async upsert(row:{user_id:string;device_id:string}){if(networkFailure)return {error:{code:'',message:'TypeError: fetch failed'}};if(missing)return {error:{code:'PGRST205'}};profiles.set(row.user_id+':'+row.device_id,row);return {error:null};}};}})}});
mock.module('../src/lib/readings.ts',{namedExports:{getLumiReadings:async(id:string,from:Date,to:Date)=>{queried.push(id);return {readings:[{recorded_at:from.toISOString(),total_energy_kwh:819},{recorded_at:new Date(+to-1).toISOString(),total_energy_kwh:1033}],truncated:false};}}});
const tariff=await import('../src/app/api/meter/tariff/route.ts');const compare=await import('../src/app/api/meter/bill-comparison/route.ts');
const req=(path:string,id:string,body?:object,method='POST')=>new Request('http://localhost/api/meter/'+path+'?deviceId='+id,{method:body?method:'GET',headers:{origin:'http://localhost','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('a confirmed pending provider stores only supply metadata',async()=>{
 const supply={provider:'other',providerName:'Cooperativa del Valle',jurisdiction:'AR-Santa Cruz',province:'Santa Cruz',
  locality:'Río Gallegos',category:'unknown',segment:'',bonus:'',providerConfirmed:true};
 assert.equal((await tariff.PUT(req('tariff','a',supply,'PUT'))).status,200);
 assert.equal((await (await tariff.GET(req('tariff','a'))).json()).profile.providerName,'Cooperativa del Valle');
 assert.equal((await tariff.PUT(req('tariff','a',{...supply,rawInvoice:'Contenido original'},'PUT'))).status,400);
});
test('Río Grande declarations save and reload only for the authorized supply',async()=>{
 const profile={provider:'COOPRG',jurisdiction:'AR-Tierra del Fuego',province:'Tierra del Fuego',locality:'Río Grande',
  category:'TR1',segment:'unsubsidized',bonus:'',providerConfirmed:true,supplyType:'single-phase',constructionCharge:'yes'};
 assert.equal((await tariff.PUT(req('tariff','a',profile,'PUT'))).status,200);
 const read=await (await tariff.GET(req('tariff','a'))).json();
 assert.deepEqual(read.profile,{...profile,categoryText:''});
 user='B';
 try {
  assert.equal((await tariff.GET(req('tariff','a'))).status,403);
  assert.equal((await (await tariff.GET(req('tariff','b'))).json()).profile,null);
 } finally {user='A';}
});
test('tariff selection and bill comparison remain user/meter scoped; amounts never force a match',async()=>{
 const profile={provider:'SPSE',jurisdiction:'AR-Santa Cruz',province:'Santa Cruz',locality:'Río Gallegos',category:'1',segment:'subsidized',bonus:'none',providerConfirmed:true};
 assert.equal((await tariff.PUT(req('tariff','a',profile,'PUT'))).status,200);
 assert.equal((await (await tariff.GET(req('tariff','a'))).json()).profile.segment,'subsidized');
 await tariff.PUT(req('tariff','a',{...profile,bonus:''},'PUT'));
 const {billingContext}=await import('../src/lib/tariff-profile.ts');
 const base=await billingContext('A','a','2026-11-01','2026-11-02',{allowBaseWithoutBonus:true});
 assert.equal(base.code,'base_reference_pending_bonus');assert.ok(base.definition);assert.match(base.reason??'',/sin aplicar bonificaciones/);
 assert.equal((await billingContext('A','a','2026-11-01','2026-11-02')).definition,null);
 assert.equal((await (await tariff.GET(req('tariff','a'))).json()).profile.bonus,'');
 assert.equal((await billingContext('B','a','2026-11-01','2026-11-02',{allowBaseWithoutBonus:true})).definition,null);
 await tariff.PUT(req('tariff','a',{...profile,bonus:'',providerConfirmed:false},'PUT'));
 assert.equal((await billingContext('A','a','2026-11-01','2026-11-02',{allowBaseWithoutBonus:true})).definition,null);
 await tariff.PUT(req('tariff','a',profile,'PUT'));
 const body={from:'2026-09-18T03:00:00Z',to:'2026-10-18T03:00:00Z',billedKwh:214,electricityCharge:33747.85};
 const r=await compare.POST(req('bill-comparison','a',body));assert.equal(r.status,200);const data=await r.json();assert.equal(data.comparison.appKwh,214);assert.equal(data.comparison.deltaKwh,0);assert.equal(data.comparison.electricityDifference,-3797.36);assert.equal(data.breakdown.totalElectricity,null);
 queried.length=0;assert.equal((await compare.POST(req('bill-comparison','b',body))).status,403);assert.equal(queried.length,0);
 assert.equal((await compare.POST(req('bill-comparison','a',{...body,userId:'B'}))).status,400);
 assert.equal((await compare.POST(req('bill-comparison','a',{...body,from:undefined}))).status,400);
 assert.equal((await tariff.PUT(req('tariff','a',{...profile,taxRate:.21},'PUT'))).status,400);
 const unknown={...profile,category:'unknown'};assert.equal((await tariff.PUT(req('tariff','a',unknown,'PUT'))).status,200);const resumed=await (await tariff.GET(req('tariff','a'))).json();assert.equal(resumed.profile.category,'unknown');assert.equal(resumed.resolution.code,'category_required');
 const noncatalogued={...profile,category:'other',categoryText:'Código 999'};assert.equal((await tariff.PUT(req('tariff','a',noncatalogued,'PUT'))).status,200);assert.equal((await (await tariff.GET(req('tariff','a'))).json()).profile.categoryText,'Código 999');
 user='B';assert.equal((await (await tariff.GET(req('tariff','b'))).json()).profile,null);
 user='A';missing=true;assert.equal((await (await tariff.GET(req('tariff','a'))).json()).profile,null);const missingResponse=await tariff.PUT(req('tariff','a',profile,'PUT'));assert.equal(missingResponse.status,503);assert.equal((await missingResponse.json()).code,'SUPPLY_SCHEMA_MISSING');missing=false;networkFailure=true;const networkResponse=await tariff.PUT(req('tariff','a',profile,'PUT'));assert.equal(networkResponse.status,503);const networkBody=await networkResponse.json();assert.equal(networkBody.code,'SUPPLY_STORAGE_UNAVAILABLE');assert.doesNotMatch(networkBody.error,/migraciones/);networkFailure=false;
});
