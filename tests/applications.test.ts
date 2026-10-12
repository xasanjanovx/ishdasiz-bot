import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',R='10000000-0000-4000-8000-000000000001',J='20000000-0000-4000-8000-000000000001';
for(const [name,prefix]of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']]as const){
 const {TelegramBot}=require(prefix+'telegram-bot');
 function harness(){const rows:any[]=[{id:R,user_id:A,status:'active',phone:'90 123 45 67',full_name:'Own resume'}],calls:any[]=[],prompts:string[]=[],notifications:any[]=[];let readError:any=null,rpcError:any=null,result:any={id:J,status:'pending'},notifyError=false;
  const client:any={from:(table:string)=>{assert.equal(table,'resumes','No direct application insert or permissive legacy fallback is allowed');const filters:any[]=[];const q:any={select:()=>q,eq:(key:string,value:any)=>{filters.push((row:any)=>row[key]===value);return q;},order:()=>q,limit:()=>q,maybeSingle:async()=>({data:readError?null:rows.find(row=>filters.every(fn=>fn(row)))||null,error:readError})};return q;},rpc:async(fn:string,args:any)=>{calls.push({fn,args});return{data:rpcError?null:result,error:rpcError};}};
  const bot:any=Object.create(TelegramBot.prototype);bot.supabase=client;bot.sendPrompt=async(_chat:any,_session:any,text:string)=>prompts.push(text);bot.notifyEmployerAboutApplication=async(...args:any[])=>{notifications.push(args);if(notifyError)throw new Error('Synthetic delivery failure');};
  const session:any={user_id:A,phone:'+998901234567',lang:'ru',data:{active_resume_id:R,account_session_version:2}};
  return {bot,session,rows,calls,prompts,notifications,setReadError:(v:any)=>{readError=v;},setRpcError:(v:any)=>{rpcError=v;},setResult:(v:any)=>{result=v;},failNotify:()=>{notifyError=true;}};
 }
 const apply=(h:any)=>h.bot.handleJobApply(1,J,h.session);
 test(`${name}: an application always carries an owned active resume, verified user and current account epoch`,async()=>{
  const h=harness();await apply(h);assert.deepEqual(h.calls,[{fn:'ishdasiz_submit_application',args:{p_user_id:A,p_session_version:2,p_job_id:J,p_resume_id:R,p_phone:'+998901234567',p_message:null}}]);assert.equal(h.notifications.length,1);assert.match(h.prompts[0],/отправлен/i);
 });
 test(`${name}: missing, foreign and draft selected resumes never fall back to an anonymous application`,async()=>{
  for(const mutate of [(h:any)=>h.rows.splice(0),(h:any)=>h.rows[0].user_id=B,(h:any)=>h.rows[0].status='draft',(h:any)=>h.session.data.active_resume_id='forged']){const h=harness();mutate(h);await apply(h);assert.equal(h.calls.length,0);assert.equal(h.notifications.length,0);assert.doesNotMatch(h.prompts[0],/успешно|отправлен/i);}
 });
 test(`${name}: with no selected resume the bot chooses only an own active resume`,async()=>{
  const h=harness();delete h.session.data.active_resume_id;h.rows.unshift({id:B,user_id:B,status:'active',phone:'+998909999999'},{id:A,user_id:A,status:'draft',phone:'+998909999999'});await apply(h);assert.equal(h.calls[0].args.p_resume_id,R);
 });
 test(`${name}: a resume read outage stops submission and never tries a weaker schema`,async()=>{
  const h=harness();h.setReadError({code:'42703',message:'Private SQL error'});await apply(h);assert.equal(h.calls.length,0);assert.equal(h.notifications.length,0);assert.doesNotMatch(h.prompts[0],/Private SQL|отправлен/i);
 });
 test(`${name}: duplicates, lifecycle changes, foreign ownership and database errors never announce a saved application`,async()=>{
  for(const code of ['23505','P0002','42501','40001','08006','42703','23503']){const h=harness();h.setRpcError({code,message:'Private SQL error'});await apply(h);assert.equal(h.calls.length,1);assert.equal(h.notifications.length,0);assert.doesNotMatch(h.prompts[0],/Private SQL|отправлен/i);}
 });
 test(`${name}: invalid account epochs and phones fail without an application write`,async()=>{
  for(const mutate of [(h:any)=>h.session.data.account_session_version=-1,(h:any)=>h.session.user_id='bad',(h:any)=>{h.rows[0].phone='+79123456789';h.session.phone='bad';}]){const h=harness();mutate(h);await apply(h);assert.equal(h.calls.length,0);assert.equal(h.notifications.length,0);}
 });
 test(`${name}: a malformed successful RPC result is not replaced with a phone-based guessed application`,async()=>{
  const h=harness();h.setResult({id:null,status:'pending'});await apply(h);assert.equal(h.calls.length,1);assert.equal(h.notifications.length,0);assert.doesNotMatch(h.prompts[0],/отправлен/i);
 });
 test(`${name}: an employer notification failure does not undo a confirmed application`,async()=>{
  const h=harness();h.failNotify();await apply(h);assert.equal(h.calls.length,1);assert.equal(h.notifications.length,1);assert.match(h.prompts[0],/отправлен/i);
 });
}
