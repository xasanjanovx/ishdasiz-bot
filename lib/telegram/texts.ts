/**
 * Telegram Bot Texts
 */

import {
    formatBenefits,
    formatLanguages,
    getEducationLabel,
    getExperienceLabel,
    getGenderLabel,
    getWorkingDaysLabel,
    getWorkModeLabel
} from '../mappings';

export type BotLang = 'uz' | 'ru';

export const botTexts = {
    // Language
    selectLanguage: {
        uz: 'Tilni tanlang:',
        ru: 'Выберите язык:'
    },
    languageChanged: {
        uz: '✅ Til o‘zgartirildi.',
        ru: '✅ Язык изменён.'
    },

    // Start / help
    startWelcome: {
        uz: "Assalomu alaykum | <b>ISHDASIZ</b> botiga xush kelibsiz!\n\nBu yerda siz:\n| 🎯 Ish yoki xodimni ortiqcha vaqt sarflamasdan topishingiz\n| 🧾 Rezyume va vakansiyalarni bir joyda boshqarishingiz\n| ⚡ Tanlov jarayonini tez va qulay amalga oshirishingiz\n| 🤖 Sun’iy intellekt yordamidan foydalanishingiz mumkin\n\nFoydali buyruqlar:\n| ▶️ /start — ishni boshlash\n| 🔄 /role — rolni almashtirish (ish qidiruvchi / ish beruvchi)\n| 🚪 /logout — hisobdan chiqish\n| ❓ /help — foydalanish bo‘yicha yordam",
        ru: "Здравствуйте | Добро пожаловать в <b>ISHDASIZ</b>!\n\nЗдесь вы можете:\n| 🎯 Быстро найти работу или сотрудника\n| 🧾 Управлять резюме и вакансиями в одном месте\n| ⚡ Упростить процесс подбора\n| 🤖 Использовать помощь ИИ\n\nПолезные команды:\n| ▶️ /start — начать\n| 🔄 /role — сменить роль (соискатель / работодатель)\n| 🚪 /logout — выйти из аккаунта\n| ❓ /help — помощь по использованию"
    },
    helpText: {
        uz: "❓ <b>Yordam</b>\n\nBot imkoniyatlari:\n| 🔎 Vakansiyalarni qidirish (rezyume yoki joylashuv bo‘yicha)\n| ⭐ Saqlab qo‘yish va keyin ko‘rish\n| 🧾 Rezyume yaratish va tahrirlash\n| 📢 Vakansiya joylash va arizalarni boshqarish\n\nBuyruqlar:\n| ▶️ /start — boshlash\n| 🔄 /role — rolni almashtirish\n| 🚪 /logout — chiqish\n| ❓ /help — yordam\n\nAdmin: @ishdasiz_admin",
        ru: "❓ <b>Помощь</b>\n\nВозможности бота:\n| 🔎 Поиск вакансий (по резюме или по локации)\n| ⭐ Сохранение вакансий\n| 🧾 Создание и редактирование резюме\n| 📢 Размещение вакансий и управление откликами\n\nКоманды:\n| ▶️ /start — начать\n| 🔄 /role — сменить роль\n| 🚪 /logout — выйти\n| ❓ /help — помощь\n\nАдмин: @ishdasiz_admin"
    },
    logoutDone: {
        uz: '🚪 Siz akkauntdan chiqdingiz.',
        ru: '🚪 Вы вышли из аккаунта.'
    },

    // Auth
    askPhone: {
        uz: '📱 Telefon raqamingizni yuboring:',
        ru: '📱 Отправьте номер телефона:'
    },
    otpSent: {
        uz: '✉️ Tasdiqlash kodi SMS orqali yuborildi. Kodni kiriting:',
        ru: '✉️ Код подтверждения отправлен по SMS. Введите код:'
    },
    otpInvalid: {
        uz: '❌ Kod noto‘g‘ri. Qaytadan kiriting:',
        ru: '❌ Неверный код. Введите снова:'
    },
    otpExpired: {
        uz: '⏳ Kod muddati tugadi. Jarayonni qaytadan boshlang.',
        ru: '⏳ Срок действия кода истёк. Начните заново.'
    },
    authSuccess: {
        uz: '✅ Tizimga muvaffaqiyatli kirdingiz.\n\nEndi profilingizni to‘ldiramiz.',
        ru: '✅ Вход выполнен успешно.\n\nДавайте заполним профиль.'
    },
    accountFound: {
        uz: 'Sizda hisob mavjud. Kirish usulini tanlang:',
        ru: 'Аккаунт найден. Выберите способ входа:'
    },
    enterPassword: {
        uz: '🔐 Parolni kiriting:',
        ru: '🔐 Введите пароль:'
    },
    passwordInvalid: {
        uz: '❌ Parol noto‘g‘ri.',
        ru: '❌ Неверный пароль.'
    },
    loginSuccess: {
        uz: '✅ Xush kelibsiz!',
        ru: '✅ Добро пожаловать!'
    },

    // Resume flow
    askRegion: {
        uz: '📍 | Joylashuv (viloyat) tanlang:\n| Qaysi hududda ishlamoqchisiz?',
        ru: '📍 | Выберите регион:\n| В каком регионе хотите работать?'
    },
    askDistrict: {
        uz: '🏙️ | Tuman/Shaharni tanlang:',
        ru: '🏙️ | Выберите район/город:'
    },
    askCategory: {
        uz: '🧭 | Faoliyat sohangizni tanlang:\n| Bir nechta kategoriya tanlashingiz mumkin',
        ru: '🧭 | Выберите сферу деятельности:\n| Можно выбрать несколько категорий'
    },
    askExperience: {
        uz: '🧠 | Ish tajribangizni tanlang:',
        ru: '🧠 | Выберите опыт работы:'
    },
    askEducation: {
        uz: '🎓 | Ma’lumotingizni tanlang:',
        ru: '🎓 | Выберите образование:'
    },
    askGender: {
        uz: '🚻 | Jinsingizni tanlang:',
        ru: '🚻 | Выберите пол:'
    },
    askSalary: {
        uz: '💰 | Kutilayotgan maosh (so‘m):',
        ru: '💰 | Ожидаемая зарплата (сум):'
    },
    askSalaryMax: {
        uz: '💰 | Maksimal maosh (so‘m):',
        ru: '💰 | Максимальная зарплата (сум):'
    },
    askEmploymentType: {
        uz: '🕒 | Ish turi (bandlik):',
        ru: '🕒 | Тип занятости:'
    },
    askWorkMode: {
        uz: '🧭 | Ish usuli (rejimi):',
        ru: '🧭 | Режим работы:'
    },
    askWorkingDays: {
        uz: '📆 | Ish grafigi (kunlar):',
        ru: '📆 | График работы (дни):'
    },
    askSubscriptionFrequency: {
        uz: '🔔 | Xabarnoma chastotasi:',
        ru: '🔔 | Частота уведомлений:'
    },
    askTitle: {
        uz: '🧾 | Qaysi lavozimda ishlamoqchisiz?\n\n(Masalan: Bosh hisobchi, Marketing direktori, Operatsion menejer, Loyiha menejeri, IT Team Lead)',
        ru: '🧾 | На какой должности хотите работать?\n\n(Например: Главный бухгалтер, Директор по маркетингу, Операционный менеджер, Руководитель проектов, Team Lead)'
    },
    askName: {
        uz: '🪪 | To‘liq ismingizni kiriting (F.I.O):',
        ru: '🪪 | Введите полное имя (Ф.И.О):'
    },
    askAbout: {
        uz: '📝 | O‘zingiz haqingizda qo‘shimcha ma’lumot (qisqacha) — ixtiyoriy.\nEslatma: Qancha ko‘p ma’lumot yozsangiz, ish beruvchilar sizni shuncha tez topadi.',
        ru: '📝 | Дополнительная информация о себе (кратко) — необязательно.\nСовет: Чем больше информации, тем быстрее работодатель вас найдёт.'
    },
    askSkills: {
        uz: '🧠 | Asosiy ko‘nikmalaringizni kiriting:\n| Masalan: Excel, 1C, CRM, Sotuv, Photoshop, Teamwork\n| Har birini alohida xabar yoki vergul orqali yozishingiz mumkin.\n\n<i>Ko‘nikma yuborgach “Tayyor” tugmasi paydo bo‘ladi.</i>\n<i>Agar ko‘nikma bo‘lmasa, “O‘tkazib yuborish”ni bosing.</i>',
        ru: '🧠 | Введите основные навыки:\n| Например: Excel, 1C, CRM, Продажи, Photoshop, Teamwork\n| Можно отправлять по одному или через запятую.\n\n<i>Кнопка “Готово” появится после первого навыка.</i>\n<i>Если навыков нет — нажмите “Пропустить”.</i>'
    },
    skillAdded: {
        uz: '<b>Qo‘shildi:</b>',
        ru: '<b>Добавлено:</b>'
    },
    skillDeleted: {
        uz: '🗑️ O‘chirildi',
        ru: '🗑️ Удалено'
    },
    resumeSaved: {
        uz: "Ma'lumotlar saqlandi.",
        ru: 'Данные сохранены.'
    },
    locationRequest: {
        uz: '📍 | Iltimos, joylashuvni yuboring.\n| Agar kompyuterdan foydalansangiz, skrepka orqali “Joylashuv” yuborishingiz mumkin.',
        ru: '📍 | Пожалуйста, отправьте локацию.\n| Если вы за ПК, можно отправить через скрепку «Локация».'
    },
    locationAccepted: {
        uz: '✅ Joylashuv qabul qilindi.',
        ru: '✅ Локация принята.'
    },
    locationSkipped: {
        uz: '✅ Joylashuv o‘tkazib yuborildi.',
        ru: '✅ Локация пропущена.'
    },

    // Main menu
    mainMenu: {
        uz: '🏠 | Asosiy bo‘limlar\n| Kerakli bo‘limni tanlang.',
        ru: '🏠 | Основные разделы\n| Выберите нужный раздел.'
    },

    // Jobs
    searchingJobs: {
        uz: '🔎 Mos vakansiyalar qidirilmoqda...',
        ru: '🔎 Идёт поиск подходящих вакансий...'
    },
    noJobsFound: {
        uz: '❌ Afsuski, hozircha mos vakansiyalar yo‘q.',
        ru: '❌ Подходящих вакансий пока нет.'
    },
    noResumeWarning: {
        uz: '⚠️ Avval rezyume yarating.',
        ru: '⚠️ Сначала создайте резюме.'
    },
    jobsFound: {
        uz: (count: number) => `✅ ${count} ta vakansiya topildi`,
        ru: (count: number) => `✅ Найдено ${count} вакансий`
    },
    searchModePrompt: {
        uz: '🔎 | Qidirish usulini tanlang:',
        ru: '🔎 | Выберите способ поиска:'
    },
    savedEmpty: {
        uz: '⭐ Saqlanganlar bo‘limi hozircha bo‘sh.',
        ru: '⭐ Сохранённые пока пусты.'
    },
    favoriteAdded: {
        uz: "✅ Saqlab qo'yildi.",
        ru: '✅ Сохранено.'
    },
    favoriteRemoved: {
        uz: "🗑️ Saqlangandan olib tashlandi.",
        ru: '🗑️ Удалено из сохранённых.'
    },
    applicationSent: {
        uz: '✅ Ariza muvaffaqiyatli yuborildi.',
        ru: '✅ Заявка успешно отправлена.'
    },
    applicationExists: {
        uz: '№️⃣ Siz ushbu vakansiyaga avval ariza yuborgansiz.',
        ru: '№️⃣ Вы уже отправляли отклик на эту вакансию.'
    },

    // Profile / settings
    settings: {
        uz: '⚙️ Sozlamalar',
        ru: '⚙️ Настройки'
    },
    error: {
        uz: '❌ Tizimda xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.',
        ru: '❌ Произошла ошибка. Попробуйте позже.'
    },
    unknownCommand: {
        uz: 'Noto‘g‘ri buyruq. Menyu tugmalaridan foydalaning.',
        ru: 'Неверная команда. Используйте меню.'
    },
    matchScore: {
        uz: (score: number) => `Mos kelish: ${score}%`,
        ru: (score: number) => `Совпадение: ${score}%`
    },
    resumeMenu: {
        uz: '🧾 | Rezyume\n\nRezyumeni ko‘rish yoki tahrirlash:',
        ru: '🧾 | Резюме\n\nПросмотр или редактирование:'
    },

    // Roles / employer
    selectRole: {
        uz: '👥 Kim sifatida kirmoqchisiz?',
        ru: '👥 Войти как:'
    },
    roleSeeker: {
        uz: 'Ish qidiruvchi',
        ru: 'Соискатель'
    },
    roleEmployer: {
        uz: 'Ish beruvchi',
        ru: 'Работодатель'
    },
    employerWelcome: {
        uz: 'Ish beruvchi bo‘limiga xush kelibsiz!',
        ru: 'Добро пожаловать в раздел работодателя!'
    },
    employerMainMenu: {
        uz: 'Ish beruvchi menyusi:',
        ru: 'Меню работодателя:'
    },
    companyNamePrompt: {
        uz: '🏢 Kompaniya nomini kiriting:',
        ru: '🏢 Введите название компании:'
    },

    // Employer posting
    postJobTitle: {
        uz: '📝 Vakansiya nomi qanday?',
        ru: '📝 Название вакансии?'
    },
    postJobCategory: {
        uz: '🧭 Vakansiya sohasini tanlang:',
        ru: '🧭 Выберите сферу вакансии:'
    },
    postJobSalary: {
        uz: '💰 Maosh qancha taklif qilasiz?',
        ru: '💰 Какую зарплату предлагаете?'
    },
    postJobRegion: {
        uz: '📍 Ish joyi qayerda?',
        ru: '📍 Где находится работа?'
    },
    postJobDescription: {
        uz: '📌 Vakansiya haqida batafsil yozing:\nTalablar, vazifalar va sharoitlar.',
        ru: '📌 Опишите вакансию подробно:\nТребования, обязанности, условия.'
    },
    postJobConfirm: {
        uz: (title: string) => `Vakansiyani tekshiring va tasdiqlang:\n\n"${title}"`,
        ru: (title: string) => `Проверьте и подтвердите вакансию:\n\n"${title}"`
    },
    jobPublished: {
        uz: '🚀 Vakansiya chop etildi!',
        ru: '🚀 Вакансия опубликована!'
    },
    myVacancies: {
        uz: 'Sizning vakansiyalaringiz:',
        ru: 'Ваши вакансии:'
    },
    noVacancies: {
        uz: 'Sizda hali vakansiyalar yo‘q.',
        ru: 'У вас пока нет вакансий.'
    },

    // Subscriptions
    subscriptionRequired: {
        uz: 'Davom etish uchun @ishdasiz kanaliga obuna bo‘ling.',
        ru: 'Для продолжения подпишитесь на канал @ishdasiz.'
    },
    subscriptionSettings: {
        uz: '🔔 | Obuna sozlamalari',
        ru: '🔔 | Настройки подписки'
    },
    subscriptionSaved: {
        uz: '✅ Obuna saqlandi.',
        ru: '✅ Подписка сохранена.'
    },
    subscriptionDisabled: {
        uz: "✅ Obuna o'chirildi.",
        ru: '✅ Подписка отключена.'
    },
    checkSubscription: {
        uz: 'Tekshirish',
        ru: 'Проверить'
    },
    notSubscribed: {
        uz: 'Siz hali obuna bo‘lmagansiz.',
        ru: 'Вы ещё не подписаны.'
    },

    // Multi-select categories
    categorySelected: {
        uz: '✅ Tanlandi. Yana qo‘shish yoki davom etish mumkin.',
        ru: '✅ Выбрано. Можно добавить ещё или продолжить.'
    },
    categoriesDone: {
        uz: 'Davom etish',
        ru: 'Продолжить'
    }
};

export function t(key: keyof typeof botTexts, lang: BotLang): string {
    const text = botTexts[key];
    if (typeof text === 'object' && 'uz' in text && 'ru' in text) {
        return text[lang] as string;
    }
    return String(text);
}

export function formatJobCard(job: any, lang: BotLang, matchScore?: number): string {
    const na = lang === 'uz' ? "Ko'rsatilmagan" : 'Не указано';
    const title = lang === 'uz' ? (job.title_uz || job.title_ru) : (job.title_ru || job.title_uz);
    const salaryMin = job.salary_min && job.salary_min > 0 ? job.salary_min : null;
    const salaryMax = job.salary_max && job.salary_max > 0 ? job.salary_max : null;
    const salary = salaryMin && salaryMax
        ? `${(salaryMin / 1e6).toFixed(1)} - ${(salaryMax / 1e6).toFixed(1)} mln`
        : salaryMin
            ? `${(salaryMin / 1e6).toFixed(1)} mln+`
            : (lang === 'uz' ? 'Kelishiladi' : 'Договорная');
    const location = [job.region_name, job.district_name].filter(Boolean).join(', ') || na;
    let card = `💼 | ${title || na}\n🏢 | ${job.company_name || (lang === 'uz' ? 'Kompaniya' : 'Компания')}\n💰 | ${salary}\n📍 | ${location}`;
    if (matchScore !== undefined) card += `\n\n${botTexts.matchScore[lang](matchScore)}`;
    return card;
}

export function formatFullJobCard(job: any, lang: BotLang): string {
    const raw = job.raw_source_json || {};
    const na = lang === 'uz' ? "Ko'rsatilmagan" : 'Не указано';
    const title = lang === 'uz' ? (job.title_uz || job.title_ru) : (job.title_ru || job.title_uz);

    let description = lang === 'uz'
        ? (job.description_uz || job.description_ru)
        : (job.description_ru || job.description_uz);
    if (!description && raw?.info) description = raw.info;
    if (description) {
        description = String(description)
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\r/g, '')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    }

    const salaryMin = job.salary_min && job.salary_min > 0 ? job.salary_min : null;
    const salaryMax = job.salary_max && job.salary_max > 0 ? job.salary_max : null;
    const salary = salaryMin && salaryMax
        ? `${(salaryMin / 1e6).toFixed(1)} - ${(salaryMax / 1e6).toFixed(1)} mln`
        : salaryMin
            ? `${(salaryMin / 1e6).toFixed(1)} mln+`
            : (lang === 'uz' ? 'Kelishiladi' : 'Договорная');

    const location = [job.region_name, job.district_name].filter(Boolean).join(', ') || na;
    const address = job.address || raw?.address || raw?.work_address || null;
    const hrName = job.hr_name || raw?.hr?.name || raw?.hr?.fio || null;

    const empTypeLabels: Record<string, { uz: string; ru: string }> = {
        full_time: { uz: "To'liq ish kuni", ru: 'Полный день' },
        part_time: { uz: 'Yarim kun', ru: 'Неполный день' },
        contract: { uz: 'Shartnoma', ru: 'Договор' },
        internship: { uz: 'Amaliyot', ru: 'Стажировка' },
        remote: { uz: 'Masofaviy', ru: 'Удалённо' },
        onsite: { uz: 'Ish joyida', ru: 'На месте' },
        hybrid: { uz: 'Gibrid', ru: 'Гибрид' }
    };
    const empType = job.employment_type ? (empTypeLabels[job.employment_type]?.[lang] || job.employment_type) : null;

    const workMode = getWorkModeLabel(job, lang) || null;
    const workingDays = getWorkingDaysLabel(job, lang) || null;
    const experienceLabel = getExperienceLabel(job, lang) || null;
    const educationLabel = getEducationLabel({ education_level: job.education_level, raw_source_json: job.raw_source_json }, lang) || null;
    const genderLabel = getGenderLabel(job.gender ?? raw?.gender, lang) || null;

    const ageMin = job.age_min ?? raw?.age_min ?? raw?.age_from ?? null;
    const ageMax = job.age_max ?? raw?.age_max ?? raw?.age_to ?? null;
    let ageLabel: string | null = null;
    if (ageMin || ageMax) {
        if (ageMin && ageMax) ageLabel = `${ageMin}-${ageMax} ${lang === 'uz' ? 'yosh' : 'лет'}`;
        else if (ageMin) ageLabel = `${ageMin}+ ${lang === 'uz' ? 'yosh' : 'лет'}`;
        else if (ageMax) ageLabel = lang === 'uz' ? `${ageMax} yoshgacha` : `до ${ageMax} лет`;
    }

    let languagesLabel = formatLanguages(job.languages ?? raw?.languages ?? raw?.language_ids, lang);
    if (!languagesLabel && typeof job.languages === 'string') languagesLabel = job.languages.trim();

    let benefitsLabel = formatBenefits(raw?.benefit_ids || raw?.benefits || job.benefits, lang);
    if (!benefitsLabel) {
        const rawBenefits = raw?.ijtimoiy_paketlar || raw?.social_packages || raw?.benefits_text;
        if (Array.isArray(rawBenefits)) benefitsLabel = rawBenefits.join(', ');
        if (!benefitsLabel && typeof rawBenefits === 'string') benefitsLabel = rawBenefits;
    }

    const formatHours = (value?: string | null) => {
        if (!value) return null;
        const clean = String(value).trim();
        if (!clean) return null;
        return clean.replace(/(\d{2}:\d{2})(:\d{2})/g, '$1');
    };
    const workingHours = formatHours(job.working_hours || raw?.working_hours || null);

    const normalize = (value?: string | null) => {
        if (!value) return null;
        const trimmed = String(value).trim();
        if (!trimmed || trimmed === na) return null;
        return trimmed;
    };

    const lines: string[] = [];
    lines.push(`💼 | ${title || na}`);
    lines.push('— — — — — — — — — — — — — — — —');
    lines.push(`🏢 | ${lang === 'uz' ? 'Kompaniya' : 'Компания'}: ${job.company_name || (lang === 'uz' ? 'Kompaniya' : 'Компания')}`);
    lines.push(`📍 | ${lang === 'uz' ? 'Joylashuv' : 'Локация'}: ${location}`);
    if (address) lines.push(`📌 | ${lang === 'uz' ? 'Ish joy manzili' : 'Адрес'}: ${address}`);
    lines.push(`💰 | ${lang === 'uz' ? 'Maosh' : 'Зарплата'}: ${salary}`);

    const exp = normalize(experienceLabel || null);
    if (exp) lines.push(`🧠 | ${lang === 'uz' ? 'Tajriba' : 'Опыт'}: ${exp}`);

    const edu = normalize(educationLabel || null);
    if (edu) lines.push(`🎓 | ${lang === 'uz' ? "Ma'lumot" : 'Образование'}: ${edu}`);

    const gender = normalize(genderLabel || null);
    if (gender && !['Ahamiyatsiz', 'Любой'].includes(gender)) {
        lines.push(`🚻 | ${lang === 'uz' ? 'Jins' : 'Пол'}: ${gender}`);
    }

    if (ageLabel) lines.push(`🧓 | ${lang === 'uz' ? 'Yosh' : 'Возраст'}: ${ageLabel}`);

    const mode = normalize(workMode || null);
    if (mode) lines.push(`🧭 | ${lang === 'uz' ? 'Ish usuli' : 'Режим'}: ${mode}`);

    const days = normalize(workingDays || null);
    if (days) lines.push(`📆 | ${lang === 'uz' ? 'Ish kunlari' : 'График'}: ${days}`);

    const emp = normalize(empType || null);
    if (emp) lines.push(`🕒 | ${lang === 'uz' ? 'Bandlik' : 'Занятость'}: ${emp}`);

    if (workingHours) lines.push(`⏰ | ${lang === 'uz' ? 'Ish vaqti' : 'Время работы'}: ${workingHours}`);

    const langs = normalize(languagesLabel || null);
    if (langs) lines.push(`🌐 | ${lang === 'uz' ? 'Tillarni bilishi' : 'Языки'}: ${langs}`);

    const benefits = normalize(benefitsLabel || null);
    if (benefits) lines.push(`🎁 | ${lang === 'uz' ? 'Qulayliklar' : 'Условия'}: ${benefits}`);

    // Description parsing
    const parseSections = (text?: string | null) => {
        if (!text) return { tasks: [] as string[], reqs: [] as string[], perks: [] as string[] };
        const markers = [
            { key: 'tasks', regex: /(vazifalar|обязанности)/i },
            { key: 'reqs', regex: /(talablar|требования)/i },
            { key: 'perks', regex: /(imkoniyatlar|qulayliklar|условия)/i }
        ];
        const found = markers.map(m => {
            const match = text.match(m.regex);
            if (!match || match.index == null) return null;
            return { key: m.key, index: match.index, length: match[0].length };
        }).filter(Boolean) as Array<{ key: string; index: number; length: number }>;
        if (!found.length) return { tasks: [], reqs: [], perks: [] };
        const sorted = found.sort((a, b) => a.index - b.index);
        const extract = (start: number, end: number) => {
            const chunk = text.slice(start, end).replace(/^[:\s-]+/, '').trim();
            if (!chunk) return [];
            const normalized = chunk
                .replace(/\r/g, '')
                .replace(/[•·]/g, '\n- ')
                .replace(/\s*-\s*/g, ' - ')
                .replace(/\n{2,}/g, '\n');
            return normalized
                .split('\n')
                .map(line => line.replace(/^\s*-\s*/g, '').trim())
                .filter(Boolean);
        };
        const result = { tasks: [] as string[], reqs: [] as string[], perks: [] as string[] };
        for (let i = 0; i < sorted.length; i += 1) {
            const current = sorted[i];
            const next = sorted[i + 1];
            const start = current.index + current.length;
            const end = next ? next.index : text.length;
            const items = extract(start, end);
            if (current.key === 'tasks') result.tasks = items;
            if (current.key === 'reqs') result.reqs = items;
            if (current.key === 'perks') result.perks = items;
        }
        return result;
    };

    const sections = parseSections(description || '');
    const tasks = Array.from(new Set([...sections.tasks, ...sections.reqs].map(s => s.trim()).filter(Boolean)));
    const perks = Array.from(new Set(sections.perks.map(s => s.trim()).filter(Boolean)));

    if (tasks.length > 0) {
        lines.push('');
        lines.push(`📌 | ${lang === 'uz' ? 'Vazifalar va talablar' : 'Обязанности и требования'}`);
        lines.push(...tasks.map(item => `- ${item}`));
    } else if (description) {
        lines.push('');
        lines.push(`📌 | ${lang === 'uz' ? 'Tavsif' : 'Описание'}`);
        lines.push(description);
    }

    if (perks.length > 0) {
        lines.push('');
        lines.push(`🎁 | ${lang === 'uz' ? 'Qulayliklar' : 'Условия'}`);
        lines.push(...perks.map(item => `- ${item}`));
    }

    const hasContacts = job.contact_phone || job.contact_email || job.contact_telegram || hrName || job.phone || job.email;
    if (hasContacts) {
        lines.push('');
        lines.push(`☎️ | ${lang === 'uz' ? 'Aloqa' : 'Контакты'}`);
        if (hrName) lines.push(`👤 | ${lang === 'uz' ? 'Vakansiya HR menejeri' : 'HR менеджер'}: ${hrName}`);
        if (job.contact_phone || job.phone) lines.push(`📞 | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${job.contact_phone || job.phone}`);
        if (job.contact_email || job.email) lines.push(`📧 | Email: ${job.contact_email || job.email}`);
        if (job.contact_telegram) lines.push(`💬 | Telegram: ${job.contact_telegram}`);
    }

    return lines.join('\n');
}

export const EXPERIENCE_LABELS: Record<string, { uz: string; ru: string }> = {
    no_experience: { uz: 'Tajribasiz', ru: 'Без опыта' },
    '1_year': { uz: '1 yil', ru: '1 год' },
    '3_years': { uz: '1-3 yil', ru: '1-3 года' },
    '5_years': { uz: '3-5 yil', ru: '3-5 лет' },
    '10_years': { uz: '5+ yil', ru: '5+ лет' }
};
