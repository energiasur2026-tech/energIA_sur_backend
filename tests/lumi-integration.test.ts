import {TARIFFS} from '../src/domain/electricity-billing.ts';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

mock.module('../src/lib/personal-goals.ts',{namedExports:{withPersonalGoal:async (_user: string, meter:unknown)=>meter}});

let identity: string | null = 'A';
mock.module('../src/lib/tariff-profile.ts',{namedExports:{lumiSupply:async(user:string,id:string)=>({country:'AR',province:'Santa Cruz',locality:id==='meter-a'?'Río Gallegos':'',distributor:id==='meter-a'?'SPSE':'unknown',category:'1',tariffNote:'Cargos de referencia, no total final.',tariffStatus:'reference_only',source:'supply_settings'}),billingContext:async(_u:string,_m:string,from:string,to=from)=>({configured:true,definition:TARIFFS[0],from,to,code:'reference_only'})}});
mock.module('../src/infrastructure/supabase-repositories.ts',{namedExports:{supabaseRepositories:{readings:{periodConsumption:async()=>({samples:2,firstEnergy:100,lastEnergy:101.25,firstAt:start.toISOString(),lastAt:end.toISOString()})}}}});
const meters = { A: ['meter-a','meter-a2','meter-shared'], B: ['meter-b'] };
const meter = (id: string) => ({ deviceId:id, name:id, ownerId:id==='meter-shared'?'B':id==='meter-b'?'B':'A', goalKwh:id==='meter-a'?500:id==='meter-shared'?999:null, collectionIntervalMinutes:60, thresholds:{lowVoltageV:190,highVoltageV:250,overcurrentA:40} });
mock.module('../src/lib/auth.ts', { namedExports: { getCurrentUser: async () => identity ? {id:identity} : null } });
mock.module('../src/lib/meters.ts', { namedExports: {
  getMeterForOwner: async (user: keyof typeof meters) => meter(meters[user][0]),
  getAccessibleMeter: async (user: keyof typeof meters, id: string) => meters[user].includes(id) ? meter(id) : null,
} });
const end = new Date(); const start = new Date(+end-3600000);
const rows = (id:string) => [
  { recorded_at:start.toISOString(), power_w:id==='meter-b'?9000:1000, voltage:260, total_energy_kwh:id==='meter-b'?500:100 },
  { recorded_at:new Date(+end-1000).toISOString(), power_w:id==='meter-b'?9000:1000, voltage:221, total_energy_kwh:id==='meter-b'?509:101.25 },
];
let queried: string[] = [];
let failReadings = false;
mock.module('../src/lib/readings.ts', { namedExports: {
  getLumiReadings:async(id:string)=>{queried.push(id);if(failReadings) throw new Error('synthetic data failure');return {readings:rows(id),truncated:false};},
  getLatestReading:async(id:string)=>({recordedAt:rows(id)[1].recorded_at,powerW:rows(id)[1].power_w,voltage:221}),
} });
const { GET, POST } = await import('../src/app/api/lumi/v1/route.ts');
const { requireMeter, isErrorResponse, meterIdFrom } = await import('../src/lib/api-auth.ts');

test('meter selection accepts both query names and checks access before data lookup', async () => {
  identity = 'A';
  for (const query of ['deviceId=meter-a2', 'meterId=meter-a2', 'deviceId=meter-a2&meterId=meter-a']) {
    const request = new Request('http://localhost/api/lumi/v1?' + query);
    const selected = await requireMeter(meterIdFrom(request));
    assert.ok(!isErrorResponse(selected));
    if (!isErrorResponse(selected)) assert.equal(selected.meter.deviceId, 'meter-a2');
  }
  queried = [];
  const response = await GET(new Request('http://localhost/api/lumi/v1?deviceId=meter-b'));
  assert.equal(response.status, 403);
  assert.equal(queried.length, 0);
  identity = null;
  const expired = await requireMeter('meter-a');
  assert.ok(isErrorResponse(expired));
  if (isErrorResponse(expired)) assert.equal(expired.status, 401);
  identity = 'A';
});
const request = (id:string, action?:object, extra='') => new Request('http://localhost:3001/api/lumi/v1?meterId='+id+extra, {
  method:action?'POST':'GET', headers:{origin:'http://localhost:3000','content-type':'application/json'}, body:action?JSON.stringify(action):undefined,
});

test('real signed Python pipeline: reads, period, persistence, two users, two meters and forbidden access', { skip: process.env.LUMI_TEST_PYTHON ? false : 'Set LUMI_TEST_PYTHON to run the independent Python service integration.' }, async () => {
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = (socket.address() as {port:number}).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const folder = await mkdtemp(path.join(tmpdir(),'lumi-isolation-'));
  const child = spawn(process.env.LUMI_TEST_PYTHON ?? 'python', ['-m','lumi.server'], {
    cwd:path.resolve(process.cwd(),'../energIA_sur_machine_learning'), windowsHide:true,
    env:{...process.env,LUMI_SERVICE_SECRET:'fixture-secret-with-at-least-32-characters',LUMI_DB_PATH:path.join(folder,'test.sqlite3'),LUMI_PORT:String(port)}, stdio:'ignore',
  });
  process.env.LUMI_SERVICE_URL='http://127.0.0.1:'+port;
  process.env.LUMI_SERVICE_SECRET='fixture-secret-with-at-least-32-characters';
  process.env.LUMI_ALLOWED_ORIGINS='http://localhost:3000';
  try {
    for(let i=0;i<40;i++){try {await fetch(process.env.LUMI_SERVICE_URL);break;}catch{await new Promise(r=>setTimeout(r,100));}}
    identity='A';
    queried=[];
    for(const question of ['Acabo de conectar el lavarropas, ¿consume mucha energía?','¿Cuánta electricidad gasta una lavadora?']){
      const result=await POST(request('meter-a',{action:'chat',question}));assert.equal(result.status,200);const answer=await result.json();assert.match(answer.answer.text,/programa/);assert.doesNotMatch(answer.answer.text,/De qué período/);assert.equal(queried.length,0);
    }
    const supplier=await (await POST(request('meter-a',{action:'chat',question:'Vivo en Santa Cruz, ¿quién es el proveedor de energía?'}))).json();assert.match(supplier.answer.text,/SPSE/);assert.match(supplier.answer.text,/configuración/);
    const priced=await (await POST(request('meter-a',{action:'chat',question:'¿Cuánto gasté en pesos hoy?'}))).json();assert.equal(priced.answer.intent,'cost');assert.match(priced.answer.text,/referencia de cargos/);assert.match(priced.answer.text,/1,250/);assert.match(priced.answer.text,/Cobertura/);
    const unconfigured=await (await POST(request('meter-a2',{action:'chat',question:'¿Quién me provee electricidad?'}))).json();assert.match(unconfigured.answer.text,/localidad/);
    await POST(request('meter-a2',{action:'clear'}));await POST(request('meter-a',{action:'clear'}));queried=[];
    let memoryResponse=await POST(request('meter-a',{action:'chat',question:'Siempre a las 9 conecto la pava eléctrica'}));
    assert.equal(memoryResponse.status,200);
    let memoryBody=await memoryResponse.json();const habitId=memoryBody.memories[0].id;
    assert.equal(memoryBody.memories[0].source,'user_declared');assert.equal(queried.length,0);
    assert.equal((await POST(request('meter-a2',{action:'memory',operation:'delete',id:habitId}))).status,404);
    identity='B';assert.equal((await POST(request('meter-a',{action:'memory',operation:'delete',id:habitId}))).status,403);
    assert.equal((await POST(request('meter-b',{action:'memory',operation:'delete',id:habitId}))).status,404);
    identity='A';memoryResponse=await POST(request('meter-a',{action:'memory',operation:'update',id:habitId,text:'Ahora uso esa pava a las 10'}));
    assert.equal(memoryResponse.status,200);assert.equal((await memoryResponse.json()).memories[0].localTime,'10:00');
    assert.equal((await POST(request('meter-a',{action:'supplyProfile',profile:{country:'AR',province:'Santa Cruz',distributor:'SPSE'}}))).status,409);
    memoryResponse=await POST(request('meter-a',{action:'chat',question:'¿Qué tensión es normal en mi hogar?'}));memoryBody=await memoryResponse.json();
    assert.equal(memoryResponse.status,200);assert.match(memoryBody.messages.at(-1).text,/referencia doméstica 220 V/);assert.match(memoryBody.messages.at(-1).text,/SPSE/);
    assert.ok(memoryBody.answer.validated);assert.ok(memoryBody.answer.evidenceIds.length);
    for(const action of [{action:'memory',operation:'delete',id:habitId,userId:'B'},{action:'supplyProfile',profile:{country:'AR',userId:'B'}},{action:'recommendation',kind:'arbitrary',adopted:true}]) assert.equal((await POST(request('meter-a',action))).status,400);
    assert.equal((await POST(request('meter-a',{action:'memory',operation:'delete',id:habitId}))).status,200);
    failReadings=true;
    memoryResponse=await POST(request('meter-a',{action:'chat',question:'¿Qué tensión es normal en mi hogar?'}));
    assert.equal(memoryResponse.status,200);memoryBody=await memoryResponse.json();assert.match(memoryBody.messages.at(-1).text,/No pude recuperar las mediciones/);assert.doesNotMatch(memoryBody.messages.at(-1).text,/221,0 V/);
    failReadings=false;
    await POST(request('meter-a',{action:'clear'}));
    let response=await POST(request('meter-a',{action:'chat',question:'Última lectura'}));
    assert.equal(response.status,200);let body=await response.json();
    assert.equal(body.context.userId,'A');assert.equal(body.goalKwh,500);assert.equal(body.latest.powerW,1000);assert.equal(body.latest.voltage,221);
    assert.match(body.messages.at(-1).text,/1\.000 W/);assert.match(body.messages.at(-1).text,/meter-a/);
    assert.match(body.messages.at(-1).text, /Fecha: \d{2}\/\d{2}\/\d{4}/);
    response=await POST(request('meter-a',{action:'chat',question:'Consumo del período'},'&from='+encodeURIComponent(start.toISOString())+'&to='+encodeURIComponent(end.toISOString())));
    body=await response.json(); assert.equal(body.period.energyKwh,1.25);assert.match(body.messages.at(-1).text,/1,250 kWh/);
    assert.equal((await (await GET(request('meter-a'))).json()).messages.length,4);
    // Real route + signed Python + SQLite, with identity resolved on the server.
    body=await (await GET(request('meter-a'))).json();
    const eventId=body.events.find((e:{type:string})=>e.type==='voltage').id;
    queried=[];response=await POST(request('meter-a',{action:'read',eventId,read:true}));assert.equal(response.status,200);assert.equal(queried.length,0,'reading an event must not requery measurements');
    body=await (await GET(request('meter-a'))).json();assert.equal(body.events.find((e:{id:string})=>e.id===eventId).read,true);
    response=await POST(request('meter-a',{action:'read',eventId,read:false}));assert.equal(response.status,200);
    response=await POST(request('meter-a',{action:'label',eventId,labels:['Pava eléctrica']}));assert.equal(response.status,200);
    response=await POST(request('meter-a',{action:'label',eventId,labels:['Otro equipo'],otherEquipment:'Tostadora'}));assert.equal(response.status,200);
    body=await (await GET(request('meter-a'))).json();
    let saved=body.events.find((e:{id:string})=>e.id===eventId);assert.deepEqual(saved.userLabels,['Otro equipo']);assert.equal(saved.otherEquipment,'Tostadora');assert.ok(saved.answeredAt);assert.equal(saved.read,false);
    assert.equal(body.events.filter((e:{id:string})=>e.id===eventId).length,1);
    for(const invalid of [{action:'read',eventId,read:'false'},{action:'label',eventId,labels:['No recuerdo','Plancha']},{action:'label',eventId,labels:['Plancha'],otherEquipment:'texto'},{action:'read',eventId,userId:'B'}]) {
      response=await POST(request('meter-a',invalid));assert.equal(response.status,400);
    }
    response=await POST(request('meter-a2',{action:'read',eventId,read:true}));assert.equal(response.status,404);
    identity='B';response=await POST(request('meter-b',{action:'label',eventId,labels:[]}));assert.equal(response.status,404);
    response=await POST(request('meter-a',{action:'read',eventId,read:true}));assert.equal(response.status,403);
    identity='A';body=await (await GET(request('meter-a'))).json();assert.deepEqual(body.events.find((e:{id:string})=>e.id===eventId).userLabels,['Otro equipo']);
    response=await POST(request('meter-a',{action:'label',eventId,labels:[]}));assert.equal(response.status,200);
    body=await (await GET(request('meter-a'))).json();saved=body.events.find((e:{id:string})=>e.id===eventId);
    assert.deepEqual(saved.userLabels,[]);assert.equal(saved.answered,false);assert.equal(saved.answeredAt,null);assert.equal(saved.otherEquipment,'');
    await POST(request('meter-a',{action:'preferences',preferences:{reducedMotion:true,proactivePaused:true}}));
    await POST(request('meter-a',{action:'goal',goalKwh:123}));
    body=await (await GET(request('meter-a2'))).json();assert.equal(body.messages.length,0);assert.equal(body.preferences.reducedMotion,false);assert.equal(body.goalKwh,null);
    assert.equal((await (await GET(request('meter-shared'))).json()).goalKwh,null);
    identity='B';response=await POST(request('meter-b',{action:'chat',question:'Última lectura'}));body=await response.json();
    assert.equal(body.latest.powerW,9000);assert.equal(body.messages.length,2);assert.equal(body.preferences.reducedMotion,false);assert.equal(body.goalKwh,null);
    identity='A';queried=[];response=await GET(request('meter-b'));assert.equal(response.status,403);assert.equal(queried.length,0);assert.ok(!(await response.text()).includes('9000'));
    response=await POST(request('meter-a',{action:'chat',question:'hola',context:{userId:'B'}}));assert.equal(response.status,400);
    body=await (await GET(request('meter-a'))).json();assert.equal(body.messages.length,4);assert.equal(body.goalKwh,123);assert.equal(body.preferences.reducedMotion,true);
    assert.equal((await GET(request('meter-a'))).headers.get('cache-control'),'private, no-store');
    for (const question of ['Hola','Tengo una consulta','¿Me ayudás?','¿Cuánto consumí?']) {
      queried=[];
      response=await POST(request('meter-a',{action:'chat',question}));assert.equal(response.status,200);
      body=await response.json();assert.equal(body.snapshot,true);assert.equal(queried.length,0,'introductory turns must not read measurements');
      assert.ok(!body.messages.at(-1).text.includes('kWh'));assert.ok(!body.messages.at(-1).text.includes('modelo'));
    }
    response=await POST(request('meter-a',{action:'chat',question:'Hola',prepare:true}));assert.equal(response.status,400);
    const invalidOrigin = new Request('http://localhost:3001/api/lumi/v1?meterId=meter-a',{method:'POST',headers:{origin:'https://untrusted.invalid'},body:JSON.stringify({action:'clear'})});
    assert.equal((await POST(invalidOrigin)).status,403);
    delete process.env.LUMI_SERVICE_SECRET;
    response=await GET(request('meter-a'));assert.equal(response.status,503);assert.equal((await response.json()).code,'CONFIGURATION_ERROR');
    identity=null;assert.equal((await GET(request('meter-a'))).status,401);
  } finally { child.kill(); await new Promise(r=>child.once('exit',r)); await rm(folder,{recursive:true,force:true}); }
});
