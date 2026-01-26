/**
 * Telegram Bot Keyboards - Complete Resume Flow
 * All inline keyboards for resume creation and job search
 */

import { BotLang } from './texts';

// ============================================
// Keyboard Types
// ============================================
interface InlineButton {
    text: string;
    callback_data?: string;
    url?: string;
    web_app?: { url: string };
}

interface ReplyButton {
    text: string;
    request_contact?: boolean;
    request_location?: boolean;
    web_app?: { url: string };
}

interface RegionItem {
    id: number;
    name_uz: string;
    name_ru: string;
}

interface CategoryItem {
    id: string;
    name_uz: string;
    name_ru: string;
    icon?: string;
}

// ============================================
// Data Constants
// ============================================
const REGIONS = [
    { id: 1, name_uz: "Toshkent shahri", name_ru: "Ташкент" },
    { id: 2, name_uz: "Toshkent viloyati", name_ru: "Ташкентская область" },
    { id: 3, name_uz: "Andijon viloyati", name_ru: "Андижанская область" },
    { id: 4, name_uz: "Buxoro viloyati", name_ru: "Бухарская область" },
    { id: 5, name_uz: "Farg'ona viloyati", name_ru: "Ферганская область" },
    { id: 6, name_uz: "Jizzax viloyati", name_ru: "Джизакская область" },
    { id: 7, name_uz: "Xorazm viloyati", name_ru: "Хорезмская область" },
    { id: 8, name_uz: "Namangan viloyati", name_ru: "Наманганская область" },
    { id: 9, name_uz: "Navoiy viloyati", name_ru: "Навоийская область" },
    { id: 10, name_uz: "Qashqadaryo viloyati", name_ru: "Кашкадарьинская область" },
    { id: 11, name_uz: "Samarqand viloyati", name_ru: "Самаркандская область" },
    { id: 12, name_uz: "Sirdaryo viloyati", name_ru: "Сырдарьинская область" },
    { id: 13, name_uz: "Surxondaryo viloyati", name_ru: "Сурхандарьинская область" },
    { id: 14, name_uz: "Qoraqalpog'iston Respublikasi", name_ru: "Республика Каракалпакстан" }
];

const CATEGORIES = [
    { id: "a0000001-0001-4000-8000-000000000001", name_uz: "IT", name_ru: "IT", icon: "💻" },
    { id: "a0000002-0002-4000-8000-000000000002", name_uz: "Sanoat", name_ru: "Производство", icon: "🏭" },
    { id: "a0000003-0003-4000-8000-000000000003", name_uz: "Xizmatlar", name_ru: "Услуги", icon: "🛎" },
    { id: "a0000004-0004-4000-8000-000000000004", name_uz: "Ta'lim", name_ru: "Образование", icon: "📚" },
    { id: "a0000005-0005-4000-8000-000000000005", name_uz: "Tibbiyot", name_ru: "Медицина", icon: "🏥" },
    { id: "a0000006-0006-4000-8000-000000000006", name_uz: "Moliya", name_ru: "Финансы", icon: "💰" },
    { id: "a0000007-0007-4000-8000-000000000007", name_uz: "Qurilish", name_ru: "Строительство", icon: "🏗" },
    { id: "a0000008-0008-4000-8000-000000000008", name_uz: "Qishloq xo'jaligi", name_ru: "Сельское хоз.", icon: "🌾" },
    { id: "a0000009-0009-4000-8000-000000000009", name_uz: "Transport", name_ru: "Транспорт", icon: "🚗" },
    { id: "a0000010-0010-4000-8000-000000000010", name_uz: "Savdo", name_ru: "Продажи", icon: "🛒" },
    { id: "a0000011-0011-4000-8000-000000000011", name_uz: "Boshqa", name_ru: "Другое", icon: "📋" }
];

const EXPERIENCE_LEVELS = [
    { value: 'no_experience', label_uz: "Tajribasiz", label_ru: "Без опыта" },
    { value: '1_year', label_uz: "1 yil", label_ru: "1 год" },
    { value: '3_years', label_uz: "1-3 yil", label_ru: "1-3 года" },
    { value: '5_years', label_uz: "3-5 yil", label_ru: "3-5 лет" },
    { value: '10_years', label_uz: "5+ yil", label_ru: "5+ лет" }
];

const EDUCATION_LEVELS = [
    { value: 'secondary', label_uz: "O'rta", label_ru: "Среднее" },
    { value: 'vocational', label_uz: "O'rta maxsus", label_ru: "Среднее спец." },
    { value: 'incomplete_higher', label_uz: "Oliy (tugallanmagan)", label_ru: "Неоконченное высшее" },
    { value: 'higher', label_uz: "Oliy", label_ru: "Высшее" }
];

const SALARY_RANGES = [
    { value: '0', label_uz: "Kelishiladi", label_ru: "Договорная" },
    { value: '2000000', label_uz: "2 mln+", label_ru: "2 млн+" },
    { value: '3000000', label_uz: "3 mln+", label_ru: "3 млн+" },
    { value: '5000000', label_uz: "5 mln+", label_ru: "5 млн+" },
    { value: '7000000', label_uz: "7 mln+", label_ru: "7 млн+" },
    { value: '10000000', label_uz: "10 mln+", label_ru: "10 млн+" }
];

// ============================================
// Helper Functions
// ============================================
function createInlineKeyboard(buttons: InlineButton[][]): object {
    return { inline_keyboard: buttons };
}

function createReplyKeyboard(buttons: ReplyButton[][], options: { resize?: boolean; one_time?: boolean } = {}): object {
    return {
        keyboard: buttons,
        resize_keyboard: options.resize ?? true,
        one_time_keyboard: options.one_time ?? false
    };
}

// ============================================
// Language Keyboard
// ============================================
export function languageKeyboard(): object {
    return createInlineKeyboard([
        [
            { text: "🇺🇿 O'zbekcha", callback_data: 'lang:uz' },
            { text: "🇷🇺 Русский", callback_data: 'lang:ru' }
        ]
    ]);
}

// ============================================
// Phone Request Keyboard
// ============================================
export function phoneRequestKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? "📱 Telefon raqamni yuborish" : "📱 Отправить номер", request_contact: true }]
    ], { one_time: true });
}

// ============================================
// WebApp Keyboard - Main entry point for Mini App
// ============================================
export function webAppKeyboard(lang: BotLang): object {
    const webAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ishdasiz.uz';
    return {
        inline_keyboard: [
            [
                {
                    text: lang === 'uz' ? "🚀 Ilovani ochish" : "🚀 Открыть приложение",
                    web_app: { url: webAppUrl }
                }
            ],
            [
                {
                    text: lang === 'uz' ? "🔍 Ish qidirish" : "🔍 Поиск работы",
                    web_app: { url: `${webAppUrl}/jobs` }
                },
                {
                    text: lang === 'uz' ? "📄 Rezyume" : "📄 Резюме",
                    web_app: { url: `${webAppUrl}/profile/job-seeker` }
                }
            ]
        ]
    };
}

// ============================================
// Login Choice Keyboard
// ============================================
export function loginChoiceKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "🔑 Parol orqali" : "🔑 Через пароль", callback_data: "auth:password" },
            { text: lang === 'uz' ? "📩 SMS kod orqali" : "📩 Через SMS код", callback_data: "auth:sms" }
        ]
    ]);
}

// ============================================
// Region Selection Keyboard (2 columns)
// ============================================
export function regionKeyboard(lang: BotLang, regions: RegionItem[] = REGIONS): object {
    const buttons: InlineButton[][] = [];

    for (let i = 0; i < regions.length; i += 2) {
        const row: InlineButton[] = [];
        row.push({
            text: lang === 'uz' ? regions[i].name_uz : regions[i].name_ru,
            callback_data: `region:${regions[i].id}`
        });
        if (regions[i + 1]) {
            row.push({
                text: lang === 'uz' ? regions[i + 1].name_uz : regions[i + 1].name_ru,
                callback_data: `region:${regions[i + 1].id}`
            });
        }
        buttons.push(row);
    }

    return createInlineKeyboard(buttons);
}

// ============================================
// District Selection Keyboard (fetched dynamically)
// ============================================
export function districtKeyboard(districts: Array<{ id: string; name_uz: string; name_ru: string }>, lang: BotLang, page: number = 0): object {
    const perPage = 8;
    const start = page * perPage;
    const pageDistricts = districts.slice(start, start + perPage);
    const buttons: InlineButton[][] = [];

    // 2 columns
    for (let i = 0; i < pageDistricts.length; i += 2) {
        const row: InlineButton[] = [];
        row.push({
            text: lang === 'uz' ? pageDistricts[i].name_uz : pageDistricts[i].name_ru,
            callback_data: `district:${pageDistricts[i].id}`
        });
        if (pageDistricts[i + 1]) {
            row.push({
                text: lang === 'uz' ? pageDistricts[i + 1].name_uz : pageDistricts[i + 1].name_ru,
                callback_data: `district:${pageDistricts[i + 1].id}`
            });
        }
        buttons.push(row);
    }

    // Pagination
    const navRow: InlineButton[] = [];
    if (page > 0) {
        navRow.push({ text: "◀", callback_data: `distpage:${page - 1}` });
    }
    navRow.push({ text: "◀ Orqaga", callback_data: "back:region" });
    if (start + perPage < districts.length) {
        navRow.push({ text: "▶", callback_data: `distpage:${page + 1}` });
    }
    buttons.push(navRow);

    return createInlineKeyboard(buttons);
}

// ============================================
// Category Selection Keyboard (2 columns with icons)
// ============================================
export function categoryKeyboard(lang: BotLang, categories: CategoryItem[] = CATEGORIES): object {
    const buttons: InlineButton[][] = [];

    for (let i = 0; i < categories.length; i += 2) {
        const row: InlineButton[] = [];
        const leftIcon = categories[i].icon ? `${categories[i].icon} ` : '';
        row.push({
            text: `${leftIcon}${lang === 'uz' ? categories[i].name_uz : categories[i].name_ru}`,
            callback_data: `category:${categories[i].id}`
        });
        if (categories[i + 1]) {
            const rightIcon = categories[i + 1].icon ? `${categories[i + 1].icon} ` : '';
            row.push({
                text: `${rightIcon}${lang === 'uz' ? categories[i + 1].name_uz : categories[i + 1].name_ru}`,
                callback_data: `category:${categories[i + 1].id}`
            });
        }
        buttons.push(row);
    }

    // Back button
    buttons.push([{ text: "◀ Orqaga", callback_data: "back:district" }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Experience Level Keyboard
// ============================================
export function experienceKeyboard(lang: BotLang): object {
    const buttons: InlineButton[][] = EXPERIENCE_LEVELS.map(exp => [{
        text: lang === 'uz' ? exp.label_uz : exp.label_ru,
        callback_data: `experience:${exp.value}`
    }]);

    buttons.push([{ text: "◀ Orqaga", callback_data: "back:category" }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Education Level Keyboard
// ============================================
export function educationKeyboard(lang: BotLang): object {
    const buttons: InlineButton[][] = EDUCATION_LEVELS.map(edu => [{
        text: lang === 'uz' ? edu.label_uz : edu.label_ru,
        callback_data: `education:${edu.value}`
    }]);

    buttons.push([{ text: "◀ Orqaga", callback_data: "back:experience" }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Gender Keyboard
// ============================================
export function genderKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "👨 Erkak" : "👨 Мужской", callback_data: "gender:male" },
            { text: lang === 'uz' ? "👩 Ayol" : "👩 Женский", callback_data: "gender:female" }
        ],
        [{ text: "◀ Orqaga", callback_data: "back:education" }]
    ]);
}

// ============================================
// Salary Selection Keyboard
// ============================================
export function salaryKeyboard(lang: BotLang): object {
    const buttons: InlineButton[][] = [];

    // 2 columns
    for (let i = 0; i < SALARY_RANGES.length; i += 2) {
        const row: InlineButton[] = [];
        row.push({
            text: lang === 'uz' ? SALARY_RANGES[i].label_uz : SALARY_RANGES[i].label_ru,
            callback_data: `salary:${SALARY_RANGES[i].value}`
        });
        if (SALARY_RANGES[i + 1]) {
            row.push({
                text: lang === 'uz' ? SALARY_RANGES[i + 1].label_uz : SALARY_RANGES[i + 1].label_ru,
                callback_data: `salary:${SALARY_RANGES[i + 1].value}`
            });
        }
        buttons.push(row);
    }

    buttons.push([{ text: "◀ Orqaga", callback_data: "back:gender" }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Skip Button Keyboard
// ============================================
export function skipKeyboard(lang: BotLang, backAction: string): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "O'tkazib yuborish →" : "Пропустить →", callback_data: "skip" }
        ],
        [{ text: "◀ Orqaga", callback_data: `back:${backAction}` }]
    ]);
}

// ============================================
// Skills Keyboard
// ============================================
export function skillsKeyboard(lang: BotLang, skills: string[]): object {
    const buttons: InlineButton[][] = [];

    // Show current skills as deletable badges
    for (let i = 0; i < skills.length; i += 2) {
        const row: InlineButton[] = [];
        row.push({ text: `❌ ${skills[i]}`, callback_data: `delskill:${i}` });
        if (skills[i + 1]) {
            row.push({ text: `❌ ${skills[i + 1]}`, callback_data: `delskill:${i + 1}` });
        }
        buttons.push(row);
    }

    // Action buttons
    buttons.push([
        { text: lang === 'uz' ? "✅ Tayyor" : "✅ Готово", callback_data: "skills:done" }
    ]);
    buttons.push([{ text: "◀ Orqaga", callback_data: "back:about" }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Main Menu Keyboard (Reply)
// ============================================
export function mainMenuKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [
            { text: lang === 'uz' ? "🔍 Ish topish" : "🔍 Найти работу" },
            { text: lang === 'uz' ? "📄 Rezyume" : "📄 Резюме" }
        ],
        [
            { text: lang === 'uz' ? "👤 Profil" : "👤 Профиль" },
            { text: lang === 'uz' ? "⚙️ Sozlamalar" : "⚙️ Настройки" }
        ]
    ]);
}



// ============================================
// Job Navigation Keyboard
// ============================================
export function jobNavigationKeyboard(lang: BotLang, current: number, total: number, jobId: string, source?: string): object {
    const buttons: InlineButton[][] = [];

    // Navigation row
    const navRow: InlineButton[] = [];
    if (current > 0) {
        navRow.push({ text: "◀", callback_data: "job:prev" });
    }
    navRow.push({ text: `${current + 1}/${total}`, callback_data: "noop" });
    if (current < total - 1) {
        navRow.push({ text: "▶", callback_data: "job:next" });
    }
    buttons.push(navRow);

    // Action row - only show apply for manual/bot jobs
    const showApply = !source || source === 'manual' || source === 'bot';
    if (showApply) {
        buttons.push([
            { text: lang === 'uz' ? "📝 Ariza berish" : "📝 Откликнуться", callback_data: `apply:${jobId}` }
        ]);
    }

    // Back to menu
    buttons.push([
        { text: lang === 'uz' ? "◀ Menyu" : "◀ Меню", callback_data: "menu:main" }
    ]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Profile View/Edit Keyboard
// ============================================
export function profileKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "✏️ Tahrirlash" : "✏️ Редактировать", callback_data: "profile:edit" }
        ],
        [
            { text: lang === 'uz' ? "📄 Rezyumeni ko'rish" : "📄 Посмотреть резюме", callback_data: "profile:resume" }
        ],
        [
            { text: lang === 'uz' ? "◀ Menyu" : "◀ Меню", callback_data: "menu:main" }
        ]
    ]);
}

// ============================================
// Settings Keyboard
// ============================================
export function settingsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "🌐 Tilni o'zgartirish" : "🌐 Изменить язык", callback_data: "settings:language" }],
        [{ text: "◀ Orqaga", callback_data: "menu:main" }]
    ]);
}

// ============================================
// Resume Complete Keyboard
// ============================================
export function resumeCompleteKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "🔍 Ish qidirish" : "🔍 Искать работу", callback_data: "action:search" }],
        [{ text: lang === 'uz' ? "📄 Rezyumeni ko'rish" : "📄 Посмотреть резюме", callback_data: "action:viewresume" }],
        [{ text: lang === 'uz' ? "🏠 Bosh menyu" : "🏠 Главное меню", callback_data: "menu:main" }]
    ]);
}

// ============================================
// DUAL ROLE & EMPLOYER KEYBOARDS
// ============================================

export function roleSelectionKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "👤 Ish qidiruvchi" : "👤 Соискатель", callback_data: "role:seeker" }],
        [{ text: lang === 'uz' ? "💼 Ish beruvchi" : "💼 Работодатель", callback_data: "role:employer" }]
    ]);
}

export function employerMainMenuKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [
            { text: lang === 'uz' ? "📝 Vakansiya joylash" : "📝 Разместить вакансию" },
            { text: lang === 'uz' ? "📋 Mening vakansiyalarim" : "📋 Мои вакансии" }
        ],
        [
            { text: lang === 'uz' ? "⚙️ Sozlamalar" : "⚙️ Настройки" }
        ]
    ]);
}

export function jobConfirmKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "✅ Chop etish" : "✅ Опубликовать", callback_data: "job:publish" }],
        [{ text: lang === 'uz' ? "❌ Bekor qilish" : "❌ Отмена", callback_data: "menu:main" }]
    ]);
}

export function subscriptionRequiredKeyboard(lang: BotLang, channelUsername: string = 'ishdasiz'): object {
    const handle = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
    const channelLabel = `@${handle}`;
    return createInlineKeyboard([
        [{ text: channelLabel, url: `https://t.me/${handle}` }],
        [{ text: lang === 'uz' ? "✅ Tekshirish" : "✅ Проверить", callback_data: "sub:check" }]
    ]);
}

export function multiCategoryKeyboard(lang: BotLang, selectedIds: string[] = [], categories: CategoryItem[] = CATEGORIES): object {
    const rows: InlineButton[][] = categories.map(cat => {
        const isSelected = selectedIds.includes(cat.id);
        const checkmark = isSelected ? "✅ " : "";
        const name = lang === 'uz' ? cat.name_uz : cat.name_ru;
        const icon = cat.icon ? `${cat.icon} ` : '';
        return [{ text: `${checkmark}${icon}${name}`, callback_data: `mcat:${cat.id}` }];
    });

    // Add done button if at least one selected
    if (selectedIds.length > 0) {
        rows.push([{ text: lang === 'uz' ? "✅ Davom etish" : "✅ Продолжить", callback_data: "mcat:done" }]);
    }

    return createInlineKeyboard(rows);
}

// ============================================
// Remove Keyboard
// ============================================
export function removeKeyboard(): object {
    return { remove_keyboard: true };
}

// ============================================
// Location & Resume Options
// ============================================
export function locationRequestKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? "📍 Lokatsiyani yuborish" : "📍 Отправить локацию", request_location: true }],
        [{ text: lang === 'uz' ? "◀ Bekor qilish" : "◀ Отмена" }]
    ], { one_time: true, resize: true });
}

export function resumeOptionsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "✏️ Ma'lumotlarni yangilash" : "✏️ Обновить данные", callback_data: "resume:update" }],
        [{ text: lang === 'uz' ? "🗑 O'chirish" : "🗑 Удалить", callback_data: "resume:delete" }],
        [{ text: lang === 'uz' ? "◀ Bosh menyu" : "◀ Главное меню", callback_data: "menu:main" }]
    ]);
}

// ============================================
// Export Constants for use in bot
// ============================================
export { REGIONS, CATEGORIES, EXPERIENCE_LEVELS, EDUCATION_LEVELS, SALARY_RANGES };


