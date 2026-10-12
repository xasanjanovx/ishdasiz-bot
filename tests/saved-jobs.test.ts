import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {readSavedJobs,toggleSavedJob}=require(prefix+'saved-jobs');const {TelegramBot}=require(prefix+'telegram-bot');
 function harness(){const tables:any={favorites:[],jobs:[],users:[{id:A},{id:B}]},faults:any={},calls:any[]=[];
  const client:any={from:(table:string)=>{let start=0,size=Infinity;const filters:any[]=[];const q:any={select:()=>q,eq:(key:string,v:any)=>{filters.push((row:any)=>row[key]===v);return q;},in:(key:string,v:any[])=>{filters.push((row:any)=>v.includes(row[key]));return q;},or:()=>q,order:()=>q,range:(a:number,b:number)=>{start=a;size=b-a+1;return q;}};
   const run=()=>({data:faults[table]?null:(tables[table]||[]).filter((row:any)=>filters.every(fn=>fn(row))).slice(start,start+size),error:faults[table]||null});q.then=(resolve:any,reject:any)=>Promise.resolve(run()).then(resolve,reject);q.maybeSingle=async()=>{const r=run();return {...r,data:r.data?.[0]||null};};return q;},
   rpc:async(fn:string,args:any)=>{calls.push({fn,args});return {data:faults.rpc?null:args.p_favorite,error:faults.rpc||null};}};
  return {tables,faults,calls,client};
 }
 test(`${name}: RPC desired bookmark state carries the authenticated epoch and reports failed reads/writes`,async()=>{
  const h=harness();assert.equal(await toggleSavedJob(h.client,A,2,id(1)),true);assert.deepEqual(h.calls[0].args,{p_user_id:A,p_session_version:2,p_job_id:id(1),p_favorite:true});
  h.tables.favorites=[{id:id(5),user_id:A,job_id:id(1)}];assert.equal(await toggleSavedJob(h.client,A,2,id(1)),false);
  h.faults.favorites={code:'08006'};await assert.rejects(toggleSavedJob(h.client,A,2,id(1)));assert.equal(h.calls.length,2);
  delete h.faults.favorites;h.faults.rpc={code:'42501'};await assert.rejects(toggleSavedJob(h.client,A,2,id(1)));
 });
 test(`${name}: long saved lists preserve favorite order and filter hidden, filled and closed companies`,async()=>{
  const h=harness();h.tables.favorites=Array.from({length:1205},(_,i)=>({id:id(i+1),job_id:id(1205-i),user_id:A}));h.tables.favorites.push({id:id(1300),job_id:id(1300),user_id:B});
  h.tables.jobs=Array.from({length:1205},(_,i)=>({id:id(i+1),is_active:true,status:'active'}));h.tables.jobs[0].is_active=false;h.tables.jobs[1].status='draft';h.tables.jobs[2].source_status='filled';h.tables.jobs[3].employer_id='closed-company';h.tables.jobs[3].employer_profiles={user_id:B};h.tables.jobs[3].user_id=A;h.tables.users[1].closed_at='2026-10-07';
  const result=await readSavedJobs(h.client,A);assert.equal(result.hasSaved,true);assert.equal(result.jobs.length,1201);assert.equal(result.jobs[0].id,id(1205));assert.equal(result.jobs.at(-1).id,id(5));
 });
 test(`${name}: empty, unavailable and failed saved lists remain distinguishable`,async()=>{
  const h=harness();assert.deepEqual(await readSavedJobs(h.client,A),{hasSaved:false,jobs:[]});h.tables.favorites=[{job_id:id(1),user_id:A}];assert.deepEqual(await readSavedJobs(h.client,A),{hasSaved:true,jobs:[]});
  h.faults.favorites={code:'08006'};await assert.rejects(readSavedJobs(h.client,A));delete h.faults.favorites;h.faults.jobs={code:'08006'};await assert.rejects(readSavedJobs(h.client,A));
 });
 test(`${name}: bot callbacks never redraw the favorite as success after a failed write`,async()=>{
  const h=harness(),bot:any=Object.create(TelegramBot.prototype),prompts:string[]=[],shown:any[]=[];bot.supabase=h.client;bot.sendPrompt=async(_c:any,_s:any,text:string)=>prompts.push(text);bot.showJob=async(...args:any[])=>shown.push(args);h.faults.rpc={code:'08006'};
  const session={user_id:A,lang:'ru',data:{account_session_version:2,currentJobIndex:3}};await bot.handleFavorite(1,id(1),session);assert.equal(prompts.length,1);assert.equal(shown.length,0);
  delete h.faults.rpc;await bot.handleFavorite(1,id(1),session);assert.equal(shown[0][2],3);
 });
}
