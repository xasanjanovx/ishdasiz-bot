import {createHash} from 'node:crypto';

const derived = new Set(['regions','districts','categories','employer_profiles',
 'matchScore','explanation','matchCriteria','ageKnown','titleRelevance',
 'conditionallySuitable','conditionalReason','strictScore','aiScore','search_revision']);
const referenceKeys = ['id','work_mode','employment_type','region_id','district_id','region_name','district_name',
 'latitude','longitude','matchScore','matchCriteria','ageKnown',
 'titleRelevance','conditionallySuitable','conditionalReason'] as const;
const listKeys = ['job_list','auto_job_list','related_job_list','region_job_list'] as const;
const candidateKeys = ['id','created_at','updated_at','title_uz','title_ru','title',
 'field_id','field_title','region_id','district_id','category_id','salary_min','salary_max',
 'experience_years','experience','employment_type','work_mode','gender','age_min','age_max',
 'education_level','region_name','district_name','latitude','longitude','company_name'] as const;

export function jobSearchRevision(job:Record<string,any>):string {
 const fields:Record<string,any>={};
 for(const key of Object.keys(job))if(!derived.has(key))fields[key]=job[key];
 const serialized=JSON.stringify(fields,(_key,value)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const sorted:Record<string,any>={};
  for(const key of Object.keys(value).sort())sorted[key]=value[key];
  return sorted;
 });
 return createHash('sha256').update(serialized).digest('hex');
}

export function jobSearchReference(job:Record<string,any>):Record<string,any> {
 const reference:Record<string,any>={};
 for(const key of referenceKeys)if(job[key]!==undefined)reference[key]=job[key];
 reference.search_revision=typeof job.search_revision==='string'&&/^[a-f0-9]{64}$/.test(job.search_revision)
  ?job.search_revision:jobSearchRevision(job);
 return reference;
}

// Keep every input used by the existing matcher, title filter and AI reranker.
// Full imported bodies, descriptions and contacts are discarded per page.
export function jobSearchCandidate(job:Record<string,any>):Record<string,any> {
 const candidate:Record<string,any>={search_revision:jobSearchRevision(job)};
 for(const key of candidateKeys)if(job[key]!==undefined)candidate[key]=job[key];
 const raw=job.raw_source_json??{};
 candidate.raw_source_json={};
 for(const key of ['work_experiance','experience','position_name','mmk_position_id','min_education']){
  if(raw[key]!==undefined)candidate.raw_source_json[key]=raw[key];
 }
 if(raw.mmk_position)candidate.raw_source_json.mmk_position={id:raw.mmk_position.id};
 return candidate;
}

export function compactJobSearchData(data:Record<string,any>):Record<string,any> {
 const result={...data};
 for(const key of listKeys)if(Array.isArray(data[key])){
  result[key]=data[key].filter((job:any)=>job&&typeof job==='object'&&typeof job.id==='string').map(jobSearchReference);
 }
 return result;
}
