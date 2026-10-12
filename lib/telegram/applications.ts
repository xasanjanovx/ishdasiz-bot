import type {SupabaseClient} from '@supabase/supabase-js';
export class ApplicationError extends Error{constructor(public kind:'unavailable'|'resume'|'duplicate'|'own'|'failed'){super('Application '+kind);}}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const phone=(value:unknown)=>{if(typeof value!=='string'||!/^\+?[\d\s().-]+$/.test(value.trim()))return null;let digits=value.replace(/[^0-9]/g,'');if(digits.length===9)digits='998'+digits;return /^998\d{9}$/.test(digits)?'+'+digits:null;};
export async function submitBotApplication(client:SupabaseClient,session:any,jobId:string){
 const userId=session.user_id,epoch=session.data?.account_session_version??0;
 if(!uuid(userId)||!uuid(jobId)||!Number.isSafeInteger(epoch)||epoch<0)throw new ApplicationError('unavailable');
 const selected=session.data?.active_resume_id;
 if(selected!=null&&!uuid(selected))throw new ApplicationError('resume');
 let query=client.from('resumes').select('id,full_name,phone').eq('user_id',userId).eq('status','active');
 query=selected?query.eq('id',selected):query.order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(1);
 const {data:resume,error:resumeError}=await query.maybeSingle();
 if(resumeError)throw new ApplicationError('failed');if(!resume)throw new ApplicationError('resume');
 const contact=phone(resume.phone)||phone(session.phone);
 if(!contact)throw new ApplicationError('failed');
 const {data,error}=await client.rpc('ishdasiz_submit_application',{p_user_id:userId,p_session_version:epoch,p_job_id:jobId,p_resume_id:resume.id,p_phone:contact,p_message:null});
 if(error)throw new ApplicationError(error.code==='23505'?'duplicate':error.code==='40001'?'own':['P0002','42501'].includes(error.code)?'unavailable':'failed');
 if(!uuid(data?.id)||data.status!=='pending')throw new ApplicationError('failed');
 return {id:data.id,fullName:typeof resume.full_name==='string'&&resume.full_name.trim()?resume.full_name.trim():'Nomzod'};
}
