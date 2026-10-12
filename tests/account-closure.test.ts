import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
for(const [name,file] of [['worker','../lib/telegram/telegram-bot'],['site','../../ISHDASIZ NEW/lib/telegram/telegram-bot']] as const) {
 const {TelegramBot,BotState}=require(file);
 const session=()=>({telegram_user_id:10,user_id:'owner',lang:'ru',state:BotState.MAIN_MENU,phone:'+998901234567',data:{account_session_version:0,private_draft:'Old data'}});
 function harness(account:any,error:any=null) {
  const bot:any=Object.create(TelegramBot.prototype),prompts:string[]=[];
  bot.supabase={from:()=>{const chain:any={};for(const method of ['select','eq'])chain[method]=()=>chain;chain.maybeSingle=async()=>({data:account,error});return chain;}};
  bot.setSession=async(s:any,changes:any)=>Object.assign(s,changes);
  bot.sendPrompt=async(_chat:any,_s:any,text:string)=>{prompts.push(text);};
  return {bot,prompts};
 }
 test(`${name}: closed account invalidates bot state and provides SMS restoration link`,async()=>{
  const {bot,prompts}=harness({closed_at:'2026-10-07',session_version:1});const s=session();
  assert.equal(await bot.checkAccountSession(10,s),false);assert.equal(s.user_id,null);assert.deepEqual(s.data,{});assert.equal(s.state,BotState.AWAITING_PHONE);assert(prompts[0].includes('https://ishdasiz.uz'));
 });
 test(`${name}: an old session remains revoked after restoration, and a fresh epoch works`,async()=>{
  const {bot}=harness({closed_at:null,session_version:2});const old=session();assert.equal(await bot.checkAccountSession(10,old),false);
  const fresh=session();fresh.data.account_session_version=2;assert.equal(await bot.checkAccountSession(10,fresh),true);assert.equal(fresh.user_id,'owner');
 });
 test(`${name}: database outages fail closed without executing an account action`,async()=>{
  const {bot}=harness(null,{code:'08006'});const s=session();await assert.rejects(bot.checkAccountSession(10,s),/unavailable/);assert.equal(s.user_id,'owner');
 });
 test(`${name}: closed phone accounts do not request SMS or create a password`,async()=>{
  const {bot,prompts}=harness(null);bot.findUserByPhone=async()=>({id:'owner',closed_at:'2026-10-07',session_version:1});
  bot.startSMSAuth=async()=>{throw new Error('Must not send SMS');};const s=session();s.user_id=null as any;
  await bot.handlePhone(10,'901234567',s);await bot.handlePasswordLogin(10,'password',s);assert.equal(prompts.length,2);
 });
 test(`${name}: pending authentication from an earlier epoch cannot attach a restored account`,async()=>{
  const {bot,prompts}=harness({id:'owner',closed_at:null,session_version:2});bot.findOrCreateUser=async()=> 'owner';
  const s=session();s.user_id=null as any;(s.data as any).auth_epoch=0;
  await TelegramBot.prototype.finalizeLogin.call(bot,10,s.phone,s);assert.equal(s.user_id,null);assert.equal(s.state,BotState.AWAITING_PHONE);assert.equal(prompts.length,1);
 });
}
