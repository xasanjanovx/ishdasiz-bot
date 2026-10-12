import {test} from 'node:test';
import assert from 'node:assert/strict';
const TOKEN='synthetic-polling-token';
for(const [name,path] of [['worker','../lib/telegram/polling'],['site','../../ISHDASIZ NEW/lib/telegram/polling']] as const){
 const {runPolling,pollingConfiguration}=require(path);
 function harness(replies:any[],handler?:any){const controller=new AbortController(),requests:any[]=[],logs:string[]=[],handled:number[]=[],waits:number[]=[];
  const fetchImpl=async(url:any,init:any)=>{const method=String(url).split('/').at(-1),body=JSON.parse(init.body);requests.push({method,body,signal:init.signal});const next=replies.shift();assert.notEqual(next,undefined,'Unexpected Telegram mutation/request');if(next instanceof Error)throw next;const value=typeof next==='function'?await next({method,body,signal:init.signal,controller}):next;if(value instanceof Response)return value;return new Response(JSON.stringify({ok:true,result:value}),{status:200});};
  const options={token:TOKEN,signal:controller.signal,fetchImpl,log:(line:string)=>logs.push(line),sleep:async(ms:number)=>{waits.push(ms);},handleUpdate:async(update:any)=>{handled.push(update.update_id);if(handler)await handler(update,controller);}};
  return{controller,requests,logs,handled,waits,options,run:()=>runPolling(options)};
 }
 test(name+': receiving live updates is refused with dry-run mode or incomplete credentials',()=>{
  const env={TELEGRAM_BOT_TOKEN:TOKEN,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'};
  assert.equal(pollingConfiguration(env),TOKEN);assert.throws(()=>pollingConfiguration({...env,TELEGRAM_DRY_RUN:'1'}),(e:any)=>e.code==='dry_run');
  for(const key of Object.keys(env))assert.throws(()=>pollingConfiguration({...env,[key]:' '}),(e:any)=>e.code==='configuration');
 });
 const me={id:101,is_bot:true,username:'ishdasizbot'},empty={url:''};
 test(name+': default startup never removes an active webhook or consumes its pending updates',async()=>{
  const h=harness([me,{url:'https://ishdasiz.uz/api/telegram/webhook'}]);await assert.rejects(h.run(),(e:any)=>e.code==='webhook_active');assert.deepEqual(h.requests.map(x=>x.method),['getMe','getWebhookInfo']);
 });
 test(name+': explicit mode switch preserves pending messages and verifies the cleared webhook before polling',async()=>{
  const h=harness([me,{url:'https://ishdasiz.uz/api/telegram/webhook'},true,empty,({controller}:any)=>{controller.abort();return [];}]);h.options.switchFromWebhook=true;await h.run();assert.deepEqual(h.requests.map(x=>x.method),['getMe','getWebhookInfo','deleteWebhook','getWebhookInfo','getUpdates']);assert.deepEqual(h.requests[2].body,{drop_pending_updates:false});
 });
 test(name+': a failed or unconfirmed mode switch never begins polling',async()=>{
  for(const replies of [[false],[true,{url:'https://still-active.example'}]]){const h=harness([me,{url:'https://active.example'},...replies]);h.options.switchFromWebhook=true;await assert.rejects(h.run());assert.ok(h.requests.every(x=>x.method!=='getUpdates'));}
 });
 test(name+': offset advances only past successfully handled updates and preserves a failed update for retry',async()=>{
  let failed=false;const h=harness([me,empty,[{update_id:10,text:'secret first'},{update_id:11,text:'secret OTP 123456'},{update_id:12}],({body}:any)=>{assert.equal(body.offset,11);return [{update_id:11},{update_id:12}];}],async(u:any,c:any)=>{if(u.update_id===11&&!failed){failed=true;throw Error('database unavailable '+TOKEN);}if(u.update_id===12)c.abort();});await h.run();assert.deepEqual(h.handled,[10,11,11,12]);assert.equal(h.requests[2].body.offset,undefined);assert.equal(h.waits.length,1);assert.ok(h.logs.every(line=>!line.includes(TOKEN)&&!line.includes('123456')&&!line.includes('secret')));
 });
 test(name+': an empty acknowledged batch clears the offset instead of retaining it over a long idle period',async()=>{
  const h=harness([me,empty,[{update_id:100}],({body}:any)=>{assert.equal(body.offset,101);return [];},({body,controller}:any)=>{assert.equal(body.offset,undefined);controller.abort();return [];}]);await h.run();assert.deepEqual(h.handled,[100]);
 });
 test(name+': shutdown during handling completes the current update and leaves later updates unconsumed',async()=>{
  const h=harness([me,empty,[{update_id:1},{update_id:2}]],async(_u:any,c:any)=>{c.abort();});await h.run();assert.deepEqual(h.handled,[1]);assert.equal(h.requests.length,3);
 });
 test(name+': invalid, duplicate, unordered or oversized batches never reach the handler or advance an offset',async()=>{
  for(const batch of [{unexpected:true},[{update_id:-1}],[{update_id:1},{update_id:1}],[{update_id:2},{update_id:1}],Array.from({length:101},(_,i)=>({update_id:i}))]){const h=harness([me,empty,batch,({body,controller}:any)=>{assert.equal(body.offset,undefined);controller.abort();return [];}]);await h.run();assert.deepEqual(h.handled,[]);assert.equal(h.waits.length,1);}
 });
 test(name+': a conflicting poller stops instead of repeatedly deleting another webhook',async()=>{
  const h=harness([me,empty,new Response(JSON.stringify({ok:false,error_code:409,description:'conflict '+TOKEN}),{status:409})]);await assert.rejects(h.run(),(e:any)=>e.code==='conflict'&&!e.message.includes(TOKEN));assert.equal(h.waits.length,0);assert.ok(h.requests.every(x=>x.method!=='deleteWebhook'));
 });
 test(name+': invalid credentials stop without logging Telegram descriptions or tokens',async()=>{
  const h=harness([new Response(JSON.stringify({ok:false,error_code:401,description:TOKEN}),{status:401})]);await assert.rejects(h.run(),(e:any)=>e.code==='unauthorized'&&!e.message.includes(TOKEN));assert.deepEqual(h.logs,[]);
 });
 test(name+': rate limits respect retry_after and never expose payloads in the log',async()=>{
  const h=harness([me,empty,new Response(JSON.stringify({ok:false,error_code:429,parameters:{retry_after:120}}),{status:429}),({controller}:any)=>{controller.abort();return [];}]);await h.run();assert.deepEqual(h.waits,[120000]);assert.ok(h.logs.some(x=>x.includes('120s')));
 });
 test(name+': stop aborts a pending long poll without retrying or advancing the queue',async()=>{
  const h=harness([me,empty,({signal,controller}:any)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted '+TOKEN)),{once:true});controller.abort();})]);await h.run();assert.deepEqual(h.waits,[]);assert.deepEqual(h.handled,[]);
 });
 test(name+': a missing bot identity or malformed webhook response fails before polling',async()=>{
  for(const replies of [[{id:101,is_bot:false,username:'ishdasizbot'}],[me,{}]]){const h=harness(replies);await assert.rejects(h.run(),(e:any)=>e.code==='protocol');assert.ok(h.requests.every(x=>x.method!=='getUpdates'));}
 });
}
