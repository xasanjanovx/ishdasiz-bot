export const OSONISH_MAPPINGS = {
    payment_type: {
        1: { uz: 'Kelishilgan holda', ru: 'По договоренности' },
        2: { uz: 'Ishbay', ru: 'Сдельная' },
        3: { uz: 'Stavka (oklad)', ru: 'Фиксированный оклад' },
        4: { uz: 'Shartnomaviy', ru: 'Договорная' },
    },
    work_mode: {
        1: { uz: 'Ish joyida', ru: 'На месте' },
        2: { uz: 'Uydan ishlash', ru: 'Работа из дома' },
        3: { uz: 'Masofaviy', ru: 'Удалённая работа' },
        4: { uz: 'Gibrid (ish joyi + masofaviy)', ru: 'Гибрид (офис + удалённо)' },
    },
    test_period: {
        1: { uz: "Sinov muddati yo'q", ru: 'Без испытательного срока' },
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
        1: { uz: "A1 (Boshlang'ich)", ru: 'A1 (Начальный)' },
        2: { uz: 'A2 (Elementar)', ru: 'A2 (Элементарный)' },
        3: { uz: "B1 (O'rta)", ru: 'B1 (Средний)' },
        4: { uz: "B2 (O'rta-yuqori)", ru: 'B2 (Выше среднего)' },
        5: { uz: 'C1 (Yuqori)', ru: 'C1 (Продвинутый)' },
        6: { uz: 'C2 (Mukammal)', ru: 'C2 (Носитель)' },
    },
    // OsonIsh social_packages / benefit_ids
    benefits: {
        1: { uz: "Ovqat bilan ta'minlanadi", ru: 'Обеспечивается питанием' },
        2: { uz: 'Transport xizmati mavjud', ru: 'Есть транспорт' },
        3: { uz: "Maxsus kiyim bilan ta'minlanadi", ru: 'Выдается спецодежда' },
        4: { uz: "Yotoqxona yoki turar joy bilan ta'minlanadi", ru: 'Обеспечивается жильем/общежитием' },
        5: { uz: "Tibbiy ko'rik mavjud", ru: 'Есть медосмотр' },
        6: { uz: "Moddiy rag'batlantirish mavjud", ru: 'Материальное стимулирование' },
        7: { uz: 'Boshqa ijtimoiy paketlar mavjud', ru: 'Есть другие соцпакеты' },
    },
    // OsonIsh min_education field
    education: {
        0: { uz: 'Ahamiyatga ega emas', ru: 'Не имеет значения' },
        1: { uz: "O'rta", ru: 'Среднее' },
        2: { uz: "O'rta-maxsus", ru: 'Среднее специальное' },
        3: { uz: 'Oliy', ru: 'Высшее' },
        4: { uz: 'Magistr', ru: 'Магистратура' },
        5: { uz: 'PhD / Fan nomzodi', ru: 'PhD / Кандидат наук' },
    },
    // OsonIsh work_experiance field
    experience: {
        0: { uz: 'Ahamiyatga ega emas', ru: 'Не имеет значения' },
        1: { uz: 'Talab etilmaydi', ru: 'Не требуется' },
        2: { uz: '1 yilgacha', ru: 'До 1 года' },
        3: { uz: '1-3 yil', ru: '1-3 года' },
        4: { uz: '3-5 yil', ru: '3-5 лет' },
        5: { uz: "5 yildan ortiq", ru: '5+ лет' },
    },
};

export type Language = 'uz' | 'ru' | 'en';

export const getMappedValue = (type: keyof typeof OSONISH_MAPPINGS, id: number | undefined, lang: Language) => {
    if (id === undefined || id === null) return null;
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';
    // @ts-ignore
    return OSONISH_MAPPINGS[type]?.[id]?.[effectiveLang] || id;
};

export const getGenderLabel = (gender: number | string | null | undefined, lang: Language) => {
    if (typeof gender === 'number') {
        if (gender === 1) return lang === 'ru' ? 'Мужской' : 'Erkak';
        if (gender === 2) return lang === 'ru' ? 'Женский' : 'Ayol';
        return lang === 'ru' ? 'Любой' : 'Ahamiyatsiz';
    }
    if (gender === 'male') return lang === 'ru' ? 'Мужской' : 'Erkak';
    if (gender === 'female') return lang === 'ru' ? 'Женский' : 'Ayol';
    if (gender === 'any') return lang === 'ru' ? 'Любой' : 'Ahamiyatsiz';
    return lang === 'ru' ? 'Любой' : 'Ahamiyatsiz';
};

export const getExperienceLabel = (job: any, lang: Language) => {
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';

    const rawExp = job.raw_source_json?.work_experiance;
    if (typeof rawExp === 'number' && OSONISH_MAPPINGS.experience[rawExp as keyof typeof OSONISH_MAPPINGS.experience]) {
        return OSONISH_MAPPINGS.experience[rawExp as keyof typeof OSONISH_MAPPINGS.experience][effectiveLang];
    }

    if (typeof job.experience === 'number' && OSONISH_MAPPINGS.experience[job.experience as keyof typeof OSONISH_MAPPINGS.experience]) {
        return OSONISH_MAPPINGS.experience[job.experience as keyof typeof OSONISH_MAPPINGS.experience][effectiveLang];
    }

    if (typeof job.experience === 'string') {
        const raw = job.experience.trim().toLowerCase();
        if (['no_experience', 'tajribasiz', 'без опыта', 'talab etilmaydi'].includes(raw)) {
            return OSONISH_MAPPINGS.experience[1][effectiveLang];
        }
        if (['1_year', '1 yil', '1 год', '1 yilgacha', 'до 1 года'].includes(raw)) {
            return OSONISH_MAPPINGS.experience[2][effectiveLang];
        }
        if (['3_years', '1_3_years', '1-3 yil', '1-3 года'].includes(raw)) {
            return OSONISH_MAPPINGS.experience[3][effectiveLang];
        }
        if (['5_years', '3_5_years', '3-5 yil', '3-5 лет'].includes(raw)) {
            return OSONISH_MAPPINGS.experience[4][effectiveLang];
        }
        if (['10_years', '5_plus', '5+ yil', '5+ лет', '5 yildan ortiq'].includes(raw)) {
            return OSONISH_MAPPINGS.experience[5][effectiveLang];
        }
        const expId = parseInt(job.experience, 10);
        if (!isNaN(expId) && OSONISH_MAPPINGS.experience[expId as keyof typeof OSONISH_MAPPINGS.experience]) {
            return OSONISH_MAPPINGS.experience[expId as keyof typeof OSONISH_MAPPINGS.experience][effectiveLang];
        }
    }

    const expYears = job.experience_years;
    if (typeof expYears === 'number') {
        if (expYears === 0) return OSONISH_MAPPINGS.experience[1][effectiveLang];
        if (expYears <= 1) return OSONISH_MAPPINGS.experience[2][effectiveLang];
        if (expYears <= 3) return OSONISH_MAPPINGS.experience[3][effectiveLang];
        if (expYears <= 5) return OSONISH_MAPPINGS.experience[4][effectiveLang];
        return OSONISH_MAPPINGS.experience[5][effectiveLang];
    }

    return OSONISH_MAPPINGS.experience[0][effectiveLang];
};

export const getEducationLabel = (job: any, lang: Language) => {
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';

    const rawEdu = job.raw_source_json?.min_education;
    if (rawEdu === null || rawEdu === undefined || rawEdu === 0) {
        return OSONISH_MAPPINGS.education[0][effectiveLang];
    }
    if (typeof rawEdu === 'number' && OSONISH_MAPPINGS.education[rawEdu as keyof typeof OSONISH_MAPPINGS.education]) {
        return OSONISH_MAPPINGS.education[rawEdu as keyof typeof OSONISH_MAPPINGS.education][effectiveLang];
    }

    const eduLevel = job.education_level;
    if (eduLevel === null || eduLevel === undefined || eduLevel === 0) {
        return OSONISH_MAPPINGS.education[0][effectiveLang];
    }
    if (typeof eduLevel === 'number' && OSONISH_MAPPINGS.education[eduLevel as keyof typeof OSONISH_MAPPINGS.education]) {
        return OSONISH_MAPPINGS.education[eduLevel as keyof typeof OSONISH_MAPPINGS.education][effectiveLang];
    }

    if (typeof eduLevel === 'string') {
        const normalized = eduLevel
            .toLowerCase()
            .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalized || ['ahamiyatsiz', 'any', 'любой', 'не важно'].includes(normalized)) {
            return OSONISH_MAPPINGS.education[0][effectiveLang];
        }
        if (normalized.includes('magistr') || normalized.includes('master') || normalized.includes('магистр')) {
            return OSONISH_MAPPINGS.education[4][effectiveLang];
        }
        if (normalized.includes('oliy') || normalized.includes('higher') || normalized.includes('высш')) {
            return OSONISH_MAPPINGS.education[3][effectiveLang];
        }
        const hasOrta = normalized.includes('orta') || normalized.includes('o rta');
        const hasMaxsus = normalized.includes('maxsus') || normalized.includes('spets') || normalized.includes('специаль');
        if (hasOrta && hasMaxsus) return OSONISH_MAPPINGS.education[2][effectiveLang];
        if (normalized === 'secondary' || normalized.includes('средн')) return OSONISH_MAPPINGS.education[1][effectiveLang];

        if (normalized === 'vocational') return OSONISH_MAPPINGS.education[2][effectiveLang];
        if (normalized === 'secondary_special' || normalized === 'middle_special') return OSONISH_MAPPINGS.education[2][effectiveLang];
        if (normalized === 'incomplete_higher') return OSONISH_MAPPINGS.education[3][effectiveLang];
        if (normalized === 'higher') return OSONISH_MAPPINGS.education[3][effectiveLang];
        if (normalized === 'master') return OSONISH_MAPPINGS.education[4][effectiveLang];
        if (normalized === 'bachelor') return OSONISH_MAPPINGS.education[3][effectiveLang];
        if (normalized === 'phd') return OSONISH_MAPPINGS.education[4][effectiveLang];
    }

    return OSONISH_MAPPINGS.education[0][effectiveLang];
};

export const formatBenefits = (benefitIds: any, lang: Language): string | null => {
    if (!benefitIds) return null;
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';

    if (Array.isArray(benefitIds)) {
        if (benefitIds.length === 0) return null;
        const labels = benefitIds
            .map(id => OSONISH_MAPPINGS.benefits[id as keyof typeof OSONISH_MAPPINGS.benefits]?.[effectiveLang])
            .filter(Boolean);
        return labels.length > 0 ? labels.join(', ') : null;
    }

    if (typeof benefitIds === 'object') {
        const list = benefitIds[effectiveLang] || benefitIds.uz || benefitIds.ru;
        if (Array.isArray(list)) return list.join(', ');
    }

    if (typeof benefitIds === 'string') return benefitIds;
    return null;
};

export const formatLanguages = (languages: any, lang: Language): string | null => {
    if (!languages) return null;
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';

    if (Array.isArray(languages)) {
        if (languages.length === 0) return null;
        const normalized = languages.map((l: any) => (typeof l === 'number' ? { language: l } : l));
        const labels = normalized
            .map((l: any) => {
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
    }

    if (typeof languages === 'object') {
        const list = languages[effectiveLang] || languages.uz || languages.ru;
        if (Array.isArray(list)) return list.join(', ');
    }

    if (typeof languages === 'string') return languages;
    return null;
};

export const getPaymentTypeLabel = (job: any, lang: Language) => {
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';
    const typeId = job.payment_type;
    const rawId = typeId || job.raw_source_json?.payment_type;

    if (typeof rawId === 'number' && OSONISH_MAPPINGS.payment_type[rawId as keyof typeof OSONISH_MAPPINGS.payment_type]) {
        return OSONISH_MAPPINGS.payment_type[rawId as keyof typeof OSONISH_MAPPINGS.payment_type][effectiveLang];
    }

    return null;
};

export const getWorkModeLabel = (job: any, lang: Language) => {
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';

    const mode = job.work_mode;
    const rawMode = job.raw_source_json?.work_type;

    if (mode === 'remote') return lang === 'ru' ? 'Удаленно' : 'Masofaviy ish';
    if (mode === 'hybrid') return lang === 'ru' ? 'Гибрид' : 'Gibrid';
    if (mode === 'onsite') return lang === 'ru' ? 'На месте' : 'Ish joyida';

    if (typeof rawMode === 'number' && OSONISH_MAPPINGS.work_mode[rawMode as keyof typeof OSONISH_MAPPINGS.work_mode]) {
        return OSONISH_MAPPINGS.work_mode[rawMode as keyof typeof OSONISH_MAPPINGS.work_mode][effectiveLang];
    }

    return null;
};

export const getWorkingDaysLabel = (job: any, lang: Language) => {
    const effectiveLang = lang === 'uz' ? 'uz' : 'ru';

    const daysId = job.working_days_id || (job.working_days ? parseInt(job.working_days) : null);
    const rawId = daysId || job.raw_source_json?.working_days_id;

    if (typeof rawId === 'number' && OSONISH_MAPPINGS.working_days[rawId as keyof typeof OSONISH_MAPPINGS.working_days]) {
        return OSONISH_MAPPINGS.working_days[rawId as keyof typeof OSONISH_MAPPINGS.working_days][effectiveLang];
    }

    const rawDays = job.working_days || job.raw_source_json?.working_days;
    if (typeof rawDays === 'string') {
        const normalized = rawDays.toLowerCase();
        if (normalized === 'full_week') return effectiveLang === 'uz' ? "To'liq hafta" : 'Полная неделя';
        if (normalized === 'shift_2_2') return effectiveLang === 'uz' ? 'Smenali 2/2' : 'Сменный 2/2';
        if (normalized === 'shift_3_3') return effectiveLang === 'uz' ? 'Smenali 3/3' : 'Сменный 3/3';
        if (normalized === '2') return OSONISH_MAPPINGS.working_days[2][effectiveLang];
        if (normalized === '1') return OSONISH_MAPPINGS.working_days[1][effectiveLang];
    }

    return null;
};
