/**
 * Job Matcher - Strict criteria with weighted score.
 * Filters out vacancies that don't match key requirements.
 */

export interface UserProfile {
    region_id?: number | string;
    district_id?: number | string;
    category_id?: string | null;
    category_ids?: string[];
    expected_salary_min?: number | null;
    expected_salary_max?: number | null;
    experience_level?: string | null;
    employment_type?: string | null;
    gender?: string | number | null;
    birth_date?: string | null;
    education_level?: string | number | null;
    skills?: string[];
}

export interface JobVacancy {
    id: string;
    title_uz?: string;
    title_ru?: string;
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
}

const EXPERIENCE_YEARS: Record<string, number> = {
    no_experience: 0,
    '1_year': 1,
    '3_years': 3,
    '5_years': 5,
    '10_years': 10
};

const EDUCATION_ORDER: Record<string, number> = {
    any: 0,
    secondary: 1,
    vocational: 2,
    higher: 3,
    master: 4,
    phd: 5
};

const WEIGHTS: Record<keyof MatchCriteria, number> = {
    location: 30,
    category: 20,
    gender: 15,
    age: 10,
    education: 10,
    salary: 8,
    experience: 7
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
    if (typeof value === 'number') return Math.max(0, value);
    const key = String(value).toLowerCase();
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
    if (typeof job.experience_years === 'number') return job.experience_years;
    const exp = job.experience;
    if (typeof exp === 'number') {
        if (exp === 1) return 0;
        if (exp === 2) return 1;
        if (exp === 3) return 3;
        if (exp === 4) return 5;
        if (exp === 5) return 5;
    }
    if (typeof exp === 'string') {
        const num = Number(exp);
        if (Number.isFinite(num)) {
            if (num === 1) return 0;
            if (num === 2) return 1;
            if (num === 3) return 3;
            if (num === 4) return 5;
            if (num === 5) return 5;
        }
    }
    return null;
}

function getResumeExperienceYears(profile: UserProfile): number {
    const key = profile.experience_level || 'no_experience';
    return EXPERIENCE_YEARS[key] ?? 0;
}

export function calculateMatchScore(profile: UserProfile, job: JobVacancy): MatchedJob {
    const criteria: MatchCriteria = {
        location: false,
        category: false,
        gender: false,
        age: false,
        education: false,
        salary: false,
        experience: false
    };

    let totalWeight = 0;
    let matchedWeight = 0;

    const add = (key: keyof MatchCriteria, matched: boolean, ratio: number = 1): void => {
        totalWeight += WEIGHTS[key];
        if (matched) {
            matchedWeight += WEIGHTS[key] * ratio;
        }
        criteria[key] = matched;
    };

    // Location
    const pRegion = toNumber(profile.region_id);
    const jRegion = toNumber(job.region_id);
    const pDist = profile.district_id ? String(profile.district_id) : null;
    const jDist = job.district_id ? String(job.district_id) : null;
    const isRemote = job.work_mode === 'remote' || job.employment_type === 'remote';

    if (isRemote) {
        add('location', true, 0.7);
    } else if (pRegion && jRegion) {
        if (pDist && jDist && pDist === jDist) {
            add('location', true, 1);
        } else if (pRegion === jRegion) {
            add('location', true, 0.8);
        } else {
            add('location', false);
        }
    } else {
        add('location', false);
    }

    // Category
    const categoryIds = Array.isArray(profile.category_ids) && profile.category_ids.length > 0
        ? profile.category_ids
        : profile.category_id ? [profile.category_id] : [];
    if (categoryIds.length > 0 && job.category_id) {
        add('category', categoryIds.includes(job.category_id));
    } else {
        add('category', false);
    }

    // Gender
    const userGender = normalizeGender(profile.gender) || 'any';
    const jobGender = normalizeGender(job.gender);
    if (jobGender === null) {
        add('gender', true);
    } else if (jobGender === 'any') {
        add('gender', true);
    } else if (jobGender === 'male' || jobGender === 'female') {
        add('gender', userGender === jobGender);
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
        add('age', true);
    }

    // Education
    const jobEdu = normalizeEducation(job.education_level);
    const userEdu = normalizeEducation(profile.education_level);
    if (jobEdu > 0) {
        add('education', userEdu >= jobEdu);
    } else {
        add('education', true);
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
        add('salary', true);
    }

    // Experience
    const jobExp = getJobExperienceYears(job);
    const userExp = getResumeExperienceYears(profile);
    if (jobExp !== null) {
        add('experience', userExp >= jobExp);
    } else {
        add('experience', true);
    }

    const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

    const reasonsUz: string[] = [];
    const reasonsRu: string[] = [];
    if (criteria.location) { reasonsUz.push('Joylashuv mos'); reasonsRu.push('Локация подходит'); }
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
        ageKnown
    };
}

export function matchAndSortJobs(profile: UserProfile, jobs: JobVacancy[]): MatchedJob[] {
    const matched = jobs.map(job => calculateMatchScore(profile, job));

    const filtered = matched.filter(item => (
        item.matchCriteria.location &&
        item.matchCriteria.category &&
        item.matchCriteria.gender &&
        item.matchCriteria.age &&
        item.matchCriteria.education &&
        item.matchCriteria.salary &&
        item.matchCriteria.experience
    ));

    return filtered.sort((a, b) => b.matchScore - a.matchScore);
}

export function getMatchPercentage(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
}
