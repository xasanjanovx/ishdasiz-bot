import {compactJobSearchData} from './job-search-state';

const candidateKeys=['id','user_id','full_name','title','field_title','field_id','region_id','district_id',
 'district_name','category_id','category_ids','expected_salary_min','experience','experience_level',
 'gender','birth_date','education_level'] as const;
const referenceKeys=['id','district_id','district_name','region_id','score','strictScore','aiScore',
 'matchCriteria','conditionallySuitable','conditionalReason','ageKnown','offer_sent'] as const;
const listKeys=['worker_resume_list','worker_district_resume_list','worker_region_resume_list','related_resume_list'] as const;

export function publicCandidateSearchRow(resume:Record<string,any>):Record<string,any>{
 const result:Record<string,any>={};
 for(const key of candidateKeys)if(resume[key]!==undefined)result[key]=resume[key];
 return result;
}

export function candidateSearchReference(resume:Record<string,any>):Record<string,any>{
 const result:Record<string,any>={};
 for(const key of referenceKeys)if(resume[key]!==undefined)result[key]=resume[key];
 return result;
}

export function compactBotSearchData(data:Record<string,any>):Record<string,any>{
 const result=compactJobSearchData(data);
 for(const key of listKeys)if(Array.isArray(data[key])){
  result[key]=data[key].filter((resume:any)=>resume&&typeof resume==='object'&&typeof resume.id==='string').map(candidateSearchReference);
 }
 return result;
}
