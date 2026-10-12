import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function split(value:string){let depth=0,start=0;const out:string[]=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&!depth){out.push(value.slice(start,i));start=i+1;}}out.push(value.slice(start));return out;}
function matches(row:any,clause:string):boolean{const group=clause.match(/^(and|or)\((.*)\)$/);if(group){const items=split(group[2]).map(item=>matches(row,item));return group[1]==='and'?items.every(Boolean):items.some(Boolean);}const m=clause.match(/^(\w+)\.(eq|lt|is)\.(.*)$/);if(!m)throw Error('Unexpected query');const [,key,op,value]=m;return op==='is'?(row[key]??null)===(value==='null'?null:value):op==='eq'?row[key]===value:row[key]!=null&&row[key]<value;}
for(const [name,prefix]of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']]as const){
 const {TelegramBot}=require(prefix+'telegram-bot'),{visibleSavedJobs}=require(prefix+'saved-jobs'),{readAllPublicJobs}=require(prefix+'public-jobs');
 function harness(){const rows:any[]=[],calls:any[]=[],rpcCalls:any[]=[];let result:any={total:1305,districts:{'100':1205,'200':100},categories:{[id(90)]:1305}},rpcError:any=null,failPage=0,repeat=false;
  const client:any={rpc:async(fn:string,args:any)=>{rpcCalls.push({fn,args});return {data:result,error:rpcError};},from:(table:string)=>{assert.equal(table,'jobs');const filters:any[]=[],orders:any[]=[],call:any={eq:[],limit:500};let expression:string|undefined;
   const q:any={abortSignal:()=>q,select:()=>q,eq:(key:string,value:any)=>{call.eq.push([key,value]);filters.push((row:any)=>row[key]===value);return q;},is:(key:string,value:any)=>{filters.push((row:any)=>(row[key]??null)===value);return q;},lt:(key:string,value:any)=>{filters.push((row:any)=>row[key]!=null&&row[key]<value);return q;},order:(key:string,opts:any)=>{orders.push({key,...opts});return q;},limit:(n:number)=>{call.limit=n;return q;},or:(value:string)=>{expression=value;call.or=value;return q;}};
   q.then=(resolve:any,reject:any)=>{calls.push(call);if(calls.length===failPage)return Promise.resolve({data:null,error:{code:'08006'}}).then(resolve,reject);let data=rows.filter(row=>filters.every(fn=>fn(row))).filter(row=>repeat||!expression||split(expression).some(s=>matches(row,s)));
    for(const {key,ascending,nullsFirst}of [...orders].reverse())data.sort((a,b)=>a[key]===b[key]?0:a[key]==null?(nullsFirst?-1:1):b[key]==null?(nullsFirst?1:-1):(a[key]>b[key]?1:-1)*(ascending===false?-1:1));
    return Promise.resolve({data:data.slice(0,Math.min(500,call.limit)),error:null}).then(resolve,reject);};return q;}};
  const bot:any=Object.create(TelegramBot.prototype);bot.supabase=client;
  return {bot,client,rows,calls,rpcCalls,setResult:(v:any)=>{result=v;},setRpcError:(v:any)=>{rpcError=v;},fail:(n:number)=>{failPage=n;},repeat:()=>{repeat=true;}};
 }
 test(`${name}: public bot counts use a scoped aggregate for the whole dataset without a table fallback`,async()=>{
  const h=harness();assert.deepEqual(await h.bot.getDistrictJobCounts(1),{'100':1205,'200':100});assert.deepEqual(await h.bot.getCategoryJobCounts(1,100),{[id(90)]:1305});assert.equal(await h.bot.safeActiveJobsCount(),1305);
  assert.deepEqual(h.rpcCalls.map(c=>c.args),[{p_region:1,p_district:null},{p_region:1,p_district:100},{p_region:null,p_district:null}]);assert.ok(h.rpcCalls.every(c=>c.fn==='ishdasiz_public_job_counts'));assert.equal(h.calls.length,0);
 });
 test(`${name}: empty counts are valid while RPC failures and malformed results stay unavailable`,async()=>{
  const h=harness();h.setResult({total:0,districts:{},categories:{}});assert.deepEqual(await h.bot.getDistrictJobCounts(1),{});assert.equal(await h.bot.safeActiveJobsCount(),0);
  for(const result of [null,{total:3,districts:{'100':4},categories:{}},{total:1,districts:[],categories:{}},{total:'0',districts:{},categories:{}},{total:1,districts:{'bad':1},categories:{}},{total:1,districts:{},categories:{bad:1}}]){h.setResult(result);await assert.rejects(h.bot.getCategoryJobCounts(1));assert.equal(await h.bot.safeActiveJobsCount(),null);}
  h.setRpcError({code:'PGRST202'});await assert.rejects(h.bot.getDistrictJobCounts(1));assert.equal(h.calls.length,0);
 });
 test(`${name}: public searches read every row through bounded keyset pages including equal and null dates`,async()=>{
  const h=harness();h.rows.push(...Array.from({length:1805},(_,i)=>({id:id(i+1),created_at:i<1205?'2026-10-09T00:00:00.123456Z':null,ishdasiz_job_available:true,region_id:1,district_id:100})),{id:id(2000),created_at:'2026-10-10T00:00:00Z',ishdasiz_job_available:false,region_id:1,district_id:100},{id:id(2001),created_at:null,ishdasiz_job_available:true,region_id:2,district_id:100});
  const rows=await readAllPublicJobs(h.client,{regionId:1,districtId:100});assert.equal(rows.length,1805);assert.equal(new Set(rows.map((row:any)=>row.id)).size,1805);assert.equal(rows[0].id,id(1205));assert.equal(rows.at(-1).id,id(1206));assert.ok(rows.some((row:any)=>row.created_at===null));assert.deepEqual(h.calls.map(c=>c.limit),Array(11).fill(200));
  assert.ok(h.calls.every(c=>c.eq.some(([key,value]:any[])=>key==='ishdasiz_job_available'&&value===true)&&c.eq.some(([key,value]:any[])=>key==='region_id'&&value===1)&&c.eq.some(([key,value]:any[])=>key==='district_id'&&value===100)));
 });
 test(`${name}: empty public search never reveals a hidden row and a failed later page never returns partial success`,async()=>{
  const h=harness();h.rows.push({id:id(1),ishdasiz_job_available:false});assert.deepEqual(await readAllPublicJobs(h.client),[]);assert.equal(h.calls.length,1);
  const failing=harness();failing.rows.push(...Array.from({length:600},(_,n)=>({id:id(n+1),created_at:null,ishdasiz_job_available:true})));failing.fail(2);await assert.rejects(readAllPublicJobs(failing.client));assert.equal(failing.calls.length,2);
 });
 test(`${name}: repeated pages and unsafe cursor values cannot loop or alter the public query`,async()=>{
  const h=harness();h.rows.push(...Array.from({length:600},(_,n)=>({id:id(n+1),created_at:'2026-10-09T00:00:00Z',ishdasiz_job_available:true})));h.repeat();await assert.rejects(readAllPublicJobs(h.client));assert.equal(h.calls.length,2);
  const bad=harness();bad.rows.push(...Array.from({length:500},(_,n)=>({id:id(n+1),created_at:'unsafe,or(...)',ishdasiz_job_available:true})));await assert.rejects(readAllPublicJobs(bad.client));assert.equal(bad.calls.length,1);
 });
 test(`${name}: invalid search bounds fail before any database request`,async()=>{
  const h=harness();for(const invalid of [0,-1,1.5,NaN]){await assert.rejects(readAllPublicJobs(h.client,{regionId:invalid}));await assert.rejects(readAllPublicJobs(h.client,{districtId:invalid}));}await assert.rejects(h.bot.getDistrictJobCounts(-1));assert.equal(h.calls.length+h.rpcCalls.length,0);
 });
 test(`${name}: saved job cards also hide every unavailable source state`,async()=>{
  const states=['filled','removed_at_source','archived','deleted','inactive','paused','on_hold','closed'];const rows=states.map(source_status=>({id:source_status,is_active:true,status:'active',source_status}));rows.push({id:'visible',is_active:true,status:'active',source_status:'active'});
  assert.deepEqual((await visibleSavedJobs({}as any,rows)).map((row:any)=>row.id),['visible']);
 });
}
