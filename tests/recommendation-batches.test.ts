import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
process.env.TELEGRAM_DRY_RUN='1';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-key';
const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const entries=()=>Array.from({length:451},(_,i)=>({targetId:id(i+1),score:95,strictScore:94,aiScore:96,reason:'SENSITIVE SYNTHETIC REASON'}));
for(const [name,file] of [['worker','../lib/telegram/telegram-bot'],['site','../../ISHDASIZ NEW/lib/telegram/telegram-bot']] as const){
 const {TelegramBot}=require(file);
 function harness(reply:(n:number)=>Response|Promise<Response>){
  const bot:any=Object.create(TelegramBot.prototype),requests:any[]=[];
  bot.supabase=createClient('https://example.supabase.co','synthetic-test-key',{
   auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any)=>{
    const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/telegram_match_recommendations');
    requests.push({url,body:JSON.parse(init.body),signal:init.signal});return reply(requests.length);
   }},
  });
  return{bot,requests};
 }
 const success=()=>new Response(null,{status:201});
 test(`${name}: large recommendation sets use serial 200-row batches with one deadline and no truncation`,async()=>{
  const h=harness(success),input:any[]=entries();input.push({targetId:id(999),score:89},{targetId:'',score:99});
  await h.bot.saveMatchRecommendations('employer_to_resume',id(9000),input);
  assert.deepEqual(h.requests.map(r=>r.body.length),[200,200,51]);
  const rows=h.requests.flatMap(r=>r.body);assert.equal(rows.length,451);
  assert.deepEqual(rows.map(r=>r.target_id),entries().map(r=>r.targetId));
  assert.ok(rows.every(r=>r.direction==='employer_to_resume'&&r.source_id===id(9000)&&r.score===95&&r.is_active));
  assert.ok(h.requests.every(r=>r.signal===h.requests[0].signal&&r.url.searchParams.get('on_conflict')==='direction,source_id,target_id'));
  assert.ok(h.requests[0].signal instanceof AbortSignal);
 });
 test(`${name}: rejected or thrown batches stop without fallback writes or private diagnostic output`,async()=>{
  for(const thrown of [false,true]){
   const h=harness(n=>{
    if(n===1)return success();
    if(thrown)throw Error('SENSITIVE TRANSPORT DETAIL');
    return new Response(JSON.stringify({code:'42501',message:'SENSITIVE SQL DETAIL'}),{status:403});
   });
   const warn=console.warn,warnings:any[]=[];
   try{console.warn=(...args:any[])=>warnings.push(args);await assert.doesNotReject(h.bot.saveMatchRecommendations('seeker_to_job',id(9000),entries()));}
   finally{console.warn=warn;}
   assert.equal(h.requests.length,2);assert.equal(warnings.length,1);
   assert.doesNotMatch(JSON.stringify(warnings),/SENSITIVE|10000000-/);
  }
 });
 test(`${name}: the overall write deadline prevents another batch and cannot fail the completed search`,async()=>{
  const originalNow=Date.now,warn=console.warn;let now=originalNow();const warnings:any[]=[];
  const h=harness(()=>{now+=15001;return success();});
  try{
   Date.now=()=>now;console.warn=(...args:any[])=>warnings.push(args);
   await assert.doesNotReject(h.bot.saveMatchRecommendations('seeker_to_job',id(9000),entries()));
  }finally{Date.now=originalNow;console.warn=warn;}
  assert.equal(h.requests.length,1);assert.equal(warnings.length,1);
 });
 test(`${name}: a missing recommendation table preserves best-effort behavior without individual fallback`,async()=>{
  const h=harness(()=>new Response(JSON.stringify({code:'42P01',message:'relation does not exist'}),{status:404}));
  const warn=console.warn,warnings:any[]=[];
  try{console.warn=(...args:any[])=>warnings.push(args);await h.bot.saveMatchRecommendations('employer_to_resume',id(9000),entries());}
  finally{console.warn=warn;}
  assert.equal(h.requests.length,1);assert.deepEqual(warnings,[]);
 });
}
