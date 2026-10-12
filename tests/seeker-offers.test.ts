import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const S='00000000-0000-4000-8000-000000000001',T='00000000-0000-4000-8000-000000000002';
const J='10000000-0000-4000-8000-000000000001',R='20000000-0000-4000-8000-000000000001';
const id=(n:number)=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0');
const DATE='2026-10-10T00:00:00.123456Z';
const actor=()=>({user_id:S,lang:'ru',data:{active_role:'job_seeker',account_session_version:3,last_prompt_message_id:77}});
const row=(n=1,extra:any={})=>({id:id(n),job_id:J,seeker_user_id:S,status:'sent',created_at:DATE,seen_at:null,job_available:true,job:{id:J,title_ru:'Current vacancy',company_name:'Current company'},...extra});
const full=(extra:any={})=>({...row(),message:'Hello <candidate>',resume_id:R,resume:{id:R,user_id:S,status:'active',found_job:false,title:'Exact CV'},job:{id:J,title_ru:'Current vacancy',company_name:'Current company',is_active:true,status:'active',source:'local',description_ru:'Public description'},...extra});
function reader(replies:any[]){const requests:any[]=[];const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{const request={url:new URL(String(input)),body:init?.body?JSON.parse(init.body):null};requests.push(request);assert(replies.length,'Unexpected table fallback/query');const next=replies.shift();const result=typeof next==='function'?next(request):next;return new Response(JSON.stringify(result?.error||result),{status:result?.error?500:200,headers:{'Content-Type':'application/json'}});}}});return{client,requests};}
for(const[name,prefix]of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']]as const){
 const {readSeekerOffers,readSeekerOffer,markSeekerOfferSeen}=require(prefix+'seeker-offers');
 const {TelegramBot}=require(prefix+'telegram-bot');const keyboards=require(prefix+'keyboards');
 function harness(replies:any[]){const h=reader(replies),bot:any=Object.create(TelegramBot.prototype),session:any=actor(),prompts:any[]=[],states:any[]=[];bot.supabase=h.client;bot.setSession=async(s:any,p:any)=>{Object.assign(s,p);states.push(p);};bot.updateSession=async()=>{};bot.sendPrompt=async(_c:any,_s:any,text:any,options:any)=>prompts.push({text,options});bot.normalizeJob=(j:any)=>j;bot.buildResumeJobMatchBlock=(cv:any)=>'Match for '+cv.title;return{...h,bot,session,prompts,states};}
 test(`${name}: pages always send the canonical recipient, current epoch and precise keyset, without table fallbacks`,async()=>{
  const cursor={id:id(20),created_at:DATE},h=reader([{items:[row(19)],next_cursor:null}]);const result=await readSeekerOffers(h.client,actor(),cursor);assert.equal(result.items[0].id,id(19));assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_seeker_offers');assert.deepEqual(h.requests[0].body,{p_user_id:S,p_session_version:3,p_after_created:DATE,p_after_id:id(20),p_page_size:10});
 });
 test(`${name}: microsecond ordering and null-date continuation retain precise history`,async()=>{
  const h=reader([{items:[row(1,{created_at:'2026-10-10T00:00:00.123457Z'}),row(2)],next_cursor:null}]);assert.equal((await readSeekerOffers(h.client,actor())).items.length,2);
  const n=reader([{items:[row(1,{created_at:null})],next_cursor:null}]);await readSeekerOffers(n.client,actor(),{id:id(2),created_at:null});assert.equal(n.requests[0].body.p_after_created,null);assert.equal(n.requests[0].body.p_after_id,id(2));
 });
 test(`${name}: invalid identities, roles, epochs and cursors never issue a database request`,async()=>{
  const h=reader([]);for(const a of [{...actor(),user_id:'bad'},{...actor(),data:{active_role:'employer'}},{...actor(),data:{active_role:'job_seeker',account_session_version:-1}}])await assert.rejects(readSeekerOffers(h.client,a));
  for(const cursor of [{id:'bad',created_at:DATE},{id:id(2),created_at:'injected'}])await assert.rejects(readSeekerOffers(h.client,actor(),cursor));await assert.rejects(readSeekerOffer(h.client,actor(),'bad'));assert.equal(h.requests.length,0);
 });
 test(`${name}: foreign, duplicate, unordered and inconsistent availability pages reject the whole result`,async()=>{
  for(const items of [[row(1,{seeker_user_id:T})],[row(),row()],[row(1),row(2)],[row(1,{job_available:false})],[row(1,{job:{id:R}})]])await assert.rejects(readSeekerOffers(reader([{items,next_cursor:null}]).client,actor()));
  await assert.rejects(readSeekerOffers(reader([{items:[row()],next_cursor:{id:id(99),created_at:DATE}}]).client,actor()));
 });
 test(`${name}: outages never weaken the query or masquerade as an empty invitation list`,async()=>{
  const h=harness([{error:{code:'PGRST202',message:'PRIVATE'}}]);await h.bot.showSeekerOffers(1,h.session);assert.equal(h.requests.length,1);assert.match(h.prompts[0].text,/Не удалось/);assert.doesNotMatch(h.prompts[0].text,/нет приглашений|PRIVATE/);assert.equal(h.states.length,0);
 });
 test(`${name}: pagination stores only cursors, and older records are reachable with bounded callback data`,async()=>{
  const items=Array.from({length:10},(_,n)=>row(20-n)),cursor={id:id(11),created_at:DATE};const h=harness([{items,next_cursor:cursor},{items:[row(10)],next_cursor:null}]);await h.bot.showSeekerOffers(1,h.session);assert.equal(h.session.data.seeker_offers_list,null);assert.deepEqual(h.session.data.seeker_offer_cursors,[null,cursor]);await h.bot.handleOfferAction(1,'page','1',h.session);assert.equal(h.requests[1].body.p_after_id,id(11));assert.match(h.prompts[1].text,/Страница 2/);
  const markup=JSON.stringify(h.prompts[0].options.replyMarkup);assert.match(markup,/offer:page:1/);for(const r of h.prompts[0].options.replyMarkup.inline_keyboard)for(const b of r)if(b.callback_data)assert(Buffer.byteLength(b.callback_data)<=64);
 });
 test(`${name}: failed subsequent pages retain navigation and stale page buttons cannot query arbitrary positions`,async()=>{
  const h=harness([{error:{code:'08006'}}]);h.session.data={...h.session.data,seeker_offer_owner:S,seeker_offer_epoch:3,seeker_offer_cursors:[null,{id:id(2),created_at:DATE}],seeker_offer_page:0};const before=JSON.stringify(h.session.data);await h.bot.showSeekerOffers(1,h.session,1);assert.equal(JSON.stringify(h.session.data),before);await h.bot.showSeekerOffers(1,h.session,50);assert.equal(h.requests.length,1);assert.match(h.prompts[1].text,/устарела/);
 });
 test(`${name}: matching uses only the invitation's own active CV, with no archived, found-job or substitute queries`,async()=>{
  const h=harness([]);assert.equal(await h.bot.buildOfferMatchBlock(h.session,{id:J},'ru'),null);for(const cv of [{user_id:T,status:'active',found_job:false},{user_id:S,status:'archived',found_job:false},{user_id:S,status:'active',found_job:true}])assert.equal(await h.bot.buildOfferMatchBlock(h.session,{id:J},'ru',cv),null);assert.equal(await h.bot.buildOfferMatchBlock(h.session,{id:J},'ru',{user_id:S,status:'active',found_job:false,title:'Exact CV'}),'Match for Exact CV');assert.equal(h.requests.length,0);
 });
 test(`${name}: opening an invitation renders fresh escaped content and marks it read only after confirmed content delivery`,async()=>{
  const h=harness([full(),{id:id(1),seeker_user_id:S,seen_at:DATE}]);let rendered=false;h.bot.sendPrompt=async(_c:any,_s:any,text:any,options:any)=>{rendered=true;h.prompts.push({text,options});};await h.bot.showSeekerOfferDetail(1,id(1),h.session);assert(rendered);assert.equal(h.requests.length,2);assert.equal(h.requests[1].url.pathname,'/rest/v1/rpc/ishdasiz_seeker_offer_seen');assert.match(h.prompts[0].text,/Match for Exact CV/);assert.match(h.prompts[0].text,/&lt;candidate&gt;/);assert.equal(h.prompts[0].options.requireContentDelivery,true);assert.match(JSON.stringify(h.prompts[0].options.replyMarkup),/apply:/);
 });
 test(`${name}: failed content delivery never sends a read receipt`,async()=>{
  const h=harness([full()]);h.bot.sendPrompt=async()=>{throw Error('Synthetic delivery failure');};await assert.rejects(h.bot.showSeekerOfferDetail(1,id(1),h.session));assert.equal(h.requests.length,1);
 });
 test(`${name}: unconfirmed read receipts do not fabricate success or rewrite offer status`,async()=>{
  const h=harness([full(),{error:{code:'42501'}}]);await h.bot.showSeekerOfferDetail(1,id(1),h.session);assert.equal(h.prompts.length,1);assert.equal(h.requests.length,2);assert.equal(h.requests[1].body.p_user_id,S);assert.equal(h.requests[1].body.p_session_version,3);assert(!('status'in h.requests[1].body));
 });
 test(`${name}: foreign IDs and legacy job-only notifications require an actual invitation and cannot claim one from a public job`,async()=>{
  const h=harness([null]);await h.bot.handleOfferJobView(1,J,h.session);assert.equal(h.requests[0].body.p_offer_id,null);assert.equal(h.requests[0].body.p_job_id,J);assert.equal(h.requests.length,1);assert.match(h.prompts[0].text,/недоступно/);assert.doesNotMatch(h.prompts[0].text,/Вы приглашены/);
 });
 test(`${name}: unavailable vacancies remain in invitation history without an apply button, current contacts or a substitute score`,async()=>{
  const h=harness([full({job_available:false,job:null,resume:null,resume_id:null,seen_at:DATE})]);h.bot.buildResumeJobMatchBlock=()=>assert.fail('No score for unavailable job');await h.bot.showSeekerOfferDetail(1,id(1),h.session);assert.match(h.prompts[0].text,/сохранено в истории/);assert.doesNotMatch(JSON.stringify(h.prompts[0].options.replyMarkup),/apply:|https:\/\/ishdasiz/);assert.equal(h.requests.length,1);
 });
 test(`${name}: large descriptions and employer notes keep the notification bounded and preserve the full vacancy link`,async()=>{
  const value=full({message:'Large '.repeat(2000)});value.job.description_ru='Description '.repeat(2000);const h=harness([value,{id:id(1),seeker_user_id:S,seen_at:DATE}]);await h.bot.showSeekerOfferDetail(1,id(1),h.session);assert(h.prompts[0].text.length<3800);assert.match(JSON.stringify(h.prompts[0].options.replyMarkup),new RegExp('https://ishdasiz.uz/jobs/'+J));
 });
 test(`${name}: notification views remain usable after another menu, while invitation confirmation still rejects stale messages`,()=>{
  const h=harness([]);assert.equal(h.bot.shouldIgnoreStaleCallback(h.session,'offer',10,'view'),false);assert.equal(h.bot.shouldIgnoreStaleCallback(h.session,'offer',10,'confirm'),true);assert.equal(h.bot.isHighRiskCallbackAction('offer'),true);
 });
 test(`${name}: receipt helper rejects foreign, empty and missing acknowledgements`,async()=>{
  for(const value of [{id:id(1),seeker_user_id:T,seen_at:DATE},{id:id(1),seeker_user_id:S,seen_at:null},null])await assert.rejects(markSeekerOfferSeen(reader([value]).client,actor(),id(1)));
  await assert.rejects(readSeekerOffer(reader([full({resume:{id:R,user_id:T,status:'active',found_job:false}})]).client,actor(),id(1)));
 });
 test(`${name}: strict Telegram content delivery does not retry an uncertain send or mark the invitation read`,async()=>{
  const h=harness([full(),[]]);delete h.bot.sendPrompt;const fetchBefore=globalThis.fetch,tokenBefore=process.env.TELEGRAM_BOT_TOKEN;let sends=0;process.env.TELEGRAM_BOT_TOKEN='123456:synthetic-test-token';process.env.TELEGRAM_DRY_RUN='0';
  globalThis.fetch=async()=>{sends++;throw Error('synthetic uncertain network error');};
  try{await assert.rejects(h.bot.showSeekerOfferDetail(1,id(1),h.session),/delivery failed/);assert.equal(sends,1);assert.equal(h.requests.length,2);assert(h.requests.every(r=>!r.url.pathname.includes('offer_seen')));}
  finally{globalThis.fetch=fetchBefore;process.env.TELEGRAM_DRY_RUN='1';if(tokenBefore===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=tokenBefore;}
 });
 test(`${name}: invitation keyboard labels are bounded and public links use only validated UUIDs`,()=>{
  const page:any=keyboards.seekerOffersKeyboard('uz',[{id:id(1),title:'Very long '.repeat(100),company:'Company',isUnread:true}],{page:1,hasNext:true});assert(Array.from(page.inline_keyboard[0][0].text).length<=90);const invalid=keyboards.seekerOfferViewKeyboard('ru',id(1),'javascript:bad',true);assert(!JSON.stringify(invalid).includes('javascript:'));assert(!JSON.stringify(invalid).includes('apply:'));
 });
 test(`${name}: an empty Telegram success response is not sufficient to mark an invitation read`,async()=>{
  const h=harness([full(),[]]);delete h.bot.sendPrompt;const fetchBefore=globalThis.fetch,tokenBefore=process.env.TELEGRAM_BOT_TOKEN;let sends=0;process.env.TELEGRAM_BOT_TOKEN='123456:synthetic-test-token';process.env.TELEGRAM_DRY_RUN='0';
  globalThis.fetch=async()=>{sends++;return new Response(JSON.stringify({ok:true,result:{}}),{status:200});};
  try{await assert.rejects(h.bot.showSeekerOfferDetail(1,id(1),h.session),/delivery unconfirmed/);assert.equal(sends,1);assert.equal(h.requests.length,2);}
  finally{globalThis.fetch=fetchBefore;process.env.TELEGRAM_DRY_RUN='1';if(tokenBefore===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=tokenBefore;}
 });
}
