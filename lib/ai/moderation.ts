/**
 * Content Moderation for AI Chat
 * Detects abuse, spam, and inappropriate content
 */

// Banned words/patterns in Russian and Uzbek
const BANNED_PATTERNS_RU = [
    // Profanity (Russian) - basic patterns
    /\bбля[дть]?\b/i,
    /\bхуй/i,
    /\bпизд/i,
    /\bсука\b/i,
    /\bмудак/i,
    /\bдебил/i,
    /\bидиот/i,
    /\bдурак\b/i,
    /\bзаткнись/i,
    /\bубью\b/i,
    /\bубить\b/i,
    /\bсдохни/i,
    /\bнах[у|е]й/i,
    // Threats
    /\bугроз/i,
    /\bвзорв/i,
    /\bубийств/i,
];

const BANNED_PATTERNS_UZ = [
    // Profanity (Uzbek) - basic patterns
    /\bsho['']pang/i,
    /\baxmoq/i,
    /\btentak/i,
    /\bjinni/i,
    /\bo['']ldiraman/i,
    /\bqotil/i,
];

// Prompt injection patterns
const INJECTION_PATTERNS = [
    /ignore\s+(previous|above|all)/i,
    /forget\s+(everything|all|previous)/i,
    /you\s+are\s+now/i,
    /new\s+instructions/i,
    /system\s*prompt/i,
    /reveal\s+(your|the)\s+(instructions|prompt|system)/i,
    /ignore\s+your\s+(instructions|rules)/i,
    /pretend\s+you\s+are/i,
    /act\s+as\s+if/i,
    /\bAPI\s*key\b/i,
    /\bpassword\b/i,
    /\bSUPABASE/i,
    /\benv\s*\./i,
    /\bprocess\.env/i,
    /\bSQL\b.*\b(inject|injection)/i,
    /DROP\s+TABLE/i,
    /DELETE\s+FROM/i,
    /\bRLS\b/i,
];

// Spam patterns
const SPAM_PATTERNS = [
    /(.)\1{5,}/,  // Repeated characters: "aaaaaa"
    /\b(http|www)\S+/i, // URLs
    /@\w+\.\w+/i, // Email-like patterns
];

export interface ModerationResult {
    allowed: boolean;
    reason?: 'profanity' | 'threat' | 'injection' | 'spam';
    warningMessage?: {
        uz: string;
        ru: string;
    };
    shouldLog: boolean;
}

/**
 * Check message for abuse, injection attempts, or spam
 */
export function checkForAbuse(message: string): ModerationResult {
    const normalizedMessage = message.toLowerCase().trim();

    // Check for profanity
    for (const pattern of [...BANNED_PATTERNS_RU, ...BANNED_PATTERNS_UZ]) {
        if (pattern.test(normalizedMessage)) {
            return {
                allowed: false,
                reason: 'profanity',
                warningMessage: WARNING_MESSAGES.profanity,
                shouldLog: true,
            };
        }
    }

    // Check for prompt injection
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(normalizedMessage)) {
            return {
                allowed: false,
                reason: 'injection',
                warningMessage: WARNING_MESSAGES.injection,
                shouldLog: true,
            };
        }
    }

    // Check for spam
    for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(normalizedMessage)) {
            return {
                allowed: false,
                reason: 'spam',
                warningMessage: WARNING_MESSAGES.spam,
                shouldLog: true,
            };
        }
    }

    return { allowed: true, shouldLog: false };
}

// Warning messages in both languages
export const WARNING_MESSAGES = {
    profanity: {
        uz: "⚠️ Hurmatli foydalanuvchi, iltimos, odob doirasida muloqot qiling. Qoidalarni buzish akkauntingiz bloklanishiga olib kelishi mumkin.",
        ru: "⚠️ Уважаемый пользователь, пожалуйста, соблюдайте правила общения. Нарушение правил может привести к блокировке аккаунта.",
    },
    threat: {
        uz: "⚠️ Tahdid yoki zo'ravonlikka oid so'zlar taqiqlangan. Bunday xatti-harakatlar akkauntingiz bloklanishiga olib keladi.",
        ru: "⚠️ Угрозы и призывы к насилию запрещены. Подобное поведение приведёт к блокировке аккаунта.",
    },
    injection: {
        uz: "⚠️ Noto'g'ri so'rov aniqlandi. Iltimos, oddiy tilda ish qidiring.",
        ru: "⚠️ Обнаружен некорректный запрос. Пожалуйста, используйте обычный язык для поиска работы.",
    },
    spam: {
        uz: "⚠️ Spam aniqlandi. Iltimos, oddiy so'rovlarni yuboring.",
        ru: "⚠️ Обнаружен спам. Пожалуйста, отправляйте обычные запросы.",
    },
    rate_limit: {
        uz: "⚠️ Siz juda ko'p so'rov yubordingiz. Iltimos, 1 daqiqa kuting.",
        ru: "⚠️ Слишком много запросов. Пожалуйста, подождите 1 минуту.",
    },
};

/**
 * Sanitize user input before sending to AI
 * Removes potentially dangerous content
 */
export function sanitizeInput(message: string): string {
    return message
        .replace(/[<>{}[\]\\]/g, '') // Remove brackets and special chars
        .replace(/\s+/g, ' ')         // Normalize whitespace
        .trim()
        .slice(0, 500);               // Limit length
}
