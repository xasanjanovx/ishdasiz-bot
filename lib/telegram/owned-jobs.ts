import type {SupabaseClient} from '@supabase/supabase-js';
type EmployerContext={userId:string|null;employerId:string|null};
export type OwnedJob={id:string;title_uz:string|null;title_ru:string|null;title?:string|null;employer_id:string|null;user_id:string|null;created_by:string|null;contact_phone:string|null;company_name:string|null;created_at:string|null;updated_at:string|null;status:string|null;is_active:boolean|null;is_imported:boolean|null;source:string|null;source_status:string|null};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export const unavailableSourceStates=['filled','removed_at_source','archived','deleted','inactive','paused','on_hold','closed'];
export function ownsEmployerJob(job:any,context:EmployerContext):boolean{
 if(!job||!context?.userId)return false;
 if(job.employer_id)return Boolean(context.employerId&&String(job.employer_id).toLowerCase()===context.employerId.toLowerCase());
 return job.user_id?String(job.user_id).toLowerCase()===context.userId.toLowerCase():String(job.created_by||'').toLowerCase()===context.userId.toLowerCase();
}
export function employerJobState(job:any){
 const status=String(job?.status||'').trim().toLowerCase(),hasActive=typeof job?.is_active==='boolean';
 const isArchived=status==='archived',isFilled=isArchived||['filled','closed'].includes(status);
 const isSourceUnavailable=(job?.is_imported===true||job?.source==='osonish')&&unavailableSourceStates.includes(String(job?.source_status||'').trim().toLowerCase());
 const isUnknown=!status&&!hasActive;
 const isPaused=!isFilled&&(job?.is_active===false||isSourceUnavailable||isUnknown||Boolean(status&&!['active','published','open'].includes(status)));
 return {isPaused,isFilled,isUnknown,isArchived,isSourceUnavailable};
}
export async function readOwnedJobs(client:SupabaseClient,context:EmployerContext,options:{limit?:number;offset?:number;scope?:'all'|'current'|'archived'|'available'}={}):Promise<OwnedJob[]>{
 const limit=options.limit??30,offset=options.offset??0,scope=options.scope??'all';
 if(!uuid(context.userId)||context.employerId!==null&&!uuid(context.employerId)||!Number.isSafeInteger(limit)||limit<1||limit>1000||!Number.isSafeInteger(offset)||offset<0||offset>100000||!['all','current','archived','available'].includes(scope))throw new Error('Owned vacancies unavailable');
 const user=context.userId.toLowerCase(),employer=context.employerId?.toLowerCase();
 const ownership=[...(employer?[`employer_id.eq.${employer}`]:[]),`and(employer_id.is.null,user_id.eq.${user})`,`and(employer_id.is.null,user_id.is.null,created_by.eq.${user})`].join(',');
 const filter=scope==='archived'?`and(or(${ownership}),status.eq.archived)`:scope==='current'?`and(or(${ownership}),or(status.is.null,status.neq.archived))`:ownership;
 const rows:OwnedJob[]=[],seen=new Set<string>(),deadline=AbortSignal.timeout(15000);
 while(rows.length<limit){
  const take=Math.min(500,limit-rows.length),start=offset+rows.length;
  let query=client.from('jobs').select('id,title_uz,title_ru,employer_id,user_id,created_by,contact_phone,company_name,created_at,updated_at,status,is_active,is_imported,source,source_status').or(filter);
  if(scope==='available')query=query.eq('ishdasiz_job_available',true);
  const result=await query.order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(start,start+take-1).abortSignal(deadline);
  if(result.error||!Array.isArray(result.data)||result.data.length>take)throw new Error('Owned vacancies unavailable');
  for(const row of result.data){
   if(!uuid(row.id)||seen.has(row.id)||!['employer_id','user_id','created_by'].every(key=>Object.prototype.hasOwnProperty.call(row,key))||!ownsEmployerJob(row,context)||scope==='archived'&&row.status!=='archived'||scope==='current'&&row.status==='archived'||scope==='available'&&(()=>{const state=employerJobState(row);return row.is_active!==true||state.isFilled||state.isPaused||state.isUnknown;})())throw new Error('Owned vacancies unavailable');
   seen.add(row.id);rows.push({...row,title:row.title_uz||row.title_ru||null} as OwnedJob);
  }
  if(result.data.length<take)break;
 }
 return rows;
}
