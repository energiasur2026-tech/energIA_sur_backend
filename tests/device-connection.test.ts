import {mock,test} from 'node:test';
import assert from 'node:assert/strict';

let authorized=false;
const checked:string[]=[];
mock.module('../src/lib/api-auth.ts',{namedExports:{
  requireMeter:async()=>authorized?{meter:{deviceId:'owned'}}:new Response(null,{status:403}),
  isErrorResponse:(value:unknown)=>value instanceof Response,
}});
mock.module('../src/lib/tuya.ts',{namedExports:{
  getDeviceDetails:async(id:string)=>{checked.push(id);return {online:false,name:'Internal device label',category:'internal-category'};},
}});
const {GET}=await import('../src/app/api/meter/connection/route.ts');

test('connection check requires access and returns only Tuya online state',async()=>{
  const request=new Request('http://localhost/api/meter/connection?deviceId=owned');
  assert.equal((await GET(request)).status,403);
  assert.deepEqual(checked,[]);
  authorized=true;
  const result=await GET(request);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{online:false});
  assert.deepEqual(checked,['owned']);
});
