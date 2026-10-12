import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
function split(s:string){let depth=0,start=0;const result:string[]=[];for(let i=0;i<s.length;i++){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&!depth){result.push(s.slice(start,i));start=i+1;}}result.push(s.slice(start));return result;}
function matches(row:any,s:string):boolean{const group=s.match(/^(and|or)\((.*)\)$/);if(group){const parts=split(group[2]).map(p=>matches(row,p));return group[1]==='and'?parts.every(Boolean):parts.some(Boolean);}const m=s.match(/^(\w+)\.(eq|lt|is)\.(.*)$/);assert.ok(m,s);const [,key,op,value]=m;return op==='is'?row[key]==null:op==='eq'?String(row[key])===value:row[key]!=null&&String(row[key])<value;}
for(const [name,prefix] of [['worker','../lib/'],['site','../../ISHDASIZ NEW/lib/']] as const){
 const {isRemoteJob}=require(prefix+'work-mode'),{readAllPublicJobs}=require(prefix+'telegram/public-jobs'),{TelegramBot}=require(prefix+'telegram/telegram-bot');
 const {jobSearchReference}=require(prefix+'telegram/job-search-state');
 test(name+': regional reader combines nationwide remote availability and every keyset page in one AND expression',async()=>{
  const rows=Array.from({length:251},(_,n)=>({id:id(n+1),created_at:n<150?'2026-10-10T00:00:00.123456Z':null,region_id:2,district_id:20,raw_source_json:{work_mode:3}}));
  rows.push({id:id(500),created_at:null,region_id:1,district_id:10,raw_source_json:{work_mode:1}}, {id:id(501),created_at:null,region_id:2,district_id:20,raw_source_json:{work_mode:4}});
  const requests:URL[]=[];
  const client=createClient('https://example.supabase.co','synthetic-test-key',{auth:{persistSession:false},global:{fetch:async(input:any)=>{
   const url=new URL(String(input)),p=url.searchParams;requests.push(url);
   let data=rows.map(r=>({...r,ishdasiz_job_work_mode:isRemoteJob(r)?'remote':'onsite'}));
   const expression=p.get('or')!;assert.equal(p.getAll('or').length,1);assert.ok(expression.includes('or(and(region_id.eq.1,district_id.eq.10),ishdasiz_job_work_mode.eq.remote)'));
   data=data.filter(r=>matches(r,expression.slice(1,-1)));
   if(p.get('created_at')==='is.null')data=data.filter(r=>r.created_at===null&&r.id<p.get('id')!.slice(3));
   data.sort((a,b)=>a.created_at===b.created_at?b.id.localeCompare(a.id):a.created_at===null?1:b.created_at===null?-1:b.created_at.localeCompare(a.created_at));
   return new Response(JSON.stringify(data.slice(0,73)),{headers:{'Content-Type':'application/json'}});
  }}});
  const result=await readAllPublicJobs(client,{regionId:1,districtId:10,includeRemote:true});
  assert.equal(result.length,252);assert.equal(new Set(result.map((r:any)=>r.id)).size,252);assert.ok(!result.some((r:any)=>r.id===id(501)));
  assert.equal(requests.length,5);assert.ok(requests.some(r=>r.searchParams.get('created_at')==='is.null'));
 });
 test(name+': district navigation separates remote work from office districts and omits commuting distance',()=>{
  const bot:any=Object.create(TelegramBot.prototype);
  bot.getDistanceToJob=()=>{throw Error('Remote work must not acquire office distance');};
  const rows=[{id:id(1),work_mode:'remote',region_id:2,district_id:20,district_name:'Distant office'}, {id:id(2),employment_type:'remote',region_id:null,district_id:null}];
  for(const lang of ['ru','uz']){
   const buttons=bot.buildDistrictButtonsList(rows,lang,{latitude:40,longitude:69});
   assert.equal(buttons.length,1);assert.equal(buttons[0].id,'remote');assert.equal(buttons[0].count,2);assert.ok(!buttons[0].name.includes('Distant office'));
   assert.ok(!bot.buildDistrictFallbackHint(lang,rows,{latitude:40,longitude:69}).includes('km'));
   assert.deepEqual(bot.buildRegionButtonsList(rows,lang),[]);
  }
  assert.equal(jobSearchReference(rows[0]).work_mode,'remote');assert.equal(jobSearchReference(rows[1]).employment_type,'remote');
 });
 test(name+': selecting remote, a physical district or all uses the correct current list',async()=>{
  const bot:any=Object.create(TelegramBot.prototype),rows=[{id:id(1),work_mode:'remote',district_id:10},{id:id(2),work_mode:'onsite',district_id:10},{id:id(3),work_mode:'hybrid',district_id:20}];
  bot.getRegionMatchedJobsForResume=async()=>rows;bot.setSession=async(s:any,p:any)=>Object.assign(s,p);let shown=0;bot.showJob=async()=>{shown++;};
  for(const [choice,expected] of [['remote',[id(1)]],['10',[id(2)]],['all',rows.map(r=>r.id)]] as const){
   const session:any={lang:'ru',data:{search_region_id:1,account_session_version:7}};
   await bot.handleDistrictSearch(10,choice,session);assert.deepEqual(session.data.job_list.map((r:any)=>r.id),expected);assert.equal(session.data.account_session_version,7);
  }
  assert.equal(shown,3);
 });
}
