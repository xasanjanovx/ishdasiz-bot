import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',E='10000000-0000-4000-8000-000000000001';
const id=(n:number)=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const owner={userId:A,role:'employer',employerId:E},seeker={userId:B,role:'job_seeker'};
const row=(n=1,patch:any={})=>({id:id(n),job_id:id(901),user_id:B,resume_id:id(902),full_name:'Synthetic',phone:'+998901234567',status:'pending',responded_at:null,viewed_at:null,created_at:'2026-10-09T01:00:00.123456Z',jobs:{id:id(901),title_ru:'Работа <тест>',title_uz:'Ish',employer_id:E,user_id:null,created_by:null},...patch});
function reader(replies:any[]){const requests:any[]=[];const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{requests.push({url:new URL(String(input)),method:init?.method,body:init?.body?JSON.parse(init.body):null});const reply=replies.shift();assert.notEqual(reply,undefined,'Unexpected query or weaker fallback');const headers:any={'Content-Type':'application/json'};if(reply.count!==undefined)headers['Content-Range']='0-0/'+reply.count;return new Response(init?.method==='HEAD'?null:JSON.stringify(reply.error||(Object.prototype.hasOwnProperty.call(reply,'body')?reply.body:reply)),{status:reply.error?500:200,headers});}}});return{client,requests};}
for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {readInboxPage,readInboxApplication,readSubmittedResume,readInboxDashboard,actOnApplication,parseInterviewDate,formatInterviewDate}=require(prefix+'application-inbox');const {TelegramBot}=require(prefix+'telegram-bot');const keys=require(prefix+'keyboards');
 test(`${name}: application ownership is filtered in the database, before ten-row keyset pagination`,async()=>{
  const h=reader([Array.from({length:11},(_,i)=>row(i+1)),[row(12)]]);const first=await readInboxPage(h.client,owner);assert.equal(first.items.length,10);assert.deepEqual(first.nextCursor,{id:id(10),created_at:row().created_at});await readInboxPage(h.client,owner,first.nextCursor);
  for(const {url} of h.requests){assert.match(url.searchParams.get('select')||'',/jobs!inner/);assert.equal(url.searchParams.get('jobs.or'),`(employer_id.eq.${E},and(employer_id.is.null,user_id.eq.${A}),and(employer_id.is.null,user_id.is.null,created_by.eq.${A}))`);assert.equal(url.searchParams.get('order'),'created_at.desc.nullslast,id.desc');assert.equal(url.searchParams.get('limit'),'11');assert.equal(url.searchParams.get('offset'),null);}
  assert.equal(h.requests[1].url.searchParams.get('or'),`(created_at.lt.${row().created_at},and(created_at.eq.${row().created_at},id.lt.${id(10)}),created_at.is.null)`);
 });
 test(`${name}: seeker reads require the canonical user ID and continue through null timestamps`,async()=>{
  const h=reader([[row(1,{created_at:null})],row(1)]);await readInboxPage(h.client,seeker,{id:id(20),created_at:null});await readInboxApplication(h.client,seeker,id(1));const url=h.requests[0].url;assert.equal(url.searchParams.get('user_id'),'eq.'+B);assert.equal(url.searchParams.get('created_at'),'is.null');assert.equal(url.searchParams.get('id'),'lt.'+id(20));assert.doesNotMatch(url.searchParams.get('select')||'',/applicant_id|jobs!inner/);assert.equal(h.requests[1].url.searchParams.get('id'),'eq.'+id(1));
 });
 test(`${name}: invalid actors, injected cursors and invalid application IDs issue no query`,async()=>{
  const h=reader([]);for(const actor of [{...owner,userId:'bad'},{...owner,employerId:null},{...owner,role:'admin'}])await assert.rejects(readInboxPage(h.client,actor));for(const cursor of [{id:'bad',created_at:null},{id:id(1),created_at:'now),user_id.neq.null'},{id:id(1),created_at:'invalid'}])await assert.rejects(readInboxPage(h.client,owner,cursor));await assert.rejects(readInboxApplication(h.client,owner,'bad'));assert.equal(h.requests.length,0);
 });
 test(`${name}: a schema outage never removes identity filters or pretends the inbox is empty`,async()=>{
  const h=reader([{error:{code:'42703',message:'Missing user_id'}}]);await assert.rejects(readInboxPage(h.client,seeker));assert.equal(h.requests.length,1);
 });
 test(`${name}: malformed, duplicated, foreign and mismatched joined records are rejected`,async()=>{
  const missing=row();delete missing.jobs.created_by;
  for(const [actor,rows] of [[owner,[missing]],[owner,[row(1,{jobs:{...row().jobs,employer_id:B,user_id:A}})]],[owner,[row(1,{jobs:{...row().jobs,id:id(999)}})]],[seeker,[row(1,{user_id:A})]],[owner,[row(),row()]]]){const h=reader([rows]);await assert.rejects(readInboxPage(h.client,actor));assert.equal(h.requests.length,1);}
 });
 const resumeSession={user_id:A,data:{active_role:'employer',account_session_version:4}};
 const resumeReply=(resume:any)=>({application_id:id(1),resume});
 test(`${name}: only the exact active submitted resume is read through the protected current-owner RPC`,async()=>{
  const resume={id:id(902),status:'active',full_name:'Synthetic'},h=reader([resumeReply({...resume,internal_note:'PRIVATE'})]);assert.deepEqual(await readSubmittedResume(h.client,resumeSession,row()),resume);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_application_resume');assert.deepEqual(h.requests[0].body,{p_user_id:A,p_session_version:4,p_application_id:id(1)});
  for(const bad of [{...resume,status:'draft'},{...resume,id:id(903)}])await assert.rejects(readSubmittedResume(reader([resumeReply(bad)]).client,resumeSession,row()));await assert.rejects(readSubmittedResume(reader([{application_id:id(2),resume}]).client,resumeSession,row()));
 });
 test(`${name}: a missing or unreadable submitted resume never falls back to another CV`,async()=>{
  const missing=reader([]);assert.equal(await readSubmittedResume(missing.client,resumeSession,{...row(),resume_id:null}),null);assert.equal(missing.requests.length,0);
  const gone=reader([{body:null}]);assert.equal(await readSubmittedResume(gone.client,resumeSession,row()),null);assert.equal(gone.requests.length,1);
  const fail=reader([{error:{code:'42883'}}]);await assert.rejects(readSubmittedResume(fail.client,resumeSession,row()));assert.equal(fail.requests.length,1);
 });
 test(`${name}: invalid actor, role and epoch cannot read a CV or query a weaker table`,async()=>{
  const h=reader([]);for(const session of [{user_id:'bad',data:{active_role:'employer'}},{user_id:A,data:{active_role:'job_seeker'}},{user_id:A,data:{active_role:'employer',account_session_version:-1}}])await assert.rejects(readSubmittedResume(h.client,session,row()));assert.equal(h.requests.length,0);
 });
 test(`${name}: dashboard requests exact HEAD counts with current ownership and Uzbekistan day boundaries`,async()=>{
  const h=reader([1234,3456,2001,301,7].map(count=>({count})));assert.deepEqual(await readInboxDashboard(h.client,owner),{activeJobs:1234,totalApps:3456,pendingApps:2001,acceptedApps:301,interviewsToday:7});assert.ok(h.requests.every(r=>r.method==='HEAD'));assert.equal(h.requests[0].url.searchParams.get('ishdasiz_job_available'),'eq.true');for(const r of h.requests.slice(1))assert.ok(r.url.searchParams.get('jobs.or'));const dates=h.requests[4].url.searchParams.getAll('interview_date');assert.equal(dates.length,2);assert.ok(dates.some((v:string)=>/T19:00:00.000Z$/.test(v)));assert.equal(h.requests[4].url.searchParams.get('status'),'in.(interview_set,invited,interview,interviewed)');
 });
 test(`${name}: a failed or absent dashboard count never becomes a zero statistic`,async()=>{
  for(const bad of [{},{error:{code:'08006'}},{count:-1}])await assert.rejects(readInboxDashboard(reader([bad,...Array.from({length:4},()=>({count:0}))]).client,owner));
 });
 test(`${name}: action RPC passes the account epoch and exact six-digit optimistic version`,async()=>{
  const app=row(),saved={...app,status:'accepted',responded_at:'2026-10-09T02:00:00.123457Z'};const h=reader([saved]);assert.deepEqual(await actOnApplication(h.client,{user_id:A,data:{account_session_version:4}},app,'accepted',{employer_message:'Synthetic'}),saved);assert.equal(h.requests[0].url.pathname,'/rest/v1/rpc/ishdasiz_application_action');assert.deepEqual(h.requests[0].body,{p_user_id:A,p_session_version:4,p_application_id:app.id,p_action:'accepted',p_expected_status:'pending',p_expected_responded_at:null,p_details:{employer_message:'Synthetic'}});
 });
 test(`${name}: action conflicts and unconfirmed results never retry a weaker write`,async()=>{
  for(const reply of [{error:{code:'40001'}},{...row(),id:id(2),status:'accepted'},{...row(),status:'pending'}]){const h=reader([reply]);await assert.rejects(actOnApplication(h.client,{user_id:A,data:{}},row(),'accepted'));assert.equal(h.requests.length,1);}
  const h=reader([]);for(const session of [{user_id:'bad',data:{}},{user_id:A,data:{account_session_version:-1}}])await assert.rejects(actOnApplication(h.client,session,row(),'accepted'));await assert.rejects(actOnApplication(h.client,{user_id:A,data:{}},{id:id(1)},'accepted'));assert.equal(h.requests.length,0);
 });
 function harness(replies:any[]){const h=reader(replies),prompts:any[]=[];const bot:any=Object.create(TelegramBot.prototype),session:any={user_id:A,lang:'ru',data:{active_role:'employer'}};bot.supabase=h.client;bot.getEmployerContext=async()=>({userId:A,employerId:E});bot.sendPrompt=async(_c:any,_s:any,text:string,options:any)=>prompts.push({text,options});bot.setSession=async(s:any,patch:any)=>Object.assign(s,patch);return{...h,bot,session,prompts};}
 test(`${name}: inbox paging validates the saved cursor, refreshes from page one and keeps outage messages honest`,async()=>{
  const h=harness([Array.from({length:11},(_,i)=>row(i+1)),[row(12)],[]]);await h.bot.showEmployerApplications(1,h.session);assert.equal(h.session.data.application_inbox.next.id,id(10));assert.equal(h.prompts[0].options.replyMarkup.inline_keyboard.flat().filter((b:any)=>b.callback_data.startsWith('appview:')).length,10);await h.bot.showEmployerApplications(1,h.session,id(10));assert.equal(h.session.data.application_inbox.page,1);await h.bot.showEmployerApplications(1,h.session);assert.equal(h.session.data.application_inbox.page,0);
  const bad=harness([]);await bad.bot.showEmployerApplications(1,bad.session,id(777));assert.equal(bad.requests.length,0);assert.match(bad.prompts[0].text,/Не удалось/);
  const outage=harness([{error:{code:'08006'}}]);await outage.bot.showEmployerApplications(1,outage.session);assert.match(outage.prompts[0].text,/Не удалось/);assert.doesNotMatch(outage.prompts[0].text,/нет откликов/);
 });
 test(`${name}: opening a foreign card reads no resume, writes nothing and renders no private data`,async()=>{
  const h=harness([[]]);await h.bot.handleApplicationView(1,id(1),h.session);assert.equal(h.requests.length,1);assert.ok(h.requests.every(r=>r.url.pathname==='/rest/v1/job_applications'));assert.equal(h.prompts.length,1);assert.doesNotMatch(h.prompts[0].text,/Synthetic|1234567/);
 });
 test(`${name}: local interview dates validate calendar/time and round-trip in Uzbekistan time`,()=>{
  assert.equal(parseInterviewDate('12.10.2026 10:30'),'2026-10-12T10:30:00+05:00');assert.equal(parseInterviewDate('29.02.2028 00:00'),'2028-02-29T00:00:00+05:00');
  for(const value of ['31.02.2026 10:30','29.02.2027 10:30','12.13.2026 10:30','00.10.2026 10:30','12.10.2026 24:00','12.10.2026 10:60','tomorrow','2026-10-12','12.10.99 10:30'])assert.equal(parseInterviewDate(value),null,value);
  assert.match(formatInterviewDate('2026-10-12T05:30:00Z'),/12.10.2026.*10:30.*UTC\+5/);
 });
 test(`${name}: an unavailable submitted CV shows only submitted contacts and an escaped vacancy title`,async()=>{
  const h=harness([row(),{body:null},{id:id(1),status:'reviewed',responded_at:null,viewed_at:'2026-10-09T01:00:00Z'}]);h.bot.getEmployerOwnedJobById=async()=>row().jobs;
  await h.bot.handleApplicationView(1,id(1),h.session);assert.equal(h.requests.length,3);assert.match(h.prompts[0].text,/Synthetic/);assert.match(h.prompts[0].text,/1234567/);assert.match(h.prompts[0].text,/Работа &lt;тест&gt;/);assert.match(h.prompts[0].text,/резюме больше недоступно/);assert.equal(h.requests[2].url.pathname,'/rest/v1/rpc/ishdasiz_application_action');assert.equal(h.requests[2].body.p_action,'view');
 });
 test(`${name}: failure to authorize the view never renders an already fetched private resume`,async()=>{
  const h=harness([row(),resumeReply({id:id(902),status:'active',full_name:'Private candidate'}),{error:{code:'42501'}}]);h.bot.getEmployerOwnedJobById=async()=>row().jobs;h.bot.buildResumeText=async()=>assert.fail('Never render after failed authorization');await h.bot.handleApplicationView(1,id(1),h.session);assert.equal(h.requests.length,3);assert.doesNotMatch(h.prompts[0].text,/Private candidate|Synthetic/);
 });
 test(`${name}: transferred or unavailable submitted CV access fails before viewing or exposing private data`,async()=>{
  const h=harness([row(),{error:{code:'42501'}}]);h.bot.getEmployerOwnedJobById=async()=>row().jobs;h.bot.buildResumeText=async()=>assert.fail('No private rendering');await h.bot.handleApplicationView(1,id(1),h.session);assert.equal(h.requests.length,2);assert.equal(h.requests[1].url.pathname,'/rest/v1/rpc/ishdasiz_application_resume');assert.doesNotMatch(h.prompts[0].text,/Synthetic|1234567/);
 });
 test(`${name}: a valid private attached CV is rendered only after both protected read and view succeed`,async()=>{
  const h=harness([row(),resumeReply({id:id(902),status:'active',full_name:'Exact private applicant'}),{id:id(1),status:'reviewed',responded_at:null,viewed_at:'2026-10-10T00:00:00Z'}]);h.bot.getEmployerOwnedJobById=async()=>row().jobs;h.bot.buildResumeText=async(resume:any)=>'CV '+resume.full_name;h.bot.buildResumeJobMatchBlock=()=>null;await h.bot.handleApplicationView(1,id(1),h.session);assert.equal(h.requests.length,3);assert.match(h.prompts[0].text,/Exact private applicant/);assert.equal(h.requests[1].url.pathname,'/rest/v1/rpc/ishdasiz_application_resume');assert.equal(h.requests[2].url.pathname,'/rest/v1/rpc/ishdasiz_application_action');
 });
 test(`${name}: long and escaped CVs stay within Telegram limits and link to the protected application resume`,async()=>{
  const h=harness([row(),resumeReply({id:id(902),status:'active',title:'&'.repeat(10000),full_name:'😀'.repeat(10000),phone:'+998000000000',about:'<'.repeat(10000)}),{id:id(1),status:'reviewed',responded_at:null,viewed_at:'2026-10-10T00:00:00Z'}]);h.bot.getEmployerOwnedJobById=async()=>({...row().jobs,title_ru:'&'.repeat(10000)});h.bot.buildResumeText=async()=>'CV '.repeat(5000);h.bot.buildResumeJobMatchBlock=()=>null;await h.bot.handleApplicationView(1,id(1),h.session);assert.ok(h.prompts[0].text.length<=3400);assert.doesNotMatch(h.prompts[0].text,/�/);assert.match(h.prompts[0].text,/Полное резюме/);const full=h.prompts[0].options.replyMarkup.inline_keyboard.flat().find((b:any)=>b.url);assert.equal(full.url,'https://ishdasiz.uz/profile/employer/applications/'+id(1)+'/resume');assert.equal((keys.applicationViewKeyboard('ru','bad','reviewed',true) as any).inline_keyboard.flat().some((b:any)=>b.url),false);
 });
 test(`${name}: application keyboards bound Unicode text and callbacks and participate in stale-message guards`,()=>{
  for(const lang of ['ru','uz']){const k:any=keys.employerApplicationsKeyboard(lang,Array.from({length:20},(_,i)=>({id:id(i+1),applicant:'😀'.repeat(300)})),{page:3,nextId:id(10)});const buttons=k.inline_keyboard.flat();assert.equal(buttons.filter((b:any)=>b.callback_data.startsWith('appview:')).length,10);assert.ok(buttons.some((b:any)=>b.callback_data==='apps:next:'+id(10)));assert.ok(buttons.some((b:any)=>b.callback_data==='apps:list'));for(const b of buttons){assert.ok(Buffer.byteLength(b.callback_data)<=64);assert.ok(Array.from(b.text).length<=80);assert.doesNotMatch(b.text,/�/);}}
  const bot:any=Object.create(TelegramBot.prototype);for(const action of ['apps','appview'])assert.equal(bot.isFlowSensitiveCallbackAction(action),true);
 });
 {
  test(`${name}: decision failures preserve the draft and never notify or show success`,async()=>{
   const h=harness([{error:{code:'40001'}}]);h.bot.loadEmployerApplicationContext=async()=>({app:row(),job:row().jobs});let notifications=0;h.bot.notifySeekerAboutApplicationStatus=async()=>notifications++;h.session.data.application_pipeline={application_id:id(1),mode:'accept',expected_status:'pending',expected_responded_at:null,employer_message:'Draft'};await h.bot.handleApplicationInterviewAction(1,'confirm_accept',id(1),h.session);assert.equal(notifications,0);assert.equal(h.session.data.application_pipeline.employer_message,'Draft');assert.match(h.prompts[0].text,/Решение не сохранено/);assert.ok(h.prompts[0].options.replyMarkup.inline_keyboard.flat().some((b:any)=>b.callback_data==='appinterview:message:'+id(1)));assert.equal(h.requests.length,1);
  });
  test(`${name}: saved decision uses the original form version and clears the draft even if notification fails`,async()=>{
   const h=harness([{...row(),status:'accepted',responded_at:'2026-10-09T02:00:00.000001Z'}]);h.bot.loadEmployerApplicationContext=async()=>({app:{...row(),status:'interview_set'},job:row().jobs});h.bot.notifySeekerAboutApplicationStatus=async()=>{throw Error('Synthetic transport failure');};h.session.data.application_pipeline={application_id:id(1),mode:'accept',expected_status:'pending',expected_responded_at:null,employer_phone:null,employer_message:'Draft'};await h.bot.handleApplicationInterviewAction(1,'confirm_accept',id(1),h.session);assert.equal(h.requests[0].body.p_expected_status,'pending');assert.equal(h.requests[0].body.p_details.employer_message,'Draft');assert.equal(h.session.data.application_pipeline,null);assert.ok(h.prompts[0].options.replyMarkup.inline_keyboard.flat().some((b:any)=>b.callback_data==='appdecision:hire:'+id(1)));
  });
  test(`${name}: forged decisions, unrelated confirmations and missing version snapshots never write`,async()=>{
   const h=harness([]);h.bot.loadEmployerApplicationContext=async()=>({app:row(),job:row().jobs});await h.bot.handleApplicationDecisionAction(1,'forged',id(1),h.session);await h.bot.handleApplicationInterviewAction(1,'confirm_accept',id(1),h.session);h.session.data.application_pipeline={application_id:id(2),mode:'accept',expected_status:'pending',expected_responded_at:null};await h.bot.handleApplicationInterviewAction(1,'confirm_accept',id(1),h.session);assert.equal(h.requests.length,0);
  });
 }
}
