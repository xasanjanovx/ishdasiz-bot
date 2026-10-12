import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

process.env.TELEGRAM_DRY_RUN = '1';
process.env.TELEGRAM_BOT_TOKEN = 'synthetic-test-token';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
const J = '20000000-0000-4000-8000-000000000001';
const U = '00000000-0000-4000-8000-000000000002';
const job = (patch: any = {}) => ({
    id: J, title_ru: 'Current title', description_ru: 'Current description',
    contact_phone: '+998901112233', is_active: true, status: 'active', source_status: null,
    region_id: null, district_id: null, user_id: U, employer_id: null,
    salary_min: 5000000, raw_source_json: {}, ...patch,
});
function reader(replies: any[]) {
    const requests: any[] = [];
    const client = createClient('https://example.supabase.co', 'synthetic-test-key', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (input: any) => {
            requests.push(new URL(String(input)));
            const reply = replies.shift();
            assert.notEqual(reply, undefined, 'Unexpected query or cached fallback');
            return new Response(JSON.stringify(reply?.error ?? reply ?? []), {
                status: reply?.error ? 500 : 200, headers: { 'Content-Type': 'application/json' },
            });
        } },
    });
    return { client, requests };
}

for (const [name, prefix] of [
    ['worker', '../lib/telegram/'], ['site', '../../ISHDASIZ NEW/lib/telegram/'],
] as const) {
    const { readPublicJob, currentJobCard } = require(prefix + 'public-jobs');
    const { TelegramBot, BotState } = require(prefix + 'telegram-bot');

    test(`${name}: a job card reloads the complete current job and its canonical owner`, async () => {
        const current = job({ employer_id: 'company', user_id: 'stale-owner', employer_profiles: { user_id: U, company_name: 'Current company' } });
        const h = reader([current, [{ id: U, closed_at: null }]]);
        assert.deepEqual(await readPublicJob(h.client, J), current);
        assert.equal(h.requests[0].searchParams.get('id'), 'eq.' + J);
        assert.match(h.requests[0].searchParams.get('select')!, /employer_profiles\(company_name,user_id\)/);
        assert.equal(h.requests[1].searchParams.get('id'), 'in.(' + U + ')');
    });

    test(`${name}: removed, paused, missing and owner-closed cards cannot use old data`, async () => {
        for (const row of [null, job({ is_active: false }), job({ source_status: 'removed_at_source' }), job({ status: 'paused' })]) {
            const h = reader([row]);
            assert.equal(await readPublicJob(h.client, J), null);
            assert.equal(h.requests.length, 1);
        }
        assert.equal(await readPublicJob(reader([job(), [{ id: U, closed_at: '2026-10-10' }]]).client, J), null);
    });

    test(`${name}: invalid identifiers, wrong acknowledgements and database failures fail closed`, async () => {
        const invalid = reader([]);
        await assert.rejects(readPublicJob(invalid.client, 'not-a-uuid'));
        assert.equal(invalid.requests.length, 0);
        await assert.rejects(readPublicJob(reader([job({ id: U })]).client, J));
        await assert.rejects(readPublicJob(reader([{ error: { code: '08006' } }]).client, J));
        await assert.rejects(readPublicJob(reader([job(), { error: { code: '08006' } }]).client, J));
    });

    test(`${name}: fresh content wins and changed requirements discard an old match explanation`, () => {
        const current = job();
        const cached = { ...current, title_ru: 'Old title', contact_phone: 'OLD PRIVATE PHONE',
            matchScore: 99, matchCriteria: { salary: true }, conditionallySuitable: true };
        const card = currentJobCard(current, cached);
        assert.deepEqual(card, current);
        assert.equal(card.matchScore, undefined);
        assert.equal(card.contact_phone, current.contact_phone);
        assert.equal(currentJobCard(job({ raw_source_json: { salary: 'Changed' } }), { ...current, matchScore: 99 }).matchScore, undefined);
    });

    test(`${name}: unchanged cards preserve match details without importing stale extra fields`, () => {
        const current = job();
        const cached = { ...current, matchScore: 70, matchCriteria: { salary: true }, stale_contact: 'SECRET' };
        assert.deepEqual(currentJobCard(current, cached), { ...current, matchScore: 70, matchCriteria: { salary: true } });
    });

    test(`${name}: a failed or unavailable refresh never renders the cached job`, async () => {
        for (const replies of [[null], [job(), [{ id: U, closed_at: '2026-10-10' }]], [{ error: { code: '08006' } }]]) {
            const bot: any = Object.create(TelegramBot.prototype);
            const prompts: string[] = [];
            bot.supabase = reader(replies).client;
            bot.sendPrompt = async (_id: number, _session: any, text: string) => { prompts.push(text); };
            await bot.showJob(10, { lang: 'ru', data: { job_list: [job({ title_ru: 'OLD SECRET TITLE' })] } }, 0);
            assert.equal(prompts.length, 1);
            assert.doesNotMatch(prompts[0], /OLD SECRET TITLE|Current title/);
        }
    });

    test(`${name}: opening a cached card renders current text and keeps its navigation`, async () => {
        const h = reader([job(), [{ id: U, closed_at: null }], null]);
        const bot: any = Object.create(TelegramBot.prototype);
        const session: any = { user_id: U, lang: 'ru', state: BotState.BROWSING_JOBS, data: {
            job_list: [job({ title_ru: 'OLD CACHED TITLE', contact_phone: '+998909999999', matchScore: 99 })],
            account_session_version: 3, job_source: 'resume',
        } };
        bot.supabase = h.client;
        bot.setSession = async (s: any, changes: any) => Object.assign(s, changes);
        bot.getSeekerGeo = async () => null;
        const messages: any[] = [];
        const originalFetch = globalThis.fetch;
        try {
            process.env.TELEGRAM_DRY_RUN = '0';
            globalThis.fetch = async (input: any, init: any) => {
                assert.match(String(input), /^https:\/\/api\.telegram\.org\/botsynthetic-test-token\/sendMessage$/);
                const params = JSON.parse(init.body);
                messages.push(params);
                return new Response(JSON.stringify({ ok: true, result: { message_id: 123, text: params.text } }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            };
            await bot.showJob(10, session, 0);
        } finally {
            globalThis.fetch = originalFetch;
            process.env.TELEGRAM_DRY_RUN = '1';
        }
        assert.equal(messages.length, 1);
        assert.match(messages[0].text, /Current title/);
        assert.match(messages[0].text, /Current description/);
        assert.doesNotMatch(messages[0].text, /OLD CACHED TITLE|909999999|99%/);
        assert.equal(session.data.currentJobIndex, 0);
        assert.equal(session.data.last_job_message_id, 123);
        assert.equal(session.data.job_list.length, 1);
    });
}
