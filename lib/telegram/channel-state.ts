import type { SupabaseClient } from '@supabase/supabase-js';
import { resumeUuid } from './owned-resumes';
import { isJobActiveForChannel, isResumeActiveForChannel, REGION_CHANNEL_BY_SLUG, MAIN_JOB_CHANNEL } from './channel-sync';
export type ChannelSnapshot = { available: boolean; entity: any | null; region_slug: string | null };
export async function readChannelSnapshot(client: SupabaseClient, type: 'job' | 'resume', id: string): Promise<ChannelSnapshot> {
  if (!['job','resume'].includes(type) || !resumeUuid(id)) throw new Error('Channel entity unavailable');
  const { data, error } = await client.rpc('ishdasiz_channel_snapshot', { p_type: type, p_id: id }).abortSignal(AbortSignal.timeout(15000));
  if (error || !data || typeof data.available !== 'boolean' || data.region_slug !== null && typeof data.region_slug !== 'string'
    || data.available && (!data.entity || data.entity.id !== id || !(type==='job'?isJobActiveForChannel(data.entity):isResumeActiveForChannel(data.entity)))
    || !data.available && data.entity !== null) throw new Error('Channel entity unavailable');
  return data;
}

type TelegramCall = (method: string, params: Record<string, any>) => Promise<any>;
const missing = (error: unknown) => /message to (?:delete|edit) not found/i.test(error instanceof Error ? error.message : String(error));
export const CHANNEL_REDACTED_TEXT = 'Объявление недоступно. / E’lon mavjud emas.';
/** Never swallow Telegram failure or call a non-existent chat a deleted post. */
export async function removeChannelMessage(call: TelegramCall, channel: string, messageId: number): Promise<'deleted'|'redacted'> {
  if (!/^@[a-z0-9_]{5,32}$/i.test(channel) || !Number.isSafeInteger(messageId) || messageId < 1) throw new Error('Invalid channel message');
  if (![MAIN_JOB_CHANNEL, ...Object.values(REGION_CHANNEL_BY_SLUG)].includes(channel.toLowerCase())) throw new Error('Channel is not configured');
  try {
    if (await call('deleteMessage', { chat_id: channel, message_id: messageId }) !== true) throw new Error('Deletion unconfirmed');
    return 'deleted';
  } catch (error) {
    if (missing(error)) return 'deleted';
    if (!/message (?:can.t|cannot) be deleted/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
  try {
    const result = await call('editMessageText', { chat_id: channel, message_id: messageId, text: CHANNEL_REDACTED_TEXT, reply_markup: { inline_keyboard: [] } });
    if (result !== true && (!result || result.message_id !== messageId)) throw new Error('Redaction unconfirmed');
    return 'redacted';
  } catch (error) {
    if (missing(error)) return 'deleted';
    if (/message is not modified/i.test(error instanceof Error ? error.message : String(error))) return 'redacted';
    throw error;
  }
}
