import type { SupabaseClient } from '@supabase/supabase-js';
import { resumeUuid } from './owned-resumes';

type Actor = { user_id?: string | null; data?: Record<string, any> };
function context(session: Actor, jobId: string) {
  const epoch = session.data?.account_session_version ?? 0;
  if (!resumeUuid(session.user_id) || !resumeUuid(jobId) || !Number.isSafeInteger(epoch) || epoch < 0
    || session.data?.active_role !== 'employer') throw new Error('Candidate search unavailable');
  return { p_user_id: session.user_id, p_session_version: epoch, p_job_id: jobId };
}
function candidate(row: any) {
  if (!row || !resumeUuid(row.id) || !resumeUuid(row.user_id) || row.status !== 'active'
    || row.is_public !== true || row.found_job !== false) throw new Error('Candidate unavailable');
  return row;
}
export async function readPublicCandidates(client: SupabaseClient, session: Actor, jobId: string, region: number | null = null, mapRow?: (row: any) => any) {
  const args = context(session, jobId);
  if (region !== null && (!Number.isSafeInteger(region) || region < 1)) throw new Error('Invalid location');
  const rows: any[] = [], seen = new Set<string>(), deadline = AbortSignal.timeout(30000);
  let after: string | null = null;
  const expiresAt = Date.now() + 30000;
  for (;;) {
    if (Date.now() >= expiresAt) throw new Error('Candidate search timed out');
    const result = await client.rpc('ishdasiz_bot_candidates', { ...args, p_region: region, p_after_id: after, p_resume_id: null, p_page_size: 200 }).abortSignal(deadline);
    if (Date.now() >= expiresAt) throw new Error('Candidate search timed out');
    if (result.error || !Array.isArray(result.data) || result.data.length > 200) throw new Error('Candidate search unavailable');
    for (const value of result.data) {
      const row = candidate(value), key = row.id.toLowerCase();
      if (seen.has(key) || after !== null && key <= after || region !== null && row.region_id !== region) throw new Error('Candidate page changed');
      seen.add(key); rows.push(mapRow ? mapRow(row) : row); after = key;
    }
    if (Date.now() >= expiresAt) throw new Error('Candidate search timed out');
    if (result.data.length === 0) return rows;
  }
}
export async function readPublicCandidate(client: SupabaseClient, session: Actor, jobId: string, resumeId: string) {
  const args = context(session, jobId);
  if (!resumeUuid(resumeId)) throw new Error('Candidate unavailable');
  const result = await client.rpc('ishdasiz_bot_candidates', { ...args, p_region: null, p_after_id: null, p_resume_id: resumeId, p_page_size: 1 }).abortSignal(AbortSignal.timeout(15000));
  if (result.error || !Array.isArray(result.data) || result.data.length > 1) throw new Error('Candidate unavailable');
  if (!result.data.length) return null;
  const row = candidate(result.data[0]);
  if (row.id.toLowerCase() !== resumeId.toLowerCase()) throw new Error('Candidate unavailable');
  return row;
}
export async function createCandidateOffer(client: SupabaseClient, session: Actor, jobId: string, resumeId: string, seekerUserId: string) {
  const args = context(session, jobId);
  if (!resumeUuid(resumeId) || !resumeUuid(seekerUserId)) throw new Error('Offer unavailable');
  const result = await client.rpc('ishdasiz_bot_create_offer', { ...args, p_resume_id: resumeId, p_expected_seeker: seekerUserId }).abortSignal(AbortSignal.timeout(15000));
  const row = result.data;
  if (result.error || !row || !resumeUuid(row.id) || !resumeUuid(row.seeker_user_id) || typeof row.created !== 'boolean' || row.seeker_user_id !== seekerUserId
    || row.job?.id !== jobId || row.resume_id !== resumeId) throw new Error('Offer unavailable');
  return row as { id: string; seeker_user_id: string; resume_id: string; created: boolean; job: any };
}
