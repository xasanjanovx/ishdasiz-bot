/**
 * Job Matcher - Strict criteria with weighted score.
 * Filters out vacancies that don't match key requirements.
 */

export interface UserProfile {
    region_id?: number | string | null;
    district_id?: number | string | null;
    category_id?: string | null;
    category_ids?: string[];
    field_id?: string | number | null;
    field_title?: string | null;
    expected_salary_min?: number | null;
    expected_salary_max?: number | null;
    experience_level?: string | null;
    experience?: string | number | null;
    employment_type?: string | null;
    gender?: string | number | null;
    birth_date?: string | null;
    education_level?: string | number | null;
    skills?: string[];
    title?: string | null;
}

export interface JobVacancy {
    id: string;
    title_uz?: string;
    title_ru?: string;
    title?: string | null;
    field_id?: string | number | null;
    field_title?: string | null;
    region_id?: number | string;
    district_id?: number | string;
    category_id?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    experience_years?: number | null;
    experience?: string | number | null;
    employment_type?: string | null;
    work_mode?: string | null;
    gender?: string | number | null;
    age_min?: number | null;
    age_max?: number | null;
    education_level?: string | number | null;
    [key: string]: any;
}

export interface MatchExplanation {
    uz: string;
    ru: string;
}

export interface MatchCriteria {
    location: boolean;
    profession: boolean;
    category: boolean;
    gender: boolean;
    age: boolean;
    education: boolean;
    salary: boolean;
    experience: boolean;
}

export interface MatchedJob extends JobVacancy {
    matchScore: number;
    explanation: MatchExplanation;
    matchCriteria: MatchCriteria;
    ageKnown?: boolean;
    titleRelevance?: number;
    conditionallySuitable?: boolean;
    conditionalReason?: 'education' | 'experience' | 'both' | null;
}

const EXPERIENCE_YEARS: Record<string, number> = {
    no_experience: 0,
    '1_year': 1,
    '1_3_years': 2,
    '3_years': 2,
    '3_5_years': 3,
    '5_years': 3,
    '5_plus': 4,
    '10_years': 4
};

const EDUCATION_ORDER: Record<string, number> = {
    any: 0,
    orta: 1,
    'orta_maxsus': 2,
    oliy: 3,
    master: 4
};

// Match weights (priority order: profession anchor/title -> location -> category -> other criteria)
const WEIGHTS: Record<keyof MatchCriteria, number> = {
    profession: 44,
    location: 36,
    category: 10,
    gender: 6,
    age: 2,
    education: 4,
    // Salary is supportive, not primary.
    salary: 1,
    experience: 3
};

function toNumber(value: number | string | undefined | null): number | null {
    if (value === undefined || value === null) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeGender(value?: string | number | null): 'male' | 'female' | 'any' | 'other' | null {
    if (value === null || value === undefined) return null;
    const raw = typeof value === 'string' ? value.toLowerCase().trim() : value;
    if (raw === '1' || raw === 1 || raw === 'male' || raw === 'erkak' || raw === 'мужской') return 'male';
    if (raw === '2' || raw === 2 || raw === 'female' || raw === 'ayol' || raw === 'женский') return 'female';
    if (raw === '3' || raw === 3 || raw === 'any' || raw === 'ahamiyatsiz' || raw === 'любое' || raw === 'любой' || raw === 'не важно') return 'any';
    return 'other';
}

function normalizeEducation(value?: string | number | null): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') {
        if (value <= 0) return 0;
        if (value >= 4) return 4;
        if (value === 3) return 3;
        if (value === 2) return 2;
        return 1;
    }

    const key = String(value)
        .toLowerCase()
        .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!key) return 0;
    if (['any', 'ahamiyatsiz', 'не важно', 'любой', 'любой уровень'].includes(key)) return 0;
    if (key.includes('magistr') || key.includes('master') || key.includes('магистр')) return 4;
    if (key.includes('oliy') || key.includes('higher') || key.includes('высш')) return 3;
    const hasOrta = key.includes('orta') || key.includes("o rta");
    const hasMaxsus = key.includes('maxsus') || key.includes('spets') || key.includes('специаль');
    if (hasOrta && hasMaxsus) return 2;
    if (key.includes('vocational') || key.includes('средне специаль')) return 2;
    if (hasOrta || key.includes('secondary') || key.includes('средн')) return 1;
    return EDUCATION_ORDER[key] ?? 0;
}

function parseBirthDate(value?: string | null): Date | null {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (trimmed.includes('.')) {
        const parts = trimmed.split('.').map(p => p.trim());
        if (parts.length === 3) {
            const [dd, mm, yyyy] = parts;
            const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
            return Number.isNaN(date.getTime()) ? null : date;
        }
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeExperience(value?: string | number | null): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= 1 && value <= 5) {
            const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
            return map[value] ?? 0;
        }
        if (value <= 0) return 0;
        if (value <= 1) return 1;
        if (value <= 3) return 2;
        if (value <= 5) return 3;
        return 4;
    }

    const raw = String(value)
        .toLowerCase()
        .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!raw) return null;
    if (['any', 'ahamiyatsiz', 'не важно', 'любой'].includes(raw)) return null;
    if (['1', '2', '3', '4', '5'].includes(raw)) {
        const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
        return map[raw] ?? 0;
    }
    if (['no_experience', 'tajribasiz', 'без опыта', 'talab etilmaydi'].includes(raw)) return 0;
    if (raw === '1_year' || /\b1\s*yil\b/.test(raw) || /\b1\s*год\b/.test(raw)) return 1;
    if (raw === '1_3_years' || raw === '3_years' || raw.includes('1 3') || /(1\s*[-–]\s*3)/.test(raw)) return 2;
    if (raw === '3_5_years' || raw === '5_years' || raw.includes('3 5') || /(3\s*[-–]\s*5)/.test(raw)) return 3;
    if (
        raw === '5_plus' ||
        raw === '10_years' ||
        /5\s*\+/.test(raw) ||
        (/5\s*yil/.test(raw) && raw.includes('ortiq')) ||
        raw.includes('5+')
    ) return 4;

    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return normalizeExperience(numeric);
    return null;
}

function getAgeFromBirthDate(value?: string | null): number | null {
    const date = parseBirthDate(value);
    if (!date) return null;
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const m = now.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < date.getDate())) {
        age -= 1;
    }
    return age;
}

function getJobExperienceYears(job: JobVacancy): number | null {
    return normalizeExperience(
        job.experience_years
        ?? job.experience
        ?? job.raw_source_json?.work_experiance
        ?? job.raw_source_json?.experience
    );
}

function getResumeExperienceYears(profile: UserProfile): number {
    const parsed = normalizeExperience(profile.experience_level ?? profile.experience);
    if (parsed !== null) return parsed;
    const key = profile.experience_level || 'no_experience';
    return EXPERIENCE_YEARS[key] ?? 0;
}

function hasGenderRequirement(job: JobVacancy): boolean {
    const jobGender = normalizeGender(job.gender);
    return jobGender !== null && jobGender !== 'any';
}

function normalizeFieldId(value?: string | number | null): string | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    return raw.length > 0 ? raw : null;
}

function getJobFieldId(job: JobVacancy): string | null {
    const direct = normalizeFieldId(job.field_id);
    if (direct) return direct;
    const rawMmkId = job.raw_source_json?.mmk_position?.id ?? job.raw_source_json?.mmk_position_id ?? null;
    return normalizeFieldId(rawMmkId);
}

function tokenizeTitle(value?: string | null): string[] {
    if (!value) return [];
    return String(value)
        .toLowerCase()
        .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
        .replace(/[^a-z\u0400-\u04FF0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length >= 3);
}

function isGenericTitle(value?: string | null): boolean {
    if (!value) return true;
    const tokens = tokenizeTitle(value);
    if (tokens.length === 0) return true;
    const generic = new Set(['mutaxassis', 'ishchi', 'xodim', 'employee', 'specialist', 'worker', 'operator']);
    if (tokens.length === 1 && generic.has(tokens[0])) return true;
    return false;
}

const TITLE_STOPWORDS = new Set([
    // Generic job words
    'uchun', 'boyicha', 'boyicha', 'bilan', 'va', 'ish', 'lavozim', 'xodim',
    'mutaxassis', 'specialist', 'worker', 'employee', 'vakansiya', 'vacancy',
    'bo', 'yicha', 'malaka', 'toifali', 'toifa',
    // Medical/profession modifiers - these are NOT the main profession word
    'shifokori', 'shifokor', 'doctor', 'vrach', 'doktor',
    'umumiy', 'amaliyot', 'amaliyotchi', 'klinik', 'bolalar', 'kattalar',
    'kichik', 'katta', 'bosh', 'yordamchi', 'assistent',
    'malakali', 'tajribali', 'yosh', 'senior', 'junior',
    // Job type modifiers
    'ishchi', 'xizmati', 'xizmat', 'soha', 'sohasi'
]);

const TITLE_GENERIC_TOKENS = new Set([
    'teacher', 'oqituvchi', 'ustoz', 'pedagog', 'maktab',
    'manager', 'director', 'operator', 'driver', 'developer',
    'accountant', 'sales', 'marketing', 'hr', 'support', 'doctor', 'nurse',
    'mutaxassis', 'xodim', 'ishchi', 'specialist', 'employee', 'worker',
    'language', 'subject', 'fan'
]);

const LANGUAGE_TOKENS = new Set([
    'foreign_language', 'language', 'english', 'german', 'russian',
    'french', 'arabic', 'turkish', 'korean', 'chinese', 'japanese'
]);

const TITLE_SYNONYMS: Record<string, string> = {
    dasturchi: 'developer',
    developer: 'developer',
    programmist: 'developer',
    frontend: 'frontend',
    backend: 'backend',
    buxgalter: 'accountant',
    hisobchi: 'accountant',
    accountant: 'accountant',
    sotuvchi: 'sales',
    sales: 'sales',
    marketolog: 'marketing',
    marketing: 'marketing',
    smm: 'smm',
    hr: 'hr',
    recruiter: 'hr',
    operator: 'operator',
    callcenter: 'operator',
    call: 'operator',
    support: 'support',
    menejer: 'manager',
    manager: 'manager',
    direktor: 'director',
    director: 'director',
    rahbar: 'manager',
    boshqaruvchi: 'manager',
    haydovchi: 'driver',
    driver: 'driver',
    oshpaz: 'cook',
    cook: 'cook',
    shifokor: 'doctor',
    doctor: 'doctor',
    hamshira: 'nurse',
    nurse: 'nurse',
    oqituvchi: 'teacher',
    oqituvchisi: 'teacher',
    oqituvchilar: 'teacher',
    qituvchi: 'teacher',
    qituvchisi: 'teacher',
    qituvchilar: 'teacher',
    pedagog: 'teacher',
    prepodavatel: 'teacher',
    uchitel: 'teacher',
    учитель: 'teacher',
    преподаватель: 'teacher',
    tarbiyachi: 'teacher',
    teacher: 'teacher',
    ustoz: 'teacher',
    english: 'english',
    ingiliz: 'english',
    inglis: 'english',
    ingliz: 'english',
    nemis: 'german',
    german: 'german',
    rus: 'russian',
    rusch: 'russian',
    russian: 'russian',
    fransuz: 'french',
    french: 'french',
    turk: 'turkish',
    turkcha: 'turkish',
    turkish: 'turkish',
    arab: 'arabic',
    arabic: 'arabic',
    koreys: 'korean',
    korean: 'korean',
    xitoy: 'chinese',
    chinese: 'chinese',
    yapon: 'japanese',
    japanese: 'japanese',
    til: 'language',
    tili: 'language',
    jazyk: 'language',
    язык: 'language',
    chet: 'foreign_language',
    xorijiy: 'foreign_language',
    biologiya: 'biology',
    biology: 'biology',
    kimyo: 'chemistry',
    chemistry: 'chemistry',
    fizika: 'physics',
    physics: 'physics',
    matematika: 'math',
    math: 'math',
    tarix: 'history',
    history: 'history',
    geografiya: 'geography',
    geography: 'geography',
    yurist: 'lawyer',
    lawyer: 'lawyer',
    tozalovchi: 'cleaner',
    uborshchik: 'cleaner',
    cleaner: 'cleaner'
};

function canonicalizeTitleToken(token: string): string {
    let normalized = token.trim().toLowerCase();
    if (!normalized) return normalized;
    if (normalized.endsWith('si') && normalized.includes('qituvch')) {
        normalized = normalized.slice(0, -2);
    }
    if (normalized.endsWith('lar') && normalized.includes('qituvch')) {
        normalized = normalized.slice(0, -3);
    }
    return TITLE_SYNONYMS[normalized] || normalized;
}

function normalizeTitleTokens(value?: string | null): string[] {
    const tokens = tokenizeTitle(value)
        .map(token => token.trim())
        .filter(token => token.length >= 3)
        .filter(token => !TITLE_STOPWORDS.has(token));

    return tokens.map(canonicalizeTitleToken);
}

function toSpecificTokens(tokens: string[]): string[] {
    return tokens.filter(token => token && !TITLE_GENERIC_TOKENS.has(token));
}

function tokensNearEqual(a: string, b: string): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length < 3 || b.length < 3) return false;
    return a.startsWith(b) || b.startsWith(a);
}

function hasAnyNearIntersection(a: string[], b: string[]): boolean {
    if (!a.length || !b.length) return false;
    return a.some(tokenA => b.some(tokenB => tokensNearEqual(tokenA, tokenB)));
}

function hasLanguageCompatibility(profileSpecific: string[], jobSpecific: string[]): boolean {
    const profileHasLang = profileSpecific.some(token => LANGUAGE_TOKENS.has(token));
    const jobHasLang = jobSpecific.some(token => LANGUAGE_TOKENS.has(token));
    if (!profileHasLang || !jobHasLang) return false;

    const profileHasExactLanguage = profileSpecific.some(token => LANGUAGE_TOKENS.has(token) && token !== 'language' && token !== 'foreign_language');
    const jobHasExactLanguage = jobSpecific.some(token => LANGUAGE_TOKENS.has(token) && token !== 'language' && token !== 'foreign_language');

    if (!profileHasExactLanguage || !jobHasExactLanguage) {
        return true;
    }

    return hasAnyNearIntersection(profileSpecific, jobSpecific);
}

function titleSimilarity(profileTitle?: string | null, jobTitle?: string | null): number {
    const a = normalizeTitleTokens(profileTitle);
    const b = normalizeTitleTokens(jobTitle);
    if (!a.length || !b.length) return 0;

    const setA = new Set(a);
    let intersection = 0;
    for (const tokenA of Array.from(setA)) {
        const found = b.some(tokenB => tokensNearEqual(tokenA, tokenB));
        if (found) intersection += 1;
    }

    const overlap = intersection / Math.max(setA.size, b.length);
    const specificA = toSpecificTokens(a);
    const specificB = toSpecificTokens(b);
    const specificOverlap = hasAnyNearIntersection(specificA, specificB);
    const languageCompatible = hasLanguageCompatibility(specificA, specificB);

    if (specificA.length > 0 && !specificOverlap && !languageCompatible) {
        const genericOverlap = hasAnyNearIntersection(a, b);
        return genericOverlap ? 0.08 : 0;
    }

    const contains = String(jobTitle || '').toLowerCase().includes(String(profileTitle || '').toLowerCase())
        || String(profileTitle || '').toLowerCase().includes(String(jobTitle || '').toLowerCase());
    const containsBoost = contains ? 0.2 : 0;

    const specificBoost = specificOverlap ? 0.2 : (languageCompatible ? 0.1 : 0);
    return Math.max(0, Math.min(1, overlap + containsBoost + specificBoost));
}

export function calculateMatchScore(profile: UserProfile, job: JobVacancy): MatchedJob {
    const criteria: MatchCriteria = {
        location: false,
        profession: false,
        category: false,
        gender: false,
        age: false,
        education: false,
        salary: false,
        experience: false
    };

    let totalWeight = 0;
    let matchedWeight = 0;

    const add = (key: keyof MatchCriteria, matched: boolean, ratio?: number): void => {
        totalWeight += WEIGHTS[key];
        const normalizedRatio = typeof ratio === 'number'
            ? Math.max(0, Math.min(1, ratio))
            : (matched ? 1 : 0);
        matchedWeight += WEIGHTS[key] * normalizedRatio;
        criteria[key] = matched;
    };

    // Profession anchor + title relevance
    const profileFieldId = normalizeFieldId(profile.field_id);
    const jobFieldId = getJobFieldId(job);
    const profileTitle = profile.field_title || profile.title || null;
    const jobTitle = job.field_title || job.title_uz || job.title_ru || job.title || job.raw_source_json?.position_name || null;
    const professionTitleRel = titleSimilarity(profileTitle, jobTitle);

    if (profileFieldId && jobFieldId) {
        const exactField = profileFieldId === jobFieldId;
        if (exactField) {
            add('profession', true, 1);
        } else if (professionTitleRel >= 0.7) {
            add('profession', true, 0.6);
        } else if (professionTitleRel >= 0.5) {
            add('profession', false, 0.25);
        } else {
            add('profession', false, 0);
        }
    } else if (profileFieldId && !jobFieldId) {
        if (professionTitleRel >= 0.6) {
            add('profession', true, 0.5);
        } else if (professionTitleRel >= 0.4) {
            add('profession', false, 0.2);
        } else {
            add('profession', false, 0);
        }
    } else if (!profileFieldId && profileTitle) {
        if (professionTitleRel >= 0.5) {
            add('profession', true, Math.min(1, 0.5 + professionTitleRel * 0.5));
        } else {
            add('profession', false, Math.max(0, professionTitleRel * 0.5));
        }
    } else {
        add('profession', true, 0.2);
    }

    // Location
    const pRegion = toNumber(profile.region_id);
    const jRegion = toNumber(job.region_id);
    const pDist = profile.district_id ? String(profile.district_id) : null;
    const jDist = job.district_id ? String(job.district_id) : null;
    const isRemote = job.work_mode === 'remote' || job.employment_type === 'remote';
    const hasJobLocation = Boolean(jRegion || jDist);

    if (isRemote) {
        // Remote can be considered, but not as "location match".
        add('location', false, 0.08);
    } else if (pDist && jDist) {
        if (pDist === jDist) {
            // Only exact district/city is treated as location match.
            add('location', true, 1);
        } else if (pRegion && jRegion && pRegion === jRegion) {
            // Same region, different district: no checkmark, reduced contribution.
            add('location', false, 0.2);
        } else {
            add('location', false, 0);
        }
    } else if (pRegion && jRegion && pRegion === jRegion) {
        // Region-only fallback still should not be marked as exact location.
        add('location', false, 0.15);
    } else if (!hasJobLocation) {
        // Job didn't specify location – very weak.
        add('location', false, 0.05);
    } else {
        // Location mismatch or insufficient location data.
        add('location', false, 0);
    }

    // Category
    const categoryIds = Array.isArray(profile.category_ids) && profile.category_ids.length > 0
        ? profile.category_ids
        : profile.category_id ? [profile.category_id] : [];
    if (categoryIds.length > 0 && job.category_id) {
        const jobCategory = String(job.category_id);
        const profileCategories = categoryIds.map(id => String(id));
        add('category', profileCategories.includes(jobCategory));
    } else if (!job.category_id) {
        // Job without category – neutral match
        add('category', true, 0.35);
    } else {
        // Profile without category – weak match
        add('category', true, 0.25);
    }

    // Gender
    const userGender = normalizeGender(profile.gender) || 'any';
    const jobGender = normalizeGender(job.gender);
    if (jobGender === null || jobGender === 'any') {
        // "Ahamiyatsiz" is neutral, not a full-strength match.
        add('gender', true, 0.5);
    } else if (jobGender === 'male' || jobGender === 'female') {
        if (userGender === 'any') {
            add('gender', true);
        } else {
            add('gender', userGender === jobGender);
        }
    } else {
        add('gender', false);
    }

    // Age
    const ageMin = job.age_min ?? null;
    const ageMax = job.age_max ?? null;
    const userAge = getAgeFromBirthDate(profile.birth_date || null);
    let ageKnown = true;
    if (ageMin || ageMax) {
        if (userAge == null) {
            ageKnown = false;
            add('age', true, 0.4);
        } else {
            const minOk = ageMin ? userAge >= ageMin : true;
            const maxOk = ageMax ? userAge <= ageMax : true;
            add('age', minOk && maxOk);
        }
    } else {
        // No age requirement: neutral.
        add('age', true, 0.5);
    }

    // Education
    const jobEdu = normalizeEducation(job.education_level);
    const userEdu = normalizeEducation(profile.education_level);
    const educationMismatch = jobEdu > 0 && userEdu < jobEdu;
    if (jobEdu > 0) {
        add('education', !educationMismatch);
    } else {
        // No education requirement: neutral.
        add('education', true, 0.5);
    }

    // Salary
    const expectedMin = profile.expected_salary_min ?? 0;
    if (expectedMin && expectedMin > 0) {
        if (job.salary_max && job.salary_max >= expectedMin) {
            add('salary', true);
        } else if (job.salary_min && job.salary_min >= expectedMin) {
            add('salary', true, 0.9);
        } else if (!job.salary_min && !job.salary_max) {
            add('salary', true, 0.6);
        } else {
            add('salary', false);
        }
    } else {
        // Salary not specified by seeker profile: neutral.
        add('salary', true, 0.5);
    }

    // Experience
    const jobExp = getJobExperienceYears(job);
    const userExp = getResumeExperienceYears(profile);
    const experienceMismatch = jobExp !== null && userExp < jobExp;
    if (jobExp !== null) {
        add('experience', !experienceMismatch);
    } else {
        // No experience requirement: neutral.
        add('experience', true, 0.5);
    }

    let score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
    let conditionalReason: MatchedJob['conditionalReason'] = null;
    if (educationMismatch && experienceMismatch) conditionalReason = 'both';
    else if (educationMismatch) conditionalReason = 'education';
    else if (experienceMismatch) conditionalReason = 'experience';

    if (conditionalReason === 'both') score = Math.round(score * 0.6);
    else if (conditionalReason) score = Math.round(score * 0.75);

    const reasonsUz: string[] = [];
    const reasonsRu: string[] = [];
    if (criteria.location) { reasonsUz.push('Joylashuv mos'); reasonsRu.push('Локация подходит'); }
    if (criteria.profession) { reasonsUz.push('Lavozim mos'); reasonsRu.push('Должность подходит'); }
    if (criteria.category) { reasonsUz.push('Soha mos'); reasonsRu.push('Сфера подходит'); }
    if (criteria.gender) { reasonsUz.push('Jins mos'); reasonsRu.push('Пол подходит'); }
    if (criteria.age) { reasonsUz.push('Yosh mos'); reasonsRu.push('Возраст подходит'); }
    if (criteria.education) { reasonsUz.push("Ma'lumot mos"); reasonsRu.push('Образование подходит'); }
    if (criteria.salary) { reasonsUz.push('Maosh mos'); reasonsRu.push('Зарплата подходит'); }
    if (criteria.experience) { reasonsUz.push('Tajriba mos'); reasonsRu.push('Опыт подходит'); }

    return {
        ...job,
        matchScore: score,
        explanation: {
            uz: reasonsUz.join(', '),
            ru: reasonsRu.join(', ')
        },
        matchCriteria: criteria,
        ageKnown,
        conditionallySuitable: Boolean(conditionalReason),
        conditionalReason
    };
}

export function matchAndSortJobs(profile: UserProfile, jobs: JobVacancy[]): MatchedJob[] {
    const matched = jobs.map(job => calculateMatchScore(profile, job));
    const profileCategories = Array.isArray(profile.category_ids) && profile.category_ids.length > 0
        ? profile.category_ids
        : profile.category_id ? [profile.category_id] : [];
    const hasProfileCategory = profileCategories.length > 0;
    const profileFieldId = normalizeFieldId(profile.field_id);
    const profileTitle = profile.title || '';
    const profileTitleTokens = normalizeTitleTokens(profileTitle);
    const profileSpecificTokens = toSpecificTokens(profileTitleTokens);
    const profileTitleGeneric = isGenericTitle(profileTitle);

    const enriched = matched.map(item => {
        const job: JobVacancy = item;
        const rawJobTitle = job.title_uz || job.title_ru || job.title || job.field_title || job.raw_source_json?.position_name || '';
        const relevance = titleSimilarity(profileTitle, rawJobTitle);
        const jobFieldId = getJobFieldId(job);
        const isExactField = Boolean(profileFieldId && jobFieldId && profileFieldId === jobFieldId);
        const jobSpecificTokens = toSpecificTokens(normalizeTitleTokens(rawJobTitle));
        const specificOverlap = hasAnyNearIntersection(profileSpecificTokens, jobSpecificTokens);
        const languageCompatible = hasLanguageCompatibility(profileSpecificTokens, jobSpecificTokens);
        const hardTitleMismatch = profileSpecificTokens.length > 0 && !specificOverlap && !languageCompatible;
        const mismatchPenalty = hardTitleMismatch ? 0.4 : 1;
        return {
            ...item,
            titleRelevance: relevance,
            fieldExact: isExactField,
            // Keep title influence moderate to avoid inflated 90%+ scores.
            matchScore: Math.max(0, Math.min(100, Math.round((item.matchScore * mismatchPenalty) + relevance * 6)))
        };
    });

    const filtered = enriched.filter(item => {
        const job: JobVacancy = item;
        const hasGender = hasGenderRequirement(job);
        const hasAge = Boolean(job.age_min || job.age_max);
        const hasEducation = Boolean(job.education_level || job.raw_source_json?.min_education);
        const hasExperience = getJobExperienceYears(job) !== null;
        const jobFieldId = getJobFieldId(job);
        const jobTitle = job.title_uz || job.title_ru || job.title || job.field_title || job.raw_source_json?.position_name || '';
        const jobTitleTokens = normalizeTitleTokens(jobTitle);
        const specificJobTokens = toSpecificTokens(jobTitleTokens);
        const specificTitleOverlap = profileSpecificTokens.length > 0 && specificJobTokens.length > 0
            ? profileSpecificTokens.some(token => specificJobTokens.some(jobToken => tokensNearEqual(token, jobToken)))
            : false;
        const languageCompatible = hasLanguageCompatibility(profileSpecificTokens, specificJobTokens);
        const titleOverlap = profileTitleTokens.length > 0 && jobTitleTokens.length > 0
            ? profileTitleTokens.some(token => jobTitleTokens.some(jobToken => tokensNearEqual(token, jobToken)))
            : true;
        const jobTitleGeneric = isGenericTitle(jobTitle);
        const shouldCheckTitle = (!profileTitleGeneric || !jobTitleGeneric) && profileTitleTokens.length > 0;
        const strictTitleMode = profileTitleTokens.length > 0 && !profileTitleGeneric;
        const titleRel = item.titleRelevance ?? 0;
        const requiredTitleMatch = profileSpecificTokens.length > 0
            ? (specificTitleOverlap || languageCompatible)
            : titleOverlap;
        const hasProfileField = Boolean(profileFieldId);
        const exactField = Boolean(hasProfileField && jobFieldId && profileFieldId === jobFieldId);
        const fieldMismatch = Boolean(hasProfileField && jobFieldId && profileFieldId !== jobFieldId);

        // If exact field match or title overlap - always show (core requirement)
        if (exactField) return true;
        if (titleOverlap && titleRel >= 0.15) return true;
        if (specificTitleOverlap) return true;

        // Relaxed filters - don't reject harshly, prefer to show more results
        if (fieldMismatch && titleRel < 0.35 && !titleOverlap) return false;
        if (hasProfileField && !exactField && !item.matchCriteria.profession && titleRel < 0.15 && !titleOverlap) return false;
        if (shouldCheckTitle && !requiredTitleMatch && titleRel < 0.1) return false;
        if (!shouldCheckTitle && !titleOverlap && !item.matchCriteria.category && !item.matchCriteria.profession) return false;
        return true;
    });

    // Get profile district for priority sorting
    const profileDistrictId = profile.district_id ? String(profile.district_id) : null;

    return filtered.sort((a, b) => {
        // FIRST: Prioritize jobs from user's selected district/city
        if (profileDistrictId) {
            const aDistrictId = String((a as any).district_id || '');
            const bDistrictId = String((b as any).district_id || '');
            const aInDistrict = aDistrictId === profileDistrictId ? 1 : 0;
            const bInDistrict = bDistrictId === profileDistrictId ? 1 : 0;
            if (bInDistrict !== aInDistrict) return bInDistrict - aInDistrict;
        }

        // THEN: Highest overall relevance first
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;

        const professionA = a.matchCriteria?.profession ? 1 : 0;
        const professionB = b.matchCriteria?.profession ? 1 : 0;
        if (professionB !== professionA) return professionB - professionA;

        const locationA = a.matchCriteria?.location ? 1 : 0;
        const locationB = b.matchCriteria?.location ? 1 : 0;
        if (locationB !== locationA) return locationB - locationA;

        const titleA = a.titleRelevance ?? 0;
        const titleB = b.titleRelevance ?? 0;
        if (titleB !== titleA) return titleB - titleA;

        const categoryA = a.matchCriteria?.category ? 1 : 0;
        const categoryB = b.matchCriteria?.category ? 1 : 0;
        if (categoryB !== categoryA) return categoryB - categoryA;

        const conditionalA = a.conditionallySuitable ? 1 : 0;
        const conditionalB = b.conditionallySuitable ? 1 : 0;
        if (conditionalA !== conditionalB) return conditionalA - conditionalB;

        return 0;
    });
}

export function getMatchPercentage(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
}
