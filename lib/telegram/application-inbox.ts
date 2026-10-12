import type { SupabaseClient } from '@supabase/supabase-js';
import { ownsEmployerJob } from './owned-jobs';

export type InboxActor = { userId: string; role: 'employer' | 'job_seeker'; employerId?: string | null };
export type InboxCursor = { id: string; created_at: string | null };
export const inboxUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const relation = (value: any) => Array.isArray(value) ? value[0] || null : value || null;
const root = 'id,job_id,user_id,resume_id,full_name,phone,status,created_at,viewed_at,responded_at,interview_date,interview_address,employer_phone,employer_message,rejection_reason';
const jobFields = 'id,title_uz,title_ru,company_name,employer_id,user_id,created_by';
function validateActor(actor: InboxActor) {
  if (!inboxUuid(actor.userId) || !['employer', 'job_seeker'].includes(actor.role) || actor.role === 'employer' && !inboxUuid(actor.employerId)) throw new Error('Application access unavailable');
}
export function inboxOwnership(actor: InboxActor) {
  validateActor(actor); const user = actor.userId.toLowerCase(), employer = actor.employerId?.toLowerCase();
  return `employer_id.eq.${employer},and(employer_id.is.null,user_id.eq.${user}),and(employer_id.is.null,user_id.is.null,created_by.eq.${user})`;
}
export function inboxQuery(client: SupabaseClient, actor: InboxActor, head = false) {
  validateActor(actor);
  let query = client.from('job_applications').select(`${head ? 'id' : root},jobs${actor.role === 'employer' ? '!inner' : ''}(${head ? 'id' : jobFields})`, head ? { count: 'exact', head: true } : {});
  if (actor.role === 'employer') query = query.or(inboxOwnership(actor), { referencedTable: 'jobs' });
  else query = query.eq('user_id', actor.userId);
  return query;
}
function checked(row: any, actor: InboxActor) {
  const job = relation(row.jobs);
  if (!inboxUuid(row.id) || !inboxUuid(row.job_id) || actor.role === 'job_seeker' && row.user_id !== actor.userId || actor.role === 'employer' && (!job || job.id !== row.job_id || !['employer_id','user_id','created_by'].every(key => Object.prototype.hasOwnProperty.call(job,key)) || !ownsEmployerJob(job, { userId: actor.userId, employerId: actor.employerId || null }))) throw new Error('Application access unavailable');
  return { ...row, jobs: job };
}
export function validInboxCursor(value: unknown): value is InboxCursor {
  const cursor = value as InboxCursor; return !!cursor && inboxUuid(cursor.id) && (cursor.created_at === null || timestamp(cursor.created_at));
}
export async function readInboxPage(client: SupabaseClient, actor: InboxActor, cursor: InboxCursor | null = null) {
  if (cursor && !validInboxCursor(cursor)) throw new Error('Invalid application cursor');
  let query = inboxQuery(client, actor);
  if (cursor) query = cursor.created_at === null ? query.is('created_at', null).lt('id', cursor.id)
    : query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id}),created_at.is.null`);
  const result = await query.order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(11).abortSignal(AbortSignal.timeout(15000));
  if (result.error || !Array.isArray(result.data) || result.data.length > 11) throw new Error('Applications unavailable');
  const rows = result.data.map(row => checked(row, actor));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Applications unavailable');
  const items = rows.slice(0, 10), last = items[items.length - 1];
  const nextCursor = rows.length > 10 && last ? { id: last.id, created_at: last.created_at ?? null } : null;
  if (nextCursor && !validInboxCursor(nextCursor)) throw new Error('Applications unavailable');
  return { items, nextCursor };
}
export async function readInboxApplication(client: SupabaseClient, actor: InboxActor, id: string) {
  if (!inboxUuid(id)) throw new Error('Application unavailable');
  const result = await inboxQuery(client, actor).eq('id', id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (result.error) throw new Error('Application unavailable');
  return result.data ? checked(result.data, actor) : null;
}
export async function readSubmittedResume(client: SupabaseClient, session: any, application: any) {
  const epoch = session.data?.account_session_version ?? 0;
  if (!inboxUuid(session.user_id) || session.data?.active_role !== 'employer' || !Number.isSafeInteger(epoch) || epoch < 0 || !inboxUuid(application?.id)) throw new Error('Submitted resume unavailable');
  if (!inboxUuid(application.resume_id) || !inboxUuid(application.user_id)) return null;
  const result = await client.rpc('ishdasiz_application_resume',{ p_user_id: session.user_id,p_session_version: epoch,p_application_id: application.id }).abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw new Error('Submitted resume unavailable');
  if (result.data === null) return null;
  const resume = result.data?.resume;
  if (result.data?.application_id !== application.id || !resume || resume.id !== application.resume_id || resume.status !== 'active') throw new Error('Submitted resume unavailable');
  const allowed = ['id','status','title','desired_position','field_title','full_name','birth_date','phone','city','about','skills','experience','experience_years','experience_details','education_level','education','languages','employment_type','gender','expected_salary_min','expected_salary_max','category_id','category_ids','field_id','experience_level','region_id','district_id','regions','districts'];
  return Object.fromEntries(allowed.filter(key => Object.prototype.hasOwnProperty.call(resume,key)).map(key => [key,resume[key]]));
}
export async function readInboxDashboard(client: SupabaseClient, actor: InboxActor) {
  if (actor.role !== 'employer') throw new Error('Employer required');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const start = new Date(today + 'T00:00:00+05:00'), end = new Date(start.getTime() + 86400000);
  const results = await Promise.all([
    client.from('jobs').select('id', { count: 'exact', head: true }).or(inboxOwnership(actor)).eq('ishdasiz_job_available', true),
    inboxQuery(client, actor, true), inboxQuery(client, actor, true).eq('status', 'pending'), inboxQuery(client, actor, true).eq('status', 'accepted'),
    inboxQuery(client, actor, true).in('status', ['interview_set', 'invited', 'interview', 'interviewed']).gte('interview_date', start.toISOString()).lt('interview_date', end.toISOString()),
  ]);
  const counts = results.map(result => { if (result.error || !Number.isSafeInteger(result.count) || result.count! < 0) throw new Error('Statistics unavailable'); return result.count as number; });
  return { activeJobs: counts[0], totalApps: counts[1], pendingApps: counts[2], acceptedApps: counts[3], interviewsToday: counts[4] };
}

export function validApplicationSnapshot(value: any): boolean {
  return !!value && (value.status === null || typeof value.status === 'string' && /^[a-z_]{1,30}$/i.test(value.status))
    && (value.responded_at === null || timestamp(value.responded_at));
}
export async function actOnApplication(client: SupabaseClient, session: any, application: any, action: string, details: Record<string, any> = {}) {
  const epoch = session.data?.account_session_version ?? 0;
  if (!inboxUuid(session.user_id) || !inboxUuid(application?.id) || !Number.isSafeInteger(epoch) || epoch < 0
    || !['view', 'accepted', 'interview_set', 'rejected', 'hired'].includes(action) || action !== 'view' && !validApplicationSnapshot(application)) throw new Error('Application action unavailable');
  const result = await client.rpc('ishdasiz_application_action', {
    p_user_id: session.user_id, p_session_version: epoch, p_application_id: application.id, p_action: action,
    p_expected_status: application.status ?? null, p_expected_responded_at: application.responded_at ?? null, p_details: details,
  });
  if (result.error || result.data?.id !== application.id || !validApplicationSnapshot(result.data)
    || action !== 'view' && result.data.status !== action) throw new Error('Application action unavailable');
  return result.data;
}

/** Telegram's local interview input always uses Uzbekistan time, never the host timezone. */
export function parseInterviewDate(value: string): string | null {
  const raw = value.trim(), match = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const [,dd,mm,yyyy,hh,minute] = match, year = Number(yyyy), month = Number(mm), day = Number(dd);
  if (year < 2000 || year > 2199 || Number(hh) > 23 || Number(minute) > 59) return null;
  const calendar = new Date(Date.UTC(year,month-1,day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month-1 || calendar.getUTCDate() !== day) return null;
  return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + minute + ':00+05:00';
}
export function formatInterviewDate(value: string): string {
  if (!timestamp(value)) return value;
  return new Intl.DateTimeFormat('ru-RU', {timeZone:'Asia/Tashkent',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) + ' (UTC+5)';
}
