/**
 * Local Telegram Bot Runner - Full Bot with OTP
 * Uses the complete TelegramBot class with all authentication flows
 * 
 * Run with: npx tsx scripts/run-bot-local.ts
 */

require('dotenv').config({ path: '.env.local' });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
}

let lastUpdateId = 0;

async function deleteWebhook(): Promise<void> {
    const res = await fetch(`${API_BASE}/deleteWebhook`);
    const data = await res.json() as any;
    console.log('Webhook deleted:', data.ok ? 'success' : data.description);
}

async function getUpdates(): Promise<any[]> {
    try {
        const res = await fetch(`${API_BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
        const data = await res.json() as any;
        return data.ok ? data.result : [];
    } catch (err) {
        console.error('Fetch error:', err);
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
