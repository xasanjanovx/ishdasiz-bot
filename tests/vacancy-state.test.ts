import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',J='10000000-0000-4000-8000-000000000001';
for(const [name,prefix]of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']]as const){
 const {TelegramBot}=require(prefix+'telegram-bot');
 function harness(){let row:any={id:J,status:'active',is_active:true,is_imported:true,source:'osonish',source_status:'active',employer_id:B,user_id:null,created_by:null,updated_at:'2026-10-09T00:00:00.123456Z'},conflict=false;const writes:any[]=[],prompts:string[]=[],views:any[]=[];
  const bot:any=Object.create(TelegramBot.prototype);bot.getEmployerOwnedJobById=async()=>row;bot.sendPrompt=async(_c:any,_s:any,text:string)=>prompts.push(text);bot.handleEmployerJobView=async(...args:any[])=>views.push(args);
  bot.supabase={from:(table:string)=>{assert.equal(table,'jobs');const filters:any[]=[],q:any={update:(patch:any)=>{writes.push({patch,filters});return q;},eq:(key:string,value:any)=>{filters.push([key,value]);return q;},is:(key:string,value:any)=>{filters.push([key,value]);return q;},select:()=>q,maybeSingle:async()=>({data:conflict?null:{id:J},error:null})};return q;}};
  return{bot,writes,prompts,views,row,session:{lang:'ru',user_id:A,data:{}},missing:()=>{row=null;},conflict:()=>{conflict=true;}};
 }
 test(`${name}: pausing and filling preserve source availability and guard the exact version and assignment`,async()=>{
  for(const reason of ['paused','hired']){const h=harness();await h.bot.handleEmployerJobClose(1,J,h.session,reason);assert.equal(h.writes.length,1);assert.equal(h.writes[0].patch.status,reason==='paused'?'inactive':'filled');assert.equal(h.writes[0].patch.is_active,false);assert.equal(h.writes[0].patch.source_status,undefined);assert.deepEqual(h.writes[0].filters,[['id',J],['updated_at',h.row.updated_at],['employer_id',B],['user_id',null],['created_by',null]]);}
 });
 test(`${name}: removing a vacancy archives it without deleting applications or the source record`,async()=>{
  const h=harness();await h.bot.handleEmployerJobDelete(1,J,h.session);assert.equal(h.writes[0].patch.status,'archived');assert.equal(h.writes[0].patch.source_status,undefined);assert.match(h.prompts[0],/архив/);assert.doesNotMatch(h.prompts[0],/удалена/);
 });
 test(`${name}: a removed source and an archived local job cannot be activated`,async()=>{
  for(const state of ['filled','removed_at_source','archived','deleted','inactive','paused','on_hold','closed']){const h=harness();h.row.source_status=state;await h.bot.handleEmployerJobActivate(1,J,h.session);assert.equal(h.writes.length,0);assert.equal(h.views.length,0);}
  const local=harness();local.row.is_imported=false;local.row.source='local';local.row.status='archived';await local.bot.handleEmployerJobActivate(1,J,local.session);assert.equal(local.writes.length,0);
 });
 test(`${name}: reactivating an available imported listing preserves its source status, while a legacy local listing clears its former manual flag`,async()=>{
  const h=harness();await h.bot.handleEmployerJobActivate(1,J,h.session);assert.equal(h.writes[0].patch.source_status,undefined);assert.equal(h.views.length,1);const local=harness();local.row.is_imported=false;local.row.source='local';local.row.status='inactive';local.row.source_status='inactive';await local.bot.handleEmployerJobActivate(1,J,local.session);assert.equal(local.writes[0].patch.source_status,'active');
 });
 test(`${name}: a concurrent transfer or version conflict never reports a successful change`,async()=>{
  for(const method of ['handleEmployerJobClose','handleEmployerJobActivate','handleEmployerJobDelete']){const h=harness();h.conflict();await h.bot[method](1,J,h.session);assert.equal(h.writes.length,1);assert.equal(h.views.length,0);assert.doesNotMatch(h.prompts[0],/✅|архив|приостановлена/);}
 });
 test(`${name}: assigned employer and canonical user take priority over stale creator identities`,()=>{
  const h=harness(),owns=(row:any)=>h.bot.isOwnedEmployerJob(row,{userId:A,employerId:J});assert.equal(owns({employer_id:B,user_id:A,created_by:A}),false);assert.equal(owns({employer_id:J,user_id:B}),true);assert.equal(owns({user_id:B,created_by:A}),false);assert.equal(owns({user_id:A,created_by:B}),true);assert.equal(owns({created_by:A}),true);assert.equal(owns({}),false);
 });
}
