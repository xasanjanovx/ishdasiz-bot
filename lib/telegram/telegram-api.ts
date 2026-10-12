import { E, PREMIUM_EMOJI_BY_KEY } from './premium-emoji-config';


const TELEGRAM_API_URL = 'https://api.telegram.org/bot';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;
let DRY_RUN_MESSAGE_ID = 700000;

const blockedPremiumEmojiIds = new Set<string>();

const PREMIUM_EMOJI_REPLACEMENTS: Array<{ chars: string[]; id: string }> = [
    { chars: ['\u{1F1FA}\u{1F1FF}'], id: '5438400294432028834' }, // ????
    { chars: ['\u{1F1F7}\u{1F1FA}'], id: '5436252471481611724' }, // ????
    { chars: ['\u{1F310}'], id: '5188381825701021648' }, // ??
    { chars: ['\u{2705}'], id: '6307344346748290621' }, // ?
    { chars: ['\u{1F4F1}'], id: '5407025283456835913' }, // ??
    { chars: ['\u{1F4E8}', '\u{1F4E9}'], id: '5406631276042002796' }, // ??/??
    { chars: ['\u{274C}'], id: '5852812849780362931' }, // ?
    { chars: ['\u{2611}\u{FE0F}', '\u{2611}'], id: '6307344346748290621' }, // ☑️
    { chars: ['\u{23F3}'], id: '5287579571485422439' }, // ?
    { chars: ['\u{1F510}'], id: '5350619413533958825' }, // ??
    { chars: ['\u{26A0}\u{FE0F}', '\u{26A0}'], id: '5242713260779643386' }, // ??
    { chars: ['\u{1F464}'], id: '5422364797809230911' }, // ??
    { chars: ['\u{1F465}'], id: '5422518677897512402' }, // ??
    { chars: ['\u{1F4CD}'], id: '5350301517234586704' }, // ??
    { chars: ['\u{1F4BC}'], id: '5458809519461136265' }, // ??
    { chars: ['\u{270F}\u{FE0F}', '\u{270F}'], id: '5879841310902324730' }, // ??
    { chars: ['\u{2B50}'], id: '5274046919809704653' }, // ?
    { chars: ['\u{2B50}\u{FE0F}'], id: '5436093373008066004' }, // ??
    { chars: ['\u{1F393}'], id: '5375163339154399459' }, // ??
    { chars: ['\u{1F9FE}', '\u{1F4CB}'], id: '5458458113826910668' }, // ??/??
    { chars: ['\u{1F3E2}'], id: '5264733042710181045' }, // ??
    { chars: ['\u{1F4C5}'], id: '5967782394080530708' }, // ??
    { chars: ['\u{1F514}'], id: '5242628160297641831' }, // ??
    { chars: ['\u{1F194}'], id: '5936017305585586269' }, // ??
    { chars: ['\u{1F9E0}'], id: '6257767895732848636' }, // ??
    { chars: ['\u{1F9E9}'], id: '5213306719215577669' }, // ??
    { chars: ['\u{1F552}'], id: E.clock }, // 🕒
    { chars: ['\u{1F6BB}'], id: E.group }, // 🚻
    { chars: ['\u{1F4AC}'], id: E.send }, // 💬
    { chars: ['\u{1F5E3}\u{FE0F}', '\u{1F5E3}'], id: '5188381825701021648' }, // 🗣️
    { chars: ['\u{1F9ED}'], id: E.map }, // 🧭
    { chars: ['\u{1F3F7}\u{FE0F}', '\u{1F3F7}'], id: E.clip }, // 🏷️
    { chars: ['\u{2B05}\u{FE0F}', '\u{2B05}'], id: '5258236805890710909' }, // ??
    { chars: ['\u{27A1}\u{FE0F}', '\u{27A1}'], id: '5260450573768990626' }, // ??
    { chars: ['\u{1F5D1}\u{FE0F}', '\u{1F5D1}'], id: '5841541824803509441' }, // ???
    { chars: ['\u{23ED}\u{FE0F}', '\u{23ED}'], id: '5884123981706956210' }, // ??
    { chars: ['\u{1F3E0}'], id: '5204181485669597563' }, // ??
    { chars: ['\u{1F50E}', '\u{1F50D}'], id: '5188311512791393083' }, // ??/??
    { chars: ['\u{1F4ED}'], id: '5352896944496728039' }, // ??
    { chars: ['\u{1F4C4}'], id: '5877301185639091664' }, // ??
    { chars: ['\u{1F525}'], id: '5420315771991497307' }, // ??
    { chars: ['\u{1F3AF}'], id: '5780530293945405228' }, // ??
    { chars: ['\u{1F4EC}'], id: '5350421256627838238' }, // ??
    { chars: ['\u{2699}\u{FE0F}', '\u{2699}'], id: '5350396951407895212' }, // ??
    { chars: ['\u{2795}'], id: '5406829076465861567' }, // ?
    { chars: ['\u{1F916}'], id: '5372981976804366741' }, // ??
    { chars: ['\u{1F680}'], id: '5458555944591981600' }, // ??
    { chars: ['\u{2709}\u{FE0F}', '\u{2709}'], id: '5253742260054409879' }, // ??
    { chars: ['\u{1F504}'], id: '5877410604225924969' }, // ??
    { chars: ['\u{1F3D9}\u{FE0F}', '\u{1F3D9}'], id: '5406686715479860449' }, // ???
    { chars: ['\u{1F91D}'], id: '5357080225463149588' }, // ??
    { chars: ['\u{1F7E2}'], id: '5852777287451151788' }, // ??
    { chars: ['\u{23F8}\u{FE0F}', '\u{23F8}'], id: '5359543311897998264' }, // ??
    { chars: ['\u{26AA}\u{FE0F}', '\u{26AA}'], id: '5348451945403137943' }, // ?
    { chars: ['\u{1F7E1}'], id: '5294234838058938175' }, // ??
    { chars: ['\u{1F534}'], id: '5291899179008798421' }, // ??
    { chars: ['\u{25AB}\u{FE0F}', '\u{25AB}'], id: '5978963495327108152' }, // ??
    { chars: ['\u{1F198}'], id: '5251489485283140234' }, // ??
    { chars: ['\u{1F4E2}'], id: '5330513091073427682' }, // ??
    // Additional semantic coverage from 68-step E mapping
    { chars: ['\u{1F44B}'], id: E.wave }, // 👋
    { chars: ['\u{2139}\u{FE0F}', '\u{2139}'], id: E.info }, // ℹ️
    { chars: ['\u{1F6AA}'], id: E.logout }, // 🚪
    { chars: ['\u{1F513}'], id: E.unlock }, // 🔓
    { chars: ['\u{1F511}'], id: E.key }, // 🔑
    { chars: ['\u{1F195}'], id: E.new }, // 🆕
    { chars: ['\u{1F6AB}'], id: E.ban }, // 🚫
    { chars: ['\u{1F512}'], id: E.locked }, // 🔒
    { chars: ['\u{1F5FA}\u{FE0F}', '\u{1F5FA}'], id: E.map }, // 🗺️
    { chars: ['\u{1F4C2}'], id: E.folder }, // 📂
    { chars: ['\u{1F614}'], id: E.sad }, // 😔
    { chars: ['\u{2753}'], id: E.question }, // ❓
    { chars: ['\u{1F4A1}'], id: E.idea }, // 💡
    { chars: ['\u{1F382}'], id: E.cake }, // 🎂
    { chars: ['\u{1F4CC}'], id: E.clip }, // 📌
    { chars: ['\u{1F4B0}'], id: E.money }, // 💰
    { chars: ['\u{1F4DD}'], id: E.note }, // 📝
    { chars: ['\u{1F30D}'], id: E.lang }, // 🌍
    { chars: ['\u{1F4C6}'], id: E.year }, // 📆
    { chars: ['\u{1F3EB}'], id: E.school }, // 🏫
    { chars: ['\u{1F4BE}'], id: E.save }, // 💾
    { chars: ['\u{1F381}'], id: E.gift }, // 🎁
    { chars: ['\u{1F6A8}'], id: E.alarm }, // 🚨
    { chars: ['\u{1F4CA}'], id: E.chart }, // 📊
    { chars: ['\u{1F4D8}'], id: E.book }, // 📘
    { chars: ['\u{1F454}'], id: E.tie }, // 👔
    { chars: ['\u{1F3ED}'], id: E.factory }, // 🏭
    { chars: ['\u{23F0}'], id: E.clock }, // ⏰
    { chars: ['\u{1F468}\u200D\u{1F4BC}'], id: E.user }, // 👨‍💼
    { chars: ['\u{1F4DE}', '\u{260E}\u{FE0F}', '\u{260E}'], id: E.call }, // 📞/☎️
    { chars: ['\u{26D4}'], id: E.stop } // ⛔
];
const PREMIUM_MODE_RAW = String(process.env.TELEGRAM_PREMIUM_MODE || 'auto').toLowerCase();
const PREMIUM_MODE: 'auto' | 'on' | 'off' = PREMIUM_MODE_RAW === 'on' || PREMIUM_MODE_RAW === 'off'
    ? PREMIUM_MODE_RAW
    : 'auto';
let premiumRuntimeDisabled = PREMIUM_MODE === 'off';
// Keep disabled by default to avoid duplicate icon+emoji rendering on clients with partial support.
const BUTTON_TEXT_FALLBACK_MODE = false;

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPremiumEmojiIds(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    const ids = new Set<string>();
    const regex = /emoji-id="(\d+)"/g;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
        if (match[1]) ids.add(match[1]);
    }
    return Array.from(ids);
}

function blockPremiumEmojiIdsFromText(text: string, context: string, preferredId?: string): void {
    const ids = preferredId ? [preferredId] : extractPremiumEmojiIds(text);
    if (!ids.length) return;
    let added = 0;
    for (const id of ids) {
        if (!blockedPremiumEmojiIds.has(id)) {
            blockedPremiumEmojiIds.add(id);
            added += 1;
        }
    }
    if (added > 0) {
        console.warn(`[BOT] Blocked premium emoji id(s) after ${context}: ${ids.join(', ')}`);
    }
}

function applyPremiumEmoji(text: string, premiumKey?: string): string {
    if (!text || typeof text !== 'string') return text;
    if (text.includes('emoji-id="')) return text;

    let keyEmojiId: string | undefined;
    let keyToken: string | undefined;
    const keyPlaceholder = '__TG_PREMIUM_KEY_PLACEHOLDER__';
    let output = text;

    if (premiumKey) {
        keyEmojiId = PREMIUM_EMOJI_BY_KEY[premiumKey];
        if (keyEmojiId && !blockedPremiumEmojiIds.has(keyEmojiId)) {
            const match = output.match(/\p{Extended_Pictographic}(?:\uFE0F)?/u);
            if (match?.[0]) {
                keyToken = match[0];
                const pattern = new RegExp(escapeRegex(keyToken), 'u');
                output = output.replace(pattern, keyPlaceholder);
            }
        }
    }

    for (const replacement of PREMIUM_EMOJI_REPLACEMENTS) {
        if (blockedPremiumEmojiIds.has(replacement.id)) continue;
        const pattern = new RegExp(replacement.chars.map(escapeRegex).join('|'), 'gu');
        output = output.replace(pattern, (matched) => `<tg-emoji emoji-id="${replacement.id}">${matched}</tg-emoji>`);
    }

    if (keyToken && keyEmojiId) {
        const keyWrapped = `<tg-emoji emoji-id="${keyEmojiId}">${keyToken}</tg-emoji>`;
        output = output.replace(keyPlaceholder, keyWrapped);
    }

    return output;
}

function isEntityTextError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('entity_text_invalid')
        || message.includes("can't parse entities")
        || message.includes('document_invalid');
}

function isPremiumHardFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('document_invalid');
}

function isButtonIconError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('icon_custom_emoji_id')
        || message.includes('inline keyboard button')
        || message.includes('reply keyboard button')
        || message.includes('keyboard button')
        || message.includes('field "style"')
        || message.includes("field 'style'");
}

const PREMIUM_ICON_FALLBACK_TEXT_BY_ID: Record<string, string> = {
    '5438400294432028834': '🇺🇿',
    '5436252471481611724': '🇷🇺',
    '5350619413533958825': '🔐',
    '5407025283456835913': '📱',
    '5188311512791393083': '🔎',
    '5458458113826910668': '🧾',
    '5406631276042002796': '📨',
    '5274046919809704653': '⭐',
    '5350396951407895212': '⚙️',
    '5251489485283140234': '🆘',
    '5330513091073427682': '📢',
    '5877597667231534929': '📋',
    '5422518677897512402': '👥',
    '5264733042710181045': '🏢',
    '5415742696973158126': '📍',
    '5258236805890710909': '⬅️',
    '5877468380125990242': '➡️',
    '5884123981706956210': '⏭️',
    '6307344346748290621': '✅',
    '5852812849780362931': '❌',
    '5253742260054409879': '✉️',
    '5188381825701021648': '🌐',
    '5877410604225924969': '🔄',
    '5879841310902324730': '✏️',
    '5841541824803509441': '🗑️',
    '5350301517234586704': '📍',
    '5406686715479860449': '🏙️',
    '6257767895732848636': '🧠',
    '5458809519461136265': '💼',
    '5375163339154399459': '🎓',
    '5422721499138136676': '👤',
    '5967782394080530708': '📅',
    '5436093373008066004': '⭐️',
    '5936017305585586269': '🆔',
    '5213306719215577669': '🧩',
    '5242628160297641831': '🔔',
    '5357080225463149588': '🤝',
    '5852777287451151788': '🟢',
    '5359543311897998264': '⏸️',
    '5204181485669597563': '🏠',
    '5350421256627838238': '📬',
    '5420315771991497307': '🔥',
    '5780530293945405228': '🎯',
    '5877301185639091664': '📄',
    '5352896944496728039': '📭',
    '5458555944591981600': '🚀',
    '5406829076465861567': '➕',
    '5372981976804366741': '🤖',
    '5348451945403137943': '⚪️',
    '5294234838058938175': '🟡',
    '5291899179008798421': '🔴',
    '5978963495327108152': '▫️'
};

function hasLeadingEmoji(value: string): boolean {
    return /^(\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)/u.test(
        String(value || '').trim()
    );
}

function addFallbackEmojiToText(text: string, iconId?: string): string {
    const source = String(text || '');
    if (!iconId) return source;
    const emoji = PREMIUM_ICON_FALLBACK_TEXT_BY_ID[iconId];
    if (!emoji) return source;
    if (hasLeadingEmoji(source)) return source;
    return source.trim() ? `${emoji} ${source}` : emoji;
}

const BUTTON_LEADING_DECORATORS_RE = /^[\s\u00A0\u200B\u200C\u200D•·▪▫◦‣∙●○]+/u;
function trimButtonDecorators(text: string): string {
    return String(text || '').replace(BUTTON_LEADING_DECORATORS_RE, '');
}

function stripLeadingEmojiFromButtonText(text: string): string {
    const source = trimButtonDecorators(String(text || '').trimStart());
    if (!source) return String(text || '');
    const match = source.match(/^(?:(\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)\s*)+(?:[|:：\-–—]\s*)?/u);
    if (!match?.[0]) {
        const fallback = source
            .replace(/^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+/u, '')
            .replace(/^[|:：\-–—]\s*/u, '')
            .trimStart();
        return fallback.length > 0 ? fallback : String(text || '');
    }
    const stripped = source.slice(match[0].length).trimStart();
    return stripped || String(text || '');
}

function normalizeReplyMarkupButtonText(replyMarkup: any): any {
    if (!replyMarkup || typeof replyMarkup !== 'object') return replyMarkup;
    const normalizeButton = (button: any) => {
        if (!button || typeof button !== 'object') return button;
        if (!button.icon_custom_emoji_id || typeof button.text !== 'string') return button;
        return {
            ...button,
            text: stripLeadingEmojiFromButtonText(button.text)
        };
    };
    const result: any = { ...replyMarkup };
    if (Array.isArray(replyMarkup.inline_keyboard)) {
        result.inline_keyboard = replyMarkup.inline_keyboard.map((row: any[]) =>
            Array.isArray(row) ? row.map((button) => normalizeButton(button)) : row
        );
    }
    if (Array.isArray(replyMarkup.keyboard)) {
        result.keyboard = replyMarkup.keyboard.map((row: any[]) =>
            Array.isArray(row) ? row.map((button) => normalizeButton(button)) : row
        );
    }
    return result;
}

function hasPremiumButtonFields(replyMarkup: any): boolean {
    if (!replyMarkup || typeof replyMarkup !== 'object') return false;
    const walkButtons = (rows: any[][] | undefined): boolean => {
        if (!Array.isArray(rows)) return false;
        for (const row of rows) {
            if (!Array.isArray(row)) continue;
            for (const button of row) {
                if (!button || typeof button !== 'object') continue;
                if ('icon_custom_emoji_id' in button || 'style' in button) return true;
            }
        }
        return false;
    };
    return walkButtons(replyMarkup.inline_keyboard) || walkButtons(replyMarkup.keyboard);
}

function sanitizeReplyMarkup(replyMarkup: any): any {
    if (!replyMarkup || typeof replyMarkup !== 'object') return replyMarkup;
    const sanitizeButton = (button: any) => {
        if (!button || typeof button !== 'object') return button;
        const { icon_custom_emoji_id, style, ...rest } = button;
        const maybeIconId = typeof icon_custom_emoji_id === 'string' ? icon_custom_emoji_id : undefined;
        void style;
        if (typeof rest.text === 'string') {
            return {
                ...rest,
                text: BUTTON_TEXT_FALLBACK_MODE
                    ? addFallbackEmojiToText(rest.text, maybeIconId)
                    : rest.text
            };
        }
        return rest;
    };
    const result: any = { ...replyMarkup };
    if (Array.isArray(replyMarkup.inline_keyboard)) {
        result.inline_keyboard = replyMarkup.inline_keyboard.map((row: any[]) =>
            Array.isArray(row) ? row.map((button) => sanitizeButton(button)) : row
        );
    }
    if (Array.isArray(replyMarkup.keyboard)) {
        result.keyboard = replyMarkup.keyboard.map((row: any[]) =>
            Array.isArray(row) ? row.map((button) => sanitizeButton(button)) : row
        );
    }
    return result;
}

function shouldUsePremiumEmoji(options: { disablePremiumEmoji?: boolean;
        premiumKey?: string; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' }): boolean {
    if (options.disablePremiumEmoji) return false;
    if (options.parseMode && options.parseMode !== 'HTML') return false;
    return !premiumRuntimeDisabled;
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
export class TelegramRequestError extends Error {
    constructor(message: string, public readonly definitiveRejection: boolean) { super(message); this.name = 'TelegramRequestError'; }
}

export async function callTelegramAPI<T = any>(
    method: string,
    params: Record<string, any> = {},
    options: { timeoutMs?: number; suppressErrors?: boolean; singleAttempt?: boolean } = {}
): Promise<T> {
    if (isDryRunEnabled()) {
        return buildDryRunResponse(method, params) as T;
    }

    const token = getBotToken();
    const url = `${TELEGRAM_API_URL}${token}/${method}`;

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let lastError: unknown;
    const attempts = options.singleAttempt ? 1 : MAX_RETRIES;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        let response: Response;
        try {
            response = await fetchWithTimeout(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
            }, timeoutMs);
        } catch {
            // Avoid logging fetch errors that can contain the URL and bot token.
            lastError = new TelegramRequestError('Telegram connection failed', false);
            if (attempt === attempts) break;
            await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
            continue;
        }
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok) return result.result as T;
        const status = result?.error_code || response.status;
        const reason = typeof result?.description === 'string' ? result.description.replaceAll(token, '[redacted]') : 'Telegram API request failed';
        lastError = new TelegramRequestError(reason, result?.ok === false && Number.isInteger(result?.error_code) && response.status >= 400 && response.status < 500 && status >= 400 && status < 500);
        // Invalid requests and blocked/deleted chats cannot be fixed by retrying.
        if (status !== 429 && status < 500) throw lastError;
        if (attempt === attempts) break;
        const retryAfter = Number(result?.parameters?.retry_after);
        const delay = status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 60000)
            : BACKOFF_BASE_MS * Math.pow(2, attempt);
        await sleep(delay);
    }
    if (!options.suppressErrors) console.error(`Telegram request failed: ${method}`);
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
        premiumKey?: string;
        singleAttempt?: boolean;
    } = {}
): Promise<any> {
    const safeText = typeof text === 'string' && text.trim().length > 0
        ? text
        : 'Xabar yuborilmadi.';
    const shouldDecorate = shouldUsePremiumEmoji(options);
    const premiumText = shouldDecorate ? applyPremiumEmoji(safeText, options.premiumKey) : safeText;
    const hasHtmlMarkup = /<\/?(?:b|i|u|s|code|pre|blockquote|a|tg-emoji)\b/i.test(premiumText);
    const autoParse = options.parseMode ?? (hasHtmlMarkup ? 'HTML' : undefined);
    const normalizedMarkup = normalizeReplyMarkupButtonText(options.replyMarkup);
    const payload = {
        chat_id: chatId,
        text: premiumText,
        ...(autoParse ? { parse_mode: autoParse } : {}),
        reply_markup: normalizedMarkup,
        disable_web_page_preview: options.disableWebPagePreview
    };

    const send = (body: Record<string, any>) => callTelegramAPI('sendMessage', body, { singleAttempt: options.singleAttempt, suppressErrors: options.singleAttempt });
    try {
        return await send(payload);
    } catch (error) {
        if (options.singleAttempt && (!(error instanceof TelegramRequestError) || !error.definitiveRejection)) throw error;
        let activeError: unknown = error;
        if (isButtonIconError(activeError) && hasPremiumButtonFields(normalizedMarkup)) {
            try {
                return await send({
                    ...payload,
                    reply_markup: sanitizeReplyMarkup(normalizedMarkup)
                });
            } catch (retryError) {
                if (options.singleAttempt && (!(retryError instanceof TelegramRequestError) || !retryError.definitiveRejection)) throw retryError;
                activeError = retryError;
            }
        }
        if (!shouldDecorate || !isEntityTextError(activeError)) throw activeError;
        if (isPremiumHardFailure(activeError)) {
            premiumRuntimeDisabled = true;
        }
        const preferredBlockedId = options.premiumKey ? PREMIUM_EMOJI_BY_KEY[options.premiumKey] : undefined;
        blockPremiumEmojiIdsFromText(premiumText, 'sendMessage', preferredBlockedId);
        const fallbackHasHtml = /<\/?(?:b|i|u|s|code|pre|blockquote|a)\b/i.test(safeText);
        const fallbackParse = options.parseMode ?? (fallbackHasHtml ? 'HTML' : undefined);
        return send({
            chat_id: chatId,
            text: safeText,
            ...(fallbackParse ? { parse_mode: fallbackParse } : {}),
            reply_markup: normalizedMarkup,
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
        premiumKey?: string;
    } = {}
): Promise<any> {
    if (!sticker || typeof sticker !== 'string') {
        throw new Error('Sticker file_id is required');
    }
    const shouldDecorate = shouldUsePremiumEmoji({ parseMode: options.parseMode });
    const caption = (typeof options.caption === 'string' && shouldDecorate)
        ? applyPremiumEmoji(options.caption, options.premiumKey)
        : options.caption;
    const parseMode = options.parseMode
        ?? (caption && caption.includes('<tg-emoji') ? 'HTML' : undefined);
    const normalizedMarkup = normalizeReplyMarkupButtonText(options.replyMarkup);
    const payload = {
        chat_id: chatId,
        sticker,
        ...(caption ? { caption } : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(normalizedMarkup ? { reply_markup: normalizedMarkup } : {}),
        ...(typeof options.disableNotification === 'boolean' ? { disable_notification: options.disableNotification } : {})
    };

    try {
        return await callTelegramAPI('sendSticker', payload);
    } catch (error) {
        let activeError: unknown = error;
        if (isButtonIconError(activeError) && hasPremiumButtonFields(normalizedMarkup)) {
            try {
                return await callTelegramAPI('sendSticker', {
                    ...payload,
                    ...(normalizedMarkup ? { reply_markup: sanitizeReplyMarkup(normalizedMarkup) } : {})
                });
            } catch (retryError) {
                activeError = retryError;
            }
        }
        if (!caption || !shouldDecorate || !isEntityTextError(activeError)) throw activeError;
        if (isPremiumHardFailure(activeError)) {
            premiumRuntimeDisabled = true;
        }
        const preferredBlockedId = options.premiumKey ? PREMIUM_EMOJI_BY_KEY[options.premiumKey] : undefined;
        blockPremiumEmojiIdsFromText(caption, 'sendSticker', preferredBlockedId);
        const plainCaption = options.caption;
        const plainHasHtml = typeof plainCaption === 'string' && /<\/?(?:b|i|u|s|code|pre|blockquote|a)\b/i.test(plainCaption);
        const plainParseMode = options.parseMode ?? (plainHasHtml ? 'HTML' : undefined);
        return callTelegramAPI('sendSticker', {
            chat_id: chatId,
            sticker,
            ...(plainCaption ? { caption: plainCaption } : {}),
            ...(plainParseMode ? { parse_mode: plainParseMode } : {}),
            ...(normalizedMarkup ? { reply_markup: normalizedMarkup } : {}),
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
        premiumKey?: string;
    } = {}
): Promise<any> {
    const safeText = typeof text === 'string' && text.trim().length > 0
        ? text
        : 'Xabar yangilanmadi.';
    const shouldDecorate = shouldUsePremiumEmoji({ parseMode: options.parseMode });
    const premiumText = shouldDecorate ? applyPremiumEmoji(safeText, options.premiumKey) : safeText;
    const parseMode = options.parseMode ?? 'HTML';
    const normalizedMarkup = normalizeReplyMarkupButtonText(options.replyMarkup);
    const inlineMarkup = normalizedMarkup && typeof normalizedMarkup === 'object' && 'inline_keyboard' in normalizedMarkup
        ? normalizedMarkup
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
        let activeError: unknown = error;
        if (isButtonIconError(activeError) && inlineMarkup && hasPremiumButtonFields(inlineMarkup)) {
            try {
                return await callTelegramAPI('editMessageText', {
                    ...payload,
                    reply_markup: sanitizeReplyMarkup(inlineMarkup)
                });
            } catch (retryError) {
                activeError = retryError;
            }
        }
        if (!shouldDecorate || !isEntityTextError(activeError)) throw activeError;
        if (isPremiumHardFailure(activeError)) {
            premiumRuntimeDisabled = true;
        }
        const preferredBlockedId = options.premiumKey ? PREMIUM_EMOJI_BY_KEY[options.premiumKey] : undefined;
        blockPremiumEmojiIdsFromText(premiumText, 'editMessage', preferredBlockedId);
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



