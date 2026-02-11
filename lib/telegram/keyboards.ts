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
    { id: 1, name_uz: 'Toshkent shahri', name_ru: 'Ташкент' },
    { id: 2, name_uz: 'Toshkent viloyati', name_ru: 'Ташкентская область' },
    { id: 3, name_uz: 'Andijon viloyati', name_ru: 'Андижанская область' },
    { id: 4, name_uz: 'Buxoro viloyati', name_ru: 'Бухарская область' },
    { id: 5, name_uz: "Farg'ona viloyati", name_ru: 'Ферганская область' },
    { id: 6, name_uz: 'Jizzax viloyati', name_ru: 'Джизакская область' },
    { id: 7, name_uz: 'Xorazm viloyati', name_ru: 'Хорезмская область' },
    { id: 8, name_uz: 'Namangan viloyati', name_ru: 'Наманганская область' },
    { id: 9, name_uz: 'Navoiy viloyati', name_ru: 'Навоийская область' },
    { id: 10, name_uz: 'Qashqadaryo viloyati', name_ru: 'Кашкадарьинская область' },
    { id: 11, name_uz: 'Samarqand viloyati', name_ru: 'Самаркандская область' },
    { id: 12, name_uz: 'Sirdaryo viloyati', name_ru: 'Сырдарьинская область' },
    { id: 13, name_uz: 'Surxondaryo viloyati', name_ru: 'Сурхандарьинская область' },
    { id: 14, name_uz: "Qoraqalpog'iston Respublikasi", name_ru: 'Республика Каракалпакстан' }
];

const CATEGORIES = [
    { id: 'a0000001-0001-4000-8000-000000000001', name_uz: 'IT', name_ru: 'IT', icon: '' },
    { id: 'a0000002-0002-4000-8000-000000000002', name_uz: 'Sanoat', name_ru: 'Производство', icon: '' },
    { id: 'a0000003-0003-4000-8000-000000000003', name_uz: 'Xizmatlar', name_ru: 'Услуги', icon: '' },
    { id: 'a0000004-0004-4000-8000-000000000004', name_uz: "Ta'lim", name_ru: 'Образование', icon: '' },
    { id: 'a0000005-0005-4000-8000-000000000005', name_uz: 'Tibbiyot', name_ru: 'Медицина', icon: '' },
    { id: 'a0000006-0006-4000-8000-000000000006', name_uz: 'Moliya, iqtisod, boshqaruv', name_ru: 'Финансы, экономика, управление', icon: '' },
    { id: 'a0000007-0007-4000-8000-000000000007', name_uz: 'Qurilish', name_ru: 'Строительство', icon: '' },
    { id: 'a0000008-0008-4000-8000-000000000008', name_uz: "Qishloq xo'jaligi", name_ru: 'Сельское хоз.', icon: '' },
    { id: 'a0000009-0009-4000-8000-000000000009', name_uz: 'Transport', name_ru: 'Транспорт', icon: '' },
    { id: 'a0000010-0010-4000-8000-000000000010', name_uz: 'Savdo', name_ru: 'Продажи', icon: '' }
];

const EXPERIENCE_LEVELS = [
    { value: 'no_experience', label_uz: 'Tajribasiz', label_ru: 'Без опыта' },
    { value: '1_year', label_uz: '1 yil', label_ru: '1 год' },
    { value: '3_years', label_uz: '1-3 yil', label_ru: '1-3 года' },
    { value: '5_years', label_uz: '3-5 yil', label_ru: '3-5 лет' },
    { value: '10_years', label_uz: '5+ yil', label_ru: '5+ лет' }
];

const JOB_EXPERIENCE_LEVELS = [
    { value: 'no_experience', label_uz: 'Talab etilmaydi', label_ru: 'Не требуется' },
    { value: '1_year', label_uz: '1 yil', label_ru: '1 год' },
    { value: '3_years', label_uz: '1-3 yil', label_ru: '1-3 года' },
    { value: '5_years', label_uz: '3-5 yil', label_ru: '3-5 лет' },
    { value: '10_years', label_uz: '5+ yil', label_ru: '5+ лет' }
];

const EDUCATION_LEVELS = [
    { value: 'master', label_uz: 'Magistr', label_ru: 'Магистр' },
    { value: 'higher', label_uz: 'Oliy', label_ru: 'Высшее' },
    { value: 'vocational', label_uz: "O'rta maxsus", label_ru: 'Среднее спец.' },
    { value: 'secondary', label_uz: "O'rta", label_ru: 'Среднее' }
];

const SALARY_RANGES = [
    { value: '0', label_uz: 'Kelishiladi', label_ru: 'Договорная' },
    { value: '2000000', label_uz: '2 mln+', label_ru: '2 млн+' },
    { value: '3000000', label_uz: '3 mln+', label_ru: '3 млн+' },
    { value: '4000000', label_uz: '4 mln+', label_ru: '4 млн+' },
    { value: '5000000', label_uz: '5 mln+', label_ru: '5 млн+' },
    { value: '6000000', label_uz: '6 mln+', label_ru: '6 млн+' },
    { value: '7000000', label_uz: '7 mln+', label_ru: '7 млн+' },
    { value: '8000000', label_uz: '8 mln+', label_ru: '8 млн+' },
    { value: '9000000', label_uz: '9 mln+', label_ru: '9 млн+' },
    { value: '10000000', label_uz: '10 mln+', label_ru: '10 млн+' }
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
// Simple Back Keyboard
// ============================================
export function backKeyboard(lang: BotLang, backAction: string): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]
    ]);
}

export function backCancelKeyboard(lang: BotLang, backAction: string): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function cancelInlineKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

// ============================================
// Language Keyboard
// ============================================
export function languageKeyboard(): object {
    return createInlineKeyboard([
        [
            { text: "O'zbekcha", callback_data: 'lang:uz' },
            { text: 'Русский', callback_data: 'lang:ru' }
        ]
    ]);
}

// ============================================
// Start Keyboard
// ============================================
export function startKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? '🔐 Kirish' : '🔐 Войти', callback_data: 'auth:start' }
        ]
    ]);
}

// ============================================
// Phone Request Keyboard
// ============================================
export function phoneRequestKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? '📱 Telefon raqamni yuborish' : '📱 Отправить номер телефона', request_contact: true }]
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
                    text: lang === 'uz' ? 'Ilovani ochish' : 'Открыть приложение',
                    web_app: { url: webAppUrl }
                }
            ],
            [
                {
                    text: lang === 'uz' ? 'Ish qidirish' : 'Искать работу',
                    web_app: { url: `${webAppUrl}/jobs` }
                },
                {
                    text: lang === 'uz' ? 'Rezyume' : 'Резюме',
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
            { text: lang === 'uz' ? 'SMS kod orqali' : 'По SMS коду', callback_data: 'auth:sms' }
        ]
    ]);
}

// ============================================
// Region Selection Keyboard (2 columns)
// ============================================
export function regionKeyboard(lang: BotLang, regions: RegionItem[] = REGIONS, backAction?: string): object {
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

    if (backAction) {
        buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);
    }

    return createInlineKeyboard(buttons);
}

// ============================================
// District Selection Keyboard (fetched dynamically)
// ============================================
export function districtKeyboard(
    districts: Array<{ id: string | number; name_uz: string; name_ru: string }>,
    lang: BotLang,
    page: number = 0,
    counts: Record<string, number> = {},
    backAction: string = 'region',
    showCounts: boolean = true
): object {
    void page;
    const pageDistricts = districts;
    const buttons: InlineButton[][] = [];

    // 2 columns
    for (let i = 0; i < pageDistricts.length; i += 2) {
        const row: InlineButton[] = [];
        const leftId = String(pageDistricts[i].id);
        const leftCount = counts[leftId] ?? 0;
        const leftName = lang === 'uz' ? pageDistricts[i].name_uz : pageDistricts[i].name_ru;
        row.push({
            text: showCounts ? `${leftName} (${leftCount})` : leftName,
            callback_data: `district:${pageDistricts[i].id}`
        });
        if (pageDistricts[i + 1]) {
            const rightId = String(pageDistricts[i + 1].id);
            const rightCount = counts[rightId] ?? 0;
            const rightName = lang === 'uz' ? pageDistricts[i + 1].name_uz : pageDistricts[i + 1].name_ru;
            row.push({
                text: showCounts ? `${rightName} (${rightCount})` : rightName,
                callback_data: `district:${pageDistricts[i + 1].id}`
            });
        }
        buttons.push(row);
    }

    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);
    return createInlineKeyboard(buttons);
}

// ============================================
// Category Selection Keyboard (2 columns)
// ============================================
export function categoryKeyboard(lang: BotLang, categories: CategoryItem[] = CATEGORIES, backAction: string = 'district'): object {
    const financeCategoryId = 'a0000006-0006-4000-8000-000000000006';
    const categoryList = (categories && categories.length ? categories : CATEGORIES)
        .filter(cat => {
            const id = String(cat?.id || '');
            const nameUz = String(cat?.name_uz || '').toLowerCase();
            const nameRu = String(cat?.name_ru || '').toLowerCase();
            if (id === 'a0000011-0011-4000-8000-000000000011') return false;
            if (nameUz.includes('boshqa')) return false;
            if (nameRu.includes('другое')) return false;
            return true;
        });
    if (!categoryList.some(cat => String(cat.id) === financeCategoryId)) {
        categoryList.push({
            id: financeCategoryId,
            name_uz: 'Moliya, iqtisod, boshqaruv',
            name_ru: 'Финансы, экономика, управление',
            icon: ''
        });
    }

    const buttons: InlineButton[][] = [];

    for (let i = 0; i < categoryList.length; i += 2) {
        const row: InlineButton[] = [];
        row.push({
            text: lang === 'uz' ? categoryList[i].name_uz : categoryList[i].name_ru,
            callback_data: `category:${categoryList[i].id}`
        });
        if (categoryList[i + 1]) {
            row.push({
                text: lang === 'uz' ? categoryList[i + 1].name_uz : categoryList[i + 1].name_ru,
                callback_data: `category:${categoryList[i + 1].id}`
            });
        }
        buttons.push(row);
    }

    // Back button
    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Osonish Fields (Lavozimga yaqin kasb)
// ============================================
export function fieldsKeyboard(
    lang: BotLang,
    fields: Array<{ id: number | string; title?: string | null; title_uz?: string | null; title_ru?: string | null }>,
    backAction?: string,
    page: number = 0,
    perPage: number = 10
): object {
    const buttons: InlineButton[][] = [];
    const total = fields.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * perPage;
    const pageFields = fields.slice(start, start + perPage);

    const crop = (value: string): string => {
        if (value.length <= 58) return value;
        return `${value.slice(0, 55)}...`;
    };

    for (const field of pageFields) {
        const title = (field.title_uz || field.title_ru || field.title || '').trim();
        buttons.push([{
            text: crop(title || (lang === 'uz' ? 'Kasb' : 'Профессия')),
            callback_data: `field:${field.id}`
        }]);
    }

    if (totalPages > 1) {
        const nav: InlineButton[] = [];
        if (safePage > 0) {
            nav.push({
                text: '⬅️',
                callback_data: `fieldpage:${safePage - 1}`
            });
        }
        nav.push({
            text: `${safePage + 1}/${totalPages}`,
            callback_data: 'noop:field_page'
        });
        if (safePage < totalPages - 1) {
            nav.push({
                text: '➡️',
                callback_data: `fieldpage:${safePage + 1}`
            });
        }
        buttons.push(nav);
    }

    if (backAction) {
        buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);
    }
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

    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:district' }]);

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

    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:experience' }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Gender Keyboard
// ============================================
export function genderKeyboard(lang: BotLang, includeAny: boolean = true): object {
    const rows: InlineButton[][] = [
        [
            { text: lang === 'uz' ? 'Erkak' : 'Мужской', callback_data: 'gender:male' },
            { text: lang === 'uz' ? 'Ayol' : 'Женский', callback_data: 'gender:female' }
        ]
    ];

    if (includeAny) {
        rows.push([{ text: lang === 'uz' ? 'Ahamiyatsiz' : 'Не важно', callback_data: 'gender:any' }]);
    }

    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:education' }]);

    return createInlineKeyboard(rows);
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

    buttons.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:gender' }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Skip Button Keyboard
// ============================================
export function skipKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? "⏭️ O'tkazib yuborish" : '⏭️ Пропустить' }],
        [{ text: lang === 'uz' ? '❌ Bekor qilish' : '❌ Отмена' }]
    ], { one_time: false, resize: true });
}

export function cancelReplyKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? '❌ Bekor qilish' : '❌ Отмена' }]
    ], { one_time: false, resize: true });
}

export function backReplyKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад' }]
    ], { one_time: false, resize: true });
}

export function backCancelReplyKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад' }],
        [{ text: lang === 'uz' ? '❌ Bekor qilish' : '❌ Отмена' }]
    ], { one_time: false, resize: true });
}

// ============================================
// Skills Keyboard
// ============================================
export function aboutSkipInlineKeyboard(lang: BotLang, backAction?: string): object {
    const rows: InlineButton[][] = [
        [{ text: lang === 'uz' ? "O'tkazib yuborish" : 'Пропустить', callback_data: 'skip' }]
    ];
    if (backAction) {
        rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);
    }
    return createInlineKeyboard(rows);
}

export function skillsInlineKeyboard(lang: BotLang, hasSkills: boolean, backAction?: string): object {
    const rows: InlineButton[][] = [];
    if (hasSkills) {
        rows.push([{ text: lang === 'uz' ? '➡️ Tayyor' : '➡️ Готово', callback_data: 'skills:done' }]);
    }
    if (!hasSkills) {
        rows.push([{ text: lang === 'uz' ? "O'tkazib yuborish" : 'Пропустить', callback_data: 'skip' }]);
    }
    if (backAction) {
        rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);
    }
    return createInlineKeyboard(rows);
}

// ============================================
// Main Menu Keyboard (Reply)
// ============================================
export function mainMenuKeyboard(lang: BotLang, role?: 'seeker' | 'employer'): object {
    return createReplyKeyboard([
        [
            { text: lang === 'uz' ? '🔎 Ish topish' : '🔎 Найти работу' },
            { text: lang === 'uz' ? '⭐ Saqlanganlar' : '⭐ Сохранённые' }
        ],
        [
            { text: lang === 'uz' ? '🧾 Rezyume' : '🧾 Резюме' },
            { text: lang === 'uz' ? '⚙️ Sozlamalar' : '⚙️ Настройки' }
        ],
        [
            { text: lang === 'uz' ? '🆘 Yordam' : '🆘 Помощь' }
        ]
    ]);
}

// ============================================
// Job Navigation Keyboard
// ============================================
export function jobNavigationKeyboard(
    lang: BotLang,
    current: number,
    total: number,
    jobId: string,
    source?: string,
    isFavorite: boolean = false,
    regionVacancyCount?: number
): object {
    const buttons: InlineButton[][] = [];

    const navRow: InlineButton[] = [];
    if (current > 0) {
        navRow.push({ text: lang === 'uz' ? '⬅️ Oldingi' : '⬅️ Назад', callback_data: 'job:prev' });
    }
    navRow.push({ text: `${current + 1}/${total}`, callback_data: 'noop' });
    if (current < total - 1) {
        navRow.push({ text: lang === 'uz' ? '➡️ Keyingi' : '➡️ Далее', callback_data: 'job:next' });
    }
    buttons.push(navRow);

    buttons.push([
        {
            text: isFavorite
                ? (lang === 'uz' ? "🗑️ Saqlangandan olib tashlash" : '🗑️ Удалить из сохранённых')
                : (lang === 'uz' ? "💾 Saqlab qo'yish" : '💾 Сохранить'),
            callback_data: `fav:${jobId}`
        }
    ]);

    // Add single button to search by region (shows region vacancies on click)
    if (typeof regionVacancyCount === 'number' && regionVacancyCount > 0) {
        buttons.push([{
            text: lang === 'uz'
                ? `📍 Viloyat bo'yicha qidirish (${regionVacancyCount})`
                : `📍 Поиск по области (${regionVacancyCount})`,
            callback_data: 'search:region'
        }]);
    }

    buttons.push([
        { text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню', callback_data: 'menu:main' }
    ]);

    return createInlineKeyboard(buttons);
}

export function workerNavigationKeyboard(
    lang: BotLang,
    current: number,
    total: number,
    options: {
        showRegionSearch?: boolean;
        regionCount?: number;
    } = {}
): object {
    const buttons: InlineButton[][] = [];

    const navRow: InlineButton[] = [];
    if (current > 0) {
        navRow.push({ text: lang === 'uz' ? '⬅️ Oldingi' : '⬅️ Назад', callback_data: 'worker:prev' });
    }
    navRow.push({ text: `${current + 1}/${total}`, callback_data: 'noop' });
    if (current < total - 1) {
        navRow.push({ text: lang === 'uz' ? '➡️ Keyingi' : '➡️ Далее', callback_data: 'worker:next' });
    }
    buttons.push(navRow);

    if (options.showRegionSearch) {
        const label = lang === 'uz'
            ? `📍 Viloyat bo'yicha qidirish${typeof options.regionCount === 'number' ? ` (${options.regionCount})` : ''}`
            : `📍 Поиск по области${typeof options.regionCount === 'number' ? ` (${options.regionCount})` : ''}`;
        buttons.push([{ text: label, callback_data: 'worker:region' }]);
    }

    buttons.push([
        { text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню', callback_data: 'menu:main' }
    ]);

    return createInlineKeyboard(buttons);
}


// ============================================
// Profile View/Edit Keyboard
// ============================================
export function profileKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? '✏️ Tahrirlash' : '✏️ Редактировать', callback_data: 'profile:edit' }
        ],
        [
            { text: lang === 'uz' ? "🧾 Rezyumeni ko'rish" : '🧾 Посмотреть резюме', callback_data: 'profile:resume' }
        ],
        [
            { text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню', callback_data: 'menu:main' }
        ]
    ]);
}

// ============================================
// Settings Keyboard
// ============================================
export function settingsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "🌐 Tilni o'zgartirish" : '🌐 Сменить язык', callback_data: 'settings:language' }],
        [{ text: lang === 'uz' ? '🔄 Rolni almashtirish' : '🔄 Сменить роль', callback_data: 'settings:switch_role' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'menu:main' }]
    ]);
}

export function employerVacanciesKeyboard(
    lang: BotLang,
    jobs: Array<{ id: string; title_uz?: string; title_ru?: string; title?: string | null }>
): object {
    const rows: InlineButton[][] = jobs.map(job => {
        const title = lang === 'uz'
            ? (job.title_uz || job.title_ru || job.title || 'Vakansiya')
            : (job.title_ru || job.title_uz || job.title || 'Вакансия');
        return [{ text: title, callback_data: `jobview:${job.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

export function employerJobViewKeyboard(lang: BotLang, jobId: string): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '👥 Ishchi topish' : '👥 Найти кандидатов', callback_data: `matchjob:${jobId}` }],
        [{ text: lang === 'uz' ? '✅ Xodim topildi' : '✅ Сотрудник найден', callback_data: `jobclose:confirm:${jobId}` }],
        [{ text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню', callback_data: 'menu:main' }]
    ]);
}

export function jobCloseReasonKeyboard(lang: BotLang, jobId: string): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '✅ Nomzod ishga olindi' : '✅ Кандидат принят', callback_data: `jobclose:reason_hired:${jobId}` }],
        [{ text: lang === 'uz' ? '⏸️ Vaqtincha to‘xtatish' : '⏸️ Временно приостановить', callback_data: `jobclose:reason_paused:${jobId}` }],
        [{ text: lang === 'uz' ? "❌ Bekor qilish" : '❌ Отмена', callback_data: `jobclose:no:${jobId}` }]
    ]);
}

export function confirmJobCloseKeyboard(lang: BotLang, jobId: string, reason: 'hired' | 'paused' = 'hired'): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? '✅ Ha, tasdiqlash' : '✅ Да, подтвердить', callback_data: `jobclose:yes:${jobId}:${reason}` },
            { text: lang === 'uz' ? "❌ Yo'q" : '❌ Нет', callback_data: `jobclose:no:${jobId}` }
        ]
    ]);
}

export function employerApplicationsKeyboard(
    lang: BotLang,
    applications: Array<{ id: string; applicant?: string | null; jobTitle?: string | null }>
): object {
    const rows: InlineButton[][] = applications.map(app => {
        const name = app.applicant || (lang === 'uz' ? 'Nomzod' : 'Кандидат');
        const jobTitle = app.jobTitle || (lang === 'uz' ? 'Vakansiya' : 'Вакансия');
        return [{ text: `${name} — ${jobTitle}`, callback_data: `appview:${app.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'apps:back' }]);
    return createInlineKeyboard(rows);
}

export function applicationViewKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'apps:back' }]
    ]);
}

// ============================================
// Subscription Keyboards
// ============================================
export function subscriptionFrequencyKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'Darhol' : 'Мгновенно', callback_data: 'subs:freq:instant' }],
        [{ text: lang === 'uz' ? 'Kunlik' : 'Ежедневно', callback_data: 'subs:freq:daily' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'settings:subscriptions' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function subscriptionGeoKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "Ha, joylashuv bo'yicha" : 'Да, по локации', callback_data: 'subs:geo:yes' }],
        [{ text: lang === 'uz' ? "Yo'q, qo'lda tanlayman" : 'Нет, выберу вручную', callback_data: 'subs:geo:no' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function employmentTypeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "To'liq" : 'Полный', callback_data: 'employment:full_time' },
            { text: lang === 'uz' ? 'Qisman' : 'Неполный', callback_data: 'employment:part_time' }
        ],
        [
            { text: lang === 'uz' ? 'Shartnoma' : 'Договор', callback_data: 'employment:contract' },
            { text: lang === 'uz' ? 'Amaliyot' : 'Стажировка', callback_data: 'employment:internship' }
        ],
        [{ text: lang === 'uz' ? 'Hammasi' : 'Все', callback_data: 'employment:all' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function workModeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? 'Ish joyida' : 'На месте', callback_data: 'workmode:onsite' },
            { text: lang === 'uz' ? 'Masofaviy' : 'Удаленно', callback_data: 'workmode:remote' }
        ],
        [
            { text: lang === 'uz' ? 'Gibrid' : 'Гибрид', callback_data: 'workmode:hybrid' },
            { text: lang === 'uz' ? 'Hammasi' : 'Все', callback_data: 'workmode:all' }
        ],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function workingDaysKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? '5 kunlik' : '5-дневка', callback_data: 'workingdays:2' },
            { text: lang === 'uz' ? '6 kunlik' : '6-дневка', callback_data: 'workingdays:1' }
        ],
        [{ text: lang === 'uz' ? 'Hammasi' : 'Все', callback_data: 'workingdays:all' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

// ============================================
// Job posting specific keyboards (no back/cancel inline)
// ============================================
export function jobEmploymentKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "To'liq stavka" : 'Полная ставка', callback_data: 'employment:full_time' }],
        [
            { text: lang === 'uz' ? 'Qisman' : 'Неполный', callback_data: 'employment:part_time' },
            { text: lang === 'uz' ? 'Shartnoma' : 'Договор', callback_data: 'employment:contract' }
        ],
        [{ text: lang === 'uz' ? 'Amaliyot' : 'Стажировка', callback_data: 'employment:internship' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_work_mode' }]
    ]);
}

export function jobWorkModeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'Ish joyida' : 'На месте', callback_data: 'workmode:onsite' }],
        [
            { text: lang === 'uz' ? 'Masofaviy' : 'Удаленно', callback_data: 'workmode:remote' },
            { text: lang === 'uz' ? 'Gibrid' : 'Гибрид', callback_data: 'workmode:hybrid' }
        ],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_address' }]
    ]);
}

export function jobWorkingDaysKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "To'liq hafta" : 'Полная неделя', callback_data: 'workingdays:full_week' }],
        [
            { text: lang === 'uz' ? '5 kunlik' : '5-дневка', callback_data: 'workingdays:2' },
            { text: lang === 'uz' ? '6 kunlik' : '6-дневка', callback_data: 'workingdays:1' }
        ],
        [
            { text: lang === 'uz' ? 'Smenali 2/2' : 'Сменный 2/2', callback_data: 'workingdays:shift_2_2' },
            { text: lang === 'uz' ? 'Smenali 3/3' : 'Сменный 3/3', callback_data: 'workingdays:shift_3_3' }
        ],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_employment' }]
    ]);
}

export function jobExperienceKeyboard(lang: BotLang): object {
    const rows: InlineButton[][] = JOB_EXPERIENCE_LEVELS.map(exp => [{
        text: lang === 'uz' ? exp.label_uz : exp.label_ru,
        callback_data: `jobexperience:${exp.value}`
    }]);
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_work_hours' }]);
    return createInlineKeyboard(rows);
}

export function jobSalaryKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🤝 Kelishiladi' : '🤝 Договорная', callback_data: 'jobsalary:deal' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_category' }]
    ]);
}

export function jobSalaryMaxKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '➡️ Davom etish' : '➡️ Продолжить', callback_data: 'jobsalarymax:skip' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_salary' }]
    ]);
}

export function jobEducationKeyboard(lang: BotLang): object {
    const rows: InlineButton[][] = EDUCATION_LEVELS.map(edu => [{
        text: lang === 'uz' ? edu.label_uz : edu.label_ru,
        callback_data: `jobeducation:${edu.value}`
    }]);
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_experience' }]);
    return createInlineKeyboard(rows);
}

export function jobGenderKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? 'Erkak' : 'Мужской', callback_data: 'jobgender:male' },
            { text: lang === 'uz' ? 'Ayol' : 'Женский', callback_data: 'jobgender:female' }
        ],
        [{ text: lang === 'uz' ? 'Ahamiyatsiz' : 'Не важно', callback_data: 'jobgender:any' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_education' }]
    ]);
}

export function jobAgeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'Ahamiyatsiz' : 'Не важно', callback_data: 'jobage:any' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_gender' }]
    ]);
}

export function salaryMaxKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: '2 000 000', callback_data: 'salarymax:2000000' },
            { text: '3 000 000', callback_data: 'salarymax:3000000' }
        ],
        [
            { text: '5 000 000', callback_data: 'salarymax:5000000' },
            { text: '10 000 000', callback_data: 'salarymax:10000000' }
        ],
        [
            { text: '15 000 000', callback_data: 'salarymax:15000000' },
            { text: '20 000 000', callback_data: 'salarymax:20000000' }
        ],
        [{ text: lang === 'uz' ? 'Maksimalsiz' : 'Без максимума', callback_data: 'salarymax:all' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:salary' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function specialCriteriaKeyboard(lang: BotLang, selected: string[] = [], backAction: string = 'salary'): object {
    const items = [
        { value: 'students', label_uz: 'Talabalar uchun', label_ru: 'Для студентов' },
        { value: 'graduates', label_uz: 'Bitiruvchilar uchun', label_ru: 'Для выпускников' },
        { value: 'disabled', label_uz: 'Nogironligi borlar uchun', label_ru: 'Для людей с инвалидностью' }
    ];

    const rows: InlineButton[][] = items.map(item => {
        const isSelected = selected.includes(item.value);
        const mark = isSelected ? '✅ ' : '▫️ ';
        const label = lang === 'uz' ? item.label_uz : item.label_ru;
        return [{ text: `${mark}${label}`, callback_data: `special:${item.value}` }];
    });

    rows.push([{ text: lang === 'uz' ? '➡️ Davom etish' : '➡️ Продолжить', callback_data: 'special:done' }]);
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);

    return createInlineKeyboard(rows);
}

export function subscriptionManageKeyboard(lang: BotLang, active: boolean): object {
    const rows: InlineButton[][] = [];
    if (active) {
        rows.push([{ text: lang === 'uz' ? 'Filtrlarni yangilash' : 'Обновить фильтры', callback_data: 'subs:setup' }]);
        rows.push([{ text: lang === 'uz' ? 'Chastota' : 'Частота', callback_data: 'subs:frequency' }]);
        rows.push([{ text: lang === 'uz' ? "O'chirish" : 'Отключить', callback_data: 'subs:disable' }]);
    } else {
        rows.push([{ text: lang === 'uz' ? 'Obunani yoqish' : 'Включить подписку', callback_data: 'subs:setup' }]);
    }
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

// ============================================
// AI Helper Keyboards
// ============================================
export function jobDescriptionKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:job_contact' }]
    ]);
}

export function jobCreateModeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "✍️ Qo'lda" : '✍️ Вручную', callback_data: 'jobmode:manual' }]
    ]);
}

export function resumeAboutKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "O'tkazib yuborish" : 'Пропустить', callback_data: 'skip' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:birth_date' }]
    ]);
}

// ============================================
// Search Mode Keyboard
// ============================================
export function searchModeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "🧾 Rezyume bo'yicha" : '🧾 По резюме', callback_data: 'searchmode:resume' }],
        [{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]
    ]);
}

// ============================================
// Resume Select Keyboard (for search)
// ============================================
export function resumeSelectKeyboard(
    lang: BotLang,
    resumes: Array<{ id: string; title?: string | null; created_at?: string | null }>
): object {
    const rows: InlineButton[][] = resumes.map(r => {
        const title = r.title || (lang === 'uz' ? 'Rezyume' : 'Резюме');
        return [{ text: title, callback_data: `resume_search:${r.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'menu:main' }]);
    rows.push([{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

// ============================================
// Resume Edit Keyboard
// ============================================
export function resumeEditKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? '📍 Joylashuv' : '📍 Регион', callback_data: 'resumeedit:region' },
            { text: lang === 'uz' ? '🏙️ Tuman/Shahar' : '🏙️ Район', callback_data: 'resumeedit:district' }
        ],
        [
            { text: lang === 'uz' ? '🧠 Tajriba' : '🧠 Опыт', callback_data: 'resumeedit:experience' },
            { text: lang === 'uz' ? '💼 Lavozim' : '💼 Должность', callback_data: 'resumeedit:title' }
        ],
        [
            { text: lang === 'uz' ? "🎓 Ma'lumot" : '🎓 Образование', callback_data: 'resumeedit:education' },
            { text: lang === 'uz' ? '👤 Jins' : '👤 Пол', callback_data: 'resumeedit:gender' }
        ],
        [
            { text: lang === 'uz' ? "🎂 Tug'ilgan sana" : '🎂 Дата рождения', callback_data: 'resumeedit:birth_date' },
            { text: lang === 'uz' ? '⭐️ Alohida toifalar' : '⭐️ Особые категории', callback_data: 'resumeedit:special' }
        ],
        [
            { text: lang === 'uz' ? '💰 Maosh' : '💰 Зарплата', callback_data: 'resumeedit:salary' },
            { text: lang === 'uz' ? '🆔 Ism' : '🆔 Имя', callback_data: 'resumeedit:name' }
        ],
        [
            { text: lang === 'uz' ? "📝 O'zi haqida" : '📝 О себе', callback_data: 'resumeedit:about' },
            { text: lang === 'uz' ? "🧩 Ko'nikmalar" : '🧩 Навыки', callback_data: 'resumeedit:skills' }
        ],
        [
            { text: lang === 'uz' ? "🏢 Ishlagan joy" : '🏢 Опыт работы', callback_data: 'resumeedit:workplace' },
            { text: lang === 'uz' ? "🎓 O‘qigan joy" : '🎓 Место учебы', callback_data: 'resumeedit:education_place' }
        ],
        [{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function aiJobPreviewKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "Qo'llash" : 'Применить', callback_data: 'ai:job:apply' },
            { text: lang === 'uz' ? 'Qayta' : 'Повторить', callback_data: 'ai:job:retry' }
        ],
        [{ text: lang === 'uz' ? "Qo'lda yozaman" : 'Введу вручную', callback_data: 'ai:job:cancel' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function aiResumePreviewKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "Qo'llash" : 'Применить', callback_data: 'ai:resume:apply' },
            { text: lang === 'uz' ? 'Qayta' : 'Повторить', callback_data: 'ai:resume:retry' }
        ],
        [{ text: lang === 'uz' ? "Qo'lda yozaman" : 'Введу вручную', callback_data: 'ai:resume:cancel' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

// ============================================
// Resume Complete Keyboard
// ============================================
export function resumeCompleteKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🔎 Ish qidirish' : '🔎 Найти работу', callback_data: 'action:search' }],
        [{ text: lang === 'uz' ? "📝 Ma'lumotlarni yangilash" : '📝 Обновить данные', callback_data: 'action:editresume' }],
        [{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]
    ]);
}

// ============================================
// Auto match suggestions (90%+)
// ============================================
export function autoMatchJobsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🔎 Ko‘rish' : '🔎 Посмотреть', callback_data: 'autojobs:open' }],
        [{ text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню', callback_data: 'menu:main' }]
    ]);
}

// ============================================
// DUAL ROLE & EMPLOYER KEYBOARDS
// ============================================

export function roleSelectionKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🧾 Ish qidiruvchi' : '🧾 Соискатель', callback_data: 'role:seeker' }],
        [{ text: lang === 'uz' ? '🏢 Ish beruvchi' : '🏢 Работодатель', callback_data: 'role:employer' }]
    ]);
}

export function workplaceContinueKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "➕ Yana qo'shish" : '➕ Добавить ещё', callback_data: 'workplace:add' },
            { text: lang === 'uz' ? '➡️ Davom etish' : '➡️ Продолжить', callback_data: 'workplace:done' }
        ]
    ]);
}

export function workEndYearKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🟢 Hozir ham ishlayman' : '🟢 Работаю сейчас', callback_data: 'workend:current' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:workstart' }]
    ]);
}

export function educationContinueKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "➕ Yana qo'shish" : '➕ Добавить ещё', callback_data: 'educont:add' },
            { text: lang === 'uz' ? '➡️ Davom etish' : '➡️ Продолжить', callback_data: 'educont:done' }
        ]
    ]);
}

export function educationEndYearKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "🟢 Hozir ham o'qiyapman" : '🟢 Учусь сейчас', callback_data: 'eduend:current' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'back:edu_start' }]
    ]);
}

export function employerMainMenuKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [
            { text: lang === 'uz' ? '📢 Vakansiya joylash' : '📢 Разместить вакансию' },
            { text: lang === 'uz' ? '👥 Ishchi topish' : '👥 Найти кандидатов' }
        ],
        [
            { text: lang === 'uz' ? '📋 Mening vakansiyalarim' : '📋 Мои вакансии' },
            { text: lang === 'uz' ? '📨 Arizalar' : '📨 Отклики' }
        ],
        [
            { text: lang === 'uz' ? '⚙️ Sozlamalar' : '⚙️ Настройки' },
            { text: lang === 'uz' ? '🆘 Yordam' : '🆘 Помощь' }
        ]
    ]);
}

export function employerJobsKeyboard(lang: BotLang, jobs: Array<{ id: string; title_uz?: string; title_ru?: string; title?: string | null }>): object {
    const rows: InlineButton[][] = jobs.map(job => {
        const title = lang === 'uz'
            ? (job.title_uz || job.title_ru || job.title || 'Vakansiya')
            : (job.title_ru || job.title_uz || job.title || 'Вакансия');
        return [{ text: title, callback_data: `matchjob:${job.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

export function jobConfirmKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "✏️ O'zgartirish" : '✏️ Изменить', callback_data: 'jobedit' }],
        [{ text: lang === 'uz' ? '✅ Vakansiyani joylash' : '✅ Опубликовать вакансию', callback_data: 'job:publish' }]
    ]);
}

export function jobPublishedKeyboard(lang: BotLang, jobId?: string): object {
    const rows: InlineButton[][] = [];
    if (jobId) {
        rows.push([{ text: lang === 'uz' ? '👥 Ishchi topish' : '👥 Найти кандидатов', callback_data: `matchjob:${jobId}` }]);
    }
    rows.push([{ text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

export function subscriptionRequiredKeyboard(lang: BotLang, channelUsername: string = 'ishdasiz'): object {
    const handle = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
    const channelLabel = `@${handle}`;
    return createInlineKeyboard([
        [{ text: channelLabel, url: `https://t.me/${handle}` }],
        [{ text: lang === 'uz' ? 'Tekshirish' : 'Проверить', callback_data: 'sub:check' }]
    ]);
}

export function multiCategoryKeyboard(
    lang: BotLang,
    selectedIds: string[] = [],
    categories: CategoryItem[] = CATEGORIES,
    counts: Record<string, number> = {},
    backAction?: string
): object {
    const categoryList = [...categories];
    const financeCategoryId = 'a0000006-0006-4000-8000-000000000006';
    if (!categoryList.some(cat => String(cat.id) === financeCategoryId)) {
        categoryList.push({
            id: financeCategoryId,
            name_uz: 'Moliya, iqtisod, boshqaruv',
            name_ru: 'Финансы, экономика, управление',
            icon: ''
        });
    }

    const rows: InlineButton[][] = categoryList.map(cat => {
        const isSelected = selectedIds.includes(cat.id);
        const mark = isSelected ? '✅ ' : '▫️ ';
        const name = lang === 'uz' ? cat.name_uz : cat.name_ru;
        const count = counts[String(cat.id)] ?? 0;
        return [{ text: `${mark}${name} (${count})`, callback_data: `mcat:${cat.id}` }];
    });

    if (categoryList.length > 0) {
        const allSelected = selectedIds.length === categoryList.length;
        const allLabel = lang === 'uz' ? 'Barchasi' : 'Все категории';
        const mark = allSelected ? '✅ ' : '▫️ ';
        rows.unshift([{ text: `${mark}${allLabel}`, callback_data: 'mcat:all' }]);
    }

    // Add done button if at least one selected
    if (selectedIds.length > 0) {
        rows.push([{ text: lang === 'uz' ? '➡️ Davom etish' : '➡️ Продолжить', callback_data: 'mcat:done' }]);
    }

    if (backAction) {
        rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: `back:${backAction}` }]);
    }

    return createInlineKeyboard(rows);
}

// ============================================
// Resume Match Keyboard (Employer recommendations)
// ============================================
export function resumeMatchKeyboard(
    lang: BotLang,
    resumes: Array<{ id: string; full_name?: string | null; title?: string | null; score?: number | null }>
): object {
    const rows: InlineButton[][] = resumes.map(resume => {
        const name = resume.full_name || (lang === 'uz' ? 'Nomzod' : 'Кандидат');
        const title = resume.title || (lang === 'uz' ? 'Mutaxassis' : 'Специалист');
        const score = typeof resume.score === 'number' ? ` (${resume.score}%)` : '';
        return [{ text: `${name} — ${title}${score}`, callback_data: `resume_view:${resume.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]);
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
export function locationRequestKeyboard(
    lang: BotLang,
    options: { showBack?: boolean; showCancel?: boolean } = {}
): object {
    const showBack = options.showBack ?? true;
    const showCancel = options.showCancel ?? true;
    const rows: ReplyButton[][] = [
        [{ text: lang === 'uz' ? '📍 Joylashuvni yuborish' : '📍 Отправить локацию', request_location: true }]
    ];
    if (showBack) {
        rows.push([{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад' }]);
    }
    if (showCancel) {
        rows.push([{ text: lang === 'uz' ? '❌ Bekor qilish' : '❌ Отмена' }]);
    }
    return createReplyKeyboard(rows, { one_time: true, resize: true });
}

export function resumeSearchOnlyKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🔎 Ish qidirish' : '🔎 Найти работу', callback_data: 'action:search' }]
    ]);
}

export function resumeListKeyboard(
    lang: BotLang,
    resumes: Array<{ id: string; title?: string | null; created_at?: string | null }>
): object {
    const rows: InlineButton[][] = resumes.map(r => {
        const title = r.title || (lang === 'uz' ? 'Rezyume' : 'Резюме');
        return [{ text: title, callback_data: `resume_view:${r.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? "Yangi rezyume qo'shish" : 'Добавить новое резюме', callback_data: 'resume_new' }]);
    rows.push([{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

export function resumeOptionsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🔎 Ish qidirish' : '🔎 Найти работу', callback_data: 'action:search' }],
        [{ text: lang === 'uz' ? "✏️ Ma'lumotlarni yangilash" : '✏️ Обновить данные', callback_data: 'resume:update' }],
        [{ text: lang === 'uz' ? "🗑️ O'chirish" : '🗑️ Удалить', callback_data: 'resume:delete_confirm' }],
        [{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]
    ]);
}

export function confirmResumeDeleteKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "🗑️ Ha, o'chirish" : '🗑️ Да, удалить', callback_data: 'resume:confirm_delete' },
            { text: lang === 'uz' ? "❌ Yo'q" : '❌ Нет', callback_data: 'resume:cancel_delete' }
        ]
    ]);
}

export function regionFallbackKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            {
                text: lang === 'uz' ? "🏙️ Viloyat bo‘yicha qidirish" : '🏙️ Искать по области',
                callback_data: 'searchmode:region'
            }
        ],
        [
            {
                text: lang === 'uz' ? "🧠 Yaqin vakansiyalarni ko'rsatish" : '🧠 Показать похожие вакансии',
                callback_data: 'searchmode:related'
            }
        ],
        [
            {
                text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню',
                callback_data: 'menu:main'
            }
        ]
    ]);
}

export function districtJobsFallbackKeyboard(
    lang: BotLang,
    districts: Array<{ id: string | number; name: string; count: number }>,
    options: { includeRelated?: boolean } = {}
): object {
    const rows: InlineButton[][] = [];
    for (const item of districts) {
        const text = `${item.name} (${item.count})`;
        rows.push([{ text, callback_data: `searchdist:${String(item.id)}` }]);
    }
    rows.push([
        {
            text: lang === 'uz' ? "🌐 Viloyat bo'yicha barchasi" : '🌐 Вся область',
            callback_data: 'searchdist:all'
        }
    ]);
    if (options.includeRelated) {
        rows.push([
            {
                text: lang === 'uz' ? "🧠 Sizga mos kelishi mumkin bo'lgan vakansiyalar" : '🧠 Возможные подходящие вакансии',
                callback_data: 'searchmode:related'
            }
        ]);
    }
    rows.push([
        {
            text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню',
            callback_data: 'menu:main'
        }
    ]);
    return createInlineKeyboard(rows);
}

export function regionJobsFallbackKeyboard(
    lang: BotLang,
    regions: Array<{ id: string | number; name: string; count: number }>,
    options: { includeRelated?: boolean } = {}
): object {
    const rows: InlineButton[][] = [];
    for (const item of regions) {
        const text = `${item.name} (${item.count})`;
        rows.push([{ text, callback_data: `searchregion:${String(item.id)}` }]);
    }
    if (options.includeRelated) {
        rows.push([
            {
                text: lang === 'uz' ? "🧠 Sizga mos kelishi mumkin bo'lgan vakansiyalar" : '🧠 Возможные подходящие вакансии',
                callback_data: 'searchmode:related'
            }
        ]);
    }
    rows.push([
        {
            text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню',
            callback_data: 'menu:main'
        }
    ]);
    return createInlineKeyboard(rows);
}



export function relatedJobsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            {
                text: lang === 'uz' ? "🧠 Yaqin vakansiyalarni ko'rsatish" : '🧠 Показать похожие вакансии',
                callback_data: 'searchmode:related'
            }
        ],
        [
            {
                text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню',
                callback_data: 'menu:main'
            }
        ]
    ]);
}

export function relatedResumesKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [
            {
                text: lang === 'uz' ? "🧠 Yaqin rezyumelarni ko'rsatish" : '🧠 Показать похожие резюме',
                callback_data: 'matchrelated:open'
            }
        ],
        [
            {
                text: lang === 'uz' ? '🏠 Menyu' : '🏠 Меню',
                callback_data: 'menu:main'
            }
        ]
    ]);
}

// ============================================
// Export Constants for use in bot
// ============================================
export { REGIONS, CATEGORIES, EXPERIENCE_LEVELS, EDUCATION_LEVELS, SALARY_RANGES };
