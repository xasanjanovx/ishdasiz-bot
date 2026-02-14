/**
 * Telegram Bot API Helper Library
 * Wrapper for Telegram Bot API calls
 */

const TELEGRAM_API_URL = 'https://api.telegram.org/bot';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;
let DRY_RUN_MESSAGE_ID = 700000;

// Premium custom emoji IDs (user-provided). Mapped only to business/neutral semantics.
const PREMIUM_EMOJI_IDS = {
    search: '3089780562001395745',
    document: '4648605080554045438',
    company: '6829398536396734420',
    salary: '5271091265042120292',
    location: '7489288727785635926',
    contact: '3499844080710451248',
    success: '1590429039703621659',
    warning: '3396165696185434098',
    error: '164517760200605720',
    ai: '3089780562001395827',
    interface: '623648548654677984'
} as const;

const PREMIUM_EMOJI_REPLACEMENTS: Array<{ chars: string[]; id: string }> = [
    { chars: ['🔎', '🔍'], id: PREMIUM_EMOJI_IDS.search },
    { chars: ['🧾', '📄', '📝', '📋', '🪪'], id: PREMIUM_EMOJI_IDS.document },
    { chars: ['🏢', '🏭', '💼'], id: PREMIUM_EMOJI_IDS.company },
    { chars: ['💰'], id: PREMIUM_EMOJI_IDS.salary },
    { chars: ['📍', '📌'], id: PREMIUM_EMOJI_IDS.location },
    { chars: ['📞', '📱', '☎️', '☎', '💬'], id: PREMIUM_EMOJI_IDS.contact },
    { chars: ['✅'], id: PREMIUM_EMOJI_IDS.success },
    { chars: ['⚠️', '⚠', 'ℹ️', 'ℹ', '❗️', '❗'], id: PREMIUM_EMOJI_IDS.warning },
    { chars: ['❌', '🚫'], id: PREMIUM_EMOJI_IDS.error },
    { chars: ['🤖'], id: PREMIUM_EMOJI_IDS.ai },
    {
        chars: [
            '🏠', '⭐', '⚙️', '⚙', '📨', '📩', '📢', '🆘', '👤', '👥', '🎓', '🧠', '📊', '📆',
            '📅', '⏰', '🕒', '🌐', '🗣️', '🛎️', '🔹', '🧭', '🚻', '🚪', '🔄', '▶️', '❓', '📭',
            '📥', '✨', '🚀'
        ],
        id: PREMIUM_EMOJI_IDS.interface
    }
];

const PREMIUM_MODE_RAW = String(process.env.TELEGRAM_PREMIUM_MODE || 'auto').toLowerCase();
const PREMIUM_MODE: 'auto' | 'on' | 'off' = PREMIUM_MODE_RAW === 'on' || PREMIUM_MODE_RAW === 'off'
    ? PREMIUM_MODE_RAW
    : 'auto';
let premiumRuntimeDisabled = PREMIUM_MODE === 'off';
let premiumDisableLogged = false;

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPremiumEmoji(text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (text.includes('emoji-id="')) return text;

    let output = text;
    for (const replacement of PREMIUM_EMOJI_REPLACEMENTS) {
        const pattern = new RegExp(replacement.chars.map(escapeRegex).join('|'), 'g');
        output = output.replace(pattern, (matched) => `<tg-emoji emoji-id="${replacement.id}">${matched}</tg-emoji>`);
    }
    return output;
}

function isEntityTextError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('entity_text_invalid')
        || message.includes("can't parse entities")
        || message.includes('document_invalid');
}

function shouldUsePremiumEmoji(options: { disablePremiumEmoji?: boolean; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' }): boolean {
    if (options.disablePremiumEmoji) return false;
    if (options.parseMode && options.parseMode !== 'HTML') return false;
    return !premiumRuntimeDisabled;
}

function tripPremiumCircuit(error: unknown): void {
    if (PREMIUM_MODE === 'on') return;
    if (premiumRuntimeDisabled) return;
    premiumRuntimeDisabled = true;
    if (premiumDisableLogged) return;
    premiumDisableLogged = true;
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[BOT] Premium emoji disabled for current process:', message);
}

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

function isDryRunEnabled(): boolean {
    return process.env.TELEGRAM_DRY_RUN === '1';
}

function buildDryRunResponse(method: string, params: Record<string, any> = {}): any {
    switch (method) {
        case 'sendMessage':
        case 'sendSticker':
        case 'sendLocation':
            DRY_RUN_MESSAGE_ID += 1;
            return {
                message_id: DRY_RUN_MESSAGE_ID,
                date: Math.floor(Date.now() / 1000),
                chat: { id: params.chat_id },
                text: params.text ?? params.caption ?? ''
            };
        case 'editMessageText':
        case 'deleteMessage':
        case 'answerCallbackQuery':
        case 'setWebhook':
            return true;
        case 'getWebhookInfo':
            return { url: '', has_custom_certificate: false, pending_update_count: 0 };
        case 'getMe':
            return { id: 0, is_bot: true, username: 'dry_run_bot' };
        case 'getChatMember':
            return { status: 'member' };
        default:
            return true;
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
    if (isDryRunEnabled()) {
        return buildDryRunResponse(method, params) as T;
    }

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
        disablePremiumEmoji?: boolean;
    } = {}
): Promise<any> {
    const safeText = typeof text === 'string' && text.trim().length > 0
        ? text
        : 'Xabar yuborilmadi.';
    const shouldDecorate = shouldUsePremiumEmoji(options);
    const premiumText = shouldDecorate ? applyPremiumEmoji(safeText) : safeText;
    const hasHtmlMarkup = /<\/?(?:b|i|u|s|code|pre|blockquote|a|tg-emoji)\b/i.test(premiumText);
    const autoParse = options.parseMode ?? (hasHtmlMarkup ? 'HTML' : undefined);
    const payload = {
        chat_id: chatId,
        text: premiumText,
        ...(autoParse ? { parse_mode: autoParse } : {}),
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview
    };

    try {
        return await callTelegramAPI('sendMessage', payload);
    } catch (error) {
        if (!shouldDecorate || !isEntityTextError(error)) throw error;
        tripPremiumCircuit(error);
        const fallbackHasHtml = /<\/?(?:b|i|u|s|code|pre|blockquote|a)\b/i.test(safeText);
        const fallbackParse = options.parseMode ?? (fallbackHasHtml ? 'HTML' : undefined);
        return callTelegramAPI('sendMessage', {
            chat_id: chatId,
            text: safeText,
            ...(fallbackParse ? { parse_mode: fallbackParse } : {}),
            reply_markup: options.replyMarkup,
            disable_web_page_preview: options.disableWebPagePreview
        });
    }
}

/**
 * Send sticker message
 */
export async function sendSticker(
    chatId: number | string,
    sticker: string,
    options: {
        caption?: string;
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        replyMarkup?: any;
        disableNotification?: boolean;
    } = {}
): Promise<any> {
    if (!sticker || typeof sticker !== 'string') {
        throw new Error('Sticker file_id is required');
    }
    const shouldDecorate = shouldUsePremiumEmoji({ parseMode: options.parseMode });
    const caption = (typeof options.caption === 'string' && shouldDecorate)
        ? applyPremiumEmoji(options.caption)
        : options.caption;
    const parseMode = options.parseMode
        ?? (caption && caption.includes('<tg-emoji') ? 'HTML' : undefined);
    const payload = {
        chat_id: chatId,
        sticker,
        ...(caption ? { caption } : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        ...(typeof options.disableNotification === 'boolean' ? { disable_notification: options.disableNotification } : {})
    };

    try {
        return await callTelegramAPI('sendSticker', payload);
    } catch (error) {
        if (!caption || !shouldDecorate || !isEntityTextError(error)) throw error;
        tripPremiumCircuit(error);
        const plainCaption = options.caption;
        const plainHasHtml = typeof plainCaption === 'string' && /<\/?(?:b|i|u|s|code|pre|blockquote|a)\b/i.test(plainCaption);
        const plainParseMode = options.parseMode ?? (plainHasHtml ? 'HTML' : undefined);
        return callTelegramAPI('sendSticker', {
            chat_id: chatId,
            sticker,
            ...(plainCaption ? { caption: plainCaption } : {}),
            ...(plainParseMode ? { parse_mode: plainParseMode } : {}),
            ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
            ...(typeof options.disableNotification === 'boolean' ? { disable_notification: options.disableNotification } : {})
        });
    }
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
    const shouldDecorate = shouldUsePremiumEmoji({ parseMode: options.parseMode });
    const premiumText = shouldDecorate ? applyPremiumEmoji(safeText) : safeText;
    const parseMode = options.parseMode ?? 'HTML';
    const inlineMarkup = options.replyMarkup && typeof options.replyMarkup === 'object' && 'inline_keyboard' in options.replyMarkup
        ? options.replyMarkup
        : undefined;
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: premiumText,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(inlineMarkup ? { reply_markup: inlineMarkup } : {})
    };

    try {
        return await callTelegramAPI('editMessageText', payload);
    } catch (error) {
        if (!shouldDecorate || !isEntityTextError(error)) throw error;
        tripPremiumCircuit(error);
        return callTelegramAPI('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: safeText,
            ...(parseMode ? { parse_mode: parseMode } : {}),
            ...(inlineMarkup ? { reply_markup: inlineMarkup } : {})
        });
    }
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


