import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TELEGRAM_DRY_RUN = '1';
process.env.BOT_FLOW_IDLE_TIMEOUT_MINUTES = '20';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';

for (const [name, file] of [
    ['worker', '../lib/telegram/telegram-bot'],
    ['site', '../../ISHDASIZ NEW/lib/telegram/telegram-bot']
] as const) {
    const { TelegramBot, BotState } = require(file);
    function harness(role: 'job_seeker' | 'employer', epoch = 3, accountEpoch = epoch, closed = false) {
        const session: any = {
            telegram_user_id: 10, user_id: 'owner', lang: 'ru',
            phone: '+998901234567', state: BotState.POSTING_JOB_TITLE,
            updated_at: new Date(Date.now() - 21 * 60_000).toISOString(),
            data: {
                active_role: role, account_session_version: epoch,
                telegram_username: 'synthetic_user', recent_update_ids: [1],
                job: { title: 'Unfinished draft' }, resume: { phone: 'private' },
                callback_action_lock: { until: Date.now() + 100_000 },
                otp_provider: 'sms', auth_epoch: epoch,
            },
        };
        const bot: any = Object.create(TelegramBot.prototype);
        const prompts: string[] = [];
        bot.supabase = { from: () => {
            const query: any = {};
            for (const method of ['select', 'eq']) query[method] = () => query;
            query.maybeSingle = async () => ({ data: {
                session_version: accountEpoch, closed_at: closed ? '2026-10-10' : null,
            }, error: null });
            return query;
        } };
        bot.enqueueUserUpdate = async (_id: number, run: () => Promise<void>) => run();
        bot.getOrCreateSession = async () => session;
        bot.setSession = async (target: any, changes: any) => Object.assign(target, changes);
        bot.sendPrompt = async (_id: number, _session: any, text: string) => { prompts.push(text); };
        const update = { update_id: 2, message: {
            message_id: 2, from: { id: 10 }, chat: { id: 10, type: 'private' }, text: 'Continue',
        } };
        return { bot, session, prompts, update };
    }

    for (const role of ['job_seeker', 'employer'] as const) {
        test(`${name}: idle ${role} keeps restored authorization and clears private drafts`, async () => {
            const { bot, session, prompts, update } = harness(role);
            await bot.handleUpdate(update);
            assert.equal(session.user_id, 'owner');
            assert.equal(session.data.account_session_version, 3);
            assert.equal(session.state, role === 'employer' ? BotState.EMPLOYER_MAIN_MENU : BotState.MAIN_MENU);
            assert.deepEqual(session.data, {
                active_role: role, account_session_version: 3,
                telegram_username: 'synthetic_user', recent_update_ids: [1], clean_inputs: false,
            });
            assert.equal(await bot.checkAccountSession(10, session), true);
            assert.equal(prompts.length, 1);
            assert.match(prompts[0], /Сессия обновлена/);
        });
    }

    test(`${name}: idle reset cannot renew a revoked or closed account session`, async () => {
        for (const closed of [false, true]) {
            const { bot, session, prompts, update } = harness('employer', 3, closed ? 3 : 4, closed);
            await bot.handleUpdate(update);
            assert.equal(session.user_id, null);
            assert.equal(session.state, BotState.AWAITING_PHONE);
            assert.deepEqual(session.data, {});
            assert.equal(prompts.length, 1);
            assert.match(prompts[0], /Аккаунт закрыт или сеанс отозван/);
        }
    });

    test(`${name}: idle reset retains legacy epoch zero without granting a new epoch`, async () => {
        const { bot, session, update } = harness('job_seeker', 0);
        delete session.data.account_session_version;
        await bot.handleUpdate(update);
        assert.equal(session.data.account_session_version, undefined);
        assert.equal(await bot.checkAccountSession(10, session), true);
    });

    test(`${name}: recent form activity does not reset its draft or authorization`, async () => {
        const { bot, session } = harness('employer');
        session.updated_at = new Date().toISOString();
        const originalData = session.data;
        assert.equal(await bot.resetTimedOutFlowIfNeeded(session, 10), false);
        assert.equal(session.data, originalData);
        assert.equal(session.data.account_session_version, 3);
    });
}
