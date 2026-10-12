export class PollingFailure extends Error {
 constructor(public readonly code:'configuration'|'dry_run'|'webhook_active'|'conflict'|'unauthorized'|'protocol'|'connection',public readonly status=0,public readonly retryAfter=0){
  super(code==='dry_run'?'Disable TELEGRAM_DRY_RUN before receiving real Telegram updates.':code==='webhook_active'?'A webhook is active. Stop its host and explicitly use --switch-from-webhook to change delivery mode.':code==='conflict'?'Another polling worker or webhook is active. Stop the other instance.':code==='unauthorized'?'Telegram rejected the bot credentials.':code==='configuration'?'Bot configuration is missing.':'Telegram polling is unavailable.');
  this.name='PollingFailure';
 }
}
export function pollingConfiguration(env:Record<string,string|undefined>):string{
 if(env.TELEGRAM_DRY_RUN==='1')throw new PollingFailure('dry_run');
 if(!env.TELEGRAM_BOT_TOKEN?.trim()||!env.NEXT_PUBLIC_SUPABASE_URL?.trim()||!env.SUPABASE_SERVICE_ROLE_KEY?.trim())throw new PollingFailure('configuration');
 return env.TELEGRAM_BOT_TOKEN;
}
type Options={token:string;handleUpdate:(update:any)=>Promise<void>;signal:AbortSignal;switchFromWebhook?:boolean;fetchImpl?:typeof fetch;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>;log?:(message:string)=>void};
function pause(ms:number,signal:AbortSignal){return new Promise<void>(resolve=>{
 if(signal.aborted){resolve();return;}
 const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
 const timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});
});}
/** Pure runner: importing this module never connects to Telegram or loads env. */
export async function runPolling(options:Options):Promise<void>{
 if(!options.token?.trim())throw new PollingFailure('configuration');
 const fetcher=options.fetchImpl||fetch,wait=options.sleep||pause,log=options.log||(()=>{}),signal=options.signal;
 const request=async(method:string,body:Record<string,unknown>={},timeoutMs=35000):Promise<any>=>{
  if(signal.aborted)throw new PollingFailure('connection');
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeoutMs);
  try{
   let response:Response;
   try{response=await fetcher(`https://api.telegram.org/bot${options.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});}
   catch{throw new PollingFailure('connection');}
   const data=await response.json().catch(()=>null);
   if(!response.ok||data?.ok!==true){
    const status=Number.isInteger(data?.error_code)?data.error_code:response.status;
    const retry=Number.isSafeInteger(data?.parameters?.retry_after)&&data.parameters.retry_after>0?Math.min(data.parameters.retry_after,86400):0;
    throw new PollingFailure([401,403].includes(status)?'unauthorized':status===409?'conflict':data?'connection':'protocol',status,retry);
   }
   return data.result;
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
 };
 try{
  if(signal.aborted)return;
  const me=await request('getMe');
  if(me?.is_bot!==true||!Number.isSafeInteger(me.id)||me.id<1||typeof me.username!=='string'||!/^[a-z0-9_]{5,32}$/i.test(me.username))throw new PollingFailure('protocol');
  const webhook=await request('getWebhookInfo');
  if(typeof webhook?.url!=='string')throw new PollingFailure('protocol');
  if(webhook.url){
   if(!options.switchFromWebhook)throw new PollingFailure('webhook_active');
   if(await request('deleteWebhook',{drop_pending_updates:false})!==true)throw new PollingFailure('protocol');
   const cleared=await request('getWebhookInfo');if(cleared?.url!=='')throw new PollingFailure('webhook_active');
  }
  if(signal.aborted)return;
  log(`Polling started for @${me.username}.`);
  let offset:number|undefined,failures=0;
  while(!signal.aborted){
   try{
    const updates=await request('getUpdates',{...(offset===undefined?{}:{offset}),timeout:30,limit:100,allowed_updates:['message','callback_query']});
    if(!Array.isArray(updates)||updates.length>100)throw new PollingFailure('protocol');
    let previous=offset===undefined?-1:offset-1;
    for(const update of updates){
     if(!Number.isSafeInteger(update?.update_id)||update.update_id<0||update.update_id<=previous)throw new PollingFailure('protocol');
     previous=update.update_id;
    }
    if(!updates.length)offset=undefined; // Previous offset has been acknowledged; do not retain it through a long idle period.
    for(const update of updates){
     if(signal.aborted)break;
     await options.handleUpdate(update);
     offset=update.update_id+1;
    }
    failures=0;
   }catch(error){
    if(signal.aborted)break;
    if(error instanceof PollingFailure&&['unauthorized','conflict'].includes(error.code))throw error;
    failures++;
    const delay=error instanceof PollingFailure&&error.retryAfter?error.retryAfter*1000:Math.min(1000*2**Math.min(failures,5),30000);
    log(`Polling interrupted; retrying in ${Math.ceil(delay/1000)}s.`);
    await wait(delay,signal);
   }
  }
 }catch(error){
  if(!signal.aborted)throw error instanceof PollingFailure?error:new PollingFailure('connection');
 }
 if(signal.aborted)log('Bot stopped.');
}
