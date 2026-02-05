/**
 * Telegram Bot API Helper Library
 * Wrapper for Telegram Bot API calls
 */

const TELEGRAM_API_URL = 'https://api.telegram.org/bot';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

export function getBotToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    return token;
}

/**
 * Generic Telegram API call
 */
export async function callTelegramAPI<T = any>(
    method: string,
    params: Record<string, any> = {},
    options: { timeoutMs?: number; suppressErrors?: boolean } = {}
): Promise<T> {
    const token = getBotToken();
    const url = `${TELEGRAM_API_URL}${token}/${method}`;

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            }, timeoutMs);

            const result = await response.json().catch(() => null);

            if (!response.ok || !result?.ok) {
                const retryAfter = result?.parameters?.retry_after;
                if (response.status === 429 && retryAfter) {
                    await sleep((retryAfter + 1) * 1000);
                    continue;
                }

                if (response.status >= 500 && attempt < MAX_RETRIES) {
                    const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
                    await sleep(backoff);
                    continue;
                }

                if (!options.suppressErrors) {
                    console.error(`Telegram API error (${method}):`, result || response.status);
                }
                throw new Error(result?.description || `Telegram API error (${response.status})`);
            }

            return result.result as T;
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            const nonRetriable = /bad request|query is too old|query id is invalid|message to delete not found|message is not modified|chat not found|inline keyboard expected|text must be non-empty/i.test(message);
            if (nonRetriable) {
                throw error instanceof Error ? error : new Error(message);
            }
            if (attempt >= MAX_RETRIES) break;
            const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
            await sleep(backoff);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Telegram API error');
}

/**
 * Send text message
 */
export async function sendMessage(
    chatId: number | string,
    text: string,
    options: {
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        replyMarkup?: any;
        disableWebPagePreview?: boolean;
    } = {}
): Promise<any> {
    const safeText = typeof text === 'string' && text.trim().length > 0
        ? text
        : 'Xabar yuborilmadi.';
    return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: safeText,
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview
    });
}

/**
 * Send location
 */
export async function sendLocation(
    chatId: number | string,
    latitude: number,
    longitude: number,
    options: {
        replyMarkup?: any;
        livePeriod?: number;
    } = {}
): Promise<any> {
    return callTelegramAPI('sendLocation', {
        chat_id: chatId,
        latitude,
        longitude,
        ...(options.livePeriod ? { live_period: options.livePeriod } : {}),
        reply_markup: options.replyMarkup
    });
}

/**
 * Edit existing message
 */
export async function editMessage(
    chatId: number | string,
    messageId: number,
    text: string,
    options: {
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        replyMarkup?: any;
    } = {}
): Promise<any> {
    const safeText = typeof text === 'string' && text.trim().length > 0
        ? text
        : 'Xabar yangilanmadi.';
    const inlineMarkup = options.replyMarkup && typeof options.replyMarkup === 'object' && 'inline_keyboard' in options.replyMarkup
        ? options.replyMarkup
        : undefined;
    return callTelegramAPI('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: safeText,
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
        ...(inlineMarkup ? { reply_markup: inlineMarkup } : {})
    });
}

/**
 * Answer callback query (required for inline buttons)
 */
export async function answerCallbackQuery(
    callbackQueryId: string,
    options: { text?: string; showAlert?: boolean } = {}
): Promise<boolean> {
    try {
        return await callTelegramAPI('answerCallbackQuery', {
            callback_query_id: callbackQueryId,
            text: options.text,
            show_alert: options.showAlert
        }, { suppressErrors: true });
    } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        if (message.includes('query is too old') || message.includes('query id is invalid')) {
            return false;
        }
        throw error;
    }
}

/**
 * Delete message
 */
export async function deleteMessage(
    chatId: number | string,
    messageId: number
): Promise<boolean> {
    try {
        return await callTelegramAPI('deleteMessage', {
            chat_id: chatId,
            message_id: messageId
        }, { suppressErrors: true });
    } catch {
        return false; // Ignore deletion errors
    }
}

/**
 * Set webhook URL
 */
export async function setWebhook(url: string): Promise<boolean> {
    return callTelegramAPI('setWebhook', { url });
}

export async function setWebhookWithOptions(params: {
    url: string;
    secret_token?: string;
    allowed_updates?: string[];
    drop_pending_updates?: boolean;
}): Promise<boolean> {
    return callTelegramAPI('setWebhook', params);
}

/**
 * Get webhook info
 */
export async function getWebhookInfo(): Promise<any> {
    return callTelegramAPI('getWebhookInfo');
}

/**
 * Get bot info
 */
export async function getMe(): Promise<any> {
    return callTelegramAPI('getMe');
}

/**
 * Get chat member info (for subscription check)
 */
export async function getChatMember(
    chatId: string | number,
    userId: number
): Promise<{ status: string } | null> {
    try {
        return await callTelegramAPI('getChatMember', {
            chat_id: chatId,
            user_id: userId
        });
    } catch {
        return null;
    }
}

/**
 * Check if user is subscribed to a channel
 */
export async function isUserSubscribed(
    channelUsername: string,
    userId: number
): Promise<boolean> {
    const member = await getChatMember(`@${channelUsername}`, userId);
    if (!member) return false;
    return ['member', 'administrator', 'creator'].includes(member.status);
}

