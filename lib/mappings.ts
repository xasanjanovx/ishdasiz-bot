export const OSONISH_MAPPINGS = {
    payment_type: {
        1: { uz: 'Kelishilgan holda', ru: 'По договоренности' },
        2: { uz: 'Ishbay', ru: 'Сдельная' },
        3: { uz: 'Stavka (oklad)', ru: 'Фиксированный оклад' },
        4: { uz: 'Shartnomaviy', ru: 'Договорная' },
    },
    work_mode: {
        1: { uz: 'Odatiy (ish joyida)', ru: 'В офисе' },
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
    // CORRECT MAPPINGS based on OsonIsh API
    benefits: {
        1: { uz: "Moddiy rag'batlantirish mavjud", ru: 'Материальное поощрение' },
        2: { uz: "Tibbiy sug'urta", ru: 'Медицинская страховка' },
        3: { uz: "Maxsus kiyim bilan ta'minlanadi", ru: 'Предоставляется униформа' },
        4: { uz: "Transport xizmati", ru: 'Корпоративный транспорт' },
        5: { uz: "Bepul ovqatlanish", ru: 'Бесплатное питание' },
        6: { uz: "Malaka oshirish", ru: 'Повышение квалификации' },
        7: { uz: "Bonus tizimi", ru: 'Бонусная система' },
        8: { uz: "Dam olish kunlari", ru: 'Дни отдыха' },
        9: { uz: "Tibbiy ko'rik mavjud", ru: 'Медосмотр' },
        10: { uz: "Sport zali", ru: 'Спортзал' },
        11: { uz: "Boshqa ijtimoiy paketlar mavjud", ru: 'Есть другие социальные пакеты' },
    },
    // OsonIsh min_education field
    // 0 or null = Ahamiyatga ega emas, 1 = O'rta, 2 = O'rta-maxsus, 3 = Oliy, etc.
    education: {
        0: { uz: "Ahamiyatga ega emas", ru: 'Не имеет значения' },
        1: { uz: "O'rta", ru: 'Среднее' },
        2: { uz: "O'rta-maxsus", ru: 'Среднее специальное' },
        3: { uz: 'Oliy', ru: 'Высшее' },
        4: { uz: 'Magistr', ru: 'Магистратура' },
        5: { uz: 'PhD / Fan nomzodi', ru: 'PhD / Кандидат наук' },
    },
    // OsonIsh work_experiance field 
    // 1 = Talab etilmaydi/No experience, 2 = 1-3, 3 = 3-6, 4 = 6+
    experience: {
        0: { uz: "Ahamiyatga ega emas", ru: 'Не имеет значения' },
        1: { uz: "Talab etilmaydi", ru: 'Без опыта' },
        2: { uz: "1-3 yil", ru: '1-3 года' },
        3: { uz: "3-6 yil", ru: '3-6 лет' },
        4: { uz: "6+ yil", ru: '6+ лет' },
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

    // PRIORITY 2: Check imported experience_years (numeric years - legacy from some imports)
    const expYears = job.experience_years;
    if (typeof expYears === 'number') {
        if (expYears === 0) return OSONISH_MAPPINGS.experience[1][effectiveLang]; // Map to "Talab etilmaydi"
        if (expYears <= 3) return OSONISH_MAPPINGS.experience[2][effectiveLang];
        if (expYears <= 6) return OSONISH_MAPPINGS.experience[3][effectiveLang];
        return OSONISH_MAPPINGS.experience[4][effectiveLang];
    }

    // PRIORITY 3: Check string experience for local jobs
    if (job.experience === 'no_experience') return OSONISH_MAPPINGS.experience[1][effectiveLang];
    if (job.experience === '1_3') return OSONISH_MAPPINGS.experience[2][effectiveLang];
    if (job.experience === '3_6') return OSONISH_MAPPINGS.experience[3][effectiveLang];
    if (job.experience === '6_plus') return OSONISH_MAPPINGS.experience[4][effectiveLang];

    // Default: No preference
    return OSONISH_MAPPINGS.experience[0][effectiveLang];
};

export const getEducationLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // PRIORITY 1: Check raw_source_json.min_education (OsonIsh API uses this key)
    // null/undefined/0 all mean "Ahamiyatga ega emas" (doesn't matter)
    const rawEdu = job.raw_source_json?.min_education;
    if (rawEdu === null || rawEdu === undefined || rawEdu === 0) {
        return OSONISH_MAPPINGS.education[0][effectiveLang]; // "Ahamiyatga ega emas"
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

    // String codes for local jobs
    if (job.education_level === 'any') return OSONISH_MAPPINGS.education[0][effectiveLang];
    if (job.education_level === 'secondary') return OSONISH_MAPPINGS.education[1][effectiveLang];
    if (job.education_level === 'vocational') return OSONISH_MAPPINGS.education[2][effectiveLang];
    if (job.education_level === 'higher') return OSONISH_MAPPINGS.education[3][effectiveLang];
    if (job.education_level === 'master') return OSONISH_MAPPINGS.education[4][effectiveLang];

    // Default: Doesn't matter
    return OSONISH_MAPPINGS.education[0][effectiveLang];
};

/**
 * Get Payment Type label for both imported (number) and manual (string) values
 */
export const getPaymentTypeLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // First try raw_source_json.payment_type (OsonIsh API - number)
    const rawPayment = job.raw_source_json?.payment_type;
    if (typeof rawPayment === 'number' && OSONISH_MAPPINGS.payment_type[rawPayment as keyof typeof OSONISH_MAPPINGS.payment_type]) {
        return OSONISH_MAPPINGS.payment_type[rawPayment as keyof typeof OSONISH_MAPPINGS.payment_type][effectiveLang];
    }

    // Manual job values (string or number from import)
    const pt = job.payment_type;

    // Handle if pt is a number (legacy imports)
    if (typeof pt === 'number' || (typeof pt === 'string' && !isNaN(Number(pt)) && !['monthly', 'hourly', 'piecework', 'contract', 'negotiable'].includes(pt))) {
        const numPt = Number(pt);
        if (OSONISH_MAPPINGS.payment_type[numPt as keyof typeof OSONISH_MAPPINGS.payment_type]) {
            return OSONISH_MAPPINGS.payment_type[numPt as keyof typeof OSONISH_MAPPINGS.payment_type][effectiveLang];
        }
    }

    if (pt === 'monthly') return lang === 'ru' ? 'Ежемесячная (оклад)' : 'Oylik (stavka)';
    if (pt === 'hourly') return lang === 'ru' ? 'Почасовая' : 'Soatlik';
    if (pt === 'piecework') return lang === 'ru' ? 'Сдельная' : 'Ishbay';
    if (pt === 'contract') return lang === 'ru' ? 'Договорная' : 'Shartnomaviy';
    if (pt === 'negotiable') return lang === 'ru' ? 'По договоренности' : 'Kelishiladi';

    return pt || null;
};

/**
 * Get Work Mode label for both imported (number) and manual (string) values
 */
export const getWorkModeLabel = (job: any, lang: Language) => {
    const effectiveLang = (lang === 'uz' || lang === 'uzCyrillic') ? 'uz' : 'ru';

    // First try raw_source_json.work_type (OsonIsh API - number)
    const rawWork = job.raw_source_json?.work_type;
    if (typeof rawWork === 'number' && OSONISH_MAPPINGS.work_mode[rawWork as keyof typeof OSONISH_MAPPINGS.work_mode]) {
        return OSONISH_MAPPINGS.work_mode[rawWork as keyof typeof OSONISH_MAPPINGS.work_mode][effectiveLang];
    }

    // Manual job values (string)
    const wm = job.work_mode;
    if (wm === 'onsite') return lang === 'ru' ? 'В офисе' : 'Ofisda (ish joyida)';
    if (wm === 'remote') return lang === 'ru' ? 'Удаленная работа' : 'Masofaviy';
    if (wm === 'hybrid') return lang === 'ru' ? 'Гибрид (офис + удалённо)' : 'Gibrid (ofis + masofaviy)';

    return wm || null;
};
