import type {SupabaseClient} from '@supabase/supabase-js';
const relation=(value:any)=>Array.isArray(value)?value[0]:value;
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export async function visibleSavedJobs(client:SupabaseClient,jobs:any[]){
 const candidates=jobs.filter(job=>job.is_active===true&&[null,undefined,'active','published','open'].includes(job.status)&&!['filled','removed_at_source','archived','deleted','inactive','paused','on_hold','closed'].includes(job.source_status));
 const owner=(job:any)=>job.employer_id?relation(job.employer_profiles)?.user_id:job.user_id||job.created_by||null;
 const ids=Array.from(new Set<string>(candidates.map(owner).filter(Boolean))),open=new Set<string>();
 for(let start=0;start<ids.length;start+=100){let result:any=await client.from('users').select('id,closed_at').in('id',ids.slice(start,start+100));
  if(result.error&&['42703','PGRST204'].includes(result.error.code)&&/closed_at/.test(result.error.message))result=await client.from('users').select('id').in('id',ids.slice(start,start+100));
  if(result.error)throw new Error('Saved jobs unavailable');for(const row of result.data||[])if(!row.closed_at)open.add(row.id);
 }
 return candidates.filter(job=>{const id=owner(job);return job.employer_id&&!id?false:id?open.has(id):true;});
}
export async function toggleSavedJob(client:SupabaseClient,userId:string,epoch:number,jobId:string){
 if(!uuid(jobId))throw new Error('Invalid job');
 const existing=await client.from('favorites').select('id').eq('user_id',userId).eq('job_id',jobId).maybeSingle();if(existing.error)throw new Error('Saved state unavailable');
 const desired=!existing.data;
 const result=await client.rpc('ishdasiz_set_job_favorite',{p_user_id:userId,p_session_version:epoch,p_job_id:jobId,p_favorite:desired});
 if(result.error||result.data!==desired)throw new Error('Saved state unavailable');return desired;
}
export async function readSavedJobs(client:SupabaseClient,userId:string){
 const saved:any[]=[];
 for(let start=0;;start+=500){const result=await client.from('favorites').select('id,job_id,created_at').eq('user_id',userId).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(start,start+499);
  if(result.error)throw new Error('Saved jobs unavailable');saved.push(...result.data||[]);if((result.data?.length||0)<500)break;
 }
 const jobIds=Array.from(new Set<string>(saved.map(row=>row.job_id))),jobs:any[]=[];
 for(let start=0;start<jobIds.length;start+=100){const result=await client.from('jobs').select('*,regions(name_uz,name_ru),districts(name_uz,name_ru),categories(name_uz,name_ru),employer_profiles(company_name,user_id)').in('id',jobIds.slice(start,start+100)).eq('is_active',true).or('status.eq.active,status.eq.published,status.eq.open,status.is.null');
  if(result.error)throw new Error('Saved jobs unavailable');jobs.push(...result.data||[]);
 }
 const available=new Map((await visibleSavedJobs(client,jobs)).map(job=>[job.id,job]));
 return {hasSaved:saved.length>0,jobs:jobIds.map(id=>available.get(id)).filter(Boolean)};
}
