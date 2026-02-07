import { BotLang } from '../telegram/texts';
import { callDeepSeekText } from './deepseek';

export interface AIRankResult {
    id: string;
    aiScore: number;
    reason?: string | null;
}

interface JobCandidate {
    id: string;
    title?: string | null;
    company_name?: string | null;
    region_name?: string | null;
    district_name?: string | null;
    category_id?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    experience?: string | number | null;
    education_level?: string | number | null;
    gender?: string | number | null;
}

interface ResumeCandidate {
    id: string;
    full_name?: string | null;
    title?: string | null;
    region_id?: number | string | null;
    district_id?: number | string | null;
    category_id?: string | null;
    expected_salary_min?: number | null;
    experience?: string | number | null;
    education_level?: string | number | null;
    gender?: string | number | null;
}

function safeAiScore(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function parseJsonResponse(text: string): any {
    const cleaned = String(text || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        return JSON.parse(objectMatch[0]);
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
    }

    return JSON.parse(cleaned);
}

function buildJobTitle(job: JobCandidate): string {
    return String(job.title || '').trim() || 'N/A';
}

export async function rerankJobsForResumeAI(
    resume: Record<string, any>,
    jobs: JobCandidate[],
    lang: BotLang
): Promise<Map<string, AIRankResult>> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return new Map();
    if (!Array.isArray(jobs) || jobs.length === 0) return new Map();

    const candidates = jobs.slice(0, 40).map(job => ({
        id: String(job.id),
        title: buildJobTitle(job),
        company: job.company_name || null,
        region: job.region_name || null,
        district: job.district_name || null,
        category_id: job.category_id || null,
        salary_min: job.salary_min ?? null,
        salary_max: job.salary_max ?? null,
        experience: job.experience ?? null,
        education_level: job.education_level ?? null,
        gender: job.gender ?? null
    }));

    const prompt = [
        'You are a strict recruitment ranking engine.',
        'Task: re-rank jobs for one candidate resume.',
        'Critical rule: prefer same/close role title first, then location fit, then required criteria fit.',
        'Penalty rule: if role title is clearly different, reduce score hard even if category matches.',
        'Return JSON only.',
        '',
        `language: ${lang}`,
        'resume:',
        JSON.stringify({
            id: String(resume?.id || ''),
            title: resume?.title || null,
            desired_position: resume?.desired_position || null,
            region_id: resume?.region_id || null,
            district_id: resume?.district_id || null,
            category_id: resume?.category_id || null,
            category_ids: Array.isArray(resume?.category_ids) ? resume.category_ids : [],
            expected_salary_min: resume?.expected_salary_min ?? null,
            experience: resume?.experience ?? null,
            education_level: resume?.education_level ?? null,
            gender: resume?.gender ?? null,
            skills: Array.isArray(resume?.skills) ? resume.skills.slice(0, 10) : []
        }),
        '',
        'jobs:',
        JSON.stringify(candidates),
        '',
        'Response schema:',
        '{"results":[{"id":"<job_id>","ai_score":0-100,"reason":"short reason"}]}'
    ].join('\n');

    try {
        const text = await callDeepSeekText(
            prompt,
            900,
            'You rank job relevance. Output strict JSON only.',
            0.1
        );
        const parsed = parseJsonResponse(text);
        const rows = Array.isArray(parsed?.results) ? parsed.results : [];
        const map = new Map<string, AIRankResult>();
        for (const row of rows) {
            const id = String(row?.id || '').trim();
            if (!id) continue;
            map.set(id, {
                id,
                aiScore: safeAiScore(row?.ai_score),
                reason: row?.reason ? String(row.reason).slice(0, 220) : null
            });
        }
        return map;
    } catch (err) {
        console.warn('[AI-RERANK] rerankJobsForResumeAI failed:', err);
        return new Map();
    }
}

export async function rerankResumesForJobAI(
    job: Record<string, any>,
    resumes: ResumeCandidate[],
    lang: BotLang
): Promise<Map<string, AIRankResult>> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return new Map();
    if (!Array.isArray(resumes) || resumes.length === 0) return new Map();

    const candidates = resumes.slice(0, 40).map(resume => ({
        id: String(resume.id),
        full_name: resume.full_name || null,
        title: resume.title || null,
        region_id: resume.region_id ?? null,
        district_id: resume.district_id ?? null,
        category_id: resume.category_id || null,
        expected_salary_min: resume.expected_salary_min ?? null,
        experience: resume.experience ?? null,
        education_level: resume.education_level ?? null,
        gender: resume.gender ?? null
    }));

    const prompt = [
        'You are a strict recruitment ranking engine.',
        'Task: re-rank resumes for one vacancy.',
        'Critical rule: prefer same/close role title first, then location fit, then required criteria fit.',
        'Penalty rule: if role title is clearly different, reduce score hard even if category matches.',
        'Return JSON only.',
        '',
        `language: ${lang}`,
        'vacancy:',
        JSON.stringify({
            id: String(job?.id || ''),
            title: job?.title_uz || job?.title_ru || job?.title || null,
            region_id: job?.region_id ?? null,
            district_id: job?.district_id ?? null,
            category_id: job?.category_id || null,
            salary_min: job?.salary_min ?? null,
            salary_max: job?.salary_max ?? null,
            experience: job?.experience ?? null,
            education_level: job?.education_level ?? null,
            gender: job?.gender ?? null
        }),
        '',
        'resumes:',
        JSON.stringify(candidates),
        '',
        'Response schema:',
        '{"results":[{"id":"<resume_id>","ai_score":0-100,"reason":"short reason"}]}'
    ].join('\n');

    try {
        const text = await callDeepSeekText(
            prompt,
            900,
            'You rank candidate relevance. Output strict JSON only.',
            0.1
        );
        const parsed = parseJsonResponse(text);
        const rows = Array.isArray(parsed?.results) ? parsed.results : [];
        const map = new Map<string, AIRankResult>();
        for (const row of rows) {
            const id = String(row?.id || '').trim();
            if (!id) continue;
            map.set(id, {
                id,
                aiScore: safeAiScore(row?.ai_score),
                reason: row?.reason ? String(row.reason).slice(0, 220) : null
            });
        }
        return map;
    } catch (err) {
        console.warn('[AI-RERANK] rerankResumesForJobAI failed:', err);
        return new Map();
    }
}

