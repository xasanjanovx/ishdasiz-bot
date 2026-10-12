import {test} from 'node:test';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const R='10000000-0000-4000-8000-000000000001';
const cv={id:R,title:'Synthetic CV',status:'active',is_public:true,post_to_channel:true,found_job:false,channel_account_open:true};
function reader(replies:any[]){const requests:any[]=[];const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{const req={url:new URL(String(input)),method:init?.method,body:init?.body?JSON.parse(init.body):null};requests.push(req);const reply=replies.shift();assert.notEqual(reply,undefined,'No direct publishing or unscoped table fallback');return new Response(JSON.stringify(reply),{status:200,headers:{'Content-Type':'application/json'}});}}});return{client,requests};}
for(const [name,prefix]of[['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']]as const){
 const {TelegramBot}=require(prefix+'telegram-bot');const {isJobActiveForChannel,isResumeActiveForChannel}=require(prefix+'channel-sync');const {readChannelSnapshot,removeChannelMessage}=require(prefix+'channel-state');
 test(`${name}: channel predicates require explicit consent and current account/source availability`,()=>{
  assert.equal(isResumeActiveForChannel(cv),true);for(const patch of [{post_to_channel:null},{post_to_channel:undefined},{post_to_channel:false},{found_job:true},{found_job:undefined},{status:null},{status:'draft'},{is_public:false},{channel_account_open:false},{channel_account_open:undefined}])assert.equal(isResumeActiveForChannel({...cv,...patch}),false);
  const job={is_active:true,status:'active',channel_account_open:true};for(const status of ['active','published','open',null])assert.equal(isJobActiveForChannel({...job,status}),true);for(const source_status of ['filled','removed_at_source','closed'])assert.equal(isJobActiveForChannel({...job,source_status}),false);assert.equal(isJobActiveForChannel({...job,channel_account_open:undefined}),false);
 });
 test(`${name}: bot publication reads fresh eligibility and leaves sending and receipts to the common queue`,async()=>{
  const h=reader([{available:true,entity:cv,region_slug:'andijon-viloyati'},{available:true,entity:{id:R,channel_account_open:true,is_active:true,status:'active'},region_slug:'andijon-viloyati'}]),bot:any=Object.create(TelegramBot.prototype);bot.supabase=h.client;bot.getRegions=async()=>assert.fail('No cached region publication');
  const resume=await bot.publishResumeToRegionChannel(R,cv,true),job=await bot.publishJobToRegionChannel(R,{});assert.equal(h.requests.length,2);assert.ok(h.requests.every(r=>r.url.pathname==='/rest/v1/rpc/ishdasiz_channel_snapshot'));
  if(name==='worker'){assert.equal(resume.published,false);assert.equal(resume.messageId,null);assert.equal(resume.postUrl,null);assert.equal(resume.channelUsername,'@ishdasiz_andijon');assert.equal(job.published,false);}else assert.equal(job,false);
 });
 test(`${name}: a late opt-out blocks channel metadata despite an earlier explicit yes`,async()=>{
  const h=reader([{available:false,entity:null,region_slug:null}]),bot:any=Object.create(TelegramBot.prototype);bot.supabase=h.client;const result=await bot.publishResumeToRegionChannel(R,cv,true);assert.equal(h.requests.length,1);if(name==='worker')assert.equal(result.channelUsername,null);
 });
 test(`${name}: unproven channel snapshots fail without removing visibility checks`,async()=>{
  for(const reply of [{available:true,entity:{id:R},region_slug:null},{available:false,entity:cv,region_slug:null},{available:true,entity:{...cv,id:'wrong'},region_slug:'andijon-viloyati'}]){const h=reader([reply]);await assert.rejects(readChannelSnapshot(h.client,'resume',R));assert.equal(h.requests.length,1);}
 });
 test(`${name}: deletion errors cannot become successful channel removal`,async()=>{
  await assert.rejects(removeChannelMessage(async()=>false,'@ishdasiz_andijon',10));await assert.rejects(removeChannelMessage(async()=>{throw Error('chat not found');},'@ishdasiz_andijon',10));assert.equal(await removeChannelMessage(async()=>{throw Error('message to delete not found');},'@ishdasiz_andijon',10),'deleted');
 });
}
