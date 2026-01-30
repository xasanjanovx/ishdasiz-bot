export const OSONISH_MAPPINGS = {
    payment_type: {
        1: { uz: 'Kelishilgan holda', ru: 'По договоренности' },
        2: { uz: 'Ishbay', ru: 'Сдельная' },
        3: { uz: 'Stavka (oklad)', ru: 'Фиксированный оклад' },
        4: { uz: 'Shartnomaviy', ru: 'Договорная' },
    },
    work_mode: {
        1: { uz: 'Ish joyida', ru: 'В офисе' },
        2: { uz: 'Uydan ishlash', ru: 'Работа из дома' },
        3: { uz: 'Masofaviy', ru: 'Удаленная работа' },
        4: { uz: 'Gibrid (ish joyi + masofaviy)', ru: 'Гибрид (офис + удалённо)' },
    },
    test_period: {
        1: { uz: 'Sinov muddati yo\'q', ru: 'Без испытательного срока' },
        2: { uz: '1 oy', ru: '1 месяц' },
        3: { uz: '2 oy', ru: '2 месяца' },
        4: { uz: '3 oy', ru: '3 месяца' },
    },
    working_days: {
        1: { uz: '6 kunlik ish haftasi', ru: '6-дневная рабочая неделя' },
        2: { uz: '5 kunlik ish haftasi', ru: '5-дневная рабочая неделя' },
    },
    languages: {
        1: { uz: "O'zbek tili", ru: 'Узбекский' },
        2: { uz: 'Rus tili', ru: 'Русский' },
        3: { uz: 'Ingliz tili', ru: 'Английский' },
        4: { uz: 'Turk tili', ru: 'Турецкий' },
        5: { uz: 'Xitoy tili', ru: 'Китайский' },
        6: { uz: 'Koreys tili', ru: 'Корейский' },
        7: { uz: 'Nemis tili', ru: 'Немецкий' },
        8: { uz: 'Fransuz tili', ru: 'Французский' },
        9: { uz: 'Arab tili', ru: 'Арабский' },
        10: { uz: 'Ispancha', ru: 'Испанский' },
    },
    language_levels: {
        1: { uz: 'A1 (Boshlang\'ich)', ru: 'A1 (Начальный)' },
        2: { uz: 'A2 (Elementar)', ru: 'A2 (Элементарный)' },
        3: { uz: 'B1 (O\'rta)', ru: 'B1 (Средний)' },
        4: { uz: 'B2 (O\'rta-yuqori)', ru: 'B2 (Выше среднего)' },
        5: { uz: 'C1 (Yuqori)', ru: 'C1 (Продвинутый)' },
        6: { uz: 'C2 (Mukammal)', ru: 'C2 (Носитель)' },
    },
    // OsonIsh social_packages / benefit_ids  
    benefits: {
        1: { uz: "Ovqat bilan ta'minlanadi", ru: 'Обеспечивается питанием' },
        2: { uz: "Transport xizmati mavjud", ru: 'Есть транспорт' },
        3: { uz: "Maxsus kiyim bilan ta'minlanadi", ru: 'Выдается спецодежда' },
        4: { uz: "Yotoqxona yoki turar joy bilan ta'minlanadi", ru: 'Обеспечивается жильём/общежитием' },
        5: { uz: "Tibbiy ko'rik mavjud", ru: 'Есть медосмотр' },
        6: { uz: "Moddiy rag'batlantirish mavjud", ru: 'Материальное стимулирование' },
        7: { uz: "Boshqa ijtimoiy paketlar mavjud", ru: 'Есть другие соцпакеты' },
    },
    // OsonIsh min_education field
    education: {
        0: { uz: "Ahamiyatga ega emas", ru: 'Не имеет значения' },
        1: { uz: "O'rta", ru: 'Среднее' },
        2: { uz: "O'rta-maxsus", ru: 'Среднее специальное' },
        3: { uz: 'Oliy', ru: 'Высшее' },
        4: { uz: 'Magistr', ru: 'Магистратура' },
        5: { uz: 'PhD / Fan nomzodi', ru: 'PhD / Кандидат наук' },
    },
    // OsonIsh work_experiance field - MATCHES OSONISH.UZ EXACTLY
    // 1 = Talab etilmaydi, 2 = 1 yilgacha, 3 = 1-3 yil, 4 = 3-5 yil, 5 = 5+ yil
    experience: {
        0: { uz: "Ahamiyatga ega emas", ru: 'Не имеет значения' },
        1: { uz: "Talab etilmaydi", ru: 'Не требуется' },
        2: { uz: "1 yilgacha", ru: 'До 1 года' },
        3: { uz: "1-3 yil", ru: '1-3 года' },
        4: { uz: "3-5 yil", ru: '3-5 лет' },
        5: { uz: "5 yildan ortiq", ru: '5+ лет' },
    },
};

export type Language = 'uz' | 'ru' | 'uzCyrillic' | 'en';

export const getMappedValue = (type: keyof typeof OSONISH_MAPPINGS, id: number | undefined, lang: Language) => {
    if (id === undefined || id === null) return null;
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';
    // @ts-ignore
    return OSONISH_MAPPINGS[type]?.[id]?.[effectiveLang] || id;
};

export const getGenderLabel = (gender: number | string | null | undefined, lang: Language) => {
    // Number from imported
    if (typeof gender === 'number') {
        if (gender === 1) return lang === 'ru' ? 'Мужской' : 'Erkak';
        if (gender === 2) return lang === 'ru' ? 'Женский' : 'Ayol';
        return lang === 'ru' ? 'Любой' : 'Ahamiyatsiz';
    }
    // String for local
    if (gender === 'male') return lang === 'ru' ? 'Мужской' : 'Erkak';
    if (gender === 'female') return lang === 'ru' ? 'Женский' : 'Ayol';
    return lang === 'ru' ? 'Любой' : 'Ahamiyatsiz';
};

export const getExperienceLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // PRIORITY 1: Check raw_source_json.work_experiance (OsonIsh API raw field - ID based)
    const rawExp = job.raw_source_json?.work_experiance;
    if (typeof rawExp === 'number' && OSONISH_MAPPINGS.experience[rawExp as keyof typeof OSONISH_MAPPINGS.experience]) {
        return OSONISH_MAPPINGS.experience[rawExp as keyof typeof OSONISH_MAPPINGS.experience][effectiveLang];
    }

    // PRIORITY 2: Check experience field if it's a number (ID)
    if (typeof job.experience === 'number' && OSONISH_MAPPINGS.experience[job.experience as keyof typeof OSONISH_MAPPINGS.experience]) {
        return OSONISH_MAPPINGS.experience[job.experience as keyof typeof OSONISH_MAPPINGS.experience][effectiveLang];
    }

    // PRIORITY 3: Check experience field if it's a string ID like '1', '2', etc.
    if (typeof job.experience === 'string') {
        const expId = parseInt(job.experience, 10);
        if (!isNaN(expId) && OSONISH_MAPPINGS.experience[expId as keyof typeof OSONISH_MAPPINGS.experience]) {
            return OSONISH_MAPPINGS.experience[expId as keyof typeof OSONISH_MAPPINGS.experience][effectiveLang];
        }
    }

    // PRIORITY 4: Check imported experience_years (numeric years - legacy)
    const expYears = job.experience_years;
    if (typeof expYears === 'number') {
        if (expYears === 0) return OSONISH_MAPPINGS.experience[1][effectiveLang];
        if (expYears <= 1) return OSONISH_MAPPINGS.experience[2][effectiveLang];
        if (expYears <= 3) return OSONISH_MAPPINGS.experience[3][effectiveLang];
        if (expYears <= 5) return OSONISH_MAPPINGS.experience[4][effectiveLang];
        return OSONISH_MAPPINGS.experience[5][effectiveLang];
    }

    // Default: No preference
    return OSONISH_MAPPINGS.experience[0][effectiveLang];
};

export const getEducationLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // PRIORITY 1: Check raw_source_json.min_education (OsonIsh API uses this key)
    const rawEdu = job.raw_source_json?.min_education;
    if (rawEdu === null || rawEdu === undefined || rawEdu === 0) {
        return OSONISH_MAPPINGS.education[0][effectiveLang];
    }
    if (typeof rawEdu === 'number' && OSONISH_MAPPINGS.education[rawEdu as keyof typeof OSONISH_MAPPINGS.education]) {
        return OSONISH_MAPPINGS.education[rawEdu as keyof typeof OSONISH_MAPPINGS.education][effectiveLang];
    }

    // PRIORITY 2: Check imported education_level (number)
    const eduLevel = job.education_level;
    if (eduLevel === null || eduLevel === undefined || eduLevel === 0) {
        return OSONISH_MAPPINGS.education[0][effectiveLang];
    }
    if (typeof eduLevel === 'number' && OSONISH_MAPPINGS.education[eduLevel as keyof typeof OSONISH_MAPPINGS.education]) {
        return OSONISH_MAPPINGS.education[eduLevel as keyof typeof OSONISH_MAPPINGS.education][effectiveLang];
    }

    // PRIORITY 3: String education_level (e.g., 'higher')
    if (typeof eduLevel === 'string') {
        if (eduLevel === 'secondary') return OSONISH_MAPPINGS.education[1][effectiveLang];
        if (eduLevel === 'vocational') return OSONISH_MAPPINGS.education[2][effectiveLang];
        if (eduLevel === 'higher') return OSONISH_MAPPINGS.education[3][effectiveLang];
        if (eduLevel === 'master') return OSONISH_MAPPINGS.education[4][effectiveLang];
    }

    return OSONISH_MAPPINGS.education[0][effectiveLang];
};

// Format benefits array to display string
export const formatBenefits = (benefitIds: number[] | undefined, lang: Language): string | null => {
    if (!benefitIds || benefitIds.length === 0) return null;
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    const labels = benefitIds
        .map(id => OSONISH_MAPPINGS.benefits[id as keyof typeof OSONISH_MAPPINGS.benefits]?.[effectiveLang])
        .filter(Boolean);

    return labels.length > 0 ? labels.join(', ') : null;
};

// Format languages array to display string  
export const formatLanguages = (languages: Array<{ language: number, level?: number }> | undefined, lang: Language): string | null => {
    if (!languages || languages.length === 0) return null;
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    const labels = languages
        .map(l => {
            const langName = OSONISH_MAPPINGS.languages[l.language as keyof typeof OSONISH_MAPPINGS.languages]?.[effectiveLang];
            if (!langName) return null;
            if (l.level) {
                const levelName = OSONISH_MAPPINGS.language_levels[l.level as keyof typeof OSONISH_MAPPINGS.language_levels]?.[effectiveLang];
                return levelName ? `${langName} (${levelName})` : langName;
            }
            return langName;
        })
        .filter(Boolean);

    return labels.length > 0 ? labels.join(', ') : null;
};

export const getPaymentTypeLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // Check payment_type (integer ID)
    const typeId = job.payment_type;

    // Also check raw source json for payment_type if top level missing
    const rawId = typeId || job.raw_source_json?.payment_type;

    if (typeof rawId === 'number' && OSONISH_MAPPINGS.payment_type[rawId as keyof typeof OSONISH_MAPPINGS.payment_type]) {
        return OSONISH_MAPPINGS.payment_type[rawId as keyof typeof OSONISH_MAPPINGS.payment_type][effectiveLang];
    }

    return null;
};

export const getWorkModeLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // Work mode can be string ('remote', 'hybrid', 'onsite') or number ID from raw OsonIsh
    const mode = job.work_mode; // string: 'remote', 'hybrid', etc.
    const rawMode = job.raw_source_json?.work_type; // number ID: 1, 3, 4

    // Map string values (from manual creation or converted)
    if (mode === 'remote') return lang === 'ru' ? 'Удаленная работа' : 'Masofaviy ish';
    if (mode === 'hybrid') return lang === 'ru' ? 'Гибрид' : 'Gibrid';
    if (mode === 'onsite') return lang === 'ru' ? 'В офисе' : 'Ish joyida';

    // Map raw OsonIsh IDs
    if (typeof rawMode === 'number' && OSONISH_MAPPINGS.work_mode[rawMode as keyof typeof OSONISH_MAPPINGS.work_mode]) {
        return OSONISH_MAPPINGS.work_mode[rawMode as keyof typeof OSONISH_MAPPINGS.work_mode][effectiveLang];
    }

    return null;
};

export const getWorkingDaysLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // working_days can be string '1', '2' or raw ID
    // working_days_id is usually the integer column
    const daysId = job.working_days_id || (job.working_days ? parseInt(job.working_days) : null);
    const rawId = daysId || job.raw_source_json?.working_days_id;

    if (typeof rawId === 'number' && OSONISH_MAPPINGS.working_days[rawId as keyof typeof OSONISH_MAPPINGS.working_days]) {
        return OSONISH_MAPPINGS.working_days[rawId as keyof typeof OSONISH_MAPPINGS.working_days][effectiveLang];
    }

    return null;
};
