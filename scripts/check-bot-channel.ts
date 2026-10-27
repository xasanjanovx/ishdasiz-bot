// Read-only preflight. Never starts polling, changes a webhook or sends a post.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing');
  async function telegram(method: string, params: Record<string, unknown> = {}) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params), signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(`Telegram ${method} failed (${response.status})`);
    return body.result;
  }
  const bot = await telegram('getMe');
  console.log(`Bot: @${bot.username}`);
  const [webhook, member] = await Promise.all([
    telegram('getWebhookInfo'), telegram('getChatMember', { chat_id: '@ishdasiz', user_id: bot.id }),
  ]);
  console.log(`Delivery: ${webhook.url ? 'webhook on ' + new URL(webhook.url).hostname : 'no webhook'}`);
  console.log(`@ishdasiz: administrator=${member.status === 'administrator'}, publish=${member.can_post_messages === true}, edit=${member.can_edit_messages === true}, delete=${member.can_delete_messages === true}`);
  if (member.status !== 'administrator' || member.can_post_messages !== true) process.exitCode = 1;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const response = await fetch(`${url}/rest/v1/rpc/ishdasiz_channel_target`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_snapshot: { available: true, entity: { source: 'local' }, region_slug: 'andijon-viloyati' } }),
      signal: AbortSignal.timeout(15000),
    });
    const target = await response.json();
    console.log(`Database routing to @ishdasiz: ${response.ok && target === '@ishdasiz' ? 'ready' : 'migration required'}`);
    if (!response.ok || target !== '@ishdasiz') process.exitCode = 1;
  } else { console.log('Database: configuration missing'); process.exitCode = 1; }
  console.log(`AI backend: Vertex AI; key ${(process.env.GOOGLE_CLOUD_API_KEY || process.env.gemini_cloud_api) ? 'configured (not tested)' : 'missing'}`);
}
main().catch(() => { console.error('Preflight failed. Check credentials, network and channel permissions. No secret values were printed.'); process.exitCode = 1; });
