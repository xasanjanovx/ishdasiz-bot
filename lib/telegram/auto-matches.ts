import type {SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {resumeUuid} from './owned-resumes';
function actor(session:any,role:'employer'|'job_seeker'){
 const epoch=session.data?.account_session_version??0;
 if(!resumeUuid(session.user_id)||session.data?.active_role!==role||!Number.isSafeInteger(epoch)||epoch<0)throw new Error('Recommendation account unavailable');
 return {p_user:session.user_id,p_epoch:epoch};
}
export async function storeAutoMatch(client:SupabaseClient,session:any,job:string,resume:string,recipient:string,score:number,criteria:any){
 const scope=actor(session,'employer'),token=randomUUID();
 if(!resumeUuid(job)||!resumeUuid(resume)||!resumeUuid(recipient)||!Number.isInteger(score)||score<0||score>100||!criteria||typeof criteria!=='object'||Array.isArray(criteria))throw new Error('Invalid recommendation');
 const {data,error}=await client.rpc('ishdasiz_auto_match_store',{...scope,p_job:job,p_resume:resume,p_recipient:recipient,p_score:score,p_criteria:criteria,p_token:token}).abortSignal(AbortSignal.timeout(15000));
 if(error||!resumeUuid(data?.id)||data.job_id!==job||data.resume_id!==resume||data.user_id!==recipient||data.job?.id!==job||data.match_score!==score||!['ru','uz'].includes(data.lang)
  ||data.notification_token!==null&&(data.notification_token!==token||!Number.isSafeInteger(data.telegram_user_id)||data.telegram_user_id<1)
  ||data.notification_token===null&&data.telegram_user_id!==null)throw new Error('Recommendation storage unconfirmed');
 return data;
}
export async function recordAutoMatchDelivery(client:SupabaseClient,match:any,outcome:'sent'|'uncertain'|'rejected',messageId:number|null=null){
 if(!resumeUuid(match?.id)||!resumeUuid(match.notification_token)||!['sent','uncertain','rejected'].includes(outcome)||outcome==='sent'&&(!Number.isSafeInteger(messageId)||Number(messageId)<1)||outcome!=='sent'&&messageId!==null)throw new Error('Invalid recommendation delivery');
 const {data,error}=await client.rpc('ishdasiz_auto_match_delivery',{p_match:match.id,p_token:match.notification_token,p_outcome:outcome,p_message:messageId}).abortSignal(AbortSignal.timeout(15000));
 if(error||data!==true)throw new Error('Recommendation delivery unconfirmed');
}
export async function actOnAutoMatch(client:SupabaseClient,session:any,id:string,action:'view'|'interested'|'skip',job:string|null=null){
 const scope=actor(session,'job_seeker');
 if(!resumeUuid(id)||job!==null&&!resumeUuid(job)||!['view','interested','skip'].includes(action))throw new Error('Invalid recommendation action');
 const {data,error}=await client.rpc('ishdasiz_auto_match_action',{...scope,p_match:id,p_action:action,p_job:job}).abortSignal(AbortSignal.timeout(15000));
 if(error||data?.id!==id||data.user_id!==session.user_id||!resumeUuid(data.resume_id)||!resumeUuid(data.job_id)||job!==null&&data.job_id!==job
  ||action==='skip'&&data.seeker_response!=='not_interested'||action==='interested'&&data.seeker_response!=='interested'
  ||action!=='skip'&&data.job?.id!==data.job_id)throw new Error('Recommendation action unconfirmed');
 return data;
}
