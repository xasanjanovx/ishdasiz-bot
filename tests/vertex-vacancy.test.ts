import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractVacancyDraft, vacancyDraftSchema } from '../lib/ai/vacancy-draft';
import { generateVertexText, vertexConfigured } from '../lib/ai/vertex-client';
import { getJobChannel, buildJobChannelMessage } from '../lib/telegram/channel-sync';
import { vacancyDraftToJob } from '../lib/telegram/vacancy-template';
process.env.TELEGRAM_DRY_RUN = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
const { TelegramBot, BotState } = require('../lib/telegram/telegram-bot');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; delete process.env.GOOGLE_CLOUD_API_KEY; delete process.env.gemini_cloud_api; });
const draft = () => vacancyDraftSchema.parse({ title: 'Разработчик Python', company: 'ACME', salary: '$1000', currency: 'USD', salary_min: 1000, phones: ['+998901112233'] });
const source = 'Требуется разработчик Python. ACME, зарплата $1000, телефон +998901112233.';
const provider = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));

test('new cloud-key alias uses Vertex with header authentication and preserves vacancy facts', async () => {
  process.env.gemini_cloud_api = 'synthetic-cloud-key';
  global.fetch = async (input, init) => {
    assert.match(String(input), /^https:\/\/aiplatform.googleapis.com\/v1\/publishers\/google\/models\//);
    assert.equal((init?.headers as any)['x-goog-api-key'], 'synthetic-cloud-key');
    assert.doesNotMatch(String(input), /synthetic-cloud-key/);
    return provider(draft());
  };
  const parsed = await extractVacancyDraft(source);
  const job = { ...vacancyDraftToJob(parsed, {}), source: 'local' };
  assert.equal(job.salary_min, null);
  assert.match(buildJobChannelMessage(job), /\$1000/);
  assert.equal(getJobChannel(job, 'andijon-viloyati'), '@ishdasiz');
  assert.equal(getJobChannel({ source: 'osonish' }, 'andijon-viloyati'), '@ishdasiz_andijon');
});

test('legacy Developer API key does not silently authorize a Vertex request', async () => {
  process.env.GEMINI_API_KEY = 'legacy-key';
  assert.equal(vertexConfigured(), false);
  await assert.rejects(generateVertexText('test'), { kind: 'configuration' });
});

test('employer receives a reviewable draft, not an automatic publication', async () => {
  process.env.GOOGLE_CLOUD_API_KEY = 'synthetic-key';
  global.fetch = async () => provider(draft());
  const bot: any = Object.create(TelegramBot.prototype), prompts: string[] = [];
  bot.setSession = async (session: any, changes: any) => Object.assign(session, changes);
  bot.setFlowCancelKeyboard = async () => {};
  bot.sendPrompt = async (_chat: any, _session: any, text: string) => prompts.push(text);
  bot.supabase = { rpc: () => ({ abortSignal: async () => ({ data: 2, error: null }) }) };
  const s: any = { user_id: '00000000-0000-4000-8000-000000000001', lang: 'ru', state: BotState.POSTING_JOB_MODE, data: { active_role: 'employer', temp_job: {} } };
  await bot.handleJobCreateMode(1, 'ai', s);
  assert.equal(s.state, BotState.AI_JOB_INPUT);
  await bot.handleAiJobInput(1, source, s);
  assert.equal(s.state, BotState.POSTING_JOB_CONFIRM);
  assert.equal(s.data.temp_job.ai_input, source);
  assert.match(prompts.at(-1)!, /@ishdasiz/);
  assert.equal(bot.shouldDeleteIncomingMessage(source, s, true), false);
});

test('Vertex outage preserves the original text and offers manual completion', async () => {
  process.env.GOOGLE_CLOUD_API_KEY = 'synthetic-key';
  global.fetch = async () => new Response('private provider details', { status: 402 });
  const bot: any = Object.create(TelegramBot.prototype), prompts: string[] = [];
  bot.setSession = async (session: any, changes: any) => Object.assign(session, changes);
  bot.sendPrompt = async (_chat: any, _session: any, text: string) => prompts.push(text);
  bot.supabase = { rpc: () => ({ abortSignal: async () => ({ data: 2, error: null }) }) };
  const s: any = { user_id: '00000000-0000-4000-8000-000000000001', lang: 'ru', state: BotState.AI_JOB_INPUT, data: { active_role: 'employer', temp_job: {} } };
  await bot.handleAiJobInput(1, source, s);
  assert.equal(s.data.temp_job.ai_input, source); assert.equal(s.state, BotState.AI_JOB_INPUT);
  assert.match(prompts[0], /вручную/); assert.doesNotMatch(prompts[0], /private provider details/);
});
