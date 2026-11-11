import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

mock.module('../src/lib/personal-goals.ts',{namedExports:{withPersonalGoal:async (_user: string, meter:unknown)=>meter}});

let identity: string | null = 'A';
const meters = { A: ['meter-a','meter-a2','meter-shared'], B: ['meter-b'] };
const meter = (id: string) => ({ deviceId:id, name:id, ownerId:id==='meter-shared'?'B':id==='meter-b'?'B':'A', goalKwh:id==='meter-a'?500:id==='meter-shared'?999:null, collectionIntervalMinutes:60, thresholds:{lowVoltageV:190,highVoltageV:250,overcurrentA:40} });
mock.module('../src/lib/auth.ts', { namedExports: { getCurrentUser: async () => identity ? {id:identity} : null } });
mock.module('../src/lib/meters.ts', { namedExports: {
  getMeterForOwner: async (user: keyof typeof meters) => meter(meters[user][0]),
  getMetersForOwner: async (user: keyof typeof meters) => meters[user].map(meter),
} });
const end = new Date(); const start = new Date(+end-3600000);
const rows = (id:string) => [
  { recorded_at:start.toISOString(), power_w:id==='meter-b'?9000:1000, voltage:220, total_energy_kwh:id==='meter-b'?500:100 },
  { recorded_at:new Date(+end-1000).toISOString(), power_w:id==='meter-b'?9000:1000, voltage:221, total_energy_kwh:id==='meter-b'?509:101.25 },
];
let queried: string[] = [];
mock.module('../src/lib/readings.ts', { namedExports: {
  getLumiReadings:async(id:string)=>{queried.push(id);return {readings:rows(id),truncated:false};},
  getLatestReading:async(id:string)=>({recordedAt:rows(id)[1].recorded_at,powerW:rows(id)[1].power_w,voltage:221}),
} });
const { GET, POST } = await import('../src/app/api/lumi/v1/route.ts');
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
    let response=await POST(request('meter-a',{action:'chat',question:'Última lectura'}));
    assert.equal(response.status,200);let body=await response.json();
    assert.equal(body.context.userId,'A');assert.equal(body.goalKwh,500);assert.equal(body.latest.powerW,1000);assert.equal(body.latest.voltage,221);
    assert.match(body.messages.at(-1).text,/1000 W/);assert.match(body.messages.at(-1).text,/meter-a/);
    assert.ok(body.messages.at(-1).text.includes(rows('meter-a')[1].recorded_at));
    response=await POST(request('meter-a',{action:'chat',question:'Consumo del período'},'&from='+encodeURIComponent(start.toISOString())+'&to='+encodeURIComponent(end.toISOString())));
    body=await response.json(); assert.equal(body.period.energyKwh,1.25);assert.match(body.messages.at(-1).text,/1.250 kWh/);
    assert.equal((await (await GET(request('meter-a'))).json()).messages.length,4);
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
    const invalidOrigin = new Request('http://localhost:3001/api/lumi/v1?meterId=meter-a',{method:'POST',headers:{origin:'https://untrusted.invalid'},body:JSON.stringify({action:'clear'})});
    assert.equal((await POST(invalidOrigin)).status,403);
    delete process.env.LUMI_SERVICE_SECRET;
    response=await GET(request('meter-a'));assert.equal(response.status,503);assert.equal((await response.json()).code,'CONFIGURATION_ERROR');
    identity=null;assert.equal((await GET(request('meter-a'))).status,401);
  } finally { child.kill(); await new Promise(r=>child.once('exit',r)); await rm(folder,{recursive:true,force:true}); }
});
