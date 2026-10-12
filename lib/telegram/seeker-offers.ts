import type { SupabaseClient } from '@supabase/supabase-js';
import { resumeUuid } from './owned-resumes';

export type OfferCursor = { id: string; created_at: string | null };
export type OfferActor = { user_id?: string | null; data?: Record<string, any> };
export type SeekerOffer = {
  id: string; job_id: string | null; seeker_user_id: string; status: string | null;
  created_at: string | null; seen_at: string | null; job_available: boolean; job: Record<string, any> | null;
};
export type SeekerOfferDetail = SeekerOffer & { message: string | null; resume_id: string | null; resume: Record<string, any> | null };
export class OfferError extends Error {
  constructor(public code: 'invalid' | 'identity' | 'missing' | 'unavailable') { super('Invitation unavailable'); }
}
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export const validOfferCursor = (value: any): value is OfferCursor => !!value && resumeUuid(value.id) && (value.created_at === null || timestamp(value.created_at));
const fields = (row: any, names: readonly string[]) => Object.fromEntries(names.filter(key => Object.prototype.hasOwnProperty.call(row, key)).map(key => [key, row[key]]));
const JOB_FIELDS = ['id','title','title_uz','title_ru','description_uz','description_ru','company_name','category_id','category_ids','field_id','field_title',
  'salary_min','salary_max','employment_type','region_id','district_id','address','latitude','longitude','contact_phone','phone','contact_email','contact_telegram','hr_name',
  'requirements_uz','requirements_ru','benefits','experience','education_level','gender','age_min','age_max','skills','languages','payment_type','work_mode','working_days','working_hours',
  'is_for_students','is_for_disabled','is_for_women','is_imported','source','source_url','is_active','status','created_at','regions','districts','categories'] as const;
const RESUME_FIELDS = ['id','user_id','status','found_job','title','desired_position','field_id','field_title','category_id','category_ids','region_id','district_id',
  'expected_salary_min','expected_salary_max','experience','experience_level','experience_years','education_level','gender','birth_date'] as const;
function context(actor: OfferActor) {
  const epoch = actor.data?.account_session_version ?? 0;
  if (!resumeUuid(actor.user_id) || !Number.isSafeInteger(epoch) || epoch < 0 || actor.data?.active_role !== 'job_seeker') throw new OfferError('identity');
  return { p_user_id: actor.user_id, p_session_version: epoch };
}
function checkError(error: any) {
  if (error) throw new OfferError(error.code === '42501' ? 'identity' : error.code === '22023' ? 'invalid' : 'unavailable');
}
function offerCard(value: any, actor: OfferActor): SeekerOffer {
  if (!value || !resumeUuid(value.id) || value.seeker_user_id !== actor.user_id || value.job_id !== null && !resumeUuid(value.job_id)
    || value.status !== null && typeof value.status !== 'string' || value.created_at !== null && !timestamp(value.created_at)
    || value.seen_at !== null && !timestamp(value.seen_at) || typeof value.job_available !== 'boolean'
    || value.job_available && (!value.job || value.job.id !== value.job_id) || !value.job_available && value.job !== null) throw new OfferError('unavailable');
  const job = value.job ? fields(value.job, ['id','title','title_uz','title_ru','company_name']) : null;
  return { id: value.id,job_id: value.job_id,seeker_user_id: value.seeker_user_id,status: value.status,
    created_at: value.created_at,seen_at: value.seen_at,job_available: value.job_available,job };
}
// Preserve microseconds when comparing equal/nearby PostgreSQL timestamps.
function timestampMicros(value: string): bigint {
  const match = /^(.*:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)!;
  return BigInt(Date.parse(match[1] + match[3])) * BigInt(1000) + BigInt((match[2] || '').padEnd(6,'0'));
}
function isAfter(row: OfferCursor, before: OfferCursor) {
  if (before.created_at === null) return row.created_at === null && row.id.toLowerCase() < before.id.toLowerCase();
  if (row.created_at === null) return true;
  const a = timestampMicros(row.created_at), b = timestampMicros(before.created_at);
  return a < b || a === b && row.id.toLowerCase() < before.id.toLowerCase();
}
export async function readSeekerOffers(client: SupabaseClient, actor: OfferActor, cursor: OfferCursor | null = null, pageSize = 10) {
  const args = context(actor);
  if (cursor !== null && !validOfferCursor(cursor) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new OfferError('invalid');
  const { data,error } = await client.rpc('ishdasiz_seeker_offers', { ...args,p_after_created: cursor?.created_at ?? null,p_after_id: cursor?.id ?? null,p_page_size: pageSize }).abortSignal(AbortSignal.timeout(15000));
  checkError(error);
  if (!data || !Array.isArray(data.items) || data.items.length > pageSize || data.next_cursor !== null && !validOfferCursor(data.next_cursor)) throw new OfferError('unavailable');
  const items = data.items.map((value: any) => offerCard(value,actor)) as SeekerOffer[];
  let previous = cursor;
  for (const item of items) { if (previous && !isAfter(item,previous)) throw new OfferError('unavailable'); previous = item; }
  if (data.next_cursor !== null && (items.length !== pageSize || data.next_cursor.id !== previous?.id || data.next_cursor.created_at !== previous?.created_at)) throw new OfferError('unavailable');
  return { items,nextCursor: data.next_cursor as OfferCursor | null };
}
export async function readSeekerOffer(client: SupabaseClient, actor: OfferActor, id: string, byJob = false): Promise<SeekerOfferDetail | null> {
  const args = context(actor); if (!resumeUuid(id)) throw new OfferError('invalid');
  const { data,error } = await client.rpc('ishdasiz_seeker_offer', { ...args,p_offer_id: byJob ? null : id,p_job_id: byJob ? id : null }).abortSignal(AbortSignal.timeout(15000));
  checkError(error); if (data === null) return null;
  const result = offerCard(data,actor);
  if ((byJob ? result.job_id : result.id) !== id || data.message !== null && typeof data.message !== 'string'
    || data.resume_id !== null && !resumeUuid(data.resume_id)
    || data.resume !== null && (!data.resume || data.resume.id !== data.resume_id || data.resume.user_id !== actor.user_id || data.resume.status !== 'active' || data.resume.found_job !== false)
    || data.resume === null && data.resume_id !== null || !data.job_available && data.resume !== null) throw new OfferError('unavailable');
  return { ...result,message: data.message,resume_id: data.resume_id,
    job: result.job_available ? fields(data.job,JOB_FIELDS) : null,resume: data.resume ? fields(data.resume,RESUME_FIELDS) : null };
}
export async function markSeekerOfferSeen(client: SupabaseClient, actor: OfferActor, id: string): Promise<string> {
  const args = context(actor); if (!resumeUuid(id)) throw new OfferError('invalid');
  const { data,error } = await client.rpc('ishdasiz_seeker_offer_seen', { ...args,p_offer_id: id }).abortSignal(AbortSignal.timeout(15000));
  checkError(error);
  if (data === null) throw new OfferError('missing');
  if (!data || data.id !== id || data.seeker_user_id !== actor.user_id || !timestamp(data.seen_at)) throw new OfferError('unavailable');
  return data.seen_at;
}
