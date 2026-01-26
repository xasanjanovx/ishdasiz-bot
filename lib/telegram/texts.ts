/**
 * Telegram Bot Texts - Complete Resume Flow
 * All prompts and messages for bot
 */

export type BotLang = 'uz' | 'ru';

// ============================================
// Bot Texts
// ============================================
export const botTexts = {
    // Language Selection
    selectLanguage: {
        uz: "🌐 Ilovada foydalanish uchun tilni tanlang:",
        ru: "🌐 Выберите язык для использования:"
    },
    languageChanged: {
        uz: "✅ Til o'zgartirildi",
        ru: "✅ Язык изменён"
    },

    // Welcome & Auth
    welcome: {
        uz: "ISHDASIZ platformasiga xush kelibsiz.\n\nBiz sizga mos ish topishda va karerangizni rivojlantirishda yordam beramiz.",
        ru: "Добро пожаловать в ISHDASIZ.\n\nМы поможем вам найти подходящую работу и развить карьеру."
    },
    askPhone: {
        uz: "📱 Tizimga kirish uchun telefon raqamingizni yuboring:",
        ru: "📱 Для входа отправьте ваш номер телефона:"
    },
    otpSent: {
        uz: "✉️ Tasdiqlash kodi SMS orqali yuborildi. Kodni kiriting:",
        ru: "✉️ Код подтверждения отправлен по SMS. Введите код:"
    },
    otpInvalid: {
        uz: "❌ Kod noto'g'ri. Qaytadan kiriting:",
        ru: "❌ Неверный код. Введите снова:"
    },
    otpExpired: {
        uz: "⏰ Kod muddati tugadi. Jarayonni qaytadan boshlang.",
        ru: "⏰ Срок действия кода истёк. Начните заново."
    },
    otpTooMany: {
        uz: "⚠️ Urinishlar soni oshib ketdi. 5 daqiqadan so'ng qayta urinib ko'ring.",
        ru: "⚠️ Слишком много попыток. Попробуйте через 5 минут."
    },
    authSuccess: {
        uz: "✅ Tizimga muvaffaqiyatli kirdingiz.\n\nEndi profilingizni to'ldiramiz.",
        ru: "✅ Вход выполнен успешно.\n\nТеперь заполним ваш профиль."
    },
    // Login Choices
    accountFound: {
        uz: "✅ Sizda hisob mavjud. Kirish usulini tanlang:",
        ru: "✅ Аккаунт найден. Выберите способ входа:"
    },
    loginPassword: {
        uz: "🔑 Parol orqali",
        ru: "🔑 По паролю"
    },
    loginSMS: {
        uz: "📩 SMS kod orqali",
        ru: "📩 По SMS коду"
    },
    enterPassword: {
        uz: "🔑 Parolni kiriting:",
        ru: "🔑 Введите пароль:"
    },
    passwordInvalid: {
        uz: "❌ Parol noto'g'ri.",
        ru: "❌ Неверный пароль."
    },
    loginSuccess: {
        uz: "✅ Xush kelibsiz!",
        ru: "✅ Добро пожаловать!"
    },

    // Resume Creation Flow
    askRegion: {
        uz: "📍 Yashash hududingizni tanlang:",
        ru: "📍 Выберите регион проживания:"
    },
    askDistrict: {
        uz: "🏙 Tuman/Shaharni tanlang:",
        ru: "🏙 Выберите район/город:"
    },
    askCategory: {
        uz: "💼 Faoliyat sohangizni tanlang:",
        ru: "💼 Выберите сферу деятельности:"
    },
    askExperience: {
        uz: "📊 Ish tajribangiz:",
        ru: "📊 Ваш опыт работы:"
    },
    askEducation: {
        uz: "🎓 Ma'lumotingiz:",
        ru: "🎓 Ваше образование:"
    },
    askGender: {
        uz: "👤 Jinsingiz:",
        ru: "👤 Ваш пол:"
    },
    askSalary: {
        uz: "💰 Kutilayotgan maosh (so'm):",
        ru: "💰 Ожидаемая зарплата (сум):"
    },
    askTitle: {
        uz: "📝 Qaysi lavozimda ishlamoqchisiz?\n\n(Masalan: Hisobchi, SMM menedjer, Haydovchi)",
        ru: "📝 На какой должности хотите работать?\n\n(Например: Бухгалтер, SMM менеджер, Водитель)"
    },
    askName: {
        uz: "👤 To'liq ismingizni kiriting (F.I.O):",
        ru: "👤 Введите ваше полное имя (Ф.И.О):"
    },
    askAbout: {
        uz: "📄 O'zingiz haqingizda qo'shimcha ma'lumot (Qisqacha):",
        ru: "📄 Дополнительная информация о себе (Кратко):"
    },
    askSkills: {
        uz: "🛠 Asosiy ko'nikmalaringizni kiriting (Har birini alohida yozing):\n\nTugatgach \"Tayyor\" tugmasini bosing.",
        ru: "🛠 Введите основные навыки (Каждый отдельно):\n\nПо завершении нажмите \"Готово\"."
    },
    skillAdded: {
        uz: "✅ Qo'shildi.",
        ru: "✅ Добавлено."
    },

    // Resume Complete
    resumeComplete: {
        uz: "🎉 Profilingiz muvaffaqiyatli yaratildi!",
        ru: "🎉 Ваш профиль успешно создан!"
    },
    resumeSaved: {
        uz: "✅ Ma'lumotlar saqlandi",
        ru: "✅ Данные сохранены"
    },

    // Main Menu
    mainMenu: {
        uz: "🏠 Asosiy menyu:",
        ru: "🏠 Главное меню:"
    },

    // Job Search
    searchingJobs: {
        uz: "🔍 Mos vakansiyalar qidirilmoqda...",
        ru: "🔍 Поиск подходящих вакансий..."
    },
    noJobsFound: {
        uz: "😔 Afsuski, hozircha mos vakansiyalar yo'q.",
        ru: "😔 К сожалению, подходящих вакансий пока нет."
    },
    jobsFound: {
        uz: (count: number) => `✅ ${count} ta vakansiya topildi`,
        ru: (count: number) => `✅ Найдено ${count} вакансий`
    },
    applicationSent: {
        uz: "✅ Ariza muvaffaqiyatli yuborildi. Ish beruvchi tez orada siz bilan bog'lanadi.",
        ru: "✅ Заявка успешно отправлена. Работодатель свяжется с вами в ближайшее время."
    },
    applicationExists: {
        uz: "ℹ️ Siz ushbu vakansiyaga avval ariza yuborgansiz.",
        ru: "ℹ️ Вы уже отправляли заявку на эту вакансию."
    },

    // Profile
    yourProfile: {
        uz: (data: { name: string; region: string; district: string; category: string; salary: string; experience: string }) =>
            `👤 PROFIL MA'LUMOTLARI\n\n` +
            `🔹 F.I.O: ${data.name}\n` +
            `🔹 Hudud: ${data.region}, ${data.district}\n` +
            `🔹 Soha: ${data.category}\n` +
            `🔹 Tajriba: ${data.experience}\n` +
            `🔹 Maosh: ${data.salary}`,
        ru: (data: { name: string; region: string; district: string; category: string; salary: string; experience: string }) =>
            `👤 ДАННЫЕ ПРОФИЛЯ\n\n` +
            `🔹 Ф.И.О: ${data.name}\n` +
            `🔹 Регион: ${data.region}, ${data.district}\n` +
            `🔹 Сфера: ${data.category}\n` +
            `🔹 Опыт: ${data.experience}\n` +
            `🔹 Зарплата: ${data.salary}`
    },

    // Settings
    settings: {
        uz: "⚙️ Sozlamalar",
        ru: "⚙️ Настройки"
    },

    // Errors
    error: {
        uz: "❌ Tizimda xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.",
        ru: "❌ Произошла системная ошибка. Пожалуйста, попробуйте позже."
    },
    unknownCommand: {
        uz: "❓ Noto'g'ri buyruq. Menyu tugmalaridan foydalaning.",
        ru: "❓ Неверная команда. Используйте кнопки меню."
    },

    // Match Score
    matchScore: {
        uz: (score: number) => `📊 Mos kelish: ${score}%`,
        ru: (score: number) => `📊 Совпадение: ${score}%`
    },

    // Resume Menu
    resumeMenu: {
        uz: "📄 Rezyume\n\nRezyumeni ko'rish yoki tahrirlash:",
        ru: "📄 Резюме\n\nПросмотр или редактирование резюме:"
    },

    // ============================================
    // DUAL ROLE & EMPLOYER TEXTS
    // ============================================

    // Role Selection
    selectRole: {
        uz: "👥 Kim sifatida kirmoqchisiz?",
        ru: "👥 Вы хотите войти как?"
    },
    roleSeeker: {
        uz: "👤 Ish qidiruvchi",
        ru: "👤 Соискатель"
    },
    roleEmployer: {
        uz: "💼 Ish beruvchi",
        ru: "💼 Работодатель"
    },

    // Employer Flow
    employerWelcome: {
        uz: "💼 Ish beruvchi bo'limiga xush kelibsiz!\n\nBu yerda vakansiyalarni joylashingiz va boshqarishingiz mumkin.",
        ru: "💼 Добро пожаловать в раздел работодателя!\n\nЗдесь вы можете размещать и управлять вакансиями."
    },
    employerMainMenu: {
        uz: "💼 Ish beruvchi menyusi:",
        ru: "💼 Меню работодателя:"
    },
    companyNamePrompt: {
        uz: "🏢 Kompaniya nomini kiriting:",
        ru: "🏢 Введите название компании:"
    },

    // Job Posting Wizard
    postJobTitle: {
        uz: "📝 Vakansiya nomi qanday?\n\nMasalan: Sotuvchi, Kassir, Ofitsiant",
        ru: "📝 Название вакансии?\n\nНапример: Продавец, Кассир, Официант"
    },
    postJobCategory: {
        uz: "📂 Vakansiya sohasini tanlang:",
        ru: "📂 Выберите сферу вакансии:"
    },
    postJobSalary: {
        uz: "💰 Maosh qancha taklif qilasiz?\n\nAniq summa yoki oraliqni yozing (Masalan: 3mln - 5mln)",
        ru: "💰 Какую зарплату вы предлагаете?\n\nНапишите точную сумму или диапазон (Например: 3млн - 5млн)"
    },
    postJobRegion: {
        uz: "📍 Ish joyi qayerda?\n\nViloyatni tanlang:",
        ru: "📍 Где находится работа?\n\nВыберите регион:"
    },
    postJobDescription: {
        uz: "📄 Vakansiya haqida batafsil yozing:\n\nTalablar, vazifalar va sharoitlar.",
        ru: "📄 Напишите подробно о вакансии:\n\nТребования, обязанности и условия."
    },
    postJobConfirm: {
        uz: (title: string) => `✅ Vakansiyani tekshiring va tasdiqlang:\n\n"${title}"\n\nChop etilsinmi?`,
        ru: (title: string) => `✅ Проверьте и подтвердите вакансию:\n\n"${title}"\n\nОпубликовать?`
    },
    jobPublished: {
        uz: "🚀 Vakansiya chop etildi!",
        ru: "🚀 Вакансия опубликована!"
    },
    myVacancies: {
        uz: "📋 Sizning vakansiyalaringiz:",
        ru: "📋 Ваши вакансии:"
    },
    noVacancies: {
        uz: "📭 Sizda hali vakansiyalar yo'q.",
        ru: "📭 У вас пока нет вакансий."
    },

    // Channel Subscription
    subscriptionRequired: {
        uz: "📢 Davom etish uchun @ishdasiz kanaliga obuna bo'ling!\n\nObuna bo'lgandan so'ng tugmani bosing.",
        ru: "📢 Для продолжения подпишитесь на канал @ishdasiz!\n\nПосле подписки нажмите кнопку."
    },
    checkSubscription: {
        uz: "✅ Tekshirish",
        ru: "✅ Проверить"
    },
    notSubscribed: {
        uz: "❌ Siz hali obuna bo'lmadingiz. Iltimos, @ishdasiz kanaliga obuna bo'ling.",
        ru: "❌ Вы ещё не подписаны. Пожалуйста, подпишитесь на канал @ishdasiz."
    },

    // Multi-select categories
    categorySelected: {
        uz: "✅ Tanlangan. Yana qo'shish yoki davom etish mumkin.",
        ru: "✅ Выбрано. Можете добавить ещё или продолжить."
    },
    categoriesDone: {
        uz: "✅ Davom etish",
        ru: "✅ Продолжить"
    }
};

// ============================================
// Helper function
// ============================================
export function t(key: keyof typeof botTexts, lang: BotLang): string {
    const text = botTexts[key];
    if (typeof text === 'object' && 'uz' in text && 'ru' in text) {
        return text[lang] as string;
    }
    return String(text);
}

// ============================================
// Job Card Formatter
// ============================================
export function formatJobCard(job: {
    title_uz?: string;
    title_ru?: string;
    company_name?: string;
    salary_min?: number;
    salary_max?: number;
    region_name?: string;
    district_name?: string;
    employment_type?: string;
}, lang: BotLang, matchScore?: number): string {
    const title = lang === 'uz' ? (job.title_uz || job.title_ru) : (job.title_ru || job.title_uz);

    let salary = '';
    if (job.salary_min && job.salary_max) {
        salary = `${(job.salary_min / 1000000).toFixed(1)} - ${(job.salary_max / 1000000).toFixed(1)} mln`;
    } else if (job.salary_min) {
        salary = `${(job.salary_min / 1000000).toFixed(1)} mln+`;
    } else {
        salary = lang === 'uz' ? 'Kelishiladi' : 'Договорная';
    }

    const location = [job.region_name, job.district_name].filter(Boolean).join(', ') || (lang === 'uz' ? "Ko'rsatilmagan" : "Не указано");

    const typeLabels: Record<string, { uz: string; ru: string }> = {
        'full_time': { uz: "To'liq ish kuni", ru: "Полный день" },
        'part_time': { uz: "Yarim kun", ru: "Неполный день" },
        'remote': { uz: "Masofaviy", ru: "Удалённо" }
    };
    const empType = job.employment_type ? (typeLabels[job.employment_type]?.[lang] || job.employment_type) : '';

    let card = `📌 ${title}\n`;
    card += `🏢 ${job.company_name || (lang === 'uz' ? "Kompaniya" : "Компания")}\n`;
    card += `💰 ${salary}\n`;
    card += `📍 ${location}`;
    if (empType) card += `\n🕐 ${empType}`;
    if (matchScore !== undefined) {
        card += `\n\n${botTexts.matchScore[lang](matchScore)}`;
    }

    return card;
}

// ============================================
// Full Job Card Formatter (with description & contacts)
// ============================================
export function formatFullJobCard(job: {
    title_uz?: string;
    title_ru?: string;
    company_name?: string;
    salary_min?: number;
    salary_max?: number;
    region_name?: string;
    district_name?: string;
    employment_type?: string;
    description_uz?: string;
    description_ru?: string;
    contact_phone?: string;
    contact_email?: string;
    contact_telegram?: string;
    source?: string;
    raw_source_json?: any;
}, lang: BotLang): string {
    const title = lang === 'uz' ? (job.title_uz || job.title_ru) : (job.title_ru || job.title_uz);

    // Description Logic
    let description = lang === 'uz'
        ? (job.description_uz || job.description_ru)
        : (job.description_ru || job.description_uz);

    if (!description && job.raw_source_json && job.raw_source_json.info) {
        description = job.raw_source_json.info;
    }

    // Clean description
    if (description) {
        description = description
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/\r/g, '')
            .replace(/\n\s*\n/g, '\n\n') // Normalize newlines
            .trim();
    }

    let salary = '';
    if (job.salary_min && job.salary_max) {
        salary = `${(job.salary_min / 1000000).toFixed(1)} - ${(job.salary_max / 1000000).toFixed(1)} mln`;
    } else if (job.salary_min) {
        salary = `${(job.salary_min / 1000000).toFixed(1)} mln+`;
    } else {
        salary = lang === 'uz' ? 'Kelishiladi' : 'Договорная';
    }

    const location = [job.region_name, job.district_name].filter(Boolean).join(', ') || (lang === 'uz' ? "Ko'rsatilmagan" : "Не указано");

    const typeLabels: Record<string, { uz: string; ru: string }> = {
        'full_time': { uz: "To'liq ish kuni", ru: "Полный день" },
        'part_time': { uz: "Yarim kun", ru: "Неполный день" },
        'remote': { uz: "Masofaviy", ru: "Удалённо" }
    };
    const empType = job.employment_type ? (typeLabels[job.employment_type]?.[lang] || job.employment_type) : '';

    // Build card
    let card = `📌 ${title}\n`;
    card += `🏢 ${job.company_name || (lang === 'uz' ? "Kompaniya" : "Компания")}\n`;
    card += `💰 ${salary}\n`;
    card += `📍 ${location}`;
    if (empType) card += ` • ${empType}`;
    card += `\n`;

    // Description
    if (description) {
        card += `\n📝 ${description}\n`;
    }

    // Contacts section
    const hasContacts = job.contact_phone || job.contact_email || job.contact_telegram;
    if (hasContacts) {
        card += `\n${lang === 'uz' ? '📞 Aloqa:' : '📞 Контакты:'}\n`;
        if (job.contact_phone) card += `📱 ${job.contact_phone}\n`;
        if (job.contact_email) card += `📧 ${job.contact_email}\n`;
        if (job.contact_telegram) card += `✈️ ${job.contact_telegram}\n`;
    }

    return card;
}

// ============================================
// Experience Labels
// ============================================
export const EXPERIENCE_LABELS: Record<string, { uz: string; ru: string }> = {
    'no_experience': { uz: "Tajribasiz", ru: "Без опыта" },
    '1_year': { uz: "1 yil", ru: "1 год" },
    '3_years': { uz: "1-3 yil", ru: "1-3 года" },
    '5_years': { uz: "3-5 yil", ru: "3-5 лет" },
    '10_years': { uz: "5+ yil", ru: "5+ лет" }
};
