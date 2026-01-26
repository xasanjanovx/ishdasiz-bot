/**
 * AI Helper for Telegram Bot
 * Uses Gemini 2.5 Flash for resume generation and job matching
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ProfileData {
    full_name?: string;
    phone?: string;
    city?: string;
    region_name?: string;
    district_name?: string;
    position?: string;
    expected_salary_min?: number;
    expected_salary_max?: number;
    experience_years?: number;
    education?: string;
    skills?: string[];
    about?: string;
}

interface ResumeGenerationResult {
    success: boolean;
    summary?: string;
    skills?: string[];
    experience?: string;
    education?: string;
    error?: string;
}

/**
 * Generate resume content using Gemini 2.5 Flash
 */
export async function generateResumeWithAI(
    profile: ProfileData,
    lang: 'uz' | 'ru'
): Promise<ResumeGenerationResult> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = lang === 'ru'
            ? buildRussianPrompt(profile)
            : buildUzbekPrompt(profile);

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse the structured response
        const parsed = parseAIResponse(text);

        return {
            success: true,
            ...parsed
        };

    } catch (error) {
        console.error('AI Resume generation error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

function buildUzbekPrompt(profile: ProfileData): string {
    return `Siz professional rezyume yozuvchi sifatida ishlaysiz.

Quyidagi ma'lumotlar asosida qisqa va professional rezyume matni yarating:

Ism: ${profile.full_name || "Ko'rsatilmagan"}
Shahar: ${profile.city || profile.region_name || "Ko'rsatilmagan"}
Lavozim: ${profile.position || "Ko'rsatilmagan"}
Maosh kutilmoqda: ${profile.expected_salary_min ? formatSalary(profile.expected_salary_min) : "Ko'rsatilmagan"}
Tajriba: ${profile.experience_years ? `${profile.experience_years} yil` : "Ko'rsatilmagan"}
Ta'lim: ${profile.education || "Ko'rsatilmagan"}
Qo'shimcha: ${profile.about || "—"}

Javobni quyidagi formatda bering:

QISQACHA:
[2-3 qator professional xulosa]

KO'NIKMALAR:
[vergul bilan ajratilgan ko'nikmalar ro'yxati]

TAJRIBA:
[Qisqa tajriba tavsifi]

TA'LIM:
[Ta'lim haqida]

Faqat o'zbek tilida yozing. Professional va aniq bo'ling.`;
}

function buildRussianPrompt(profile: ProfileData): string {
    return `Вы работаете как профессиональный составитель резюме.

На основе следующих данных создайте краткое профессиональное резюме:

Имя: ${profile.full_name || "Не указано"}
Город: ${profile.city || profile.region_name || "Не указано"}
Должность: ${profile.position || "Не указано"}
Ожидаемая зарплата: ${profile.expected_salary_min ? formatSalary(profile.expected_salary_min) : "Не указано"}
Опыт: ${profile.experience_years ? `${profile.experience_years} лет` : "Не указано"}
Образование: ${profile.education || "Не указано"}
Дополнительно: ${profile.about || "—"}

Ответьте в следующем формате:

КРАТКОЕ ОПИСАНИЕ:
[2-3 строки профессионального резюме]

НАВЫКИ:
[список навыков через запятую]

ОПЫТ:
[краткое описание опыта]

ОБРАЗОВАНИЕ:
[об образовании]

Пишите только на русском языке. Будьте профессиональны и конкретны.`;
}

function parseAIResponse(text: string): Partial<ResumeGenerationResult> {
    const sections = {
        summary: '',
        skills: [] as string[],
        experience: '',
        education: ''
    };

    // Parse summary
    const summaryMatch = text.match(/(?:QISQACHA|КРАТКОЕ ОПИСАНИЕ):\s*([\s\S]*?)(?:\n\n|KO'NIKMALAR|НАВЫКИ)/i);
    if (summaryMatch) {
        sections.summary = summaryMatch[1].trim();
    }

    // Parse skills
    const skillsMatch = text.match(/(?:KO'NIKMALAR|НАВЫКИ):\s*([\s\S]*?)(?:\n\n|TAJRIBA|ОПЫТ)/i);
    if (skillsMatch) {
        sections.skills = skillsMatch[1]
            .split(/[,،;]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    // Parse experience
    const expMatch = text.match(/(?:TAJRIBA|ОПЫТ):\s*([\s\S]*?)(?:\n\n|TA'LIM|ОБРАЗОВАНИЕ|$)/i);
    if (expMatch) {
        sections.experience = expMatch[1].trim();
    }

    // Parse education
    const eduMatch = text.match(/(?:TA'LIM|ОБРАЗОВАНИЕ):\s*([\s\S]*?)$/i);
    if (eduMatch) {
        sections.education = eduMatch[1].trim();
    }

    return sections;
}

function formatSalary(amount: number): string {
    if (amount >= 1000000) {
        return `${(amount / 1000000).toFixed(1)} mln so'm`;
    }
    return `${amount.toLocaleString()} so'm`;
}

/**
 * Generate job search suggestions based on profile
 */
export async function generateSearchSuggestions(
    profile: ProfileData,
    lang: 'uz' | 'ru'
): Promise<string[]> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = lang === 'ru'
            ? `На основе профиля (должность: ${profile.position || 'не указана'}, город: ${profile.city || 'не указан'}), предложите 3 похожие должности для поиска работы. Ответьте только списком через запятую.`
            : `Profil asosida (lavozim: ${profile.position || "ko'rsatilmagan"}, shahar: ${profile.city || "ko'rsatilmagan"}), ish qidirish uchun 3 ta o'xshash lavozim taklif qiling. Faqat vergul bilan ajratilgan ro'yxat bering.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        return text.split(/[,،;]/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 3);

    } catch (error) {
        console.error('Search suggestions error:', error);
        return [];
    }
}
