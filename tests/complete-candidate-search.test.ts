import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';

process.env.TELEGRAM_DRY_RUN='1';
process.env.TELEGRAM_BOT_TOKEN='synthetic-test-token';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',J='20000000-0000-4000-8000-000000000001';
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const cv=(n:number,patch:any={})=>({id:id(n),user_id:'30000000-0000-4000-8000-'+String(n).padStart(12,'0'),
 status:'active',is_public:true,found_job:false,full_name:'Fresh candidate '+n,title:'Бухгалтер',field_id:2,
 region_id:22,district_id:2202,district_name:'District 2',experience:'5_plus',
 phone:'CV CONTACT',about:'LONG CV BODY',...patch});
const actor=()=>({telegram_user_id:10,user_id:A,lang:'ru',data:{account_session_version:3,active_role:'employer',worker_job_id:J}});
function database(rows:any[],options:{cap?:number;failPage?:number;hidden?:boolean;afterPage?:()=>void}={}){
 const requests:any[]=[];
 const client=createClient('https://example.supabase.co','synthetic-test-key',{
  auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{
   const url=new URL(String(input)),body=init?.body?JSON.parse(init.body):null;
   requests.push({url,body,signal:init?.signal});
   if(url.pathname==='/rest/v1/job_offers')return new Response('[]',{headers:{'Content-Type':'application/json'}});
   assert.equal(url.pathname,'/rest/v1/rpc/ishdasiz_bot_candidates');
   assert.equal(body.p_user_id,A);assert.equal(body.p_session_version,3);assert.equal(body.p_job_id,J);
   if(requests.length===options.failPage)return new Response(JSON.stringify({code:'42501',message:'Synthetic policy denial'}),{status:403});
   const data=body.p_resume_id
    ?options.hidden?[]:rows.filter(r=>r.id===body.p_resume_id)
    :rows.filter(r=>(body.p_region===null||r.region_id===body.p_region)&&(!body.p_after_id||r.id>body.p_after_id))
     .sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Math.min(body.p_page_size,options.cap??200));
   options.afterPage?.();
   return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  }},
 });
 return{client,requests};
}
async function captureTelegram(run:()=>Promise<void>){
 const original=globalThis.fetch,messages:any[]=[];
 try{
  process.env.TELEGRAM_DRY_RUN='0';
  globalThis.fetch=async(input:any,init:any)=>{
   assert.match(String(input),/^https:\/\/api\.telegram\.org\/botsynthetic-test-token\/sendMessage$/);
   const message=JSON.parse(init.body);messages.push(message);
   return new Response(JSON.stringify({ok:true,result:{message_id:123,text:message.text}}),{headers:{'Content-Type':'application/json'}});
  };
  await run();return messages;
 }finally{globalThis.fetch=original;process.env.TELEGRAM_DRY_RUN='1';}
}

for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {TelegramBot}=require(prefix+'telegram-bot');
 const {readPublicCandidates}=require(prefix+'public-candidates');
 const {compactBotSearchData,publicCandidateSearchRow}=require(prefix+'candidate-search-state');
 function harness(rows:any[],options:Parameters<typeof database>[1]={}){
  const h=database(rows,options),bot:any=Object.create(TelegramBot.prototype),session:any=actor();
  const shown:any[]=[],prompts:any[]=[],aiSizes:number[]=[],saved:any[]=[];
  bot.supabase=h.client;bot.updateSession=async(_id:any,updates:any)=>saved.push(updates);
  bot.sendPrompt=async(_id:any,_s:any,text:string,options:any)=>prompts.push({text,options});
  bot.sendSeriousSticker=async()=>{};bot.getDistrictNameById=async()=> 'District';bot.getRegionNameById=async()=> 'Tashkent';
  bot.saveMatchRecommendations=async()=>{};
  bot.applyAiRerankToResumeMatches=async(_job:any,items:any[])=>{aiSizes.push(items.length);return[];};
  bot.showEmployerResumeMatch=async(_id:any,s:any,index:number)=>shown.push({data:s.data,index});
  bot.buildResumeText=async(r:any)=>'Fresh CV: '+r.full_name;
  return{...h,bot,session,shown,prompts,aiSizes,saved};
 }
 const job=(patch:any={})=>({id:J,title_ru:'Бухгалтер',field_id:2,region_id:22,district_id:null,is_active:true,status:'active',...patch});

 test(`${name}: all 1301 qualifying candidates survive the former 400 and 1000 cutoffs`,async()=>{
  const h=harness(Array.from({length:1301},(_,i)=>cv(i+1)));
  await h.bot.showMatchingResumesForJob(10,h.session,job());
  assert.equal(h.session.data.worker_resume_list.length,1301);
  assert.equal(h.session.data.worker_region_resume_list.length,1301);
  assert.equal(h.session.data.worker_resume_list.at(-1).id,id(1301));
  assert.deepEqual(h.aiSizes,[220],'Keep the existing AI input budget');
  assert.equal(h.requests.length,8);assert.equal(h.shown.length,1);
  assert.doesNotMatch(JSON.stringify(h.session.data),/Fresh candidate|CV CONTACT|LONG CV BODY|30000000-/);
  assert.equal(h.session.data.account_session_version,3);
  h.session.data.currentWorkerIndex=1299;await h.bot.handleWorkerNavigation(10,'next',h.session);
  assert.equal(h.shown.at(-1).index,1300);
 });

 test(`${name}: a suitable local candidate below the first 400 is still present in the district results`,async()=>{
  const rows=Array.from({length:1300},(_,i)=>cv(i+1,{education_level:'higher',expected_salary_min:3000000}));
  rows.push(cv(1301,{district_id:2201,district_name:'Local district',experience:'no_experience',education_level:'secondary',expected_salary_min:10000000}));
  const h=harness(rows);await h.bot.showMatchingResumesForJob(10,h.session,job({district_id:2201,experience:'3_5_years',education_level:'higher',salary_max:5000000}));
  assert.equal(h.session.data.worker_resume_list.length,1);
  assert.equal(h.session.data.worker_resume_list[0].id,id(1301));
  assert.equal(h.session.data.worker_scope,'district');
  assert.equal(h.session.data.worker_region_resume_list.length,1301);
  const region=h.session.data.worker_region_resume_list;
  assert.equal(region.at(-1).id,id(1301));assert.ok(region[0].score>region.at(-1).score);
 });

 test(`${name}: regional fallback counts and navigation retain the entire candidate list`,async()=>{
  const h=harness(Array.from({length:1301},(_,i)=>cv(i+1)));
  await h.bot.showMatchingResumesForJob(10,h.session,job({district_id:2201}));
  assert.deepEqual(h.session.data.worker_resume_list,[]);
  assert.equal(h.session.data.worker_region_resume_list.length,1301);
  assert.match(h.prompts.at(-1).text,/1301/);
  await h.bot.handleWorkerNavigation(10,'region',h.session);
  assert.equal(h.session.data.worker_resume_list.length,1301);assert.equal(h.shown.at(-1).index,0);
 });

 test(`${name}: server caps and the global deadline cannot turn a partial candidate search into success`,async()=>{
  const h=database(Array.from({length:305},(_,i)=>cv(i+1)),{cap:73});
  assert.equal((await readPublicCandidates(h.client,actor(),J,22,publicCandidateSearchRow)).length,305);
  assert.equal(h.requests.length,6);assert.ok(h.requests.every(r=>r.signal===h.requests[0].signal));
  const original=Date.now;let now=original();
  try{
   Date.now=()=>now;const timeout=database([cv(1)],{afterPage:()=>{now+=30001;}});
   await assert.rejects(readPublicCandidates(timeout.client,actor(),J),/timed out/);
   assert.equal(timeout.requests.length,1);
  }finally{Date.now=original;}
 });

 test(`${name}: policy denial on a later page clears old results and confirmation before ranking`,async()=>{
  const h=harness(Array.from({length:300},(_,i)=>cv(i+1)),{failPage:2});
  h.session.data.worker_resume_list=[cv(9999)];h.session.data.related_resume_list=[cv(9999)];
  h.session.data.offer_confirmation={owner:A,job_id:J,resume_id:id(9999)};
  await h.bot.showMatchingResumesForJob(10,h.session,job());
  assert.deepEqual(h.aiSizes,[]);assert.deepEqual(h.session.data.worker_resume_list,[]);
  assert.deepEqual(h.session.data.related_resume_list,[]);assert.equal(h.session.data.offer_confirmation,null);
  assert.equal(h.session.data.worker_job_id,null);assert.doesNotMatch(JSON.stringify(h.prompts),/Fresh candidate/);
 });

 test(`${name}: candidate state removes cached identity and contacts without truncating lists or losing authorization`,async()=>{
  const entries=Array.from({length:1301},(_,i)=>({...cv(i+1),score:90,offer_sent:i===0}));
  const data:any={...actor().data,worker_resume_list:entries,worker_district_resume_list:entries,
   worker_region_resume_list:entries,related_resume_list:entries,
   job_list:[{id:J,description_ru:'OLD JOB BODY'}],offer_confirmation:{owner:A,job_id:J,resume_id:id(1),seeker_user_id:entries[0].user_id}};
  const compact=compactBotSearchData(data);
  assert.deepEqual(compactBotSearchData(compact),compact);
  for(const key of ['worker_resume_list','worker_district_resume_list','worker_region_resume_list','related_resume_list']){
   assert.equal(compact[key].length,1301);assert.equal(compact[key][0].offer_sent,true);
   assert.doesNotMatch(JSON.stringify(compact[key]),/Fresh candidate|CV CONTACT|LONG CV BODY|user_id/);
  }
  assert.deepEqual(compact.offer_confirmation,data.offer_confirmation);assert.equal(compact.account_session_version,3);
  assert.equal(compact.job_list[0].description_ru,undefined);
  const h=harness([]);await h.bot.setSession(h.session,{data});assert.deepEqual(h.session.data,compact);
  const direct:any=Object.create(TelegramBot.prototype),writes:any[]=[];
  direct.supabase={from:(table:string)=>{assert.equal(table,'telegram_sessions');return{update:(updates:any)=>{
   writes.push(updates);return{eq:async()=>({error:null})};
  }};}};
  await direct.updateSession(10,{data});assert.deepEqual(writes[0].data,compact);
  assert.equal(data.worker_resume_list[0].full_name,'Fresh candidate 1');
 });

 test(`${name}: the last candidate opens by current ID and a now-hidden CV never falls back to cache`,async()=>{
  for(const hidden of [false,true]){
   const rows=Array.from({length:1301},(_,i)=>cv(i+1)),h=harness(rows,{hidden});
   h.session.data.worker_resume_list=rows.map((r:any)=>({id:r.id,score:90,full_name:'OLD CACHED SECRET'}));
   delete h.bot.showEmployerResumeMatch;
   const messages=await captureTelegram(()=>h.bot.showEmployerResumeMatch(10,h.session,1300));
   assert.equal(h.requests[0].body.p_resume_id,id(1301));
   if(hidden){assert.equal(messages.length,0);assert.deepEqual(h.session.data.worker_resume_list,[]);}
   else{assert.equal(messages.length,1);assert.match(messages[0].text,/Fresh candidate 1301/);assert.match(messages[0].text,/1301-1301\/1301/);}
   assert.doesNotMatch(JSON.stringify([...messages,...h.prompts]),/OLD CACHED SECRET/);
  }
 });

 test(`${name}: legacy related buttons open fresh paged candidates instead of cached-name keyboards`,async()=>{
  for(const hidden of [false,true]){
   const h=harness([cv(1)],{hidden});delete h.bot.showEmployerResumeMatch;
   h.session.data.related_resume_list=[{id:id(1),full_name:'OLD RELATED SECRET',title:'Old title',score:80}];
   const messages=await captureTelegram(()=>h.bot.showRelatedCandidates(10,h.session));
   assert.equal(h.requests[0].body.p_resume_id,id(1));
   assert.doesNotMatch(JSON.stringify([...messages,...h.prompts]),/OLD RELATED SECRET|Old title/);
   assert.deepEqual(h.session.data.related_resume_list,[]);
   if(hidden)assert.equal(messages.length,0);
   else{assert.match(messages[0].text,/Fresh candidate 1/);assert.ok(messages[0].reply_markup.inline_keyboard.length<8);}
  }
 });
}
