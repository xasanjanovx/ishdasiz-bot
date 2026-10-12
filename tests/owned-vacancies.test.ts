import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',E='10000000-0000-4000-8000-000000000001';
const id=(n:number)=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const job=(n=1,patch:any={})=>({id:id(n),title_uz:'Ish',title_ru:'Работа',employer_id:E,user_id:null,created_by:null,status:'active',is_active:true,is_imported:false,source:'local',source_status:'active',updated_at:'2026-10-09T00:00:00.123456Z',...patch});
for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {readOwnedJobs,employerJobState}=require(prefix+'owned-jobs');
 const {TelegramBot}=require(prefix+'telegram-bot');
 const keys=require(prefix+'keyboards');
 function reader(replies:any[]){const requests:URL[]=[];const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any)=>{requests.push(new URL(String(input)));const reply=replies.shift();assert.notEqual(reply,undefined,'Unexpected query or weaker fallback');return new Response(JSON.stringify(reply.error||reply),{status:reply.error?500:200,headers:{'Content-Type':'application/json'}});}}});return{client,requests};}
 test(`${name}: owned vacancy reads put assignment priority into the server filter and page beyond 500`,async()=>{
  const h=reader([Array.from({length:500},(_,i)=>job(i+1)),[job(501,{employer_id:null,user_id:A}),job(502,{employer_id:null,user_id:null,created_by:A})]]);
  const rows=await readOwnedJobs(h.client,{userId:A,employerId:E},{limit:800});assert.equal(rows.length,502);assert.equal(h.requests.length,2);
  for(const url of h.requests){assert.equal(url.pathname,'/rest/v1/jobs');assert.equal(url.searchParams.get('or'),`(employer_id.eq.${E},and(employer_id.is.null,user_id.eq.${A}),and(employer_id.is.null,user_id.is.null,created_by.eq.${A}))`);assert.match(url.searchParams.get('select')||'',/employer_id,user_id,created_by/);assert.equal(url.searchParams.get('order'),'created_at.desc.nullslast,id.desc');}
  assert.equal(h.requests[0].searchParams.get('offset'),'0');assert.equal(h.requests[0].searchParams.get('limit'),'500');assert.equal(h.requests[1].searchParams.get('offset'),'500');assert.equal(h.requests[1].searchParams.get('limit'),'300');
 });
 test(`${name}: archive/current/available restrictions apply before pagination`,async()=>{
  for(const scope of ['archived','current','available']){const h=reader([[]]);await readOwnedJobs(h.client,{userId:A,employerId:E},{limit:11,offset:20,scope});const url=h.requests[0];assert.equal(url.searchParams.get('offset'),'20');assert.equal(url.searchParams.get('limit'),'11');const filter=url.searchParams.get('or')||'';if(scope==='archived')assert.match(filter,/status.eq.archived/);if(scope==='current')assert.match(filter,/or\(status.is.null,status.neq.archived\)/);if(scope==='available')assert.equal(url.searchParams.get('ishdasiz_job_available'),'eq.true');}
 });
 test(`${name}: a missing employer profile still uses canonical user/creator ownership filters`,async()=>{
  const h=reader([[job(1,{employer_id:null,user_id:A})]]);assert.equal((await readOwnedJobs(h.client,{userId:A,employerId:null})).length,1);assert.doesNotMatch(h.requests[0].searchParams.get('or')||'',/employer_id.eq/);
 });
 test(`${name}: malformed identities, limits and offsets never issue a database read`,async()=>{
  const h=reader([]);for(const args of [[{userId:'bad',employerId:E},{}],[{userId:A,employerId:'bad'},{}],[{userId:A,employerId:E},{limit:1001}],[{userId:A,employerId:E},{offset:-1}],[{userId:A,employerId:E},{offset:100001}],[{userId:A,employerId:E},{scope:'forged'}]])await assert.rejects(readOwnedJobs(h.client,args[0],args[1]));assert.equal(h.requests.length,0);
 });
 test(`${name}: missing ownership columns, foreign assignments and conflicting canonical owners are rejected`,async()=>{
  const missing=job();delete missing.created_by;for(const row of [missing,job(1,{employer_id:B,user_id:A,created_by:A}),job(1,{employer_id:null,user_id:B,created_by:A})]){const h=reader([[row]]);await assert.rejects(readOwnedJobs(h.client,{userId:A,employerId:E}));assert.equal(h.requests.length,1);}
 });
 test(`${name}: database errors and duplicate pages never trigger a broad fallback read`,async()=>{
  const bad=reader([{error:{code:'42703',message:'Private schema failure'}}]);await assert.rejects(readOwnedJobs(bad.client,{userId:A,employerId:E}));assert.equal(bad.requests.length,1);
  const duplicate=reader([Array.from({length:500},(_,i)=>job(i+1)),[job(1)]]);await assert.rejects(readOwnedJobs(duplicate.client,{userId:A,employerId:E},{limit:501}));assert.equal(duplicate.requests.length,2);
 });
 test(`${name}: active candidate-search results reject draft, inactive, unknown and removed-source records`,async()=>{
  for(const patch of [{status:'draft'},{is_active:false},{is_active:null},{status:null,is_active:null},{is_imported:true,source_status:' CLOSED '}]){const h=reader([[job(1,patch)]]);await assert.rejects(readOwnedJobs(h.client,{userId:A,employerId:E},{scope:'available'}));}
  assert.equal(employerJobState(job(1,{status:'archived'})).isArchived,true);assert.equal(employerJobState(job(1,{is_imported:true,source_status:' REMOVED_AT_SOURCE '})).isSourceUnavailable,true);
 });
 function harness(){let row:any=job(1,{status:'archived',is_active:false}),conflict=false;const writes:any[]=[],prompts:any[]=[],views:any[]=[];const bot:any=Object.create(TelegramBot.prototype);const session:any={user_id:A,lang:'ru',data:{active_role:'employer'}};
  bot.getEmployerContext=async()=>({userId:A,employerId:E});bot.sendPrompt=async(_c:any,_s:any,text:string,options:any)=>prompts.push({text,options});bot.handleEmployerJobView=async(...args:any[])=>views.push(args);
  bot.supabase={from:(table:string)=>{assert.equal(table,'jobs','Restoration must not delete or alter applications');const filters:any[]=[];let writing=false;const q:any={select:()=>q,update:(patch:any)=>{writing=true;writes.push({patch,filters});return q;},eq:(k:any,v:any)=>{filters.push([k,v]);return q;},is:(k:any,v:any)=>{filters.push([k,v]);return q;},maybeSingle:async()=>writing?{data:conflict?null:{id:row?.id},error:null}:{data:row,error:null}};return q;}};
  return{bot,session,row,writes,prompts,views,missing:()=>{row=null;},conflict:()=>{conflict=true;}};
 }
 test(`${name}: restoration asks for confirmation and cancellation makes no write`,async()=>{
  const h=harness();await h.bot.handleEmployerJobRestore(1,id(1),h.session,'confirm');assert.equal(h.writes.length,0);assert.match(h.prompts[0].text,/черновики/);assert.match(h.prompts[0].text,/скрытой/);await h.bot.handleEmployerJobRestore(1,id(1),h.session,'no');assert.equal(h.writes.length,0);assert.equal(h.views.length,1);
 });
 test(`${name}: confirmed restoration is an inactive draft guarded by the exact owner and version`,async()=>{
  const h=harness();await h.bot.handleEmployerJobRestore(1,id(1),h.session,'yes');assert.equal(h.writes.length,1);assert.equal(h.writes[0].patch.status,'draft');assert.equal(h.writes[0].patch.is_active,false);assert.equal(h.writes[0].patch.source_status,'active');assert.deepEqual(h.writes[0].filters,[['id',id(1)],['updated_at',h.row.updated_at],['employer_id',E],['user_id',null],['created_by',null]]);assert.match(h.prompts[0].text,/возвращена в черновики/);assert.equal(h.views.length,1);
 });
 test(`${name}: restoring an unavailable imported vacancy preserves source state and blocks publication`,async()=>{
  const h=harness();h.row.is_imported=true;h.row.source_status='removed_at_source';await h.bot.handleEmployerJobRestore(1,id(1),h.session,'yes');assert.equal(h.writes[0].patch.source_status,undefined);h.row.status='draft';await h.bot.handleEmployerJobActivate(1,id(1),h.session);assert.equal(h.writes.length,1);assert.match(h.prompts.at(-1).text,/Публикация недоступна/);
 });
 test(`${name}: foreign, missing, active or role-switched restoration requests never mutate anything`,async()=>{
  for(const mutate of [(h:any)=>h.row.employer_id=B,(h:any)=>h.missing(),(h:any)=>h.row.status='active',(h:any)=>h.session.data.active_role='job_seeker']){const h=harness();mutate(h);await h.bot.handleEmployerJobRestore(1,id(1),h.session,'yes');assert.equal(h.writes.length,0);assert.equal(h.views.length,0);}
  const h=harness();await h.bot.handleEmployerJobRestore(1,id(1),h.session,'forged');assert.equal(h.writes.length,0);
 });
 test(`${name}: a concurrent vacancy transfer or edit never reports a successful restoration`,async()=>{
  const h=harness();h.conflict();await h.bot.handleEmployerJobRestore(1,id(1),h.session,'yes');assert.equal(h.writes.length,1);assert.equal(h.views.length,0);assert.ok(h.prompts.length);assert.doesNotMatch(h.prompts[0].text,/✅|возвращена/);
 });
 test(`${name}: list paging shows ten vacancies and an archive toggle, while an outage is not shown as an empty archive`,async()=>{
  const h=harness(),r=reader([Array.from({length:11},(_,i)=>job(i+1))]);h.bot.supabase=r.client;await h.bot.handleEmployerJobList(1,h.session,false,2);assert.match(h.prompts[0].text,/\n\nСтраница 3/);const buttons=h.prompts[0].options.replyMarkup.inline_keyboard.flat();assert.equal(buttons.filter((b:any)=>b.callback_data.startsWith('jobview:')).length,10);assert.ok(buttons.some((b:any)=>b.callback_data==='employerjobs:current:3'));assert.ok(buttons.some((b:any)=>b.callback_data==='employerjobs:archived:0'));
  const fail=harness();fail.bot.supabase=reader([{error:{code:'08006'}}]).client;await fail.bot.handleEmployerJobList(1,fail.session,true,0);assert.match(fail.prompts[0].text,/Не удалось загрузить/);assert.doesNotMatch(fail.prompts[0].text,/пока нет/);
 });
 test(`${name}: RU/UZ archive keyboards stay within Telegram limits and never offer direct publication`,()=>{
  for(const lang of ['ru','uz']){const archive:any=keys.employerJobViewKeyboard(lang,id(1),{isArchived:true,isFilled:true});const callbacks=archive.inline_keyboard.flat().map((b:any)=>b.callback_data);assert.ok(callbacks.includes('jobrestore:confirm:'+id(1)));assert.ok(!callbacks.some((v:string)=>/jobactivate|matchjob|jobdelete/.test(v)));
   const unavailable:any=keys.employerJobViewKeyboard(lang,id(1),{isPaused:true,canActivate:false});assert.ok(!unavailable.inline_keyboard.flat().some((b:any)=>/jobactivate|matchjob/.test(b.callback_data)));
   const filled:any=keys.employerJobViewKeyboard(lang,id(1),{isFilled:true});assert.ok(filled.inline_keyboard.flat().some((b:any)=>b.callback_data==='jobactivate:'+id(1)));
   for(const keyboard of [archive,unavailable,filled,keys.jobRestoreConfirmKeyboard(lang,id(1)),keys.jobDeleteConfirmKeyboard(lang,id(1)),keys.jobCloseReasonKeyboard(lang,id(1)),keys.employerVacanciesKeyboard(lang,[job(1,{title_ru:'😀'.repeat(300)})],{page:9998,hasMore:true})])for(const button of keyboard.inline_keyboard.flat()){assert.ok(Buffer.byteLength(button.callback_data)<=64);assert.doesNotMatch(button.text,/�/);}
  }
 });
 test(`${name}: archive actions participate in stale-message and duplicate-write guards`,()=>{
  const bot:any=Object.create(TelegramBot.prototype);for(const action of ['jobrestore','employerjobs'])assert.equal(bot.isFlowSensitiveCallbackAction(action),true);assert.equal(bot.isHighRiskCallbackAction('jobrestore'),true);
 });
 test(`${name}: candidate search without active vacancies offers the vacancy menu and never opens a creation form`,async()=>{
  const h=harness();h.bot.maybeShowSoftSubscriptionPrompt=async()=>false;h.bot.sendSeriousSticker=async()=>{};h.bot.getEmployerJobs=async(_s:any,limit:number,scope:string)=>{assert.equal(limit,20);assert.equal(scope,'available');return [];};h.bot.setFlowCancelKeyboard=async()=>{assert.fail('Unexpected new vacancy form');};await h.bot.handleEmployerMainMenu(1,'find_worker',h.session);assert.match(h.prompts[0].text,/активная вакансия/);assert.match(h.prompts[0].text,/Мои вакансии/);
 });
 test(`${name}: default region buttons use all fourteen canonical reference IDs, separating Tashkent city from province`,()=>{
  const expected=[22,17,12,9,13,19,16,21,11,18,10,15,14,8];assert.deepEqual(keys.REGIONS.map((r:any)=>r.id),expected);for(const lang of ['ru','uz']){const keyboard:any=keys.regionKeyboard(lang);const buttons=keyboard.inline_keyboard.flat();for(const id of expected)assert.ok(buttons.some((b:any)=>b.callback_data==='region:'+id));}
 });
}
