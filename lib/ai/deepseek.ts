/**
 * DeepSeek AI Client for Vacancy Extraction
 * Cost-effective alternative to Gemini for parsing vacancy data
 * API: https://api.deepseek.com (OpenAI-compatible)
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek V3

interface DeepSeekMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface DeepSeekResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Call DeepSeek API
 */
async function callDeepSeek(
    messages: DeepSeekMessage[],
    maxTokens: number = 1000,
    temperature: number = 0.1
): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data: DeepSeekResponse = await response.json();

    if (data.usage) {
        console.log(`[DeepSeek] Tokens: ${data.usage.prompt_tokens} in, ${data.usage.completion_tokens} out`);
    }

    return data.choices[0]?.message?.content || '';
}

export async function callDeepSeekText(
    prompt: string,
    maxTokens: number = 500,
    systemPrompt?: string,
    temperature: number = 0.7
): Promise<string> {
    const messages: DeepSeekMessage[] = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return callDeepSeek(messages, maxTokens, temperature);
}

/**
 * Parse JSON from DeepSeek response
 */
function parseDeepSeekJson(text: string): unknown {
    // Remove markdown code blocks if present
    let cleaned = text
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/gi, '')
        .trim();

    // Try to find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    }

    try {
        return JSON.parse(cleaned);
    } catch {
        console.error('[DeepSeek] Failed to parse JSON:', text);
        throw new Error('Invalid JSON response from AI');
    }
}

/**
 * Extracted vacancy sections structure
 */
export interface VacancySections {
    talablar: string[];      // Requirements
    ish_vazifalari: string[]; // Duties
    qulayliklar: string[];    // Benefits/conditions
    tillar: string[];         // Languages
    skills: string[];         // Skills
}

/**
 * Extracted vacancy metadata (matches osonish format)
 */
export interface VacancyMeta {
    vacancy_count?: number;
    experience?: string;          // Filter: no_experience, 1_3, 3_6, 6_plus
    payment_type?: string;        // monthly, daily, hourly, contract
    employment_type?: string;     // Filter: full_time, part_time, contract, internship, remote
    work_mode?: string;           // onsite, remote, hybrid
    working_days?: string;        // Dushanba-Juma, haftasiga 6 kun
    working_hours?: string;       // 09:00-18:00
    probation_period?: string;    // 3 oy, yo'q
    education?: string;           // Alternative key for education level
    education_level?: string;     // Filter: secondary, vocational, higher, master
    gender?: string;              // Filter: male, female, any
    age_min?: number;
    age_max?: number;
}

/**
 * Full extraction result
 */
export interface VacancyExtraction {
    meta: VacancyMeta;
    sections: VacancySections;
}

/**
 * Extracted resume metadata
 */
export interface ResumeExtraction {
    title?: string;
    about?: string;
    skills: string[];
}

/**
 * Clean HTML text from garbage before AI processing
 */
export function cleanHtmlForAI(text: string): string {
    return text
        // Remove login prompts
        .replace(/Rezyume jo['ʻ]natish uchun tizimga kiring/gi, '')
        .replace(/Kirish.*?tizimga/gi, '')
        // Remove generic service lines
        .replace(/Ma['']lumot xizmati.*?gacha\./gi, '')
        // Remove share buttons text
        .replace(/Vakansiyani bo['ʻ]lishish/gi, '')
        .replace(/Telegramda bo['ʻ]lishish/gi, '')
        // Remove HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract structured vacancy data using DeepSeek
 */
export async function extractVacancyData(
    rawText: string,
    title?: string,
    companyName?: string
): Promise<VacancyExtraction> {
    const emptyResult: VacancyExtraction = {
        meta: {},
        sections: {
            talablar: [],
            ish_vazifalari: [],
            qulayliklar: [],
            tillar: [],
            skills: []
        }
    };

    // Clean text first
    const cleanedText = cleanHtmlForAI(rawText);

    if (!cleanedText || cleanedText.length < 50) {
        console.log('[DeepSeek] Text too short after cleaning:', cleanedText.length);
        return emptyResult;
    }

    console.log(`[DeepSeek] Processing ${cleanedText.length} chars`);

    const systemPrompt = `You are a vacancy parser for Uzbekistan job site. Extract structured data from vacancy text.
Return ONLY valid JSON, no markdown. Keep response SHORT.

RULES:
- Extract ONLY what is explicitly stated in the text
- Use null if field is not mentioned
- Use EXACT enum values as specified
- For age: extract numbers like "18-35 yosh" → age_min:18, age_max:35
- For schedule: extract like "09:00-18:00" or "Dushanba-Juma"`;

    const userPrompt = `Parse this vacancy:
${title ? `Title: ${title}` : ''}
${companyName ? `Company: ${companyName}` : ''}
---
${cleanedText.slice(0, 2500)}
---

Return JSON (EXACT enum values):
{
  "meta": {
    "vacancy_count": number | null,
    "experience": "no_experience" | "1_3" | "3_6" | "6_plus" | null,
    "payment_type": "monthly" | "daily" | "hourly" | "contract" | null,
    "employment_type": "full_time" | "part_time" | "contract" | "internship" | "remote" | null,
    "work_mode": "onsite" | "remote" | "hybrid" | null,
    "working_days": "string like 'Dushanba-Juma' or 'haftasiga 6 kun'" | null,
    "working_hours": "string like '09:00-18:00'" | null,
    "probation_period": "string like '3 oy' or 'yo'q'" | null,
    "education": "secondary" | "vocational" | "higher" | "master" | null,
    "gender": "male" | "female" | "any" | null,
    "age_min": number | null,
    "age_max": number | null
  },
  "sections": {
    "talablar": ["requirement 1", "requirement 2"],
    "ish_vazifalari": ["duty 1", "duty 2"],
    "qulayliklar": ["benefit 1", "benefit 2"]
  }
}`;

    try {
        const response = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], 800);

        const parsed = parseDeepSeekJson(response) as any;

        // Validate arrays
        const validateArray = (arr: any): string[] =>
            Array.isArray(arr) ? arr.filter((s: any) => typeof s === 'string' && s.trim().length > 0) : [];

        const result: VacancyExtraction = {
            meta: {
                vacancy_count: typeof parsed.meta?.vacancy_count === 'number' ? parsed.meta.vacancy_count : undefined,
                experience: parsed.meta?.experience || undefined,
                payment_type: parsed.meta?.payment_type || undefined,
                employment_type: parsed.meta?.employment_type || undefined,
                work_mode: parsed.meta?.work_mode || undefined,
                working_days: parsed.meta?.working_days || undefined,
                working_hours: parsed.meta?.working_hours || undefined,
                probation_period: parsed.meta?.probation_period || undefined,
                education_level: parsed.meta?.education || undefined,
                gender: parsed.meta?.gender || undefined,
                age_min: typeof parsed.meta?.age_min === 'number' ? parsed.meta.age_min : undefined,
                age_max: typeof parsed.meta?.age_max === 'number' ? parsed.meta.age_max : undefined,
            },
            sections: {
                talablar: validateArray(parsed.sections?.talablar),
                ish_vazifalari: validateArray(parsed.sections?.ish_vazifalari),
                qulayliklar: validateArray(parsed.sections?.qulayliklar),
                tillar: [],
                skills: [],
            }
        };

        console.log(`[DeepSeek] Extracted: ${result.sections.talablar.length} talablar, ${result.sections.ish_vazifalari.length} vazifalar, ${result.sections.qulayliklar.length} qulayliklar`);

        return result;

    } catch (err: any) {
        console.error('[DeepSeek] Extraction failed:', err.message);
        return emptyResult;
    }
}

/**
 * Extract resume summary and skills using DeepSeek
 */
export async function extractResumeData(
    rawText: string,
    titleHint?: string
): Promise<ResumeExtraction> {
    const emptyResult: ResumeExtraction = {
        title: undefined,
        about: undefined,
        skills: []
    };

    const cleanedText = cleanHtmlForAI(rawText);
    if (!cleanedText || cleanedText.length < 40) {
        return emptyResult;
    }

    const systemPrompt = `You are a resume assistant for Uzbekistan. Extract a short professional \"about\" and key skills.
Return ONLY valid JSON, no markdown. Keep it concise.`;

    const userPrompt = `Parse this resume text and return JSON:
${titleHint ? `Title hint: ${titleHint}` : ''}
---
${cleanedText.slice(0, 2000)}
---

Return JSON:
{
  "title": "short position title or null",
  "about": "3-4 sentence professional summary in Uzbek (latin) or Russian depending on input",
  "skills": ["skill 1", "skill 2", "skill 3"]
}`;

    try {
        const response = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], 500);

        const parsed = parseDeepSeekJson(response) as any;
        const skills = Array.isArray(parsed.skills)
            ? parsed.skills.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
            : [];

        return {
            title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
            about: typeof parsed.about === 'string' ? parsed.about.trim() : undefined,
            skills
        };
    } catch (err: any) {
        console.error('[DeepSeek] Resume extraction failed:', err?.message || err);
        return emptyResult;
    }
}

/**
 * Check if DeepSeek API is available
 */
export async function checkDeepSeekHealth(): Promise<boolean> {
    try {
        const response = await callDeepSeek([
            { role: 'user', content: 'Say "ok"' }
        ], 10);
        return response.length > 0;
    } catch {
        return false;
    }
}
