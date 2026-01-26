/**
 * Job Matcher - Weighted Scoring Algorithm
 * Includes strict filtering and explanation generation.
 */

export interface UserProfile {
    region_id?: number | string;
    district_id?: number | string;
    category_id?: string;
    expected_salary_min?: number;
    expected_salary_max?: number;
    experience_level?: string;
    employment_type?: string;
    skills?: string[]; // Added skills
}

export interface JobVacancy {
    id: string;
    title_uz?: string;
    title_ru?: string;
    region_id?: number | string;
    district_id?: number | string;
    category_id?: string;
    salary_min?: number;
    salary_max?: number;
    experience_years?: number;
    employment_type?: string;
    [key: string]: any;
}

export interface MatchExplanation {
    uz: string;
    ru: string;
}

export interface MatchedJob extends JobVacancy {
    matchScore: number;
    explanation: MatchExplanation;
}

// Neighbor regions map (IDs aligned with current regions table)
const NEIGHBOR_REGIONS: Record<number, number[]> = {
    1: [2],        // Toshkent shahri -> Toshkent viloyati
    2: [1, 6, 12], // Toshkent viloyati -> Toshkent shahri, Jizzax, Sirdaryo
    3: [5, 8],     // Andijon -> Farg'ona, Namangan
    4: [9, 10],    // Buxoro -> Navoiy, Qashqadaryo
    5: [3, 8],     // Farg'ona -> Andijon, Namangan
    6: [11, 12, 2],// Jizzax -> Samarqand, Sirdaryo, Toshkent viloyati
    7: [9, 14],    // Xorazm -> Navoiy, Qoraqalpog'iston
    8: [3, 5],     // Namangan -> Andijon, Farg'ona
    9: [4, 7],     // Navoiy -> Buxoro, Xorazm
    10: [4, 13, 11], // Qashqadaryo -> Buxoro, Surxondaryo, Samarqand
    11: [6, 10],   // Samarqand -> Jizzax, Qashqadaryo
    12: [6, 2],    // Sirdaryo -> Jizzax, Toshkent viloyati
    13: [10],      // Surxondaryo -> Qashqadaryo
    14: [7, 9]     // Qoraqalpog'iston -> Xorazm, Navoiy
};

function toNumber(value: number | string | undefined): number | null {
    if (value === undefined || value === null) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

const EXPERIENCE_YEARS: Record<string, number> = {
    'no_experience': 0, '1_year': 1, '3_years': 3, '5_years': 5, '10_years': 10
};

export function calculateMatchScore(profile: UserProfile, job: JobVacancy): MatchedJob {
    let score = 0;
    const reasonsUz: string[] = [];
    const reasonsRu: string[] = [];

    // 1. Category (Strict-ish) - 30 points
    if (profile.category_id && job.category_id) {
        if (profile.category_id === job.category_id) {
            score += 30;
            reasonsUz.push("✅ Soha mos");
            reasonsRu.push("✅ Сфера подходит");
        } else {
            // Mismatching category is bad
            score -= 10;
        }
    }

    // 2. Location - 30 points
    const pRegion = toNumber(profile.region_id);
    const jRegion = toNumber(job.region_id);
    const pDist = profile.district_id ? String(profile.district_id) : null;
    const jDist = job.district_id ? String(job.district_id) : null;

    if (pRegion && jRegion) {
        if (pDist && jDist && pDist === jDist) {
            score += 30;
            reasonsUz.push("📍 Tuman mos");
            reasonsRu.push("📍 Район совпадает");
        } else if (pRegion === jRegion) {
            score += 20;
            reasonsUz.push("📍 Viloyat mos");
            reasonsRu.push("📍 Регион совпадает");
        } else {
            const neighbors = NEIGHBOR_REGIONS[pRegion] || [];
            if (neighbors.includes(jRegion)) {
                score += 10;
                reasonsUz.push("🚗 Qo'shni viloyat");
                reasonsRu.push("🚗 Соседний регион");
            } else if (job.employment_type !== 'remote') {
                // Far region and NOT remote -> Penalty
                score -= 20;
            }
        }
    }

    // 3. Salary - 20 points
    if (profile.expected_salary_min && job.salary_min) {
        if (job.salary_max && job.salary_max >= profile.expected_salary_min) {
            score += 20;
            reasonsUz.push("💰 Maosh to'g'ri");
            reasonsRu.push("💰 Зарплата подходит");
        } else if (job.salary_min >= profile.expected_salary_min * 0.8) {
            score += 10;
        }
    }

    // 4. Experience - 10 points
    if (job.experience_years !== undefined) {
        const userYears = EXPERIENCE_YEARS[profile.experience_level || 'no_experience'] || 0;
        if (userYears >= job.experience_years) {
            score += 10;
        }
    }

    // 5. Employment Type - 10 points
    if (profile.employment_type === job.employment_type) {
        score += 10;
        reasonsUz.push("⏰ Grafik mos");
        reasonsRu.push("⏰ График подходит");
    }

    // Filter Logic:
    // If strict mismatch (Category mismatch AND Location mismatch), score will be low.

    // Normalize Score 0-100
    score = Math.min(100, Math.max(0, score));

    return {
        ...job,
        matchScore: score,
        explanation: {
            uz: reasonsUz.length > 0 ? reasonsUz.join(", ") : "Umumiy moslik",
            ru: reasonsRu.length > 0 ? reasonsRu.join(", ") : "Общее совпадение"
        }
    };
}

export function matchAndSortJobs(profile: UserProfile, jobs: JobVacancy[]): MatchedJob[] {
    const matched = jobs.map(job => calculateMatchScore(profile, job));

    // Strict Filter: 
    // Remove if score < 30 (Arbitrary threshold for "Relevance")
    // Unless it's a very small pool, but user asked for "Strict".
    const filtered = matched.filter(j => j.matchScore >= 30);

    return filtered.sort((a, b) => b.matchScore - a.matchScore);
}

export function getMatchPercentage(score: number): number {
    return score;
}
