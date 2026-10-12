import type { SupabaseClient } from '@supabase/supabase-js';

export type ApplicationReadSnapshot = { id: string; status: string | null; responded_at: string | null };
export type ApplicationReadActor = { userId: string; sessionVersion: number; role: 'job_seeker' };
export class ApplicationReadError extends Error {
  constructor(public code = 'unknown') { super('Application read receipt unavailable'); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export function validApplicationReadSnapshot(value: unknown): value is ApplicationReadSnapshot {
  const row = value as ApplicationReadSnapshot;
  return !!row && uuid(row.id) && (row.status === null || typeof row.status === 'string' && /^[a-z_]{1,30}$/i.test(row.status))
    && (row.responded_at === null || typeof row.responded_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.responded_at) && Number.isFinite(Date.parse(row.responded_at)));
}
export async function markApplicationsRead(client: SupabaseClient,actor: ApplicationReadActor,snapshots: ApplicationReadSnapshot[]): Promise<{ seen: string[]; changed: string[] }> {
  if (!uuid(actor.userId) || actor.role !== 'job_seeker' || !Number.isSafeInteger(actor.sessionVersion) || actor.sessionVersion < 0
    || !Array.isArray(snapshots) || !snapshots.length || snapshots.length > 20 || !snapshots.every(validApplicationReadSnapshot)
    || new Set(snapshots.map(row => row.id.toLowerCase())).size !== snapshots.length) throw new ApplicationReadError('22023');
  const expected = snapshots.map(row => ({ id: row.id.toLowerCase(),status: row.status,responded_at: row.responded_at }));
  const result = await client.rpc('ishdasiz_application_seen',{ p_user_id: actor.userId,p_session_version: actor.sessionVersion,p_snapshots: expected }).abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw new ApplicationReadError(['42501','P0002','22023','22007','22008'].includes(result.error.code) ? result.error.code : 'unknown');
  const { seen,changed } = result.data || {};
  if (!Array.isArray(seen) || !Array.isArray(changed) || ![...seen,...changed].every(uuid)
    || seen.length + changed.length !== expected.length || new Set([...seen,...changed]).size !== expected.length
    || [...seen,...changed].some(id => !expected.some(row => row.id === id))) throw new ApplicationReadError();
  return { seen,changed };
}
