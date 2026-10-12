import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-key';process.env.TELEGRAM_BOT_TOKEN='synthetic-token';
const {storeAutoMatch,recordAutoMatchDelivery,actOnAutoMatch}=require('../../ISHDASIZ NEW/lib/telegram/auto-matches');
const {TelegramBot}=require('../../ISHDASIZ NEW/lib/telegram/telegram-bot');
const A='00000000-0000-4000-8000-000000000001',S='00000000-0000-4000-8000-000000000002',J='20000000-0000-4000-8000-000000000001',R='10000000-0000-4000-8000-000000000001',M='30000000-0000-4000-8000-000000000001',T='40000000-0000-4000-8000-000000000001';
const employer=()=>({user_id:A,lang:'ru',data:{active_role:'employer',account_session_version:2}}),seeker=()=>({user_id:S,lang:'ru',data:{active_role:'job_seeker',account_session_version:3}});
const cv={id:R,user_id:S,title:'Accountant',region_id:1,district_id:10,category_id:M,status:'active',is_public:true,found_job:false,experience:'3_years',expected_salary_min:1000000};
const job={id:J,title_ru:'Accountant',region_id:1,district_id:10,category_id:M,salary_min:2000000,salary_max:3000000,is_active:true};
const card=(patch:any={})=>({id:M,user_id:S,job_id:J,resume_id:R,seeker_response:null,job,...patch});
const stored=(req:any,patch:any={})=>({...card(),match_score:req.body.p_score,lang:'ru',telegram_user_id:103,notification_token:req.body.p_token,...patch});
function reader(replies:any[]){const requests:any[]=[];const client=createClient('https://example.supabase.co','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{const req={url:new URL(String(input)),body:init?.body?JSON.parse(init.body):null};requests.push(req);const next=replies.shift();assert.notEqual(next,undefined,'Unexpected query or weak table fallback');const reply=typeof next==='function'?next(req):next;return new Response(JSON.stringify(reply?.error||reply),{status:reply?.error?500:200,headers:{'Content-Type':'application/json'}});}}});return{client,requests};}
function harness(replies:any[]){const h=reader(replies),bot:any=Object.create(TelegramBot.prototype),prompts:string[]=[];bot.supabase=h.client;bot.sendPrompt=async(_c:any,_s:any,text:string)=>prompts.push(text);bot.saveMatchRecommendations=async()=>{};bot.normalizeJob=(data:any)=>data;return{...h,bot,prompts};}
const originalFetch=global.fetch;afterEach(()=>{global.fetch=originalFetch;process.env.TELEGRAM_DRY_RUN='1';});
test('recommendation storage sends scoped actor, epoch, recipient and durable token without resetting response fields',async()=>{
 const h=reader([(req:any)=>stored(req)]),match=await storeAutoMatch(h.client,employer(),J,R,S,80,{region:true});assert.equal(match.id,M);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_auto_match_store');assert.equal(h.requests[0].body.p_user,A);assert.equal(h.requests[0].body.p_epoch,2);assert.equal(h.requests[0].body.p_recipient,S);assert.ok(h.requests[0].body.p_token);assert.ok(!('seeker_response' in h.requests[0].body));
});
test('malformed actor, recipient, score or returned notification token fails before sending',async()=>{
 const h=reader([]);await assert.rejects(storeAutoMatch(h.client,seeker(),J,R,S,80,{}));await assert.rejects(storeAutoMatch(h.client,employer(),J,R,'bad',80,{}));await assert.rejects(storeAutoMatch(h.client,employer(),J,R,S,101,{}));assert.equal(h.requests.length,0);
 for(const patch of [{user_id:A},{job:{id:R}},{notification_token:T},{telegram_user_id:-1},{notification_token:null,telegram_user_id:103}])await assert.rejects(storeAutoMatch(reader([(req:any)=>stored(req,patch)]).client,employer(),J,R,S,80,{}));
});
test('a missing recommendation RPC never falls back to invitations or a browser table write',async()=>{
 const h=harness([[cv],[],{error:{code:'PGRST202'}}]);await h.bot.autoMatchAndNotifyOnPublish(job,employer());assert.equal(h.requests.length,3);assert.equal(h.requests[2].url.pathname,'/rest/v1/rpc/ishdasiz_auto_match_store');
});
test('responses pin the seeker, epoch, recommendation and expected job; another owner is rejected',async()=>{
 const h=reader([card({seeker_response:'not_interested',job:null})]);await actOnAutoMatch(h.client,seeker(),M,'skip');assert.deepEqual(h.requests[0].body,{p_user:S,p_epoch:3,p_match:M,p_action:'skip',p_job:null});await assert.rejects(actOnAutoMatch(reader([card({user_id:A})]).client,seeker(),M,'view',J));
});
test('failed skips never show a success or update an unrelated offer/recommendation table',async()=>{
 const h=harness([{error:{code:'42501'}}]);await h.bot.handleAutoMatchAction(1,'skip',M,seeker());assert.match(h.prompts[0],/Не удалось/);assert.equal(h.requests.length,1);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_auto_match_action');
});
test('applying without a successful persisted application never records an interested response',async()=>{
 const h=harness([card()]);h.bot.handleJobApply=async()=>false;await h.bot.handleAutoMatchAction(1,'apply',J+':'+M,seeker());assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.p_action,'view');
});
test('a confirmed application is followed by a scoped response update rather than a blind multi-table write',async()=>{
 const h=harness([card(),card({seeker_response:'interested'})]);let submitted=false;h.bot.handleJobApply=async()=>{submitted=true;return true;};await h.bot.handleAutoMatchAction(1,'apply',J+':'+M,seeker());assert.equal(submitted,true);assert.deepEqual(h.requests.map(r=>r.body.p_action),['view','interested']);
});
test('malformed callbacks do not read a raw job or use a job ID as a fabricated recommendation ID',async()=>{
 for(const extra of ['',J+':',J+':'+M+':extra']){const h=harness([]);await h.bot.handleAutoMatchAction(1,'view',extra,seeker());assert.equal(h.requests.length,0);assert.match(h.prompts[0],/Не удалось/);}
});
test('unclaimed repeat recommendations send no duplicate notification',async()=>{
 const h=harness([[cv],[],(req:any)=>stored(req,{notification_token:null,telegram_user_id:null})]);global.fetch=async()=>assert.fail('No duplicate private notification');await h.bot.autoMatchAndNotifyOnPublish(job,employer());assert.equal(h.requests.length,3);
});
test('a reserved notification stores the real acknowledgement and uses fresh server job text',async()=>{
 const h=harness([[cv],[],(req:any)=>stored(req,{job:{id:J,title_ru:'Fresh <safe> title',company_name:'Company & Team'}}),true]);process.env.TELEGRAM_DRY_RUN='0';const sends:any[]=[];global.fetch=async(_url:any,init:any)=>{sends.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,result:{message_id:11}}),{status:200});};await h.bot.autoMatchAndNotifyOnPublish(job,employer());assert.equal(sends.length,1);assert.match(sends[0].text,/Fresh &lt;safe&gt; title/);assert.match(sends[0].text,/Company &amp; Team/);assert.equal(h.requests[3].body.p_outcome,'sent');assert.equal(h.requests[3].body.p_message,11);
});
test('an ambiguous notification failure performs one network request and durably records uncertainty',async()=>{
 const h=harness([[cv],[],(req:any)=>stored(req),true]);process.env.TELEGRAM_DRY_RUN='0';let calls=0;global.fetch=async()=>{calls++;throw new Error('connection lost');};await h.bot.autoMatchAndNotifyOnPublish(job,employer());assert.equal(calls,1);assert.equal(h.requests[3].body.p_outcome,'uncertain');
});
test('only a confirmed Telegram rejection is recorded as retryable',async()=>{
 const h=harness([[cv],[],(req:any)=>stored(req),true]);process.env.TELEGRAM_DRY_RUN='0';let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({ok:false,error_code:403,description:'Forbidden'}),{status:403});};await h.bot.autoMatchAndNotifyOnPublish(job,employer());assert.equal(calls,1);assert.equal(h.requests[3].body.p_outcome,'rejected');
});
test('unconfirmed delivery writes never count as a stored notification success',async()=>{
 const match={id:M,notification_token:T};for(const reply of [false,{error:{code:'08006'}}])await assert.rejects(recordAutoMatchDelivery(reader([reply]).client,match,'sent',11));const h=reader([]);await assert.rejects(recordAutoMatchDelivery(h.client,match,'sent',-1));assert.equal(h.requests.length,0);
});

for(const [name,prefix] of [['site','../../ISHDASIZ NEW/lib/telegram/'],['worker','../lib/telegram/']] as const){
 const {TelegramBot:Version}=require(prefix+'telegram-bot'),{autoMatchNotificationKeyboard}=require(prefix+'keyboards');
 test(name+': recommendation buttons fit Telegram callback limits in both languages',()=>{
  for(const lang of ['ru','uz']){const keyboard=autoMatchNotificationKeyboard(lang,M);for(const row of keyboard.inline_keyboard)for(const button of row){assert.ok(Buffer.byteLength(button.callback_data,'utf8')<=64);assert.match(button.callback_data,new RegExp('^automatch:(view|apply|skip):'+M+'$'));}}
 });
 test(name+': old notification buttons remain usable after another prompt without weakening ownership scope',async()=>{
  const h=reader([card()]),bot:any=Object.create(Version.prototype),session:any=seeker();session.data.last_prompt_message_id=999;bot.supabase=h.client;bot.normalizeJob=(x:any)=>x;bot.sendPrompt=async()=>{};
  assert.equal(bot.shouldIgnoreStaleCallback(session,'automatch',123),false);assert.equal(bot.isHighRiskCallbackAction('automatch'),true);await bot.handleAutoMatchAction(1,'view',M,session);assert.equal(h.requests[0].body.p_match,M);assert.equal(h.requests[0].body.p_job,null);
 });
}
