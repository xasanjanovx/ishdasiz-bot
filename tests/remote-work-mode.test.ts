import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';process.env.TELEGRAM_BOT_TOKEN='synthetic-test-token';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const A='00000000-0000-4000-8000-000000000001',S='00000000-0000-4000-8000-000000000002',J='20000000-0000-4000-8000-000000000001';
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const job=(patch:any={})=>({id:J,title_ru:'Бухгалтер',field_id:2,region_id:22,district_id:2201,
 is_active:true,status:'active',source_status:null,user_id:S,employer_id:null,raw_source_json:{},...patch});
for(const [name,prefix] of [['worker','../lib/'],['site','../../ISHDASIZ NEW/lib/']] as const){
 const {getJobWorkMode,parseWorkMode,isRemoteJob}=require(prefix+'work-mode');
 const {getWorkModeLabel}=require(prefix+'mappings');
 const {calculateMatchScore}=require(prefix+'telegram/job-matcher');
 const {TelegramBot}=require(prefix+'telegram/telegram-bot');

 test(`${name}: canonical and legacy work formats display consistently in Russian and Uzbek`,()=>{
  for(const [code,mode,ru,uz] of [[1,'onsite','На месте','Ish joyida'],[2,'home','Работа из дома','Uydan ishlash'],
   [3,'remote','Удалённая работа','Masofaviy'],[4,'hybrid','Гибрид (офис + удалённо)','Gibrid (ish joyi + masofaviy)']]){
   for(const value of [code,String(code),mode,ru,uz]){
    assert.equal(parseWorkMode(value),mode);assert.equal(getWorkModeLabel({work_mode:value},'ru'),ru);
    assert.equal(getWorkModeLabel({work_mode:value},'uz'),uz);
   }
  }
  for(const value of [' REMOTE ','Удаленно','Удалённая','masofadan ishlash','fully remote'])assert.equal(parseWorkMode(value),'remote');
  assert.equal(parseWorkMode('on_site'),'onsite');
 });

 test(`${name}: explicit office/hybrid formats win over legacy remote metadata and unknown text is not guessed`,()=>{
  for(const mode of ['onsite','hybrid','home']){
   const row={work_mode:mode,employment_type:'remote',raw_source_json:{work_mode:3}};
   assert.equal(getJobWorkMode(row),mode);assert.equal(isRemoteJob(row),false);
  }
  for(const mode of ['not remote','не удаленная','hybrid or remote','remote / office']){
   assert.equal(getJobWorkMode({work_mode:mode,employment_type:'remote'}),null);
   assert.equal(isRemoteJob({work_mode:mode}),false);
  }
  assert.equal(getJobWorkMode({work_format:'Удалённая работа'}),'remote');
  assert.equal(getJobWorkMode({raw_source_json:{workplace_type:3}}),'remote');
  assert.equal(getJobWorkMode({employment_type:'remote'}),'remote');
 });

 test(`${name}: normalization and the existing location criterion agree on legacy remote and conflicting physical formats`,()=>{
  const bot:any=Object.create(TelegramBot.prototype),profile={region_id:22,district_id:2201,field_id:2,title:'Бухгалтер'};
  const canonical=calculateMatchScore(profile,job({work_mode:'remote'}));
  for(const patch of [{work_mode:'Удалённая работа'},{work_mode:'Masofaviy'},{raw_source_json:{work_mode:3}},{employment_type:'remote'}]){
   const raw=job(patch),normalized=bot.normalizeJob(raw,'ru');
   assert.equal(normalized.work_mode,'remote');assert.equal(calculateMatchScore(profile,normalized).matchScore,canonical.matchScore);
   assert.deepEqual(calculateMatchScore(profile,raw).matchCriteria,canonical.matchCriteria);
  }
  for(const work_mode of ['onsite','hybrid'])assert.equal(calculateMatchScore(profile,job({work_mode,employment_type:'remote'})).matchCriteria.location,true);
 });

 test(`${name}: remote vacancies search all canonical regions while office and hybrid retain vacancy location`,async()=>{
  const {REGION_COORDINATES}=require(prefix+'constants'),regions=Object.keys(REGION_COORDINATES).map(Number);
  const rows=regions.map((region_id:number,i:number)=>({id:id(i+1),user_id:S,status:'active',is_public:true,found_job:false,
   title:'Бухгалтер',field_id:2,region_id,district_id:region_id*100+1}));
  for(const patch of [{work_mode:'remote'},{work_mode:'Удалённая работа'},{raw_source_json:{work_mode:3}},
   {employment_type:'remote'},{work_mode:'hybrid',employment_type:'remote'},{work_mode:'onsite'},{work_mode:2}]){
   const bot:any=Object.create(TelegramBot.prototype),requests:any[]=[];
   bot.supabase=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false},global:{fetch:async(input:any,init:any)=>{
    assert.equal(new URL(String(input)).pathname,'/rest/v1/rpc/ishdasiz_bot_candidates');
    const body=JSON.parse(init.body);requests.push(body);assert.equal(body.p_user_id,A);assert.equal(body.p_session_version,3);assert.equal(body.p_job_id,J);
    const data=rows.filter((r:any)=>(body.p_region===null||body.p_region===r.region_id)&&(!body.p_after_id||r.id>body.p_after_id));
    return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
   }}});
   const session:any={telegram_user_id:10,user_id:A,lang:'ru',data:{active_role:'employer',account_session_version:3}};
   bot.updateSession=async()=>{};bot.sendPrompt=async()=>{};bot.sendSeriousSticker=async()=>{};
   bot.getDistrictNameById=async()=>null;bot.getRegionNameById=async()=>null;
   bot.applyAiRerankToResumeMatches=async()=>[];bot.saveMatchRecommendations=async()=>{};bot.showEmployerResumeMatch=async()=>{};
   const vacancy=job(patch);await bot.showMatchingResumesForJob(10,session,vacancy);
   const remote=isRemoteJob(vacancy);
   assert.equal(requests.length,2);assert.ok(requests.every(r=>r.p_region===(remote?null:22)));
   assert.equal(session.data.worker_resume_list.length,remote?14:1);
   if(remote)assert.deepEqual(session.data.worker_region_resume_list.map((r:any)=>r.region_id).sort(),[...regions].sort());
  }
 });

 test(`${name}: remote cards omit distance to the office and physical formats keep it`,async()=>{
  for(const patch of [{work_mode:'remote'},{work_mode:'Удалённая работа'},{raw_source_json:{work_mode:3}},
   {employment_type:'remote'},{work_mode:'hybrid',employment_type:'remote'},{work_mode:'onsite'}]){
   const bot:any=Object.create(TelegramBot.prototype),fresh=job(patch);let geoCalls=0;const messages:any[]=[];
   bot.supabase=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false},global:{fetch:async(input:any)=>{
    const path=new URL(String(input)).pathname;
    const data=path==='/rest/v1/jobs'?fresh:path==='/rest/v1/users'?[{id:S,closed_at:null}]:path==='/rest/v1/favorites'?[]:assert.fail('Unexpected query');
    return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
   }}});
   bot.getSeekerGeo=async()=>{geoCalls++;return{latitude:40,longitude:72};};bot.getDistanceToJob=()=>123;
   bot.getRegionNameById=async()=> 'Tashkent';bot.getDistrictNameById=async()=> 'Office district';
   bot.getRegionMatchedJobsForResume=async()=>[];bot.updateSession=async()=>{};
   const session:any={telegram_user_id:10,user_id:A,lang:'ru',data:{job_list:[fresh],account_session_version:3,active_role:'job_seeker'}};
   const original=globalThis.fetch;
   try{
    process.env.TELEGRAM_DRY_RUN='0';globalThis.fetch=async(input:any,init:any)=>{
     assert.match(String(input),/^https:\/\/api\.telegram\.org\/botsynthetic-test-token\/sendMessage$/);
     const message=JSON.parse(init.body);messages.push(message);
     return new Response(JSON.stringify({ok:true,result:{message_id:123,text:message.text}}),{headers:{'Content-Type':'application/json'}});
    };
    await bot.showJob(10,session,0);
   }finally{globalThis.fetch=original;process.env.TELEGRAM_DRY_RUN='1';}
   assert.equal(messages.length,1);
   if(isRemoteJob(fresh)){assert.equal(geoCalls,0);assert.doesNotMatch(messages[0].text,/Расстояние/);assert.match(messages[0].text,/Формат: удалённый/);}
   else{assert.equal(geoCalls,1);assert.match(messages[0].text,/Расстояние/);assert.doesNotMatch(messages[0].text,/Формат: удалённый/);}
  }
 });
}
