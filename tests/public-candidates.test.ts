import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',S='00000000-0000-4000-8000-000000000002';
const J='20000000-0000-4000-8000-000000000001';
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const cv=(n=1,patch:any={})=>({id:id(n),user_id:S,status:'active',is_public:true,found_job:false,title:'Public CV',full_name:'Current public name',region_id:1,...patch});
const actor=()=>({user_id:A,lang:'ru',data:{account_session_version:3,active_role:'employer',worker_job_id:J,worker_resume_list:[{id:id(1),user_id:S,full_name:'OLD CACHED SECRET',title:'OLD CACHED TITLE'}],worker_district_resume_list:[cv()],worker_region_resume_list:[cv()],currentWorkerIndex:0}});
function reader(replies:any[]){const requests:any[]=[];const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{const req={url:new URL(String(input)),method:init?.method,body:init?.body?JSON.parse(init.body):null};requests.push(req);const value=replies.shift();assert.notEqual(value,undefined,'Unexpected query or weaker table fallback');const reply=typeof value==='function'?value(req):value;return new Response(JSON.stringify(reply.error||reply),{status:reply.error?500:200,headers:{'Content-Type':'application/json'}});}}});return{client,requests};}
for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {readPublicCandidates,readPublicCandidate,createCandidateOffer}=require(prefix+'public-candidates');
 const {TelegramBot}=require(prefix+'telegram-bot');
 function harness(replies:any[]){const h=reader(replies),bot:any=Object.create(TelegramBot.prototype),session:any=actor(),prompts:any[]=[],states:any[]=[];bot.supabase=h.client;bot.setSession=async(s:any,p:any)=>{Object.assign(s,p);states.push(p);};bot.sendPrompt=async(_c:any,_s:any,text:any,options:any)=>prompts.push({text,options});bot.getRegions=async()=>[];bot.getCategories=async()=>[];bot.buildResumeText=async(r:any)=>'Fresh CV: '+r.full_name;return{...h,bot,session,prompts,states};}
 test(`${name}: candidate search pages beyond a thousand rows with owner, job, epoch and region scope on every request`,async()=>{
  const replies=[...Array.from({length:6},(_,page)=>Array.from({length:200},(_,i)=>cv(page*200+i+1))),[]];
  const h=reader(replies),rows=await readPublicCandidates(h.client,actor(),J,1);assert.equal(rows.length,1200);assert.equal(h.requests.length,7);
  for(let i=0;i<h.requests.length;i++){const r=h.requests[i];assert.equal(r.url.pathname,'/rest/v1/rpc/ishdasiz_bot_candidates');assert.equal(r.body.p_user_id,A);assert.equal(r.body.p_session_version,3);assert.equal(r.body.p_job_id,J);assert.equal(r.body.p_region,1);assert.equal(r.body.p_page_size,200);assert.equal(r.body.p_after_id,i?id(i*200):null);assert.equal(r.body.p_resume_id,null);}
 });
 test(`${name}: national search is explicit and missing RPC never falls back to unrestricted resumes`,async()=>{
  const h=reader([[]]);assert.deepEqual(await readPublicCandidates(h.client,actor(),J),[]);assert.equal(h.requests[0].body.p_region,null);
  const fail=reader([{error:{code:'PGRST202'}}]);await assert.rejects(readPublicCandidates(fail.client,actor(),J));assert.equal(fail.requests.length,1);
 });
 test(`${name}: malformed, duplicate, unordered, private, draft, found-job and foreign-region rows reject the entire result`,async()=>{
  for(const reply of [[cv(1,{id:'bad'})],[cv(1,{user_id:null})],[cv(),cv()],[cv(2),cv(1)],[cv(1,{is_public:false})],[cv(1,{status:'draft'})],[cv(1,{found_job:true})],[cv(1,{region_id:2})]])await assert.rejects(readPublicCandidates(reader([reply]).client,actor(),J,1));
  const first=Array.from({length:200},(_,i)=>cv(i+1));await assert.rejects(readPublicCandidates(reader([first,[cv(100)]]).client,actor(),J));
 });
 test(`${name}: invalid actor, role, epoch, IDs and region are rejected before any database access`,async()=>{
  const h=reader([]);for(const session of [{...actor(),user_id:'bad'},{...actor(),data:{active_role:'job_seeker'}},{...actor(),data:{active_role:'employer',account_session_version:-1}}])await assert.rejects(readPublicCandidates(h.client,session,J));
  await assert.rejects(readPublicCandidates(h.client,actor(),'bad'));await assert.rejects(readPublicCandidates(h.client,actor(),J,-1));await assert.rejects(readPublicCandidate(h.client,actor(),J,'bad'));assert.equal(h.requests.length,0);
 });
 test(`${name}: direct card reads use the chosen resume ID and all search protections; absence is not a cached fallback`,async()=>{
  const h=reader([[cv()],[]]);assert.equal((await readPublicCandidate(h.client,actor(),J,id(1))).id,id(1));assert.equal(await readPublicCandidate(h.client,actor(),J,id(1)),null);
  assert.equal(h.requests[0].body.p_resume_id,id(1));assert.equal(h.requests[0].body.p_page_size,1);assert.equal(h.requests[0].body.p_session_version,3);
  for(const data of [[cv(2)],[cv(),cv(2)],[cv(1,{is_public:false})]])await assert.rejects(readPublicCandidate(reader([data]).client,actor(),J,id(1)));
 });
 test(`${name}: invitation RPC pins the recipient and only a complete confirmed result counts as success`,async()=>{
  const result={id:id(99),resume_id:id(1),seeker_user_id:S,created:true,job:{id:J,title_ru:'Job'}};
  const h=reader([result]);assert.deepEqual(await createCandidateOffer(h.client,actor(),J,id(1),S),result);assert.deepEqual(h.requests[0].body,{p_user_id:A,p_session_version:3,p_job_id:J,p_resume_id:id(1),p_expected_seeker:S});
  for(const reply of [{error:{code:'42501'}},{...result,created:null},{...result,job:{id:id(1)}},{...result,resume_id:id(2)},{...result,seeker_user_id:A}])await assert.rejects(createCandidateOffer(reader([reply]).client,actor(),J,id(1),S));
 });
 test(`${name}: a hidden cached card clears all candidate selections and never renders cached identity or private coordinates`,async()=>{
  const h=harness([[]]);h.bot.buildResumeText=async()=>assert.fail('No hidden CV render');await h.bot.showEmployerResumeMatch(1,h.session,0);assert.equal(h.requests.length,1);assert.equal(h.session.data.worker_job_id,null);assert.deepEqual(h.session.data.worker_resume_list,[]);assert.deepEqual(h.session.data.worker_region_resume_list,[]);assert.match(h.prompts[0].text,/недоступны/);assert.doesNotMatch(h.prompts[0].text,/CACHED SECRET/);
 });
 test(`${name}: current candidate cards never read a private seeker profile or geolocation`,async()=>{
  const h=harness([[cv()],[]]);await h.bot.showEmployerResumeMatch(1,h.session,0);assert.equal(h.requests.length,2);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_bot_candidates');assert.equal(h.requests[1].url.pathname,'/rest/v1/job_offers');assert.equal(h.requests[1].url.searchParams.get('employer_user_id'),'eq.'+A);assert.equal(h.requests[1].url.searchParams.get('seeker_user_id'),'eq.'+S);assert.equal(h.session.data.currentWorkerIndex,0);assert.equal(h.session.data.offer_confirmation,null);assert.ok(h.requests.every(r=>!r.url.pathname.includes('job_seeker_profiles')));
 });
 test(`${name}: the real CV renderer uses only contacts written on that resume`,async()=>{
  const h=harness([]);delete h.bot.buildResumeText;const text=await h.bot.buildResumeText(cv(1,{phone:'+998901111111',telegram:'public_cv'}),'ru');assert.match(text,/@public_cv/);assert.match(text,/998901111111/);assert.equal(h.requests.length,0);
  const without=await h.bot.buildResumeText(cv(),'ru');assert.doesNotMatch(without,/Telegram/);assert.equal(h.requests.length,0);
 });
 test(`${name}: invitation confirmation refreshes the candidate and pins the account, vacancy, CV and recipient`,async()=>{
  const h=harness([[cv()]]);await h.bot.handleOfferAction(1,'confirm','',h.session);assert.equal(h.bot.isFlowSensitiveCallbackAction('offer'),true);assert.deepEqual(h.session.data.offer_confirmation,{owner:A,job_id:J,resume_id:id(1),seeker_user_id:S});assert.match(h.prompts[0].text,/Current public name/);assert.doesNotMatch(h.prompts[0].text,/CACHED SECRET/);
  const hidden=harness([[]]);await hidden.bot.handleOfferAction(1,'confirm','',hidden.session);assert.equal(hidden.session.data.worker_job_id,null);assert.equal(hidden.session.data.offer_confirmation,null);assert.doesNotMatch(hidden.prompts[0].text,/CACHED SECRET/);
 });
 test(`${name}: missing or changed confirmation never sends an invitation`,async()=>{
  for(const confirmation of [undefined,{owner:A,job_id:J,resume_id:id(2),seeker_user_id:S},{owner:S,job_id:J,resume_id:id(1),seeker_user_id:S},{owner:A,job_id:id(99),resume_id:id(1),seeker_user_id:S}]){const h=harness([]);h.session.data.offer_confirmation=confirmation;await h.bot.sendJobOfferToCurrentCandidate(1,h.session);assert.equal(h.requests.length,0);assert.equal(h.prompts.length,1);}
 });
 test(`${name}: successful sends mark all lists only after RPC and notification failure cannot undo them`,async()=>{
  const h=harness([{id:id(99),resume_id:id(1),seeker_user_id:S,created:true,job:{id:J}}]);h.session.data.offer_confirmation={owner:A,job_id:J,resume_id:id(1),seeker_user_id:S};let notices=0;h.bot.notifySeekerAboutOffer=async()=>{notices++;throw Error('Synthetic Telegram outage');};await h.bot.sendJobOfferToCurrentCandidate(1,h.session);assert.equal(h.requests.length,1);assert.equal(notices,1);for(const key of ['worker_resume_list','worker_district_resume_list','worker_region_resume_list'])assert.equal(h.session.data[key][0].offer_sent,true);assert.equal(h.session.data.offer_confirmation,null);assert.match(h.prompts[0].text,/Приглашение отправлено/);
 });
 test(`${name}: retrying an existing offer does not notify twice; rejected RPC never displays success`,async()=>{
  const done=harness([{id:id(99),resume_id:id(1),seeker_user_id:S,created:false,job:{id:J}}]);done.session.data.offer_confirmation={owner:A,job_id:J,resume_id:id(1),seeker_user_id:S};done.bot.notifySeekerAboutOffer=async()=>assert.fail('No duplicate notification');await done.bot.sendJobOfferToCurrentCandidate(1,done.session);assert.match(done.prompts[0].text,/уже отправлено/);
  const fail=harness([{error:{code:'42501'}}]);fail.session.data.offer_confirmation={owner:A,job_id:J,resume_id:id(1),seeker_user_id:S};fail.bot.notifySeekerAboutOffer=async()=>assert.fail('No notification after rejected write');await fail.bot.sendJobOfferToCurrentCandidate(1,fail.session);assert.equal(fail.requests.length,1);assert.match(fail.prompts[0].text,/недоступны/);assert.doesNotMatch(fail.prompts[0].text,/✅/);
 });
 test(`${name}: matching uses vacancy location and a missing district shows regional results directly`,async()=>{
  const h=harness([[cv(1,{district_id:10})],[]]);h.bot.sendSeriousSticker=async()=>{};h.bot.applyAiRerankToResumeMatches=async()=>[];h.bot.getDistrictNameById=async()=>null;h.bot.getRegionNameById=async()=>null;h.bot.saveMatchRecommendations=async()=>{};h.bot.getTitleOverlapScore=()=>1;h.bot.tokenizeTitle=()=>[];h.bot.showEmployerResumeMatch=async()=>{};
  await h.bot.showMatchingResumesForJob(1,h.session,{id:J,employer_id:A,region_id:1,category_ids:[],title_ru:'Public CV',is_active:true,status:'active'});assert.equal(h.requests.length,2);assert.equal(h.requests[0].body.p_region,1);assert.equal(h.session.data.worker_scope,'region');assert.equal(h.session.data.worker_resume_list.length,1);
 });
 test(`${name}: empty or failed new searches discard previous candidates and invitation confirmation before ranking`,async()=>{
  for(const reply of [[],{error:{code:'08006'}}]){const h=harness([reply]);h.session.data.offer_confirmation={owner:A,job_id:J,resume_id:id(1),seeker_user_id:S};h.bot.sendSeriousSticker=async()=>{};h.bot.applyAiRerankToResumeMatches=async()=>assert.fail('No ranking after an empty/failed search');await h.bot.showMatchingResumesForJob(1,h.session,{id:J,region_id:1,title_ru:'Public CV'});assert.deepEqual(h.session.data.worker_resume_list,[]);assert.equal(h.session.data.worker_job_id,null);assert.equal(h.session.data.offer_confirmation,null);assert.equal(h.requests.length,1);}
 });
 if(name==='site'){
  test('site: automatic recommendations recheck a now-hidden candidate before private metadata or persistence',async()=>{
   const h=harness([[cv()],[],{error:{code:'42501'}}]);h.bot.normalizeJob=(j:any)=>j;let ranked=0;h.bot.saveMatchRecommendations=async()=>ranked++;h.bot.getUserTelegramMeta=async()=>assert.fail('No hidden candidate metadata');await h.bot.autoMatchAndNotifyOnPublish({id:J,title_ru:'Public CV',region_id:1},h.session);assert.equal(ranked,1);assert.equal(h.requests.length,3);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_bot_candidates');assert.equal(h.requests[2].url.pathname,'/rest/v1/rpc/ishdasiz_auto_match_store');
  });
  test('site: a failed recommendation write cannot silently manufacture an employer invitation',async()=>{
   const h=harness([[cv()],[],{error:{code:'42P01'}}]);h.bot.normalizeJob=(j:any)=>j;h.bot.saveMatchRecommendations=async()=>{};h.bot.getUserTelegramMeta=async()=>({telegramId:42,lang:'ru'});await h.bot.autoMatchAndNotifyOnPublish({id:J,title_ru:'Public CV',region_id:1},h.session);assert.equal(h.requests.length,3);assert.equal(h.requests[2].url.pathname,'/rest/v1/rpc/ishdasiz_auto_match_store');assert.ok(!h.requests.some(r=>r.url.pathname.includes('job_offers')));
  });
 }
}
