/** Starting this entry point connects to the real bot. Tests import polling.ts instead. */
import dotenv from 'dotenv';
import {runPolling,PollingFailure,pollingConfiguration} from '../lib/telegram/polling';
dotenv.config({path:'.env.local',quiet:true});
dotenv.config({path:'.env',quiet:true});
process.env.NODE_ENV ||= process.argv.includes('--development')?'development':'production';
async function main(){
 const token=pollingConfiguration(process.env);
 const controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  await runPolling({token,signal:controller.signal,switchFromWebhook:process.argv.includes('--switch-from-webhook'),log:message=>console.log(message),
   handleUpdate:async update=>{const {telegramBot}=await import('../lib/telegram/telegram-bot');await telegramBot.handleUpdate(update);}});
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
main().catch(error=>{console.error(error instanceof PollingFailure?error.message:'Bot startup failed. Check the configuration.');process.exitCode=1;});
