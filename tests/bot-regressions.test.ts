import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

process.env.TELEGRAM_DRY_RUN = '1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';

const { TelegramBot, BotState } = require('../lib/telegram/telegram-bot');
const { callTelegramAPI } = require('../lib/telegram/telegram-api');

function harness() {
    // Use actual methods without creating a DB connection or sending messages.
    const bot: any = Object.create(TelegramBot.prototype);
    const prompts: string[] = [];
    bot.sendPrompt = async (_chat: number, _session: any, text: string) => { prompts.push(text); };
    bot.setSession = async (session: any, changes: any) => { Object.assign(session, changes); };
    bot.finalizeLogin = async () => { bot.loginCalls = (bot.loginCalls || 0) + 1; };
    bot.loginCalls = 0;
    return { bot, prompts };
}
const session = () => ({ state: BotState.AWAITING_OTP, lang: 'ru', telegram_user_id: 10, user_id: null,
    phone: '+998901234567', otp_code: '54321', otp_expires_at: new Date(Date.now() + 60000).toISOString(), data: {} });

test('session OTP locks after three failed attempts', async () => {
    const { bot } = harness();
    const s = session();
    for (let i = 0; i < 3; i++) await bot.handleOTP(10, '11111', s);
    await bot.handleOTP(10, '54321', s);
    assert.equal(bot.loginCalls, 0);
    assert.equal(s.otp_code, null);
    assert.equal(s.state, BotState.AWAITING_PHONE);
});

test('expired or malformed expiry never authenticates', async () => {
    for (const expiry of [new Date(Date.now() - 1000).toISOString(), 'invalid-date']) {
        const { bot } = harness();
        const s = session(); s.otp_expires_at = expiry;
        await bot.handleOTP(10, '54321', s);
        assert.equal(bot.loginCalls, 0);
    }
});

test('valid OTP signs in once through the normal login flow', async () => {
    const { bot } = harness();
    await bot.handleOTP(10, '54321', session());
    assert.equal(bot.loginCalls, 1);
});

test('foreign phone numbers are rejected rather than truncated', async () => {
    const { bot } = harness();
    bot.findUserByPhone = async () => { throw new Error('Must not look up a foreign number'); };
    const s = session();
    await bot.handlePhone(10, '+79012345678', s, true);
    assert.equal(s.phone, '+998901234567');
});

test('forwarded contact cannot replace the login phone', async () => {
    const { bot, prompts } = harness();
    bot.isAdminTelegramUser = () => false;
    bot.isUserBanned = async () => false;
    bot.shouldDeleteIncomingMessage = () => false;
    bot.handlePhone = async () => { throw new Error('Must not process another user contact'); };
    const s = session(); s.state = BotState.AWAITING_PHONE;
    await bot.handleMessage({ message_id: 1, chat: { id: 10 }, from: { id: 10 }, contact: { user_id: 20, phone_number: '+998991234567' } }, s);
    assert.equal(s.phone, '+998901234567');
    assert.ok(prompts.some(text => text.includes('свой контакт')));
});

test('deep-link /start payload reaches the start flow', async () => {
    const { bot } = harness();
    bot.isAdminTelegramUser = () => true;
    bot.isUserBanned = async () => false;
    bot.shouldDeleteIncomingMessage = () => false;
    bot.keepOnlyLatestStartCommand = async () => {};
    let started = false;
    bot.handleStart = async () => { started = true; };
    await bot.handleMessage({ message_id: 1, chat: { id: 10 }, from: { id: 10 }, text: '/start job_123' }, session());
    assert.ok(started);
});

test('Telegram 403 is not retried, and the bot token is not exposed', async () => {
    const originalFetch = globalThis.fetch;
    process.env.TELEGRAM_DRY_RUN = '0';
    process.env.TELEGRAM_BOT_TOKEN = 'local-test-token';
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }), { status: 403 });
    };
    try {
        await assert.rejects(callTelegramAPI('sendMessage', { chat_id: 10, text: 'Test' }), /Forbidden/);
        assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; process.env.TELEGRAM_DRY_RUN = '1'; }
});

test('failed delivery is retriable and only successful updates are remembered', async () => {
 const { bot } = harness();
 const s = session();
 bot.userUpdateQueue = new Map();
 bot.getOrCreateSession = async () => s;
 bot.resetTimedOutFlowIfNeeded = async () => false;
 bot.syncTelegramUsernameFromUpdate = async () => {};
 bot.syncTelegramFirstNameFromUpdate = async () => {};
 bot.isDuplicateUpdate = () => false;
 let tracked = 0;
 bot.trackUpdate = async () => { tracked++; };
 bot.handleMessage = async () => { throw new Error('temporary failure'); };
 const update = { update_id: 1, message: { message_id: 1, from: { id: 10 }, chat: { id: 10, type: 'private' }, text: 'hello' } };
 await assert.rejects(bot.handleUpdate(update), /temporary failure/);
 assert.equal(tracked, 0);
 bot.handleMessage = async () => {};
 await bot.handleUpdate(update);
 assert.equal(tracked, 1);
});
