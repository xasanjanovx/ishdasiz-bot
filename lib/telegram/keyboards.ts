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
    { id: 'a0000006-0006-4000-8000-000000000006', name_uz: 'Moliya', name_ru: 'Финансы', icon: '' },
    { id: 'a0000007-0007-4000-8000-000000000007', name_uz: 'Qurilish', name_ru: 'Строительство', icon: '' },
    { id: 'a0000008-0008-4000-8000-000000000008', name_uz: "Qishloq xo'jaligi", name_ru: 'Сельское хоз.', icon: '' },
    { id: 'a0000009-0009-4000-8000-000000000009', name_uz: 'Transport', name_ru: 'Транспорт', icon: '' },
    { id: 'a0000010-0010-4000-8000-000000000010', name_uz: 'Savdo', name_ru: 'Продажи', icon: '' },
    { id: 'a0000011-0011-4000-8000-000000000011', name_uz: 'Boshqa', name_ru: 'Другое', icon: '' }
];

const EXPERIENCE_LEVELS = [
    { value: 'no_experience', label_uz: 'Tajribasiz', label_ru: 'Без опыта' },
    { value: '1_year', label_uz: '1 yil', label_ru: '1 год' },
    { value: '3_years', label_uz: '1-3 yil', label_ru: '1-3 года' },
    { value: '5_years', label_uz: '3-5 yil', label_ru: '3-5 лет' },
    { value: '10_years', label_uz: '5+ yil', label_ru: '5+ лет' }
];

const EDUCATION_LEVELS = [
    { value: 'secondary', label_uz: "O'rta", label_ru: 'Среднее' },
    { value: 'vocational', label_uz: "O'rta maxsus", label_ru: 'Среднее спец.' },
    { value: 'incomplete_higher', label_uz: 'Oliy (tugallanmagan)', label_ru: 'Неоконченное высшее' },
    { value: 'higher', label_uz: 'Oliy', label_ru: 'Высшее' }
];

const SALARY_RANGES = [
    { value: '0', label_uz: 'Kelishiladi', label_ru: 'Договорная' },
    { value: '2000000', label_uz: '2 mln+', label_ru: '2 млн+' },
    { value: '3000000', label_uz: '3 mln+', label_ru: '3 млн+' },
    { value: '5000000', label_uz: '5 mln+', label_ru: '5 млн+' },
    { value: '7000000', label_uz: '7 mln+', label_ru: '7 млн+' },
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
        [{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: `back:${backAction}` }]
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
            { text: lang === 'uz' ? 'Parol orqali' : 'По паролю', callback_data: 'auth:password' },
            { text: lang === 'uz' ? 'SMS kod orqali' : 'По SMS коду', callback_data: 'auth:sms' }
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

    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);
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
        navRow.push({ text: lang === 'uz' ? 'Oldingi sahifa' : 'Предыдущая страница', callback_data: `distpage:${page - 1}` });
    }
    navRow.push({ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:region' });
    if (start + perPage < districts.length) {
        navRow.push({ text: lang === 'uz' ? 'Keyingi sahifa' : 'Следующая страница', callback_data: `distpage:${page + 1}` });
    }
    buttons.push(navRow);
    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Category Selection Keyboard (2 columns)
// ============================================
export function categoryKeyboard(lang: BotLang, categories: CategoryItem[] = CATEGORIES): object {
    const buttons: InlineButton[][] = [];

    for (let i = 0; i < categories.length; i += 2) {
        const row: InlineButton[] = [];
        row.push({
            text: lang === 'uz' ? categories[i].name_uz : categories[i].name_ru,
            callback_data: `category:${categories[i].id}`
        });
        if (categories[i + 1]) {
            row.push({
                text: lang === 'uz' ? categories[i + 1].name_uz : categories[i + 1].name_ru,
                callback_data: `category:${categories[i + 1].id}`
            });
        }
        buttons.push(row);
    }

    // Back button
    buttons.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:district' }]);
    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

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

    buttons.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:category' }]);
    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

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

    buttons.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:experience' }]);
    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

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

    rows.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:education' }]);
    rows.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

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

    buttons.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:gender' }]);
    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Skip Button Keyboard
// ============================================
export function skipKeyboard(lang: BotLang, backAction: string): object {
    return createInlineKeyboard([
        [
            { text: lang === 'uz' ? "O'tkazib yuborish" : 'Пропустить', callback_data: 'skip' }
        ],
        [{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: `back:${backAction}` }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

// ============================================
// Skills Keyboard
// ============================================
export function skillsKeyboard(lang: BotLang, skills: string[]): object {
    const buttons: InlineButton[][] = [];

    if (skills.length > 0) {
        buttons.push([
            { text: lang === 'uz' ? 'Tayyor' : 'Готово', callback_data: 'skills:done' }
        ]);
    }
    buttons.push([{ text: lang === 'uz' ? "O'tkazib yuborish" : 'Пропустить', callback_data: 'skip' }]);
    buttons.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:about' }]);
    buttons.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

    return createInlineKeyboard(buttons);
}

// ============================================
// Main Menu Keyboard (Reply)
// ============================================
export function mainMenuKeyboard(lang: BotLang): object {
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
export function jobNavigationKeyboard(lang: BotLang, current: number, total: number, jobId: string, source?: string, isFavorite: boolean = false): object {
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

    const showApply = !source || source === 'manual' || source === 'bot';
    if (showApply) {
        buttons.push([
            { text: lang === 'uz' ? 'Ariza berish' : 'Откликнуться', callback_data: `apply:${jobId}` }
        ]);
    }

    buttons.push([
        {
            text: isFavorite
                ? (lang === 'uz' ? "🗑️ Saqlangandan olib tashlash" : '🗑️ Удалить из сохранённых')
                : (lang === 'uz' ? "💾 Saqlab qo'yish" : '💾 Сохранить'),
            callback_data: `fav:${jobId}`
        }
    ]);

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
        [{ text: lang === 'uz' ? '🔔 Obuna sozlamalari' : '🔔 Настройки подписки', callback_data: 'settings:subscriptions' }],
        [{ text: lang === 'uz' ? '📍 Joylashuvni yangilash' : '📍 Обновить локацию', callback_data: 'settings:location' }],
        [{ text: lang === 'uz' ? "🌐 Tilni o'zgartirish" : '🌐 Сменить язык', callback_data: 'settings:language' }],
        [{ text: lang === 'uz' ? '🔄 Rolni almashtirish' : '🔄 Сменить роль', callback_data: 'settings:switch_role' }],
        [{ text: lang === 'uz' ? '⬅️ Orqaga' : '⬅️ Назад', callback_data: 'menu:main' }]
    ]);
}

// ============================================
// Subscription Keyboards
// ============================================
export function subscriptionFrequencyKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'Darhol' : 'Мгновенно', callback_data: 'subs:freq:instant' }],
        [{ text: lang === 'uz' ? 'Kunlik' : 'Ежедневно', callback_data: 'subs:freq:daily' }],
        [{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'settings:subscriptions' }],
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
        [{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:salary' }],
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

    rows.push([{ text: lang === 'uz' ? 'Davom etish' : 'Продолжить', callback_data: 'special:done' }]);
    rows.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: `back:${backAction}` }]);
    rows.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

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
    rows.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

// ============================================
// AI Helper Keyboards
// ============================================
export function jobDescriptionKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'AI yordamchi' : 'AI помощник', callback_data: 'ai:job' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function resumeAboutKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "O'tkazib yuborish" : 'Пропустить', callback_data: 'skip' }],
        [{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'back:birth_date' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

// ============================================
// Search Mode Keyboard
// ============================================
export function searchModeKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "🧾 Rezyume bo'yicha" : '🧾 По резюме', callback_data: 'searchmode:resume' }],
        [{ text: lang === 'uz' ? "📍 Joylashuv bo'yicha" : '📍 По локации', callback_data: 'searchmode:geo' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
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
    rows.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'menu:main' }]);
    rows.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);
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
            { text: lang === 'uz' ? '🧭 Soha' : '🧭 Категория', callback_data: 'resumeedit:category' },
            { text: lang === 'uz' ? '🧠 Tajriba' : '🧠 Опыт', callback_data: 'resumeedit:experience' }
        ],
        [
            { text: lang === 'uz' ? "🎓 Ma'lumot" : '🎓 Образование', callback_data: 'resumeedit:education' },
            { text: lang === 'uz' ? '👤 Jins' : '👤 Пол', callback_data: 'resumeedit:gender' }
        ],
        [
            { text: lang === 'uz' ? '💰 Maosh' : '💰 Зарплата', callback_data: 'resumeedit:salary' },
            { text: lang === 'uz' ? '💼 Lavozim' : '💼 Должность', callback_data: 'resumeedit:title' }
        ],
        [
            { text: lang === 'uz' ? '🆔 Ism' : '🆔 Имя', callback_data: 'resumeedit:name' },
            { text: lang === 'uz' ? "🎂 Tug'ilgan sana" : '🎂 Дата рождения', callback_data: 'resumeedit:birth_date' }
        ],
        [
            { text: lang === 'uz' ? "📝 O'zi haqida" : '📝 О себе', callback_data: 'resumeedit:about' },
            { text: lang === 'uz' ? '🧩 Ko‘nikmalar' : '🧩 Навыки', callback_data: 'resumeedit:skills' }
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
        [{ text: lang === 'uz' ? "🧾 Rezyumeni ko'rish" : '🧾 Посмотреть резюме', callback_data: 'action:viewresume' }],
        [{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

// ============================================
// DUAL ROLE & EMPLOYER KEYBOARDS
// ============================================

export function roleSelectionKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? '🧾 Ish qidiruvchi' : '🧾 Соискатель', callback_data: 'role:seeker' }],
        [{ text: lang === 'uz' ? '🏢 Ish beruvchi' : '🏢 Работодатель', callback_data: 'role:employer' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function employerMainMenuKeyboard(lang: BotLang): object {
    return createReplyKeyboard([
        [
            { text: lang === 'uz' ? '📢 Vakansiya joylash' : '📢 Разместить вакансию' },
            { text: lang === 'uz' ? '📋 Mening vakansiyalarim' : '📋 Мои вакансии' }
        ],
        [
            { text: lang === 'uz' ? '📨 Arizalar' : '📨 Отклики' },
            { text: lang === 'uz' ? '🧾 Rezyumelar' : '🧾 Резюме' }
        ],
        [
            { text: lang === 'uz' ? '📊 Statistika' : '📊 Статистика' },
            { text: lang === 'uz' ? '⚙️ Sozlamalar' : '⚙️ Настройки' }
        ]
    ]);
}

export function employerJobsKeyboard(lang: BotLang, jobs: Array<{ id: string; title_uz?: string; title_ru?: string }>): object {
    const rows: InlineButton[][] = jobs.map(job => {
        const title = lang === 'uz' ? (job.title_uz || job.title_ru || 'Vakansiya') : (job.title_ru || job.title_uz || 'Вакансия');
        return [{ text: title, callback_data: `matchjob:${job.id}` }];
    });
    rows.push([{ text: lang === 'uz' ? 'Orqaga' : 'Назад', callback_data: 'menu:main' }]);
    return createInlineKeyboard(rows);
}

export function jobConfirmKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? 'Chop etish' : 'Опубликовать', callback_data: 'job:publish' }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]
    ]);
}

export function subscriptionRequiredKeyboard(lang: BotLang, channelUsername: string = 'ishdasiz'): object {
    const handle = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
    const channelLabel = `@${handle}`;
    return createInlineKeyboard([
        [{ text: channelLabel, url: `https://t.me/${handle}` }],
        [{ text: lang === 'uz' ? 'Tekshirish' : 'Проверить', callback_data: 'sub:check' }]
    ]);
}

export function multiCategoryKeyboard(lang: BotLang, selectedIds: string[] = [], categories: CategoryItem[] = CATEGORIES): object {
    const rows: InlineButton[][] = categories.map(cat => {
        const isSelected = selectedIds.includes(cat.id);
        const mark = isSelected ? '✅ ' : '▫️ ';
        const name = lang === 'uz' ? cat.name_uz : cat.name_ru;
        return [{ text: `${mark}${name}`, callback_data: `mcat:${cat.id}` }];
    });

    if (categories.length > 0) {
        const allSelected = selectedIds.length === categories.length;
        const allLabel = lang === 'uz' ? 'Barchasi' : 'Все категории';
        const mark = allSelected ? '✅ ' : '▫️ ';
        rows.unshift([{ text: `${mark}${allLabel}`, callback_data: 'mcat:all' }]);
    }

    // Add done button if at least one selected
    if (selectedIds.length > 0) {
        rows.push([{ text: lang === 'uz' ? 'Davom etish' : 'Продолжить', callback_data: 'mcat:done' }]);
    }
    rows.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);

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
        [{ text: lang === 'uz' ? '📍 Joylashuvni yuborish' : '📍 Отправить локацию', request_location: true }],
        [{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена' }]
    ], { one_time: true, resize: true });
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
    rows.push([{ text: lang === 'uz' ? 'Bekor qilish' : 'Отмена', callback_data: 'cancel' }]);
    return createInlineKeyboard(rows);
}

export function resumeOptionsKeyboard(lang: BotLang): object {
    return createInlineKeyboard([
        [{ text: lang === 'uz' ? "✏️ Ma'lumotlarni yangilash" : '✏️ Обновить данные', callback_data: 'resume:update' }],
        [{ text: lang === 'uz' ? "🗑️ O'chirish" : '🗑️ Удалить', callback_data: 'resume:delete' }],
        [{ text: lang === 'uz' ? '🏠 Bosh menyu' : '🏠 Главное меню', callback_data: 'menu:main' }]
    ]);
}

// ============================================
// Export Constants for use in bot
// ============================================
export { REGIONS, CATEGORIES, EXPERIENCE_LEVELS, EDUCATION_LEVELS, SALARY_RANGES };
