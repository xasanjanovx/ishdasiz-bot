import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const U='00000000-0000-4000-8000-000000000001',S='00000000-0000-4000-8000-000000000002',E='10000000-0000-4000-8000-000000000001';
const id=(n:number)=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const version='2026-10-10T01:00:00.123456Z';
const row=(patch:any={})=>({id:id(1),job_id:id(2),user_id:S,resume_id:id(3),status:'reviewed',responded_at:version,created_at:version,jobs:{id:id(2),employer_id:E,user_id:null,created_by:null,title_ru:'Оператор <тест>',title_uz:'Operator <test>'},...patch});

for(const [name,prefix] of [['worker','../lib/telegram/'],['site','../../ISHDASIZ NEW/lib/telegram/']] as const){
 const {TelegramBot,BotState}=require(prefix+'telegram-bot'),keys=require(prefix+'keyboards');
 function harness(replies:any[]=[]){
  const requests:any[]=[],prompts:any[]=[],notifications:any[]=[];
  const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{
   const url=new URL(String(input));requests.push({url,method:init?.method||'GET',body:init?.body?JSON.parse(init.body):null});
   assert.ok(replies.length,'Unexpected database request');const reply=replies.shift(),headers:any={'Content-Type':'application/json'};
   if(reply?.count!==undefined)headers['Content-Range']='0-0/'+reply.count;
   return new Response(init?.method==='HEAD'?null:JSON.stringify(reply?.error||reply),{status:reply?.error?500:200,headers});
  }}});
  const bot:any=Object.create(TelegramBot.prototype),session:any={user_id:U,telegram_user_id:11,state:BotState.EMPLOYER_MAIN_MENU,lang:'ru',data:{active_role:'employer',account_session_version:7}};
  bot.supabase=client;bot.getEmployerContext=async()=>({userId:U,employerId:E});bot.getEmployerOwnedJobById=async()=>row().jobs;bot.isAdminTelegramUser=()=>false;
  bot.setSession=async(s:any,patch:any)=>Object.assign(s,patch);bot.sendPrompt=async(_c:any,_s:any,text:string,options:any)=>prompts.push({text,options});
  bot.notifySeekerAboutApplicationStatus=async(...args:any[])=>notifications.push(args);
  return{bot,session,requests,prompts,notifications};
 }
 function form(h:ReturnType<typeof harness>,mode='interview',patch:any={}){h.session.data.application_pipeline={application_id:id(1),expected_status:'reviewed',expected_responded_at:version,mode,...patch};}

 test(`${name}: an interview draft passes date, address and phone input before one versioned save`,async()=>{
  const saved=row({status:'interview_set',responded_at:'2026-10-10T02:00:00.123457Z',interview_date:'2026-10-12T10:30:00+05:00',interview_address:'Ташкент <офис>',employer_phone:'+998901234567'});
  const h=harness([row(),row(),row(),row(),row(),saved]);
  await h.bot.handleApplicationDecisionAction(1,'interview',id(1),h.session);
  assert.equal(h.session.data.application_pipeline.expected_responded_at,version);
  await h.bot.handleApplicationInterviewAction(1,'date',id(1),h.session);
  assert.equal(h.session.state,BotState.APPLICATION_INTERVIEW_DATE);
  await h.bot.handleTextByState(1,'12.10.2026 10:30',h.session);
  assert.equal(h.session.data.application_pipeline.interview_date,'2026-10-12T10:30:00+05:00');
  await h.bot.handleApplicationInterviewAction(1,'address',id(1),h.session);
  await h.bot.handleTextByState(1,'Ташкент <офис>',h.session);
  await h.bot.handleApplicationInterviewAction(1,'phone',id(1),h.session);
  await h.bot.handleTextByState(1,'90 123 45 67',h.session);
  assert.equal(h.notifications.length,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
  await h.bot.handleApplicationInterviewAction(1,'confirm_interview',id(1),h.session);
  assert.equal(h.requests.length,6);assert.equal(h.notifications.length,1);assert.equal(h.notifications[0][1],'interview_set');
  const write=h.requests[5];assert.equal(write.url.pathname,'/rest/v1/rpc/ishdasiz_application_action');
  assert.equal(write.body.p_session_version,7);assert.equal(write.body.p_expected_responded_at,version);
  assert.deepEqual(write.body.p_details,{interview_date:'2026-10-12T10:30:00+05:00',interview_address:'Ташкент <офис>',employer_phone:'+998901234567'});
  assert.equal(h.session.data.application_pipeline,null);assert.equal(h.session.state,BotState.EMPLOYER_MAIN_MENU);
  assert.match(h.prompts.at(-1).text,/Собеседование успешно назначено/);
  assert.ok(h.prompts.some(p=>p.text.includes('UTC+5')));
 });

 test(`${name}: acceptance and rejection preserve the entered message and original form version`,async()=>{
  for(const [mode,action,state,field,status] of [['accept','message',BotState.APPLICATION_INTERVIEW_MESSAGE,'employer_message','accepted'],['reject','reason',BotState.APPLICATION_REJECTION_REASON,'rejection_reason','rejected']]){
   const h=harness([row(),row(),row(),row({status,responded_at:'2026-10-10T02:00:00Z'})]);
   await h.bot.handleApplicationDecisionAction(1,mode,id(1),h.session);await h.bot.handleApplicationInterviewAction(1,action,id(1),h.session);assert.equal(h.session.state,state);
   await h.bot.handleTextByState(1,'Сообщение <кандидату>',h.session);assert.match(h.prompts.at(-1).text,/&lt;кандидату&gt;/);
   await h.bot.handleApplicationInterviewAction(1,'confirm_'+mode,id(1),h.session);
   const write=h.requests[3].body;assert.equal(write.p_expected_responded_at,version);assert.equal(write.p_action,status);assert.equal(write.p_details[field],'Сообщение <кандидату>');assert.equal(h.notifications.length,1);assert.equal(h.session.data.application_pipeline,null);
  }
 });

 test(`${name}: hiring saves the exact version and reports employment instead of only accepting an application`,async()=>{
  for(const lang of ['ru','uz']){const h=harness([row({status:'accepted'}),row({status:'hired',responded_at:'2026-10-10T02:00:00Z'})]);h.session.lang=lang;await h.bot.handleApplicationDecisionAction(1,'hire',id(1),h.session);assert.equal(h.requests[1].body.p_action,'hired');assert.equal(h.requests[1].body.p_expected_status,'accepted');assert.equal(h.requests[1].body.p_expected_responded_at,version);assert.match(h.prompts.at(-1).text,lang==='ru'?/Кандидат принят на работу/:/Nomzod ishga qabul qilindi/);assert.equal(h.notifications[0][1],'hired');}
 });

 test(`${name}: loss of vacancy ownership leaves the draft and never commits or notifies`,async()=>{
  const h=harness([row(),row()]);await h.bot.handleApplicationDecisionAction(1,'accept',id(1),h.session);
  h.bot.getEmployerOwnedJobById=async()=>null;await h.bot.handleApplicationInterviewAction(1,'confirm_accept',id(1),h.session);
  assert.equal(h.requests.length,2);assert.ok(h.requests.every(r=>r.method==='GET'));assert.equal(h.notifications.length,0);assert.equal(h.session.data.application_pipeline.mode,'accept');assert.doesNotMatch(h.prompts.at(-1).text,/успешно/);
 });

 test(`${name}: confirmation without a date asks for Uzbekistan date input without issuing a write`,async()=>{
  const h=harness();form(h);h.bot.loadEmployerApplicationContext=async()=>({app:row(),job:row().jobs});
  await h.bot.handleApplicationInterviewAction(1,'confirm_interview',id(1),h.session);
  assert.equal(h.requests.length,0);assert.equal(h.notifications.length,0);assert.equal(h.session.state,BotState.APPLICATION_INTERVIEW_DATE);assert.match(h.prompts[0].text,/UTC\+5/);assert.equal(h.session.data.application_pipeline.expected_responded_at,version);
 });

 test(`${name}: invalid date and phone input keeps the same draft step`,async()=>{
  const h=harness();form(h);h.session.state=BotState.APPLICATION_INTERVIEW_DATE;
  for(const value of ['31.02.2026 10:30','12.10.2026 24:00','завтра']){await h.bot.handleTextByState(1,value,h.session);assert.equal(h.session.state,BotState.APPLICATION_INTERVIEW_DATE);assert.equal(h.session.data.application_pipeline.interview_date,undefined);}
  h.session.state=BotState.APPLICATION_INTERVIEW_PHONE;await h.bot.handleTextByState(1,'123',h.session);assert.equal(h.session.state,BotState.APPLICATION_INTERVIEW_PHONE);assert.equal(h.requests.length,0);
 });

 test(`${name}: oversized input is rejected before changing the draft and previews preserve full valid input`,async()=>{
  for(const [state,max] of [[BotState.APPLICATION_INTERVIEW_ADDRESS,1000],[BotState.APPLICATION_INTERVIEW_MESSAGE,4000],[BotState.APPLICATION_REJECTION_REASON,4000],[BotState.APPLICATION_INTERVIEW_DATE,32],[BotState.APPLICATION_INTERVIEW_PHONE,40]] as const){
   const h=harness();form(h);h.session.state=state;const before=JSON.stringify(h.session.data.application_pipeline);await h.bot.handleTextByState(1,'😀'.repeat(max+1),h.session);assert.equal(JSON.stringify(h.session.data.application_pipeline),before);assert.equal(h.session.state,state);assert.match(h.prompts[0].text,new RegExp(String(max)));assert.equal(h.requests.length,0);
  }
  const h=harness();form(h,'accept');h.session.state=BotState.APPLICATION_INTERVIEW_MESSAGE;await h.bot.handleTextByState(1,'&'.repeat(4000),h.session);assert.equal(h.session.data.application_pipeline.employer_message.length,4000);assert.ok(h.prompts[0].text.length<3000);assert.match(h.prompts[0].text,/&amp;/);assert.match(h.prompts[0].text,/…/);
 });

 test(`${name}: forged edit actions cannot switch the kind of decision being confirmed`,async()=>{
  const h=harness();form(h,'accept');h.bot.loadEmployerApplicationContext=async()=>({app:row(),job:row().jobs});
  for(const action of ['date','address','reason','confirm_interview','confirm_reject'])await h.bot.handleApplicationInterviewAction(1,action,id(1),h.session);
  assert.equal(h.requests.length,0);assert.equal(h.session.data.application_pipeline.mode,'accept');assert.equal(h.session.state,BotState.EMPLOYER_MAIN_MENU);assert.equal(h.notifications.length,0);
 });

 test(`${name}: actual callback dispatch reaches all new application handlers and rejects stale messages`,async()=>{
  const h=harness(),calls:any[]=[];h.session.data.last_prompt_message_id=50;
  const routes=[['appdecision:interview:'+id(1),'handleApplicationDecisionAction'],['appinterview:date:'+id(1),'handleApplicationInterviewAction'],['seekerapps:list','showSeekerApplications'],['seekerapp:view:'+id(1),'showSeekerApplicationDetail'],['dashboard:view','showEmployerDashboard']];
  for(const [data,method] of routes){h.bot[method]=async(...args:any[])=>calls.push({method,args});h.session.data.callback_action_lock=null;await h.bot.handleCallbackQuery({id:'synthetic-callback',from:{id:11},message:{message_id:50,chat:{id:1}},data},h.session);assert.equal(calls.at(-1)?.method,method);assert.equal(h.bot.isFlowSensitiveCallbackAction(data.split(':')[0]),true);}
  const count=calls.length;h.session.data.callback_action_lock=null;await h.bot.handleCallbackQuery({id:'synthetic-stale',from:{id:11},message:{message_id:49,chat:{id:1}},data:'appdecision:hire:'+id(1)},h.session);assert.equal(calls.length,count);assert.equal(h.bot.isHighRiskCallbackAction('appdecision'),true);assert.equal(h.bot.isHighRiskCallbackAction('appinterview'),true);assert.equal(h.requests.length,0);
 });

 test(`${name}: Russian and Uzbek reply menus route to seeker applications and employer statistics`,async()=>{
  for(const lang of ['ru','uz']){const h=harness(),calls:string[]=[];h.session.lang=lang;h.bot.showSeekerApplications=async()=>calls.push('seeker');h.bot.showEmployerDashboard=async()=>calls.push('employer');h.session.data.active_role='job_seeker';h.session.state=BotState.MAIN_MENU;const button=(keys.mainMenuKeyboard(lang,'seeker') as any).keyboard.flat().find((b:any)=>b.text.includes(lang==='ru'?'Мои отклики':'Mening arizalarim')).text;assert.equal(h.bot.isMenuButtonText(button,lang),true);await h.bot.handleTextByState(1,button,h.session);h.session.data.active_role='employer';h.session.state=BotState.EMPLOYER_MAIN_MENU;const dashboard=(keys.employerMainMenuKeyboard(lang) as any).keyboard.flat().find((b:any)=>b.text.includes(lang==='ru'?'Статистика компании':'Kompaniya statistikasi')).text;assert.equal(h.bot.isMenuButtonText(dashboard,lang),true);await h.bot.handleTextByState(1,dashboard,h.session);assert.deepEqual(calls,['seeker','employer']);assert.equal(h.requests.length,0);}
 });

 test(`${name}: seeker list and detail use canonical identity and render saved interview data`,async()=>{
  const application=row({status:'interview_set',interview_date:'2026-10-12T05:30:00Z',interview_address:'Офис <1>',employer_message:'Ждём вас'}),h=harness([{id:id(4)},[application],{id:id(4)},application,{seen:[id(1)],changed:[]}]);h.session.user_id=S;h.session.data.active_role='job_seeker';
  await h.bot.showSeekerApplications(1,h.session);await h.bot.showSeekerApplicationDetail(1,id(1),h.session);
  assert.equal(h.requests.length,5);assert.equal(h.prompts[1].options.requireContentDelivery,true);for(const r of [h.requests[1],h.requests[3]])assert.equal(r.url.searchParams.get('user_id'),'eq.'+S);
  assert.match(h.prompts[1].text,/12.10.2026.*10:30.*UTC\+5/);assert.match(h.prompts[1].text,/Офис &lt;1&gt;/);assert.match(h.prompts[1].text,/Ждём вас/);
  assert.equal(h.prompts[0].options.replyMarkup.inline_keyboard[0][0].callback_data,'seekerapp:view:'+id(1));
 });

 test(`${name}: employer statistics use exact database counts and never display a zero dashboard after failure`,async()=>{
  const h=harness([12,45,6,7,8].map(count=>({count})));await h.bot.showEmployerDashboard(1,h.session);assert.equal(h.requests.length,5);assert.ok(h.requests.every(r=>r.method==='HEAD'));assert.match(h.prompts[0].text,/Активные вакансии: <b>12/);assert.match(h.prompts[0].text,/Всего откликов: <b>45/);
  const fail=harness([{error:{code:'08006'}},...Array.from({length:4},()=>({count:0}))]);await fail.bot.showEmployerDashboard(1,fail.session);assert.match(fail.prompts[0].text,/Не удалось загрузить статистику/);assert.doesNotMatch(fail.prompts[0].text,/Активные вакансии/);
 });

 test(`${name}: seeker pagination preserves the last cursor and refuses a cursor from another account`,async()=>{
  const applications=Array.from({length:11},(_,index)=>row({id:id(index+10)})),h=harness([{id:id(4)},applications,{id:id(4)},[],{id:id(4)}]);h.session.user_id=S;h.session.data.active_role='job_seeker';
  await h.bot.showSeekerApplications(1,h.session);const next=h.session.data.seeker_application_inbox.next.id;assert.equal(next,id(19));await h.bot.showSeekerApplications(1,h.session,next);assert.equal(h.session.data.seeker_application_inbox.page,1);
  h.session.data.seeker_application_inbox={owner:U,next:{id:next,created_at:version},page:1};await h.bot.showSeekerApplications(1,h.session,next);assert.equal(h.requests.length,5);assert.match(h.prompts.at(-1).text,/Не удалось загрузить отклики/);
 });

 test(`${name}: wrong-role callers cannot read employer decisions or seeker application history`,async()=>{
  const employer=harness();employer.session.data.active_role='job_seeker';await employer.bot.handleApplicationDecisionAction(1,'interview',id(1),employer.session);assert.equal(employer.requests.length,0);assert.equal(employer.session.data.application_pipeline,undefined);
  const seeker=harness();await seeker.bot.showSeekerApplications(1,seeker.session);await seeker.bot.showSeekerApplicationDetail(1,id(1),seeker.session);assert.equal(seeker.requests.length,0);assert.equal(seeker.notifications.length,0);
 });

 test(`${name}: decision buttons and full-resume links survive in both language keyboards`,()=>{
  for(const lang of ['ru','uz']){for(const status of ['pending','reviewed','interview_set','accepted','rejected','hired']){const buttons=(keys.applicationViewKeyboard(lang,id(1),status,true) as any).inline_keyboard.flat();assert.ok(buttons.some((b:any)=>b.url?.endsWith('/'+id(1)+'/resume')));for(const b of buttons)if(b.callback_data)assert.ok(Buffer.byteLength(b.callback_data)<=64);const actions=buttons.filter((b:any)=>b.callback_data?.startsWith('appdecision:'));assert.equal(actions.length,status==='pending'||status==='reviewed'?3:status==='interview_set'?2:status==='accepted'?1:0);}
   const main=(keys.mainMenuKeyboard(lang,'seeker') as any).keyboard.flat();assert.ok(main.some((b:any)=>b.text.includes(lang==='ru'?'Мои отклики':'Mening arizalarim')));const employer=(keys.employerMainMenuKeyboard(lang) as any).keyboard.flat();assert.ok(employer.some((b:any)=>b.text.includes(lang==='ru'?'Статистика компании':'Kompaniya statistikasi')));
  }
 });
}
