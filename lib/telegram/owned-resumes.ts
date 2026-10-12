import type { SupabaseClient } from '@supabase/supabase-js';

export const resumeUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export const resumeVersion = (value: unknown): value is string | null => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
export type ResumeCursor = { id: string; created_at: string | null };
export const validResumeCursor = (value: any): value is ResumeCursor => !!value && resumeUuid(value.id) && resumeVersion(value.created_at);

export async function readOwnResume(client: SupabaseClient, userId: unknown, id: unknown, active = false) {
  if (!resumeUuid(userId) || !resumeUuid(id)) throw new Error('Resume unavailable');
  let query = client.from('resumes').select('*').eq('user_id', userId).eq('id', id);
  if (active) query = query.eq('status', 'active');
  const result = await query.abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (result.error) throw new Error('Resume unavailable');
  if (!result.data) return null;
  if (result.data.id !== id || result.data.user_id !== userId || !resumeVersion(result.data.updated_at) || active && result.data.status !== 'active') throw new Error('Resume unavailable');
  return result.data;
}

export async function readOwnResumePage(client: SupabaseClient, userId: unknown, options: { archived?: boolean; active?: boolean; cursor?: ResumeCursor | null } = {}) {
  if (!resumeUuid(userId) || options.cursor && !validResumeCursor(options.cursor)) throw new Error('Resumes unavailable');
  let query = client.from('resumes').select('id,user_id,title,status,is_public,created_at,updated_at').eq('user_id', userId);
  if (options.active) query = query.eq('status', 'active');
  else if (options.archived) query = query.eq('status', 'archived');
  const current = !options.active && !options.archived ? 'or(status.is.null,status.neq.archived)' : '';
  const cursor = options.cursor;
  if (cursor) query = cursor.created_at === null ? query.is('created_at', null).lt('id', cursor.id)
    : query;
  const boundary = cursor?.created_at ? `or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id}),created_at.is.null)` : '';
  if (current || boundary) query = query.or(current && boundary ? `and(${current},${boundary})` : current || boundary);
  const result = await query.order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(11).abortSignal(AbortSignal.timeout(15000));
  if (result.error || !Array.isArray(result.data) || result.data.length > 11) throw new Error('Resumes unavailable');
  const seen = new Set<string>();
  for (const row of result.data) {
    if (!resumeUuid(row.id) || row.user_id !== userId || seen.has(row.id) || !resumeVersion(row.created_at) || !resumeVersion(row.updated_at)
      || options.active && row.status !== 'active' || !options.active && (options.archived ? row.status !== 'archived' : row.status === 'archived')) throw new Error('Resumes unavailable');
    seen.add(row.id);
  }
  const items = result.data.slice(0, 10), last = items[items.length - 1];
  return { items, next: result.data.length > 10 && last ? { id: last.id, created_at: last.created_at } as ResumeCursor : null };
}

export async function writeOwnResume(client: SupabaseClient, session: any, id: unknown, action: string, expected: unknown, payload: Record<string, any> = {}) {
  const epoch = session.data?.account_session_version ?? 0;
  if (!resumeUuid(session.user_id) || !resumeUuid(id) || !Number.isSafeInteger(epoch) || epoch < 0 || !resumeVersion(expected)
    || !['create', 'edit', 'archive', 'restore', 'publish', 'hide'].includes(action)) throw new Error('Resume write unavailable');
  const result = await client.rpc('ishdasiz_write_own_resume', { p_user_id: session.user_id, p_session_version: epoch, p_resume_id: id, p_action: action, p_expected_updated_at: expected, p_payload: payload });
  if (result.error || result.data?.id !== id || !resumeVersion(result.data.updated_at) || !(typeof result.data.is_public === 'boolean' || action === 'edit' && result.data.is_public === null)
    || !(['active', 'draft', 'archived'].includes(result.data.status) || action === 'edit' && result.data.status === null)
    || action === 'archive' && (result.data.status !== 'archived' || result.data.is_public)
    || action === 'restore' && (result.data.status !== 'draft' || result.data.is_public)
    || ['create', 'publish'].includes(action) && (result.data.status !== 'active' || !result.data.is_public)
    || action === 'hide' && result.data.is_public) throw new Error('Resume write unavailable');
  return result.data;
}

export async function enableSeekerProfile(client: SupabaseClient, session: any): Promise<string> {
  const epoch=session.data?.account_session_version??0;
  if(!resumeUuid(session.user_id)||!Number.isSafeInteger(epoch)||epoch<0)throw new Error('Seeker profile unavailable');
  const result=await client.rpc('ishdasiz_enable_seeker_profile',{p_user_id:session.user_id,p_session_version:epoch});
  if(result.error||!resumeUuid(result.data))throw new Error('Seeker profile unavailable');
  return result.data;
}
