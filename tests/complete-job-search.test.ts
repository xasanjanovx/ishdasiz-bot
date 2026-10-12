import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';

process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const row=(n:number,patch:any={})=>({id:id(n),created_at:'2026-10-09T00:00:00Z',
 ishdasiz_job_available:true,region_id:1,district_id:100,title_ru:'Бухгалтер',
 field_id:1,raw_source_json:{source_body:'UNNEEDED BODY',phone:'PRIVATE PHONE'},...patch});
function database(rows:any[],options:{cap?:number;failPage?:number;repeat?:boolean;afterPage?:()=>void}={}){
 const requests:any[]=[];
 const client=createClient('https://example.supabase.co','synthetic-test-key',{
  auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{
   const url=new URL(String(input)),params=url.searchParams;
   requests.push({url,signal:init?.signal});
   assert.equal(url.pathname,'/rest/v1/jobs');
   if(requests.length===options.failPage)return new Response(JSON.stringify({code:'08006'}),{status:500});
   const cursor=params.get('or'),cursorId=cursor?.match(/id\.lt\.([^),]+)/)?.[1];
   const cursorDate=cursor?.match(/created_at\.lt\.([^),]+)/)?.[1];
   let data=rows.filter(r=>r.ishdasiz_job_available===true);
   for(const key of ['region_id','district_id'])if(params.has(key)){
    data=data.filter(r=>String(r[key])===params.get(key)!.slice(3));
   }
   if(!options.repeat){
    if(params.get('created_at')==='is.null')data=data.filter(r=>r.created_at==null&&r.id<params.get('id')!.slice(3));
    else if(cursorDate)data=data.filter(r=>r.created_at==null||r.created_at<cursorDate!||r.created_at===cursorDate&&r.id<cursorId!);
   }
   data=data.sort((a,b)=>a.created_at===b.created_at?b.id.localeCompare(a.id):a.created_at==null?1:b.created_at==null?-1:b.created_at.localeCompare(a.created_at));
   const result=data.slice(0,Math.min(Number(params.get('limit')),options.cap??200));
   options.afterPage?.();
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }},
 });
 return{client,requests};
}

for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {readAllPublicJobs,currentJobCard}=require(prefix+'public-jobs');
 const {compactJobSearchData,jobSearchCandidate,jobSearchReference,jobSearchRevision}=require(prefix+'job-search-state');
 const {matchAndSortJobs}=require(prefix+'job-matcher');
 const {TelegramBot,BotState}=require(prefix+'telegram-bot');

 test(`${name}: national pools include all 14 canonical regions and remote jobs while retaining local scopes`,async()=>{
  const {REGION_COORDINATES}=require(prefix+'../constants');
  const regions=Object.keys(REGION_COORDINATES).map(Number);
  assert.equal(regions.length,14);
  const rows=regions.map((regionId:number,i:number)=>row(i+1,{region_id:regionId,district_id:regionId*100+1}));
  rows.push(row(100,{region_id:22,district_id:2202}),row(101,{region_id:null,district_id:null,work_mode:'remote'}));
  rows.push(row(102,{region_id:22,district_id:2201,ishdasiz_job_available:false}));
  const h=database(rows),bot:any=Object.create(TelegramBot.prototype);bot.supabase=h.client;
  const pools=await bot.fetchJobSearchPools({lang:'ru'},2201,22);
  assert.equal(pools.broadJobs.length,16);
  assert.deepEqual([...new Set(pools.broadJobs.filter((r:any)=>r.region_id!==null).map((r:any)=>r.region_id))].sort(),regions.sort());
  assert.equal(pools.districtJobs.length,2);assert.equal(pools.regionJobs.length,3);
  assert.ok(pools.broadJobs.some((r:any)=>r.work_mode==='remote'&&r.region_id===null));
  assert.ok(h.requests.every(r=>!r.url.searchParams.has('region_id')&&!r.url.searchParams.has('district_id')));
 });

 test(`${name}: complete search passes old 1800 and 5000 limits and keeps legacy null dates`,async()=>{
  const rows=Array.from({length:6001},(_,i)=>row(i+1));
  rows.push(row(7000,{created_at:null}),row(7001,{ishdasiz_job_available:false}));
  const h=database(rows),result=await readAllPublicJobs(h.client);
  assert.equal(result.length,6002);
  assert.equal(new Set(result.map((r:any)=>r.id)).size,6002);
  assert.equal(result.at(-1).id,id(7000));
  assert.equal(h.requests.length,32);
  assert.ok(h.requests.every(r=>r.url.searchParams.get('limit')==='200'&&r.signal===h.requests[0].signal));
  assert.ok(h.requests[0].signal instanceof AbortSignal);
 });

 test(`${name}: a lower server row cap is not mistaken for the end of search`,async()=>{
  const h=database(Array.from({length:305},(_,i)=>row(i+1)),{cap:73});
  const result=await readAllPublicJobs(h.client,{regionId:1,districtId:100});
  assert.equal(result.length,305);assert.equal(h.requests.length,6);
  assert.ok(h.requests.every(r=>r.url.searchParams.get('region_id')==='eq.1'&&r.url.searchParams.get('district_id')==='eq.100'));
 });

 test(`${name}: partial failures, repeated pages and the overall deadline never return partial success`,async()=>{
  const rows=Array.from({length:250},(_,i)=>row(i+1));
  for(const options of [{failPage:2},{repeat:true}]){
   const h=database(rows,options);await assert.rejects(readAllPublicJobs(h.client));assert.equal(h.requests.length,2);
  }
  const originalNow=Date.now;let clock=originalNow();
  try{
   Date.now=()=>clock;
   const h=database(rows,{afterPage:()=>{clock+=30001;}});
   await assert.rejects(readAllPublicJobs(h.client),/timed out/);assert.equal(h.requests.length,1);
  }finally{Date.now=originalNow;}
 });

 test(`${name}: page projection retains every matcher input and drops imported bodies and contacts`,async()=>{
  const bot:any=Object.create(TelegramBot.prototype);
  const original=Array.from({length:16},(_,i)=>bot.normalizeJob(row(i+1,{
   title_ru:i%2?'Бухгалтер':'Сварщик',field_id:i%2?1:2,
   salary_min:3000000+i*100000,experience:i%3?'1_3_years':'no_experience',
   age_min:18,age_max:60,education_level:i%2?'higher':'secondary',
   gender:i%3?'any':'male',employment_type:'full_time',work_mode:i%2?'remote':'office',
   raw_source_json:{work_experiance:2,min_education:'higher',mmk_position:{id:i%2?1:2},
    source_body:'LARGE UNNEEDED BODY',phone:'PRIVATE PHONE'},
  }),'ru'));
  const profile={region_id:1,district_id:100,field_id:1,title:'Бухгалтер',
   birth_date:'1990-01-01',gender:'male',experience_level:'3_5_years',education_level:'higher'};
  const compact=original.map(jobSearchCandidate);
  const summary=(jobs:any[])=>matchAndSortJobs(profile,jobs).map((j:any)=>({
   id:j.id,score:j.matchScore,criteria:j.matchCriteria,conditional:j.conditionalReason,title:j.titleRelevance,
  }));
  assert.deepEqual(summary(compact),summary(original));
  assert.doesNotMatch(JSON.stringify(compact),/LARGE UNNEEDED BODY|PRIVATE PHONE/);
  for(const match of matchAndSortJobs(profile,compact)){
   const full=original.find((r:any)=>r.id===match.id);
   assert.equal(currentJobCard(full,jobSearchReference(match)).matchScore,match.matchScore);
  }
 });

 test(`${name}: search state keeps ordered references, availability revisions and account identity`,async()=>{
  const full=row(1,{description_ru:'PRIVATE BODY',contact_phone:'PRIVATE CONTACT',matchScore:90,matchCriteria:{salary:true}});
  const data:any={account_session_version:3,active_role:'job_seeker',active_resume_id:id(9000),
   job_list:[full,row(2)],auto_job_list:[full],region_job_list:[full],related_job_list:[full]};
  const compact=compactJobSearchData(data);
  assert.deepEqual(compactJobSearchData(compact),compact);
  assert.equal(compact.account_session_version,3);assert.equal(compact.active_resume_id,id(9000));
  assert.deepEqual(compact.job_list.map((r:any)=>r.id),[id(1),id(2)]);
  assert.doesNotMatch(JSON.stringify(compact),/PRIVATE BODY|PRIVATE CONTACT|UNNEEDED BODY|PRIVATE PHONE/);
  assert.equal(currentJobCard(full,compact.job_list[0]).matchScore,90);
  assert.equal(currentJobCard({...full,salary_min:1},compact.job_list[0]).matchScore,undefined);
  assert.equal(jobSearchRevision(full),jobSearchRevision({...full,matchScore:1}));
  const bot:any=Object.create(TelegramBot.prototype),saved:any[]=[];
  bot.updateSession=async(_id:any,updates:any)=>saved.push(updates);
  const session:any={telegram_user_id:10,data:{},state:BotState.MAIN_MENU};
  await bot.setSession(session,{data});
  assert.deepEqual(session.data,compact);assert.deepEqual(saved[0].data,compact);
  assert.equal(data.job_list[0].description_ru,'PRIVATE BODY');
  const directBot:any=Object.create(TelegramBot.prototype),writes:any[]=[];
  directBot.supabase={from:(table:string)=>{
   assert.equal(table,'telegram_sessions');
   return{update:(updates:any)=>{writes.push(updates);return{eq:async()=>({error:null})};}};
  }};
  await directBot.updateSession(10,{data});
  assert.deepEqual(writes[0].data,compact);
 });

 function botHarness(h:ReturnType<typeof database>){
  const bot:any=Object.create(TelegramBot.prototype),shown:any[]=[],prompts:string[]=[],saved:any[]=[];
  const resume={id:id(9000),region_id:1,district_id:100,field_id:2,field_title:'Сварщик',title:'Сварщик'};
  const session:any={telegram_user_id:10,user_id:id(9001),lang:'ru',state:BotState.MAIN_MENU,
   data:{active_role:'job_seeker',account_session_version:3,job_list:[row(9999)]}};
  bot.supabase=h.client;bot.loadOwnResume=async()=>resume;bot.maybeShowSoftSubscriptionPrompt=async()=>false;
  bot.clearLastJobArtifacts=async()=>{};bot.ensureResumeSearchCriteria=async()=>true;
  bot.getSeekerGeo=async()=>null;bot.getActiveOrLatestResume=async()=>resume;
  bot.applyAiRerankToMatchedJobs=async(_resume:any,matched:any[])=>matched;
  bot.updateSession=async(_id:any,updates:any)=>saved.push(updates);
  bot.sendPrompt=async(_id:any,_session:any,text:string)=>prompts.push(text);
  bot.showJob=async(_id:any,s:any,index:number)=>shown.push({data:s.data,index});
  return{bot,resume,session,shown,prompts,saved};
 }

 for(const method of ['resume','location'])test(`${name}: ${method} search finds an older suitable vacancy beyond 6000 rows`,async()=>{
  const rows=Array.from({length:6001},(_,i)=>row(i+1,i===0?{title_ru:'Сварщик',field_id:2}:{}));
  const h=database(rows),b=botHarness(h);
  if(method==='resume')await b.bot.startJobSearchByResume(10,b.session,b.resume);
  else await b.bot.searchJobsByLocation(10,b.session,{region_id:1,district_id:'100'});
  assert.equal(b.shown.length,1);
  assert.equal(b.session.data.job_list[0].id,id(1));
  assert.doesNotMatch(JSON.stringify(b.session.data.job_list),/Бухгалтер|UNNEEDED BODY|PRIVATE PHONE/);
  assert.equal(b.session.data.account_session_version,3);
  assert.equal(h.requests.length,32,'One complete traversal, not three capped traversals');
 });

 test(`${name}: interrupted searches clear old navigation and report unavailability in both languages`,async()=>{
  for(const method of ['resume','location'])for(const lang of ['ru','uz']){
   const h=database(Array.from({length:250},(_,i)=>row(i+1)),{failPage:2}),b=botHarness(h);
   b.session.lang=lang;
   if(method==='resume')await b.bot.startJobSearchByResume(10,b.session,b.resume);
   else await b.bot.searchJobsByLocation(10,b.session,{region_id:1,district_id:'100'});
   assert.equal(b.shown.length,0);assert.deepEqual(b.session.data.job_list,[]);
   assert.match(b.prompts.at(-1)!,lang==='ru'?/Не удалось завершить поиск/:/qidiruvini yakunlab/);
   assert.equal(b.session.data.account_session_version,3);
  }
 });
}
