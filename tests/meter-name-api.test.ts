import test,{mock} from 'node:test';import assert from 'node:assert/strict';
const user='A';let selected='a';const names:Record<string,string>={a:'Oficina',b:'Mi taller'};const writes:string[]=[];
mock.module('../src/lib/api-auth.ts',{namedExports:{requireMeter:async()=>selected==='foreign'?new Response(null,{status:403}):({userId:user,meter:{deviceId:selected,name:names[selected],ownerId:selected==='a'?'A':'B',role:'central',areaLabel:null}}),isErrorResponse:(x:unknown)=>x instanceof Response,meterIdFrom:()=>selected}});
mock.module('../src/infrastructure/supabase-repositories.ts',{namedExports:{supabaseRepositories:{}}});
mock.module('../src/lib/meter-name.ts',{namedExports:{saveMeterName:async(owner:string,id:string,name:string)=>{assert.equal(owner,'A');assert.equal(id,'a');writes.push(id);names[id]=name;}}});
const route=await import('../src/app/api/meter/settings/route.ts');
const request=(body:unknown,origin='http://localhost')=>new Request('http://localhost/api/meter/settings',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('name persists separately from placement and cannot rename another owner or meter',async()=>{
 const r=await route.PUT(request({name:' Tablero central '}));assert.equal(r.status,200);assert.equal((await (await route.GET(new Request('http://localhost'))).json()).name,'Tablero central');assert.equal(names.b,'Mi taller');assert.deepEqual(writes,['a']);
 for(const body of [{name:''},{name:'x'.repeat(61)},{name:'a',role:'area'},{name:'a',userId:'B'},{name:'<bad>'}])assert.equal((await route.PUT(request(body))).status,400);
 assert.equal((await route.PUT(request({name:'otra'},'http://evil'))).status,403);
 selected='b';assert.equal((await route.PUT(request({name:'Otra'}))).status,403);selected='foreign';assert.equal((await route.PUT(request({name:'Otra'}))).status,403);assert.deepEqual(writes,['a']);
});
