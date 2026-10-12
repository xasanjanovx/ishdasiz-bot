import type {SupabaseClient} from '@supabase/supabase-js';
import {visibleSavedJobs} from './saved-jobs';
import {jobSearchRevision} from './job-search-state';

export type PublicJobCounts={total:number;districts:Record<string,number>;categories:Record<string,number>};
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function counts(value:unknown,key:'districts'|'categories'):value is Record<string,number>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 return Object.entries(value).every(([id,n])=>count(n)&&(key==='districts'?/^[1-9]\d*$/.test(id):/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)));
}
export async function publicJobCounts(client:SupabaseClient,regionId?:number|null,districtId?:number|null):Promise<PublicJobCounts>{
 for(const id of [regionId,districtId])if(id!=null&&(!Number.isSafeInteger(id)||id<1))throw new Error('Invalid location');
 const {data,error}=await client.rpc('ishdasiz_public_job_counts',{p_region:regionId??null,p_district:districtId??null});
 if(error||!data||!count(data.total)||!counts(data.districts,'districts')||!counts(data.categories,'categories')||
  Object.values(data.districts).reduce((a:number,b:any)=>a+b,0)>data.total||Object.values(data.categories).reduce((a:number,b:any)=>a+b,0)>data.total)throw new Error('Public job counts unavailable');
 return data as PublicJobCounts;
}
export async function readAllPublicJobs(client:SupabaseClient,filters:{regionId?:number|null;districtId?:number|null;includeRemote?:boolean}={},mapRow?:(row:any)=>any):Promise<any[]>{
 for(const id of [filters.regionId,filters.districtId])if(id!=null&&(!Number.isSafeInteger(id)||id<1))throw new Error('Invalid location');
 const rows:any[]=[],seen=new Set<string>();
 let last:any=null;
 const controller=new AbortController();
 const deadline=Date.now()+30000;
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
  while(true){
   if(Date.now()>=deadline)throw new Error('Public job search timed out');
   const size=200;
   let query=client.from('jobs').select('*,regions(name_uz,name_ru),districts(name_uz,name_ru),categories(name_uz,name_ru),employer_profiles(company_name)')
    .eq('ishdasiz_job_available',true).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(size);
   const clauses:string[]=[];
   const location:string[]=[];
   if(filters.includeRemote){
    if(filters.regionId!=null)location.push('region_id.eq.'+filters.regionId);
    if(filters.districtId!=null)location.push('district_id.eq.'+filters.districtId);
    if(location.length)clauses.push('or('+(location.length>1?'and('+location.join(',')+')':location[0])+',ishdasiz_job_work_mode.eq.remote)');
   }else{
    if(filters.regionId!=null)query=query.eq('region_id',filters.regionId);
    if(filters.districtId!=null)query=query.eq('district_id',filters.districtId);
   }
   if(last){
    if(typeof last.id!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(last.id)||
     last.created_at!=null&&(typeof last.created_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(last.created_at)||!Number.isFinite(Date.parse(last.created_at))))throw new Error('Public job page unavailable');
    if(last.created_at==null)query=query.is('created_at',null).lt('id',last.id);
    else clauses.push('or(created_at.lt.'+last.created_at+',and(created_at.eq.'+last.created_at+',id.lt.'+last.id+'),created_at.is.null)');
   }
   if(clauses.length)query=query.or('and('+clauses.join(',')+')');
   query=query.abortSignal(controller.signal);
   const {data,error}=await query;
   if(Date.now()>=deadline)throw new Error('Public job search timed out');
   if(error||!Array.isArray(data)||data.length>size)throw new Error('Public jobs unavailable');
   if(data.some(row=>{if(!row?.id||seen.has(row.id))return true;seen.add(row.id);return false;}))throw new Error('Public job page changed');
   for(const row of data)rows.push(mapRow?mapRow(row):row);
   if(Date.now()>=deadline)throw new Error('Public job search timed out');
   last=data[data.length-1]??last;
   // Complete searches continue until an empty page, even if the server applies a lower row cap.
   if(data.length===0)break;
  }
  return rows;
 }finally{clearTimeout(timer);}
}

// A cached search result supplies navigation only. Render current, available data.
export async function readPublicJob(client:SupabaseClient,id:unknown):Promise<any|null>{
 if(typeof id!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new Error('Invalid job');
 const {data,error}=await client.from('jobs')
  .select('*,regions(name_uz,name_ru),districts(name_uz,name_ru),categories(name_uz,name_ru),employer_profiles(company_name,user_id)')
  .eq('id',id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
 if(error)throw new Error('Public job unavailable');
 if(!data)return null;
 if(data.id!==id)throw new Error('Public job unavailable');
 return (await visibleSavedJobs(client,[data]))[0]??null;
}

export function currentJobCard(current:any,cached:any):any{
 // Joins are normalized into names before comparison. A changed/missing field
 // invalidates the old match explanation; cached fields never override the job.
 const joins=new Set(['regions','districts','categories','employer_profiles']);
 const unchanged=cached?.search_revision
  ?cached.search_revision===jobSearchRevision(current)
  :Object.keys(current).every(key=>joins.has(key)||JSON.stringify(current[key])===JSON.stringify(cached?.[key]));
 const metadata=['matchScore','explanation','matchCriteria','ageKnown','titleRelevance','conditionallySuitable','conditionalReason'];
 const card={...current};
 for(const key of metadata)delete card[key];
 if(unchanged)for(const key of metadata){
  if(cached?.[key]!==undefined)card[key]=cached[key];
 }
 return card;
}
