/**
 * Local Telegram Bot Runner - Full Bot with OTP
 * Uses the complete TelegramBot class with all authentication flows
 * 
 * Run with: npx tsx scripts/run-bot-local.ts
 */

require('dotenv').config({ path: '.env.local' });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const POLL_TIMEOUT_SECONDS = 30;
const REQUEST_TIMEOUT_MS = 35000;
const DELETE_WEBHOOK_RETRIES = 3;

if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
}

let lastUpdateId = 0;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatNetworkError(err: unknown): string {
    if (err instanceof Error) {
        const cause = (err as any).cause;
        const code = cause?.code || (err as any).code;
        const hostname = cause?.hostname;
        if (code === 'ENOTFOUND') {
            return `DNS resolve failed for ${hostname || 'api.telegram.org'} (ENOTFOUND). Check internet/VPN/DNS.`;
        }
        if (code === 'ECONNREFUSED') {
            return 'Connection refused by Telegram API endpoint.';
        }
        if (code === 'ETIMEDOUT' || err.name === 'AbortError') {
            return 'Telegram API request timed out.';
        }
        return err.message;
    }
    return String(err);
}

async function fetchJson(url: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(url, { signal: controller.signal });
        const raw = await res.text();

        let data: any = null;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            throw new Error(`Non-JSON response (${res.status}) from Telegram API`);
        }

        if (!res.ok) {
            throw new Error(data?.description || `HTTP ${res.status}`);
        }

        return data;
    } finally {
        clearTimeout(timeout);
    }
}

async function deleteWebhook(): Promise<void> {
    for (let attempt = 1; attempt <= DELETE_WEBHOOK_RETRIES; attempt++) {
        try {
            const data = await fetchJson(`${API_BASE}/deleteWebhook?drop_pending_updates=true`);
            console.log('Webhook deleted:', data.ok ? 'success' : data.description);
            return;
        } catch (err) {
            const reason = formatNetworkError(err);
            console.error(`deleteWebhook attempt ${attempt}/${DELETE_WEBHOOK_RETRIES} failed: ${reason}`);

            if (attempt < DELETE_WEBHOOK_RETRIES) {
                await sleep(1200 * attempt);
                continue;
            }

            console.warn('Continuing startup; polling will retry on next loop.');
            return;
        }
    }
}

async function getUpdates(): Promise<any[]> {
    try {
        const data = await fetchJson(`${API_BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=${POLL_TIMEOUT_SECONDS}`);
        if (!data?.ok) {
            console.error('Telegram getUpdates error:', data?.description || data);
            return [];
        }
        return data.ok ? data.result : [];
    } catch (err) {
        console.error('Fetch error:', formatNetworkError(err));
        await sleep(1500);
        return [];
    }
}

async function main(): Promise<void> {
    console.log('Starting FULL Telegram bot with OTP...\n');

    // Dynamic import to handle ESM modules
    const { telegramBot } = await import('../lib/telegram/telegram-bot');

    await deleteWebhook();

    console.log('Bot started in polling mode with FULL functionality.');
    console.log('Features: Language selection, Phone verification, OTP, Resume creation');
    console.log('Press Ctrl+C to stop\n');

    while (true) {
        const updates = await getUpdates();

        for (const update of updates) {
            lastUpdateId = update.update_id;
            const preview = JSON.stringify(update).slice(0, 100);
            console.log(`\nUpdate ${update.update_id}: ${preview}...`);

            try {
                await telegramBot.handleUpdate(update);
                console.log('Processed by full bot');
            } catch (err) {
                console.error('Error:', err);
            }
        }
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
