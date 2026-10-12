import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const U='00000000-0000-4000-8000-000000000001',APP='abcdef00-0000-4000-8000-000000000002',OTHER='00000000-0000-4000-8000-000000000003',J='00000000-0000-4000-8000-000000000004';
const stamp='2026-10-10T01:02:03.123456Z',actor={userId:U,role:'job_seeker',sessionVersion:5};
const snapshot=(patch:any={})=>({id:APP,status:'accepted',responded_at:stamp,...patch});
const app=(patch:any={})=>({...snapshot(),user_id:U,job_id:J,resume_id:OTHER,interview_date:'2026-10-12T10:30:00+05:00',jobs:{id:J,title_ru:'Оператор',title_uz:'Operator'},...patch});
function reader(replies:any[]){const requests:any[]=[];const client=createClient('https://example.supabase.co','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{requests.push({url:new URL(String(input)),method:init?.method||'GET',body:init?.body?JSON.parse(init.body):null});assert.ok(replies.length,'Unexpected fallback or write');const reply=replies.shift();return new Response(JSON.stringify(reply?.error||reply),{status:reply?.error?500:200,headers:{'Content-Type':'application/json'}});}}});return{client,requests};}

for(const [name,prefix] of [['worker','../lib/'],['site','../../ISHDASIZ NEW/lib/']] as const){
 const {markApplicationsRead}=require(prefix+'application-read'),{TelegramBot}=require(prefix+'telegram/telegram-bot');
 test(`${name}: one protected receipt carries current epoch and the exact original microsecond version`,async()=>{
  const h=reader([{seen:[APP],changed:[]}]);assert.deepEqual(await markApplicationsRead(h.client,actor,[snapshot({id:APP.toUpperCase(),phone:'Never send'})]),{seen:[APP],changed:[]});assert.equal(h.requests.length,1);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_application_seen');assert.deepEqual(h.requests[0].body,{p_user_id:U,p_session_version:5,p_snapshots:[snapshot()]});
 });
 test(`${name}: invalid role, epoch, duplicate IDs and malformed versions issue no database request`,async()=>{
  const h=reader([]);for(const bad of [{...actor,userId:'bad'},{...actor,role:'employer'},{...actor,sessionVersion:-1},{...actor,sessionVersion:1.5}])await assert.rejects(markApplicationsRead(h.client,bad,[snapshot()]));
  for(const rows of [[],null,[snapshot({responded_at:undefined})],[snapshot(),snapshot({id:APP.toUpperCase()})],Array.from({length:21},()=>snapshot())])await assert.rejects(markApplicationsRead(h.client,actor,rows));assert.equal(h.requests.length,0);
 });
 test(`${name}: changed versions are returned without pretending they were marked`,async()=>{
  const h=reader([{seen:[],changed:[APP]}]);assert.deepEqual(await markApplicationsRead(h.client,actor,[snapshot()]),{seen:[],changed:[APP]});assert.equal(h.requests.length,1);
 });
 test(`${name}: schema errors and malformed receipts never retry a direct table update`,async()=>{
  for(const reply of [{error:{code:'42883',message:'Private SQL'}},{seen:[OTHER],changed:[]},{seen:[APP],changed:[APP]},{seen:[],changed:[]},{seen:[APP],changed:null}]){const h=reader([reply]);await assert.rejects(markApplicationsRead(h.client,actor,[snapshot()]),e=>!String(e).includes('Private'));assert.equal(h.requests.length,1);}
 });
 function harness(replies:any[]){const h=reader(replies),bot:any=Object.create(TelegramBot.prototype),prompts:any[]=[],session:any={user_id:U,lang:'ru',data:{active_role:'job_seeker',account_session_version:5}};bot.supabase=h.client;bot.sendPrompt=async(_c:any,_s:any,text:any,options:any)=>prompts.push({text,options});bot.setSession=async(s:any,p:any)=>Object.assign(s,p);return{...h,bot,session,prompts};}
 test(`${name}: a seeker detail is acknowledged only after confirmed delivery of that decision`,async()=>{
  const h=harness([{id:OTHER},app(),{seen:[APP],changed:[]}]);let delivered=false;const original=h.bot.sendPrompt;h.bot.sendPrompt=async(...args:any[])=>{assert.equal(h.requests.length,2);await original(...args);assert.equal(args[3].requireContentDelivery,true);delivered=true;};await h.bot.showSeekerApplicationDetail(1,APP,h.session);assert.equal(delivered,true);assert.equal(h.requests.length,3);assert.deepEqual(h.requests[2].body,{p_user_id:U,p_session_version:5,p_snapshots:[snapshot()]});
 });
 test(`${name}: failed content delivery never marks the unseen decision read`,async()=>{
  const h=harness([{id:OTHER},app()]);h.bot.sendPrompt=async(_c:any,_s:any,_t:any,options:any)=>{assert.equal(options.requireContentDelivery,true);throw Error('Synthetic delivery failure');};await assert.rejects(h.bot.showSeekerApplicationDetail(1,APP,h.session),/Synthetic delivery failure/);assert.equal(h.requests.length,2);assert.ok(h.requests.every(r=>r.method==='GET'));
 });
 test(`${name}: a new employer response during delivery is kept unread and asks the seeker to reopen`,async()=>{
  const h=harness([{id:OTHER},app(),{seen:[],changed:[APP]}]);await h.bot.showSeekerApplicationDetail(1,APP,h.session);assert.equal(h.requests.length,3);assert.equal(h.prompts.length,2);assert.match(h.prompts[1].text,/успел измениться/);assert.equal(h.requests[2].body.p_snapshots[0].responded_at,stamp);
 });
 test(`${name}: a receipt failure keeps the delivered detail and does not claim successful acknowledgement`,async()=>{
  const h=harness([{id:OTHER},app(),{error:{code:'42501',message:'Private SQL'}}]);await h.bot.showSeekerApplicationDetail(1,APP,h.session);assert.equal(h.requests.length,3);assert.equal(h.prompts.length,1);assert.doesNotMatch(h.prompts[0].text,/Private|прочитан/);
 });
 test(`${name}: a pending application is delivered without hiding its future reviewed notification`,async()=>{
  const h=harness([{id:OTHER},app({status:'pending',responded_at:null})]);await h.bot.showSeekerApplicationDetail(1,APP,h.session);assert.equal(h.requests.length,2);assert.equal(h.prompts[0].options.requireContentDelivery,true);
 });
}
