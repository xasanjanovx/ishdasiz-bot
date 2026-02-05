/**
 * Telegram Bot - Complete Resume Creation Flow
 * Handles all incoming updates and state transitions
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendMessage, editMessage, answerCallbackQuery, isUserSubscribed, sendLocation, deleteMessage } from './telegram-api';
import * as keyboards from './keyboards';
import {
    botTexts,
    BotLang,
    formatJobCard,
    formatFullJobCard,
    EXPERIENCE_LABELS
} from './texts';
import {
    getWorkModeLabel,
    getWorkingDaysLabel,
    getExperienceLabel,
    getEducationLabel,
    getGenderLabel
} from '../mappings';
import { matchAndSortJobs, MatchedJob, calculateMatchScore } from './job-matcher';
import { extractVacancyData } from '../ai/deepseek';
import { checkForAbuse } from '../ai/moderation';
import { REGION_COORDINATES } from '../constants';
import bcrypt from 'bcryptjs';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ============================================
// FSM States
// ============================================
export enum BotState {
    START = 'start',
    AWAITING_LANG = 'awaiting_lang',
    AWAITING_PHONE = 'awaiting_phone',
    AWAITING_OTP = 'awaiting_otp',
    AWAITING_PASSWORD = 'awaiting_password',

    // Auth & Role
    SELECTING_ROLE = 'selecting_role',

    // Employer Flow
    EMPLOYER_MAIN_MENU = 'employer_main_menu',
    EMPLOYER_PROFILE_COMPANY = 'employer_profile_company',
    EMPLOYER_PROFILE_DIRECTOR = 'employer_profile_director',
    EMPLOYER_PROFILE_INDUSTRY = 'employer_profile_industry',
    EMPLOYER_PROFILE_SIZE = 'employer_profile_size',
    EMPLOYER_PROFILE_REGION = 'employer_profile_region',
    EMPLOYER_PROFILE_DISTRICT = 'employer_profile_district',
    EMPLOYER_PROFILE_ADDRESS = 'employer_profile_address',
    EMPLOYER_PROFILE_DESCRIPTION = 'employer_profile_description',
    POSTING_JOB_TITLE = 'posting_job_title',
    POSTING_JOB_CATEGORY = 'posting_job_category',
    POSTING_JOB_SALARY = 'posting_job_salary',
    POSTING_JOB_SALARY_MAX = 'posting_job_salary_max',
    POSTING_JOB_REGION = 'posting_job_region',
    POSTING_JOB_DISTRICT = 'posting_job_district',
    POSTING_JOB_ADDRESS = 'posting_job_address',
    POSTING_JOB_WORK_MODE = 'posting_job_work_mode',
    POSTING_JOB_EMPLOYMENT = 'posting_job_employment',
    POSTING_JOB_WORK_DAYS = 'posting_job_work_days',
    POSTING_JOB_WORK_HOURS = 'posting_job_work_hours',
    POSTING_JOB_EXPERIENCE = 'posting_job_experience',
    POSTING_JOB_EDUCATION = 'posting_job_education',
    POSTING_JOB_GENDER = 'posting_job_gender',
    POSTING_JOB_AGE = 'posting_job_age',
    POSTING_JOB_LANGUAGES = 'posting_job_languages',
    POSTING_JOB_BENEFITS = 'posting_job_benefits',
    POSTING_JOB_HR_NAME = 'posting_job_hr_name',
    POSTING_JOB_CONTACT_PHONE = 'posting_job_contact_phone',
    POSTING_JOB_DESCRIPTION = 'posting_job_description',
    POSTING_JOB_CONFIRM = 'posting_job_confirm',
    ENTERING_COMPANY_NAME = 'entering_company_name',

    // Resume Creation Flow
    REQUESTING_LOCATION = 'requesting_location',
    SELECTING_REGION = 'selecting_region',
    SELECTING_DISTRICT = 'selecting_district',
    SELECTING_CATEGORY = 'selecting_category',
    SELECTING_EXPERIENCE = 'selecting_experience',
    SELECTING_EDUCATION = 'selecting_education',
    SELECTING_GENDER = 'selecting_gender',
    ENTERING_BIRTH_DATE = 'entering_birth_date',
    SELECTING_SPECIAL = 'selecting_special',
    SELECTING_SALARY = 'selecting_salary',
    SELECTING_SALARY_MAX = 'selecting_salary_max',
    SELECTING_EMPLOYMENT = 'selecting_employment',
    SELECTING_WORK_MODE = 'selecting_work_mode',
    SELECTING_WORKING_DAYS = 'selecting_working_days',
    SELECTING_SUBSCRIPTION_FREQUENCY = 'selecting_subscription_frequency',
    ENTERING_TITLE = 'entering_title',
    ENTERING_NAME = 'entering_name',
    ENTERING_ABOUT = 'entering_about',
    ADDING_SKILLS = 'adding_skills',
    ENTERING_WORKPLACE = 'entering_workplace',
    ENTERING_WORKPLACE_YEARS = 'entering_workplace_years',
    ENTERING_WORKPLACE_END_YEAR = 'entering_workplace_end_year',
    ENTERING_EDUCATION_PLACE = 'entering_education_place',
    ENTERING_EDUCATION_START_YEAR = 'entering_education_start_year',
    ENTERING_EDUCATION_END_YEAR = 'entering_education_end_year',
    RESUME_COMPLETE = 'resume_complete',
    AI_JOB_INPUT = 'ai_job_input',
    AI_RESUME_INPUT = 'ai_resume_input',

    // Main App
    MAIN_MENU = 'main_menu',
    BROWSING_JOBS = 'browsing_jobs',
    VIEWING_PROFILE = 'viewing_profile',
    EDITING_PROFILE = 'editing_profile',
    VIEWING_RESUME = 'viewing_resume',
    SETTINGS = 'settings'
}

// ============================================
// Types
// ============================================
export interface TelegramSession {
    id: string;
    telegram_user_id: number;
    user_id: string | null;
    state: BotState;
    data: Record<string, any>;
    phone: string | null;
    otp_code: string | null;
    otp_expires_at: string | null;
    lang: BotLang;
    active_role?: 'job_seeker' | 'employer';
}

export interface TelegramMessage {
    message_id: number;
    chat: { id: number };
    from: { id: number; first_name?: string };
    text?: string;
    contact?: { phone_number: string };
    location?: { latitude: number; longitude: number };
}

export interface TelegramCallbackQuery {
    id: string;
    from: { id: number };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
}

interface RegionRef {
    id: number;
    name_uz: string;
    name_ru: string;
    slug?: string | null;
}

interface CategoryRef {
    id: string;
    name_uz: string;
    name_ru: string;
    icon?: string;
    sort_order?: number | null;
}

// ============================================
// Bot Class
// ============================================
export class TelegramBot {
    private supabase: SupabaseClient;
    private regionsCache: { data: RegionRef[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private categoriesCache: { data: CategoryRef[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private readonly referenceTtlMs = 10 * 60 * 1000;

    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    private isCacheFresh(loadedAt: number): boolean {
        return Date.now() - loadedAt < this.referenceTtlMs;
    }

    private async getRegions(): Promise<RegionRef[]> {
        if (this.regionsCache.data.length > 0 && this.isCacheFresh(this.regionsCache.loadedAt)) {
            return this.regionsCache.data;
        }

        const { data, error } = await this.supabase
            .from('regions')
            .select('id, name_uz, name_ru, slug')
            .order('name_uz', { ascending: true });

        if (error) {
            console.error('[BOT] Failed to load regions:', error);
            return this.regionsCache.data;
        }

        this.regionsCache = { data: data || [], loadedAt: Date.now() };
        return this.regionsCache.data;
    }

    private async getCategories(): Promise<CategoryRef[]> {
        if (this.categoriesCache.data.length > 0 && this.isCacheFresh(this.categoriesCache.loadedAt)) {
            const cached = this.categoriesCache.data;
            const hasFinance = cached.some(cat => cat.id === 'a0000006-0006-4000-8000-000000000006');
            if (hasFinance) return cached;
            const ensured = await this.ensureRequiredCategories(cached);
            this.categoriesCache = { data: ensured, loadedAt: Date.now() };
            return this.categoriesCache.data;
        }

        const { data, error } = await this.supabase
            .from('categories')
            .select('id, name_uz, name_ru, icon, sort_order')
            .order('sort_order', { ascending: true });

        if (error) {
            const fallback = await this.supabase
                .from('categories')
                .select('id, name_uz, name_ru, icon')
                .order('name_uz', { ascending: true });

            if (fallback.error) {
                console.error('[BOT] Failed to load categories:', error);
                return this.categoriesCache.data;
            }

            const normalizedFallback = (fallback.data || []).map((cat: any) => ({
                ...cat,
                icon: typeof cat.icon === 'string' ? cat.icon : undefined
            })) as CategoryRef[];
            const filteredFallback = normalizedFallback.filter(cat => {
                const nameUz = (cat.name_uz || '').toLowerCase();
                const nameRu = (cat.name_ru || '').toLowerCase();
                return cat.id !== 'a0000011-0011-4000-8000-000000000011'
                    && !nameUz.includes('boshqa')
                    && !nameRu.includes('другое');
            });
            const ensuredFallback = await this.ensureRequiredCategories(filteredFallback);
            this.categoriesCache = { data: ensuredFallback, loadedAt: Date.now() };
            return this.categoriesCache.data;
        }

        const normalized = (data || []).map((cat: any) => ({
            ...cat,
            icon: typeof cat.icon === 'string' ? cat.icon : undefined
        })) as CategoryRef[];
        const filtered = normalized.filter(cat => {
            const nameUz = (cat.name_uz || '').toLowerCase();
            const nameRu = (cat.name_ru || '').toLowerCase();
            return cat.id !== 'a0000011-0011-4000-8000-000000000011'
                && !nameUz.includes('boshqa')
                && !nameRu.includes('другое');
        });
        const ensured = await this.ensureRequiredCategories(filtered);
        this.categoriesCache = { data: ensured, loadedAt: Date.now() };
        return this.categoriesCache.data;
    }

    private async ensureRequiredCategories(categories: CategoryRef[]): Promise<CategoryRef[]> {
        const required: CategoryRef[] = [
            {
                id: 'a0000006-0006-4000-8000-000000000006',
                name_uz: 'Moliya, iqtisod, boshqaruv',
                name_ru: 'Финансы, экономика, управление',
                icon: 'Wallet',
                sort_order: 6
            }
        ];

        const missing = required.filter(req => !categories.some(cat => cat.id === req.id));
        if (!missing.length) return categories;

        try {
            await this.supabase
                .from('categories')
                .upsert(missing.map(cat => ({
                    id: cat.id,
                    name_uz: cat.name_uz,
                    name_ru: cat.name_ru,
                    icon: cat.icon || null,
                    sort_order: cat.sort_order ?? null
                })), { onConflict: 'id' });
        } catch (err) {
            console.warn('[BOT] Failed to upsert required categories:', err);
        }

        return [...categories, ...missing];
    }

    private async getDistrictJobCounts(regionId: number): Promise<Record<string, number>> {
        const toCounts = (rows: any[] | null | undefined): Record<string, number> => {
            const counts: Record<string, number> = {};
            for (const row of rows || []) {
                const districtId = row?.district_id;
                if (districtId === null || districtId === undefined) continue;
                const key = String(districtId);
                counts[key] = (counts[key] || 0) + 1;
            }
            return counts;
        };

        const pageSize = 1000;
        const allRows: any[] = [];
        let offset = 0;

        while (true) {
            const query = this.supabase
                .from('jobs')
                .select('district_id')
                .eq('region_id', regionId)
                .or('is_active.eq.true,status.eq.active,status.eq.published,status.eq.open,source_status.eq.active')
                .range(offset, offset + pageSize - 1);

            const { data, error } = await query;
            if (error) {
                console.error('[BOT] district counts query error:', error);
                break;
            }
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < pageSize) break;
            offset += pageSize;
        }

        if (allRows.length === 0) {
            const fallbackRows: any[] = [];
            let fallbackOffset = 0;
            while (true) {
                const fallback = await this.supabase
                    .from('jobs')
                    .select('district_id')
                    .eq('region_id', regionId)
                    .range(fallbackOffset, fallbackOffset + pageSize - 1);
                if (!fallback.data || fallback.data.length === 0) break;
                fallbackRows.push(...fallback.data);
                if (fallback.data.length < pageSize) break;
                fallbackOffset += pageSize;
            }
            return toCounts(fallbackRows);
        }

        return toCounts(allRows);
    }

    private async getCategoryJobCounts(regionId?: number | null, districtId?: number | null): Promise<Record<string, number>> {
        const toCounts = (rows: any[] | null | undefined): Record<string, number> => {
            const counts: Record<string, number> = {};
            for (const row of rows || []) {
                const categoryId = row?.category_id;
                if (!categoryId) continue;
                const key = String(categoryId);
                counts[key] = (counts[key] || 0) + 1;
            }
            return counts;
        };

        const applyFilters = (queryBuilder: any) => {
            let scoped = queryBuilder;
            if (regionId !== null && regionId !== undefined) scoped = scoped.eq('region_id', regionId);
            if (districtId !== null && districtId !== undefined) scoped = scoped.eq('district_id', districtId);
            return scoped;
        };

        const pageSize = 1000;
        const allRows: any[] = [];
        let offset = 0;

        while (true) {
            const primary = applyFilters(
                this.supabase
                    .from('jobs')
                    .select('category_id')
                    .or('is_active.eq.true,status.eq.active,status.eq.published,status.eq.open,source_status.eq.active')
            ).range(offset, offset + pageSize - 1);

            const { data, error } = await primary;
            if (error) {
                console.error('[BOT] category counts query error:', error);
                break;
            }
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < pageSize) break;
            offset += pageSize;
        }

        if (allRows.length === 0) {
            const fallbackRows: any[] = [];
            let fallbackOffset = 0;
            while (true) {
                const fallback = applyFilters(
                    this.supabase
                        .from('jobs')
                        .select('category_id')
                ).range(fallbackOffset, fallbackOffset + pageSize - 1);
                if (!fallback.data || fallback.data.length === 0) break;
                fallbackRows.push(...fallback.data);
                if (fallback.data.length < pageSize) break;
                fallbackOffset += pageSize;
            }
            return toCounts(fallbackRows);
        }

        return toCounts(allRows);
    }

    private sortDistrictsByDemand(
        districts: Array<{ id: string | number; name_uz: string; name_ru: string }>,
        counts: Record<string, number>
    ): Array<{ id: string | number; name_uz: string; name_ru: string }> {
        return [...districts].sort((a, b) => {
            const countA = counts[String(a.id)] || 0;
            const countB = counts[String(b.id)] || 0;
            if (countA !== countB) return countB - countA;
            return a.name_uz.localeCompare(b.name_uz, 'uz');
        });
    }

    private sortCategoriesByDemand(
        categories: CategoryRef[],
        counts: Record<string, number>
    ): CategoryRef[] {
        return [...categories].sort((a, b) => {
            const countA = counts[String(a.id)] || 0;
            const countB = counts[String(b.id)] || 0;
            if (countA !== countB) return countB - countA;
            const orderA = typeof a.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
            const orderB = typeof b.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return a.name_uz.localeCompare(b.name_uz, 'uz');
        });
    }

    private getCategoryOptionsFromSession(session: TelegramSession, fallback: CategoryRef[]): CategoryRef[] {
        const options = session.data?.category_options;
        const normalize = (list: CategoryRef[]): CategoryRef[] => list.filter(cat => {
            const nameUz = (cat.name_uz || '').toLowerCase();
            const nameRu = (cat.name_ru || '').toLowerCase();
            return cat.id !== 'a0000011-0011-4000-8000-000000000011'
                && !nameUz.includes('boshqa')
                && !nameRu.includes('другое');
        });
        const required: CategoryRef[] = [
            {
                id: 'a0000006-0006-4000-8000-000000000006',
                name_uz: 'Moliya, iqtisod, boshqaruv',
                name_ru: 'Финансы, экономика, управление',
                icon: 'Wallet',
                sort_order: 6
            }
        ];

        if (Array.isArray(options) && options.length > 0) {
            const filtered = normalize(options as CategoryRef[]);
            const merged = [...filtered];
            for (const req of required) {
                if (!merged.some(cat => cat.id === req.id)) merged.push(req);
            }
            for (const cat of fallback) {
                if (!merged.some(item => item.id === cat.id)) merged.push(cat);
            }
            return merged;
        }

        const normalizedFallback = normalize(fallback);
        for (const req of required) {
            if (!normalizedFallback.some(cat => cat.id === req.id)) normalizedFallback.push(req);
        }
        return normalizedFallback;
    }

    private getChannelUsername(): string {
        const raw = process.env.TELEGRAM_CHANNEL_USERNAME || 'ishdasiz';
        return raw.startsWith('@') ? raw.slice(1) : raw;
    }

    private isMenuButtonText(text: string, lang: BotLang): boolean {
        const candidates = [
            lang === 'uz' ? '🔎 Ish topish' : '🔎 Найти работу',
            lang === 'uz' ? '⭐ Saqlanganlar' : '⭐ Сохранённые',
            lang === 'uz' ? '🧾 Rezyume' : '🧾 Резюме',
            lang === 'uz' ? '⚙️ Sozlamalar' : '⚙️ Настройки',
            lang === 'uz' ? '🆘 Yordam' : '🆘 Помощь',
            lang === 'uz' ? '📢 Vakansiya joylash' : '📢 Разместить вакансию',
            lang === 'uz' ? '📋 Mening vakansiyalarim' : '📋 Мои вакансии',
            lang === 'uz' ? '📨 Arizalar' : '📨 Отклики',
            lang === 'uz' ? '📊 Statistika' : '📊 Статистика'
        ];
        return candidates.includes(text);
    }

    private formatChannelText(text: string): string {
        const channelTag = `@${this.getChannelUsername()}`;
        return text.replace(/@ishdasiz\b/g, channelTag);
    }

    private async trackUpdate(session: TelegramSession, updateId?: number, messageId?: number, callbackId?: string): Promise<void> {
        if (!updateId && !messageId && !callbackId) return;

        const data = session.data || {};
        const recentUpdateIds: number[] = Array.isArray(data.recent_update_ids) ? data.recent_update_ids : [];
        const recentMessageIds: number[] = Array.isArray(data.recent_message_ids) ? data.recent_message_ids : [];
        const recentCallbackIds: string[] = Array.isArray(data.recent_callback_ids) ? data.recent_callback_ids : [];

        if (typeof updateId === 'number') {
            recentUpdateIds.unshift(updateId);
        }
        if (typeof messageId === 'number') {
            recentMessageIds.unshift(messageId);
        }
        if (callbackId) {
            recentCallbackIds.unshift(callbackId);
        }

        const updatedData = {
            ...data,
            recent_update_ids: recentUpdateIds.slice(0, 20),
            recent_message_ids: recentMessageIds.slice(0, 20),
            recent_callback_ids: recentCallbackIds.slice(0, 20)
        };

        session.data = updatedData;
    }

    private isDuplicateUpdate(session: TelegramSession, updateId?: number, messageId?: number, callbackId?: string): boolean {
        const data = session.data || {};
        const recentUpdateIds: number[] = Array.isArray(data.recent_update_ids) ? data.recent_update_ids : [];
        const recentMessageIds: number[] = Array.isArray(data.recent_message_ids) ? data.recent_message_ids : [];
        const recentCallbackIds: string[] = Array.isArray(data.recent_callback_ids) ? data.recent_callback_ids : [];

        if (typeof updateId === 'number' && recentUpdateIds.includes(updateId)) return true;
        if (typeof messageId === 'number' && recentMessageIds.includes(messageId)) return true;
        if (callbackId && recentCallbackIds.includes(callbackId)) return true;
        return false;
    }

    private isPasswordState(state: BotState): boolean {
        return state === BotState.AWAITING_PASSWORD || state === BotState.AWAITING_OTP;
    }

    private shouldSkipModeration(state: BotState, text: string): boolean {
        const skipStates = [
            BotState.POSTING_JOB_SALARY,
            BotState.POSTING_JOB_SALARY_MAX,
            BotState.POSTING_JOB_WORK_HOURS,
            BotState.POSTING_JOB_AGE,
            BotState.ENTERING_BIRTH_DATE
        ];
        if (skipStates.includes(state)) return true;
        if (!text) return false;
        const numericLike = /^[\d\s+.,-]+$/.test(text.trim());
        return numericLike && skipStates.includes(state);
    }

    private async sendPrompt(
        chatId: number,
        session: TelegramSession,
        text: string,
        options: { replyMarkup?: any; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' } = {}
    ): Promise<void> {
        const safeText = text && String(text).trim().length > 0 ? text : botTexts.error[session.lang || 'uz'];
        const lastPromptId = session.data?.last_prompt_message_id;
        if (lastPromptId) {
            try {
                await deleteMessage(chatId, lastPromptId);
            } catch (err) {
                // ignore delete errors
            }
        }
        const result = await sendMessage(chatId, safeText, {
            parseMode: options.parseMode ?? 'HTML',
            replyMarkup: options.replyMarkup
        });
        const messageId = result?.message_id;
        if (messageId) {
            const updatedData = { ...session.data, last_prompt_message_id: messageId };
            session.data = updatedData;
            await this.updateSession(session.telegram_user_id, { data: updatedData });
        }
    }

    private async isUserBanned(chatId: number, session: TelegramSession): Promise<boolean> {
        const bannedUntil = session.data?.banned_until;
        if (!bannedUntil) return false;
        const until = new Date(bannedUntil);
        if (Number.isNaN(until.getTime())) return false;
        if (until.getTime() > Date.now()) {
            await sendMessage(chatId, '🚫 Sizning akkauntingiz vaqtinchalik bloklangan.');
            return true;
        }
        return false;
    }

    private async handleModerationBlock(chatId: number, session: TelegramSession, reason?: string): Promise<void> {
        const data = session.data || {};
        const profanityCount = (data.profanity_count || 0) + (reason === 'profanity' ? 1 : 0);
        const updatedData: Record<string, any> = { ...data, profanity_count: profanityCount };

        if (reason === 'profanity' && profanityCount >= 3) {
            const banUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString();
            updatedData.banned_until = banUntil;
            session.data = updatedData;
            await this.updateSession(session.telegram_user_id, { data: updatedData });
            if (session.user_id) {
                await this.supabase.from('users').update({ locked_until: banUntil }).eq('id', session.user_id);
            }
            await sendMessage(chatId, '🚫 Qoidabuzarlik 3 marta aniqlandi. Akkauntingiz bloklandi.');
            return;
        }

        session.data = updatedData;
        await this.updateSession(session.telegram_user_id, { data: updatedData });

        const warning = {
            profanity: {
                uz: 'Hurmatli foydalanuvchi, iltimos, odob doirasida muloqot qiling.',
                ru: 'Пожалуйста, соблюдайте правила общения.'
            },
            injection: {
                uz: "Noto'g'ri so'rov aniqlandi. Iltimos, oddiy tilda yozing.",
                ru: 'Обнаружен некорректный запрос. Пишите обычным языком.'
            },
            spam: {
                uz: "Spam aniqlandi. Iltimos, oddiy so'rov yuboring.",
                ru: 'Обнаружен спам. Отправьте обычный запрос.'
            }
        } as const;

        const lang = session.lang || 'uz';
        if (reason === 'profanity') {
            await sendMessage(chatId, warning.profanity[lang]);
        } else if (reason === 'injection') {
            await sendMessage(chatId, warning.injection[lang]);
        } else if (reason === 'spam') {
            await sendMessage(chatId, warning.spam[lang]);
        } else {
            await sendMessage(chatId, botTexts.error[lang]);
        }
    }

    // ============================================
    // Main Entry Points
    // ============================================
    async handleUpdate(update: any): Promise<void> {
        const message = update?.message;
        const callback = update?.callback_query;
        const updateId = update?.update_id;
        const userId = message?.from?.id ?? callback?.from?.id;
        const messageId = message?.message_id;
        const callbackId = callback?.id;
        const chatType = message?.chat?.type ?? callback?.message?.chat?.type;

        console.log('[BOT] handleUpdate called, userId:', userId, 'hasMessage:', !!message, 'hasCallback:', !!callback);

        if (chatType && chatType !== 'private') {
            console.log('[BOT] Non-private chat update, skipping:', chatType);
            return;
        }

        if (!userId) {
            console.log('[BOT] No userId, skipping');
            return;
        }

        const session = await this.getOrCreateSession(userId);
        if (!session) {
            console.log('[BOT] No session, skipping');
            return;
        }

        console.log('[BOT] Session state:', session.state, 'lang:', session.lang);

        if (this.isDuplicateUpdate(session, updateId, messageId, callbackId)) {
            console.log('[BOT] Duplicate update, skipping');
            return;
        }

        await this.trackUpdate(session, updateId, messageId, callbackId);

        try {
            if (message) {
                console.log('[BOT] Calling handleMessage for text:', message.text?.slice(0, 50));
                await this.handleMessage(message, session);
                if (session.data?.clean_inputs && typeof message.message_id === 'number') {
                    try {
                        await deleteMessage(message.chat.id, message.message_id);
                    } catch {
                        // ignore delete errors
                    }
                }
            } else if (callback) {
                console.log('[BOT] Calling handleCallbackQuery for data:', callback.data);
                await this.handleCallbackQuery(callback, session);
            }
        } catch (err) {
            console.error('[BOT] Error in handleUpdate:', err);
        }
    }

    async handleMessage(msg: TelegramMessage, sessionOverride?: TelegramSession): Promise<void> {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || '';
        const incomingMessageId = typeof msg.message_id === 'number' ? msg.message_id : null;
        const hasUserPayload = Boolean(msg.text || msg.contact || msg.location);

        try {
            const session = sessionOverride || await this.getOrCreateSession(userId);
            if (!session) {
                await sendMessage(chatId, botTexts.error.uz);
                return;
            }
            const lang = session.lang || 'uz';
            const trimmedText = text.trim();

            if (await this.isUserBanned(chatId, session)) {
                return;
            }

            if (trimmedText && !msg.contact && !msg.location && !this.isPasswordState(session.state) && !this.shouldSkipModeration(session.state, trimmedText)) {
                const moderation = checkForAbuse(trimmedText);
                if (!moderation.allowed) {
                    await this.handleModerationBlock(chatId, session, moderation.reason);
                    return;
                }
            }

            if (trimmedText === '/start') {
                await this.handleStart(chatId, session);
                return;
            }
            if (trimmedText === '/help') {
                const isEmployer = session.data?.active_role === 'employer';
                await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                    replyMarkup: isEmployer ? keyboards.employerMainMenuKeyboard(lang) : keyboards.mainMenuKeyboard(lang, 'seeker'),
                    parseMode: 'HTML'
                });
                return;
            }
            if (trimmedText === '/logout') {
                await this.handleLogout(chatId, session);
                return;
            }
            if (trimmedText === '/role') {
                await this.handleRoleSwitch(chatId, session);
                return;
            }
            if (msg.contact) {
                await this.handlePhone(chatId, msg.contact.phone_number, session);
                return;
            }
            if (msg.location) {
                await this.handleLocation(chatId, msg.location, session);
                return;
            }
            await this.handleTextByState(chatId, trimmedText, session);

        } catch (err) {
            console.error('Bot message error:', err);
            const lang = sessionOverride?.lang || 'uz';
            await sendMessage(chatId, botTexts.error[lang]);
        } finally {
            if (incomingMessageId && hasUserPayload) {
                try {
                    await deleteMessage(chatId, incomingMessageId);
                } catch {
                    // ignore
                }
            }
        }
    }

    async handleCallbackQuery(query: TelegramCallbackQuery, sessionOverride?: TelegramSession): Promise<void> {
        const { id, from, message, data } = query;
        if (!message || !data) return;

        try {
            await answerCallbackQuery(id);
            const session = sessionOverride || await this.getOrCreateSession(from.id);
            if (!session) return;
            if (!session.data) session.data = {};

            const chatId = message.chat.id;
            const parts = data.split(':');
            const action = parts[0];
            const value = parts[1];
            const extra = parts.slice(2).join(':');

            switch (action) {
                case 'lang': await this.handleLangSelect(chatId, value as BotLang, session); break;
                case 'auth': await this.handleAuthCallback(chatId, value, session); break;
                case 'role': await this.handleRoleSelect(chatId, value, session); break;
                case 'region': await this.handleRegionSelect(chatId, value, session, message.message_id); break;
                case 'district': await this.handleDistrictSelect(chatId, value, session, message.message_id); break;
                case 'distpage': await this.showDistrictPage(chatId, parseInt(value), session, message.message_id); break;
                case 'category': await this.handleCategorySelect(chatId, value, session, message.message_id); break;
                case 'experience': await this.handleExperienceSelect(chatId, value, session, message.message_id); break;
                case 'education': await this.handleEducationSelect(chatId, value, session, message.message_id); break;
                case 'gender': await this.handleGenderSelect(chatId, value, session, message.message_id); break;
                case 'special': await this.handleSpecialCriteria(chatId, value, session, message.message_id); break;
                case 'salary': await this.handleSalarySelect(chatId, value, session, message.message_id); break;
                case 'jobsalary': await this.handleJobSalaryQuick(chatId, value, session, message.message_id); break;
                case 'jobsalarymax': await this.handleJobSalaryMaxQuick(chatId, value, session, message.message_id); break;
                case 'matchjob': await this.handleMatchJob(chatId, value, session); break;
                case 'jobview': await this.handleEmployerJobView(chatId, value, session); break;
                case 'jobclose': await this.handleEmployerJobClose(chatId, value, session); break;
                case 'appview': await this.handleApplicationView(chatId, value, session); break;
                case 'apps':
                    if (value === 'back') await this.showEmployerApplications(chatId, session);
                    break;
                case 'salarymax': await this.handleSalaryMaxSelect(chatId, value, session, message.message_id); break;
                case 'employment': await this.handleEmploymentSelect(chatId, value, session, message.message_id); break;
                case 'workmode': await this.handleWorkModeSelect(chatId, value, session, message.message_id); break;
                case 'workingdays': await this.handleWorkingDaysSelect(chatId, value, session, message.message_id); break;
                case 'skip': await this.handleSkip(chatId, session); break;
                case 'skills': if (value === 'done') await this.finishSkills(chatId, session); break;
                case 'workplace':
                    if (value === 'add') {
                        await this.setSession(session, {
                            state: BotState.ENTERING_WORKPLACE,
                            data: { ...session.data, workplace_pending: null }
                        });
                        await this.sendPrompt(chatId, session, botTexts.askWorkplace[session.lang], {
                            replyMarkup: keyboards.backKeyboard(session.lang, 'experience')
                        });
                    } else if (value === 'done') {
                        await this.finishWorkplaceStep(chatId, session);
                    }
                    break;
                case 'education':
                    if (value === 'add') {
                        await this.setSession(session, { state: BotState.ENTERING_EDUCATION_PLACE, data: { ...session.data, education_pending: null } });
                        await this.setFlowCancelKeyboard(chatId, session, 'back');
                        await this.sendPrompt(chatId, session, botTexts.askEducationPlace[session.lang], {
                            replyMarkup: keyboards.backKeyboard(session.lang, 'education')
                        });
                    } else if (value === 'done') {
                        await this.finishEducationStep(chatId, session);
                    }
                    break;
                case 'delskill': await this.deleteSkill(chatId, parseInt(value), session); break;
                case 'back': await this.handleBack(chatId, value, session); break;
                case 'menu': if (value === 'main') await this.showMainMenu(chatId, session); break;
                case 'action': await this.handleAction(chatId, value, session); break;
                case 'job':
                    if (value === 'publish') await this.handleJobPublish(chatId, session);
                    else await this.handleJobNavigation(chatId, value, session, message.message_id);
                    break;
                case 'jobmode':
                    await this.handleJobCreateMode(chatId, value, session);
                    break;
                case 'fav': await this.handleFavorite(chatId, value, session); break;
                case 'apply': await this.handleJobApply(chatId, value, session); break;
                case 'profile': await this.handleProfileAction(chatId, value, session); break;
                case 'settings':
                    if (value === 'switch_role') await this.handleRoleSwitch(chatId, session);
                    else await this.handleSettingsAction(chatId, value, session);
                    break;
                case 'subs': await this.handleSubscriptionAction(chatId, value, extra, session); break;
                case 'ai': await this.handleAiAction(chatId, value, extra, session); break;
                case 'sub': if (value === 'check') await this.handleSubscriptionCheck(chatId, session); break;
                case 'searchmode': await this.handleSearchMode(chatId, value, session); break;
                case 'resume_view': await this.showResumeById(chatId, value, session); break;
                case 'resume_search': await this.handleResumeSearchSelect(chatId, value, session); break;
                case 'resume_new':
                    await this.setSession(session, { data: { ...session.data, active_resume_id: null, resume: {} } });
                    await this.startResumeFlow(chatId, session);
                    break;
                case 'resumeedit': await this.handleResumeEdit(chatId, value, session); break;
                case 'cancel': await this.handleCancel(chatId, session); break;
                case 'resume':
                    if (value === 'update') {
                        await this.updateSession(session.telegram_user_id, { state: BotState.VIEWING_RESUME });
                        await this.sendPrompt(chatId, session, botTexts.resumeMenu[session.lang], {
                            replyMarkup: keyboards.resumeEditKeyboard(session.lang)
                        });
                    } else if (value === 'delete') {
                        await this.handleResumeDelete(chatId, session);
                    }
                    break;
                case 'mcat': await this.handleMultiCategory(chatId, value, session, message.message_id); break;
                default: console.log('Unknown callback:', data);
            }
        } catch (err) {
            console.error('Callback error:', err);
            if (message) await sendMessage(message.chat.id, botTexts.error[sessionOverride?.lang || 'uz']);
        }
    }

    private async handleAuthCallback(chatId: number, value: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const phone = session.data?.temp_phone || session.phone;

        if (value === 'start') {
            await this.setSession(session, { state: BotState.AWAITING_PHONE });
            await this.sendPrompt(chatId, session, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
        } else if (value === 'password') {
            // Password auth is only allowed for role switch.
            if (phone) {
                await this.startSMSAuth(chatId, phone, session);
            } else {
                await this.sendPrompt(chatId, session, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
            }
        } else if (value === 'sms') {
            if (!phone) {
                await sendMessage(chatId, botTexts.error[lang]);
                return;
            }
            await this.startSMSAuth(chatId, phone, session);
        }
    }

    private async handleRoleSelect(chatId: number, role: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (role === 'employer') {
            const updatedData = { ...session.data, active_role: 'employer' };
            await this.setSession(session, { data: updatedData });

            const { data: profile } = await this.supabase
                .from('employer_profiles')
                .select('*')
                .eq('user_id', session.user_id)
                .maybeSingle();

            if (!profile || !profile.company_name) {
                await this.startEmployerProfileFlow(chatId, session, profile || null);
                return;
            }

            await this.setSession(session, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.employerWelcome[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });

        } else if (role === 'seeker') {
            const updatedData = { ...session.data, active_role: 'job_seeker' };
            await this.setSession(session, { data: updatedData });
            const { data: resume } = await this.supabase
                .from('resumes')
                .select('id')
                .eq('user_id', session.user_id)
                .single();

            if (resume) {
                await this.showResumeList(chatId, session);
            } else {
                await this.startResumeFlow(chatId, session);
            }
        }
    }

    private async startEmployerProfileFlow(chatId: number, session: TelegramSession, profile: any | null): Promise<void> {
        const lang = session.lang;
        const draft = {
            company_name: profile?.company_name || '',
            director_name: profile?.director_name || null,
            phone: profile?.phone || session.phone || null
        };

        await this.setSession(session, {
            state: BotState.EMPLOYER_PROFILE_COMPANY,
            data: { ...session.data, active_role: 'employer', employer_profile: draft }
        });

        await this.sendPrompt(chatId, session, `${botTexts.employerProfileIntro[lang]}\n\n${botTexts.companyNamePrompt[lang]}`, {
            replyMarkup: keyboards.cancelReplyKeyboard(lang)
        });
    }

    private async finalizeEmployerProfile(chatId: number, session: TelegramSession, draft: any): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        const payload: Record<string, any> = {
            user_id: session.user_id,
            company_name: draft.company_name,
            director_name: draft.director_name || null,
            phone: draft.phone || session.phone || null,
            updated_at: new Date().toISOString()
        };

        if (draft.region_id) payload.region_id = draft.region_id;
        if (draft.district_id) payload.district_id = draft.district_id;
        if (draft.address) {
            payload.address = draft.address;
            payload.default_address = draft.address;
        }
        if (draft.description) payload.description = draft.description;
        if (draft.industry) payload.industry = draft.industry;
        if (draft.company_size) payload.company_size = draft.company_size;

        const { error } = await this.supabase
            .from('employer_profiles')
            .upsert(payload, { onConflict: 'user_id' });

        if (error) {
            console.error('Save employer profile error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        await this.setSession(session, {
            state: BotState.EMPLOYER_MAIN_MENU,
            data: { ...session.data, active_role: 'employer', employer_profile: null }
        });
        await this.sendPrompt(chatId, session, botTexts.employerWelcome[lang], {
            replyMarkup: keyboards.employerMainMenuKeyboard(lang)
        });
    }

    private buildJobDescriptionFromSections(sections: any): string {
        const safe = sections || {};
        const tasks = Array.isArray(safe.ish_vazifalari) ? safe.ish_vazifalari : [];
        const reqs = Array.isArray(safe.talablar) ? safe.talablar : [];
        const perks = Array.isArray(safe.qulayliklar) ? safe.qulayliklar : [];
        const chunks: string[] = [];
        if (tasks.length) {
            chunks.push(`Vazifalar:\n- ${tasks.join('\n- ')}`);
        }
        if (reqs.length) {
            chunks.push(`Talablar:\n- ${reqs.join('\n- ')}`);
        }
        if (perks.length) {
            chunks.push(`Imkoniyatlar:\n- ${perks.join('\n- ')}`);
        }
        return chunks.join('\n\n').trim();
    }

    private buildJobConfirmText(lang: BotLang, jobData: any): string {
        const preview = {
            ...jobData,
            title_uz: jobData?.title,
            title_ru: jobData?.title,
            description_uz: jobData?.description,
            description_ru: jobData?.description,
            company_name: jobData?.company_name,
            region_name: jobData?.region_name,
            district_name: jobData?.district_name,
            salary_min: jobData?.salary_min,
            salary_max: jobData?.salary_max,
            contact_phone: jobData?.contact_phone,
            hr_name: jobData?.hr_name,
            work_mode: jobData?.work_mode,
            employment_type: jobData?.employment_type,
            working_days: jobData?.working_days,
            working_hours: jobData?.working_hours,
            experience: jobData?.experience,
            education_level: jobData?.education_level,
            gender: jobData?.gender,
            age_min: jobData?.age_min,
            age_max: jobData?.age_max,
            languages: jobData?.languages,
            benefits: jobData?.benefits,
            address: jobData?.address,
            raw_source_json: jobData?.raw_source_json || {}
        };

        return formatFullJobCard(preview, lang);
    }

    private mapAiExperienceValue(value: any): string | null {
        if (!value) return null;
        const raw = String(value).toLowerCase().trim();
        if (['any', 'ahamiyatsiz', 'не важно'].includes(raw)) return null;
        if (raw === 'no_experience' || raw === 'tajribasiz' || raw === 'bez opyta') return 'no_experience';
        if (raw === '1_year' || raw === '1 yil' || raw === '1 год') return '1_year';
        if (raw === '1_3' || raw === '1-3' || raw === '1_3_years') return '1_3_years';
        if (raw === '3_5' || raw === '3-5' || raw === '3_5_years' || raw === '3_6' || raw === '3-6') return '3_5_years';
        if (raw === '5_plus' || raw === '6_plus' || raw === '6+' || raw.includes('5+')) return '5_plus';
        if (['1', '2', '3', '4', '5'].includes(raw)) {
            const map: Record<string, string> = { '1': 'no_experience', '2': '1_year', '3': '1_3_years', '4': '3_5_years', '5': '5_plus' };
            return map[raw] || null;
        }
        return raw;
    }

    private async handleJobCreateMode(chatId: number, mode: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.setFlowCancelKeyboard(chatId, session);
        const baseJob = { ...(session.data?.temp_job || {}), job_create_mode: 'manual' };
        await this.setSession(session, {
            state: BotState.POSTING_JOB_TITLE,
            data: { ...session.data, temp_job: baseJob }
        });
        await this.sendPrompt(chatId, session, botTexts.postJobTitle[lang], {
            replyMarkup: keyboards.backKeyboard(lang, 'employer_menu')
        });
    }

    private async setFlowCancelKeyboard(
        chatId: number,
        session: TelegramSession,
        mode: 'cancel' | 'back' | 'back_cancel' = 'back_cancel'
    ): Promise<void> {
        try {
            const lang = session.lang || 'uz';
            const currentMode = session.data?.cancel_keyboard_mode;
            if (session.data?.cancel_keyboard_active && currentMode === mode) return;

            let replyMarkup = keyboards.cancelReplyKeyboard(lang);
            if (mode === 'back') replyMarkup = keyboards.backReplyKeyboard(lang);
            if (mode === 'back_cancel') replyMarkup = keyboards.backCancelReplyKeyboard(lang);

            const msg = await sendMessage(chatId, '⬇️', { replyMarkup });
            if (msg?.message_id) {
                try {
                    await deleteMessage(chatId, msg.message_id);
                } catch {
                    // ignore
                }
            }
            await this.setSession(session, {
                data: { ...session.data, cancel_keyboard_active: true, cancel_keyboard_message_id: null, cancel_keyboard_mode: mode }
            });
        } catch {
            // ignore
        }
    }

    private async clearFlowCancelKeyboard(chatId: number, session: TelegramSession): Promise<void> {
        try {
            if (!session.data?.cancel_keyboard_active) return;
            const msg = await sendMessage(chatId, '...', { replyMarkup: keyboards.removeKeyboard() });
            if (msg?.message_id) {
                try {
                    await deleteMessage(chatId, msg.message_id);
                } catch {
                    // ignore
                }
            }
            await this.setSession(session, {
                data: { ...session.data, cancel_keyboard_active: false, cancel_keyboard_message_id: null, cancel_keyboard_mode: null }
            });
        } catch {
            // ignore
        }
    }

    private async showExistingResumeMenu(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, { state: BotState.MAIN_MENU });

        await this.sendPrompt(chatId, session,
            lang === 'uz' ? "Sizda allaqachon rezyume mavjud. Nima qilmoqchisiz?" : "У вас уже есть резюме. Что хотите сделать?",
            { replyMarkup: keyboards.resumeOptionsKeyboard(lang) }
        );
    }

    private async handleLocation(chatId: number, location: { latitude: number; longitude: number }, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const locationIntent = session.data?.location_intent || null;

        if (session.user_id) {
            const { error } = await this.supabase
                .from('job_seeker_profiles')
                .update({
                    latitude: location.latitude,
                    longitude: location.longitude,
                    location_updated_at: new Date().toISOString()
                })
                .eq('user_id', session.user_id);
            if (error) console.error('Location update error:', error);
        }
        if (locationIntent === 'resume_final' || (session.state === BotState.REQUESTING_LOCATION && !locationIntent)) {
            const updatedData = { ...session.data, location_intent: null };
            await this.setSession(session, { data: updatedData });
            await this.finalizeResume(chatId, session);
            return;
        }

        if (locationIntent === 'job_search_geo') {
            const resolved = await this.resolveLocationToRegionDistrict(location.latitude, location.longitude);
            const searchGeo = {
                region_id: resolved?.region_id ?? null,
                district_id: resolved?.district_id ?? null,
                latitude: location.latitude,
                longitude: location.longitude
            };
            const updatedData = { ...session.data, location_intent: null, search_geo: searchGeo };
            await this.setSession(session, { data: updatedData });
            await this.searchJobsByLocation(chatId, session, searchGeo);
            return;
        }

        if (this.isSubscriptionFlow(session) || locationIntent === 'subscription_geo') {
            const resolved = await this.resolveLocationToRegionDistrict(location.latitude, location.longitude);
            const draft = { ...(session.data?.subscription_draft || {}) };
            if (resolved?.region_id) draft.region_id = resolved.region_id;
            if (resolved?.district_id) draft.district_id = resolved.district_id;
            draft.use_geo = true;

            const updatedData = { ...session.data, subscription_draft: draft, location_intent: null, selected_categories: [] };
            await this.setSession(session, { data: updatedData });

            if (!draft.region_id) {
                const regions = await this.getRegions();
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
                await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
                    replyMarkup: keyboards.regionKeyboard(lang, regions, 'main_menu')
                });
                return;
            }

            const regionIdNum = this.toCoordinate(draft.region_id);
            const districtIdNum = this.toCoordinate(draft.district_id);
            const categoryCounts = await this.getCategoryJobCounts(regionIdNum, districtIdNum);
            const categories = this.sortCategoriesByDemand(await this.getCategories(), categoryCounts);
            await this.setSession(session, {
                state: BotState.SELECTING_CATEGORY,
                data: {
                    ...session.data,
                    subscription_draft: draft,
                    selected_categories: [],
                    category_counts: categoryCounts,
                    category_options: categories
                }
            });
            await this.sendPrompt(chatId, session, botTexts.askCategory[lang], {
                replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories as any, categoryCounts, 'district')
            });
            return;
        }

        if (locationIntent === 'update_only') {
            const updatedData = { ...session.data, location_intent: null };
            await this.setSession(session, {
                state: BotState.SETTINGS,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.locationAccepted[lang], {
                replyMarkup: keyboards.settingsKeyboard(lang)
            });
            return;
        }

        await this.setSession(session, { state: BotState.SELECTING_REGION });
        const regions = await this.getRegions();
        await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
            replyMarkup: keyboards.regionKeyboard(lang, regions, 'main_menu')
        });
    }

    private async handleResumeDelete(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (session.user_id) {
            if (session.data?.active_resume_id) {
                await this.supabase.from('resumes').delete().eq('id', session.data.active_resume_id);
            } else {
                await this.supabase.from('resumes').delete().eq('user_id', session.user_id);
            }
        }
        await this.setSession(session, { data: { ...session.data, active_resume_id: null } });
        await sendMessage(chatId, lang === 'uz' ? "✅ Rezyume o'chirildi." : "✅ Резюме удалено.", { replyMarkup: keyboards.removeKeyboard() });
        await this.showResumeList(chatId, session);
    }

    private async handleStart(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang || 'uz';
        if (!session.lang) {
            await this.setSession(session, { state: BotState.AWAITING_LANG });
            await this.sendPrompt(chatId, session, botTexts.selectLanguage.uz, { replyMarkup: keyboards.languageKeyboard() });
            return;
        }
        if (session.user_id) {
            await this.showMainMenu(chatId, session);
            return;
        }
        await this.setSession(session, { state: BotState.START });
        await this.sendPrompt(chatId, session, botTexts.startWelcome[lang], {
            replyMarkup: keyboards.startKeyboard(lang),
            parseMode: 'HTML'
        });
    }

    private async handleLangSelect(chatId: number, lang: BotLang, session: TelegramSession): Promise<void> {
        await this.setSession(session, { lang });
        if (session.user_id) {
            await this.showMainMenu(chatId, { ...session, lang });
            return;
        }
        await this.setSession(session, { state: BotState.START });
        await this.sendPrompt(chatId, session, botTexts.startWelcome[lang], {
            replyMarkup: keyboards.startKeyboard(lang),
            parseMode: 'HTML'
        });
    }

    private async handlePhone(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const normalized = phone.replace(/\D/g, '').slice(-9);
        if (normalized.length !== 9) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }
        const fullPhone = `+998${normalized}`;
        await this.setSession(session, {
            phone: fullPhone,
            data: { ...session.data, temp_phone: fullPhone }
        });

        const { data: user } = await this.supabase.from('users').select('id').eq('phone', fullPhone).single();
        if (user) {
            await sendMessage(chatId, botTexts.accountFound[lang], { replyMarkup: keyboards.loginChoiceKeyboard(lang) });
        } else {
            await this.startSMSAuth(chatId, fullPhone, session);
        }
    }

    private async startSMSAuth(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        try {
            const { sendSMS, generateOTP, getSMSText } = await import('../eskiz');
            const otp = generateOTP();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            const message = getSMSText(otp);
            const smsResult = await sendSMS(phone, message);

            if (!smsResult.success) {
                console.error(`[AUTH] SMS failed: ${smsResult.error}`);
                const isModerationError = smsResult.error?.includes('moderation');
                const errorMessage = isModerationError
                    ? '⚠️ SMS shablon tasdiqlanmagan.'
                    : botTexts.error[lang];
                await sendMessage(chatId, errorMessage);
                return;
            }

            await this.setSession(session, {
                state: BotState.AWAITING_OTP,
                otp_code: otp,
                otp_expires_at: expiresAt
            });
            await this.sendPrompt(chatId, session, botTexts.otpSent[lang], { replyMarkup: keyboards.removeKeyboard() });
        } catch (e: any) {
            console.error('ESKIZ Error:', e);
            // Fallback to fake OTP for dev if needed or just error
            // For now standard error
            await sendMessage(chatId, botTexts.error[lang]);
        }
    }

    private async handleOTP(chatId: number, code: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.otp_code || !session.otp_expires_at) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }
        if (new Date() > new Date(session.otp_expires_at)) {
            await this.sendPrompt(chatId, session, botTexts.otpExpired[lang]);
            await this.setSession(session, {
                state: BotState.AWAITING_PHONE,
                otp_code: null,
                otp_expires_at: null
            });
            await this.sendPrompt(chatId, session, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
            return;
        }
        if (code !== session.otp_code) {
            await this.sendPrompt(chatId, session, botTexts.otpInvalid[lang]);
            return;
        }
        if (!session.phone) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }
        const userId = await this.findOrCreateUser(session.phone, session.telegram_user_id);
        if (!userId) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        await this.finalizeLogin(chatId, session.phone, session);
    }

    private async handlePasswordLogin(chatId: number, password: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const phone = session.phone;
        if (!phone) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }
        const flow = session.data?.password_flow || 'login';

        if (flow === 'create') {
            if (password.length < 6) {
                await sendMessage(chatId, botTexts.passwordTooShort[lang]);
                return;
            }
            const passwordHash = await bcrypt.hash(password, 10);
            const { error: updateError } = await this.supabase
                .from('users')
                .update({
                    password_hash: passwordHash,
                    login_attempts: 0,
                    locked_until: null
                })
                .eq('phone', phone);
            if (updateError) {
                console.error('Create password error:', updateError);
                await sendMessage(chatId, botTexts.error[lang]);
                return;
            }
            await this.setSession(session, { data: { ...session.data, password_flow: null } });
            await sendMessage(chatId, botTexts.passwordCreated[lang]);
            await this.finalizeLogin(chatId, phone, session);
            return;
        }

        const { data: user, error } = await this.supabase
            .from('users')
            .select('id, password_hash, login_attempts, locked_until')
            .eq('phone', phone)
            .single();

        if (error || !user) {
            await sendMessage(chatId, botTexts.passwordInvalid[lang]);
            return;
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const remainingMs = new Date(user.locked_until).getTime() - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            await sendMessage(chatId, `${botTexts.accountLocked[lang]} (${remainingMin} min)`);
            return;
        }

        if (!user.password_hash) {
            await sendMessage(chatId, botTexts.passwordInvalid[lang]);
            return;
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            const newAttempts = (user.login_attempts || 0) + 1;
            if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
                await this.supabase
                    .from('users')
                    .update({ login_attempts: newAttempts, locked_until: lockedUntil.toISOString() })
                    .eq('id', user.id);
                await sendMessage(chatId, botTexts.accountLocked[lang]);
                return;
            }

            await this.supabase
                .from('users')
                .update({ login_attempts: newAttempts })
                .eq('id', user.id);

            await sendMessage(chatId, botTexts.passwordInvalid[lang]);
            return;
        }

        await this.supabase
            .from('users')
            .update({ login_attempts: 0, locked_until: null })
            .eq('id', user.id);

        await sendMessage(chatId, botTexts.loginSuccess[lang]);
        await this.setSession(session, { data: { ...session.data, password_flow: null } });
        await this.finalizeLogin(chatId, phone, session);
    }

    private async finalizeLogin(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const userId = await this.findOrCreateUser(phone, session.telegram_user_id);
        if (!userId) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        const { data: seekerProfile } = await this.supabase.from('job_seeker_profiles').select('id').eq('user_id', userId).single();
        const { data: employerProfile } = await this.supabase.from('employer_profiles').select('id').eq('user_id', userId).single();

        const updatedData = { ...session.data, resume: {} };
        await this.setSession(session, {
            user_id: userId,
            otp_code: null,
            otp_expires_at: null,
            data: updatedData
        });

        await this.sendPrompt(chatId, session, botTexts.authSuccess[lang]);

        if (session.data?.role_switch_pending) {
            await this.setSession(session, {
                state: BotState.SELECTING_ROLE,
                data: { ...session.data, role_switch_pending: false }
            });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
            return;
        }

        if (seekerProfile && employerProfile) {
            await this.setSession(session, { state: BotState.SELECTING_ROLE });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
        } else if (employerProfile) {
            await this.setSession(session, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: { ...session.data, active_role: 'employer' }
            });
            await this.sendPrompt(chatId, session, botTexts.employerWelcome[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
        } else if (seekerProfile) {
            await this.setSession(session, {
                state: BotState.MAIN_MENU,
                data: { ...session.data, active_role: 'job_seeker' }
            });
            await this.showResumeList(chatId, { ...session, user_id: userId });
        } else {
            await this.setSession(session, { state: BotState.SELECTING_ROLE });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
        }
    }

    private async findOrCreateUser(phone: string, telegramId: number): Promise<string | null> {
        const now = new Date().toISOString();
        const { data: existing } = await this.supabase
            .from('users')
            .select('id, telegram_user_id')
            .eq('phone', phone)
            .maybeSingle();
        if (existing?.id) {
            if (!existing.telegram_user_id) {
                await this.supabase
                    .from('users')
                    .update({ telegram_user_id: telegramId })
                    .eq('id', existing.id);
            }
            return existing.id;
        }

        const { data: upserted, error: upsertError } = await this.supabase
            .from('users')
            .upsert({
                phone,
                telegram_user_id: telegramId,
                role: 'job_seeker',
                created_at: now
            }, { onConflict: 'phone' })
            .select('id')
            .single();

        if (upserted?.id) return upserted.id;
        if (upsertError) {
            console.error('User upsert error:', upsertError);
        }

        const { data: retry } = await this.supabase
            .from('users')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();
        if (retry?.id) return retry.id;

        const { data: byTelegram } = await this.supabase
            .from('users')
            .select('id')
            .eq('telegram_user_id', telegramId)
            .maybeSingle();
        if (byTelegram?.id) return byTelegram.id;

        try {
            const admin = this.supabase.auth?.admin;
            if (admin) {
                const { data: authData, error: authError } = await admin.createUser({
                    phone,
                    phone_confirm: true
                });
                if (authError) {
                    console.error('Auth create user error:', authError);
                }
                if (authData?.user?.id) {
                    const { data: created } = await this.supabase
                        .from('users')
                        .upsert({
                            id: authData.user.id,
                            phone,
                            telegram_user_id: telegramId,
                            role: 'job_seeker',
                            created_at: now
                        })
                        .select('id')
                        .single();
                    return created?.id || authData.user.id;
                }
            }
        } catch (err) {
            console.error('Auth admin create failed:', err);
        }

        return null;
    }

    private async updateSession(telegramUserId: number, updates: Partial<TelegramSession>): Promise<void> {
        let lastError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const { error } = await this.supabase
                    .from('telegram_sessions')
                    .update(updates)
                    .eq('telegram_user_id', telegramUserId);
                if (!error) return;
                lastError = error;
            } catch (err) {
                lastError = err;
            }

            if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 250 * attempt));
            }
        }

        if (lastError) {
            console.error('Session update error:', lastError);
        }
    }

    private async setSession(session: TelegramSession, updates: Partial<TelegramSession>): Promise<void> {
        if (updates.state) session.state = updates.state as BotState;
        if (updates.lang) session.lang = updates.lang as BotLang;
        if (updates.user_id !== undefined) session.user_id = updates.user_id as any;
        if (updates.phone !== undefined) session.phone = updates.phone as any;
        if (updates.data) session.data = updates.data as any;
        await this.updateSession(session.telegram_user_id, updates);
    }

    private async getOrCreateSession(telegramUserId: number): Promise<TelegramSession | null> {
        try {
            const { data: existing } = await this.supabase
                .from('telegram_sessions')
                .select('*')
                .eq('telegram_user_id', telegramUserId)
                .maybeSingle();

            if (existing) {
                if (!existing.data) existing.data = {};
                return existing as TelegramSession;
            }

            const { data: newSession, error } = await this.supabase
                .from('telegram_sessions')
                .insert({
                    telegram_user_id: telegramUserId,
                    state: BotState.START,
                    data: {},
                    lang: 'uz'
                })
                .select()
                .single();

            if (error) {
                if ((error as any).code === '23505') {
                    const { data: retry } = await this.supabase
                        .from('telegram_sessions')
                        .select('*')
                        .eq('telegram_user_id', telegramUserId)
                        .maybeSingle();
                    if (retry) {
                        if (!retry.data) retry.data = {};
                        return retry as TelegramSession;
                    }
                }
                throw error;
            }
            if (newSession && !newSession.data) newSession.data = {};
            return newSession as TelegramSession;

        } catch (err) {
            console.error('Session error:', err);
            return null;
        }
    }

    // ============================================
    // Resume Creation Flow
    // ============================================
    private async handleRegionSelect(chatId: number, regionId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const regionIdNum = parseInt(regionId, 10);
        const regions = await this.getRegions();
        const regionName = regions.find(r => r.id === regionIdNum);

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const { data: districtsRaw } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', regionIdNum)
                .order('name_uz');
            const districtCounts = await this.getDistrictJobCounts(regionIdNum);
            const districts = this.sortDistrictsByDemand(districtsRaw || [], districtCounts);

            const updatedResume = {
                ...session.data?.resume,
                region_id: regionIdNum,
                region_name: lang === 'uz' ? regionName?.name_uz : regionName?.name_ru,
                district_id: null,
                district_name: null
            };

            const updatedData = {
                ...session.data,
                resume: updatedResume,
                districts,
                districtPage: 0,
                district_counts: districtCounts
            };
            await this.setSession(session, {
                state: BotState.SELECTING_DISTRICT,
                data: updatedData
            });

            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'region') };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], options);
            }
            return;
        }

        if (session.state === BotState.EMPLOYER_PROFILE_REGION) {
            const { data: districtsRaw } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', regionIdNum)
                .order('name_uz');
            const districtCounts = await this.getDistrictJobCounts(regionIdNum);
            const districts = this.sortDistrictsByDemand(districtsRaw || [], districtCounts);

            const updatedDraft = {
                ...(session.data?.employer_profile || {}),
                region_id: regionIdNum,
                district_id: null
            };

            await this.setSession(session, {
                state: BotState.EMPLOYER_PROFILE_DISTRICT,
                data: { ...session.data, employer_profile: updatedDraft, districts, districtPage: 0, district_counts: districtCounts }
            });

            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'employer_region') };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.employerDistrictPrompt[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.employerDistrictPrompt[lang], options);
            }
            return;
        }

        if (session.state === BotState.POSTING_JOB_REGION) {
            const { data: districtsRaw } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', regionIdNum)
                .order('name_uz');
            const districtCounts = await this.getDistrictJobCounts(regionIdNum);
            const districts = this.sortDistrictsByDemand(districtsRaw || [], districtCounts);

            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_DISTRICT,
                data: {
                    ...session.data,
                    temp_job: {
                        ...session.data?.temp_job,
                        region_id: regionIdNum,
                        region_name: lang === 'uz' ? regionName?.name_uz : regionName?.name_ru
                    },
                    districts,
                    districtPage: 0,
                    district_counts: districtCounts
                }
            });
            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'job_region', false) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.employerDistrictPrompt[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.employerDistrictPrompt[lang], options);
            }
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const { data: districtsRaw } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', regionIdNum)
                .order('name_uz');
            const districtCounts = await this.getDistrictJobCounts(regionIdNum);
            const districts = this.sortDistrictsByDemand(districtsRaw || [], districtCounts);

            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.region_id = regionIdNum;
            draft.district_id = null;

            const updatedData = {
                ...session.data,
                subscription_draft: draft,
                districts,
                districtPage: 0,
                district_counts: districtCounts
            };
            await this.setSession(session, {
                state: BotState.SELECTING_DISTRICT,
                data: updatedData
            });

            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'region') };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askDistrict[lang], options);
            }
            return;
        }

        const { data: districtsRaw } = await this.supabase
            .from('districts')
            .select('id, name_uz, name_ru')
            .eq('region_id', regionIdNum)
            .order('name_uz');
        const districtCounts = await this.getDistrictJobCounts(regionIdNum);
        const districts = this.sortDistrictsByDemand(districtsRaw || [], districtCounts);

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                region_id: regionIdNum,
                region_name: lang === 'uz' ? regionName?.name_uz : regionName?.name_ru
            },
            districts,
            districtPage: 0,
            district_counts: districtCounts
        };
        await this.setSession(session, {
            state: BotState.SELECTING_DISTRICT,
            data: updatedData
        });

        const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'region') };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], options);
    }

    private async showDistrictPage(chatId: number, page: number, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];
        const districtCounts = session.data?.district_counts || {};
        await this.setSession(session, { data: { ...session.data, districtPage: page } });
        const isJobFlow = session.state === BotState.POSTING_JOB_DISTRICT;
        const backAction = isJobFlow
            ? 'job_region'
            : session.state === BotState.EMPLOYER_PROFILE_DISTRICT
                ? 'employer_region'
                : 'region';
        const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, page, districtCounts, backAction, !isJobFlow) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askDistrict[lang], options);
        }
    }

    private async handleDistrictSelect(chatId: number, districtId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];
        const districtIdNum = Number.parseInt(districtId, 10);
        const district = districts.find((d: any) => String(d.id) === String(districtIdNum));

        if (session.state === BotState.EMPLOYER_PROFILE_DISTRICT) {
            const updatedDraft = {
                ...(session.data?.employer_profile || {}),
                district_id: Number.isFinite(districtIdNum) ? districtIdNum : districtId
            };
            await this.setSession(session, {
                state: BotState.EMPLOYER_PROFILE_ADDRESS,
                data: { ...session.data, employer_profile: updatedDraft }
            });
            await this.sendPrompt(chatId, session, botTexts.employerAddressPrompt[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'employer_region')
            });
            return;
        }

        if (session.state === BotState.POSTING_JOB_DISTRICT) {
            const updatedJob = {
                ...session.data?.temp_job,
                district_id: Number.isFinite(districtIdNum) ? districtIdNum : districtId,
                district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
            };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_ADDRESS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobAddressPrompt[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'job_district')
            });
            return;
        }

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = {
                ...session.data?.resume,
                district_id: Number.isFinite(districtIdNum) ? districtIdNum : districtId,
                district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
            };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            const updatedData = { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume };
            await this.setSession(session, { data: updatedData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.district_id = districtId;
            const regionIdNum = this.toCoordinate(draft.region_id);
            const districtIdForCounts = Number.isFinite(districtIdNum) ? districtIdNum : null;
            const categoryCounts = await this.getCategoryJobCounts(regionIdNum, districtIdForCounts);
            const allCategories = await this.getCategories();
            const sortedCategories = this.sortCategoriesByDemand(allCategories, categoryCounts);
            const updatedData = { ...session.data, subscription_draft: draft, selected_categories: [] };
            await this.setSession(session, {
                state: BotState.SELECTING_CATEGORY,
                data: {
                    ...updatedData,
                    category_counts: categoryCounts,
                    category_options: sortedCategories
                }
            });
            const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], sortedCategories as any, categoryCounts, 'district') };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askCategory[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askCategory[lang], options);
            }
            return;
        }

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                district_id: Number.isFinite(districtIdNum) ? districtIdNum : districtId,
                district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
            },
            selected_categories: []
        };
        const regionIdNum = this.toCoordinate(updatedData.resume?.region_id);
        const districtIdForCounts = Number.isFinite(districtIdNum) ? districtIdNum : null;
        const categoryCounts = await this.getCategoryJobCounts(regionIdNum, districtIdForCounts);
        const allCategories = await this.getCategories();
        const sortedCategories = this.sortCategoriesByDemand(allCategories, categoryCounts);
        await this.setSession(session, {
            state: BotState.SELECTING_CATEGORY,
            data: {
                ...updatedData,
                category_counts: categoryCounts,
                category_options: sortedCategories
            }
        });

        const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], sortedCategories as any, categoryCounts, 'district') };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askCategory[lang], options);
    }

    private async handleCategorySelect(chatId: number, categoryId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const categories = await this.getCategories();
        const category = categories.find(c => c.id === categoryId);

        if (session.state === BotState.POSTING_JOB_CATEGORY) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_SALARY,
                data: {
                    ...session.data,
                    temp_job: {
                        ...session.data?.temp_job,
                        category_id: categoryId,
                        category_name: lang === 'uz' ? category?.name_uz : category?.name_ru
                    }
                }
            });
            await this.sendPrompt(chatId, session, botTexts.postJobSalary[lang], {
                replyMarkup: keyboards.jobSalaryKeyboard(lang)
            });
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.category_ids = [categoryId];
            draft.category_id = categoryId;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_EMPLOYMENT,
                data: { ...session.data, subscription_draft: draft }
            });
            const options = { replyMarkup: keyboards.employmentTypeKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askEmploymentType[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askEmploymentType[lang], options);
            }
            return;
        }

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                category_id: categoryId,
                category_name: lang === 'uz' ? category?.name_uz : category?.name_ru
            }
        };
        await this.setSession(session, {
            state: BotState.SELECTING_EXPERIENCE,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.experienceKeyboard(lang) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askExperience[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askExperience[lang], options);
        }
    }

    private async handleMultiCategory(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const fallbackCategories = await this.getCategories();
        const categories = this.getCategoryOptionsFromSession(session, fallbackCategories);
        const categoryCounts = session.data?.category_counts || {};

        if (value === 'done') {
            const selectedCategories = session.data?.selected_categories || [];
            if (selectedCategories.length === 0) {
                const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories as any, categoryCounts, 'district') };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askCategory[lang], options);
                } else {
                    await sendMessage(chatId, botTexts.askCategory[lang], options);
                }
                return;
            }

            if (this.isSubscriptionFlow(session)) {
                const draft = { ...(session.data?.subscription_draft || {}) };
                draft.category_ids = selectedCategories;
                draft.category_id = selectedCategories[0] || null;
                const updatedData = { ...session.data, subscription_draft: draft };
                await this.setSession(session, {
                    state: BotState.SELECTING_EMPLOYMENT,
                    data: updatedData
                });
                const options = { replyMarkup: keyboards.employmentTypeKeyboard(lang) };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askEmploymentType[lang], options);
                } else {
                    await sendMessage(chatId, botTexts.askEmploymentType[lang], options);
                }
                return;
            }

            if (session.data?.edit_mode && session.data?.active_resume_id) {
                const updatedResume = {
                    ...session.data?.resume,
                    category_ids: selectedCategories,
                    category_id: selectedCategories[0] || null
                };
                await this.saveResume(session, updatedResume, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }

            // Proceed to next step
            const updatedData = {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    category_ids: selectedCategories,
                    category_id: selectedCategories[0]
                }
            };
            await this.setSession(session, {
                state: BotState.SELECTING_EXPERIENCE,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.experienceKeyboard(lang) };
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], options);
            return;
        }

        // Toggle category selection
        let selectedCategories = session.data?.selected_categories || [];
        if (value === 'all') {
            const allIds = categories.map(cat => cat.id);
            const allSelected = selectedCategories.length === allIds.length;
            selectedCategories = allSelected ? [] : allIds;
        } else {
            const index = selectedCategories.indexOf(value);
            if (index === -1) {
                selectedCategories.push(value);
            } else {
                selectedCategories.splice(index, 1);
            }
        }

        const updatedData = { ...session.data, selected_categories: selectedCategories };
        await this.setSession(session, { data: updatedData });

        const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, selectedCategories, categories as any, categoryCounts, 'district') };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.categorySelected[lang], options);
        } else {
            await sendMessage(chatId, botTexts.categorySelected[lang], options);
        }
    }

    private async handleExperienceSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.state === BotState.POSTING_JOB_EXPERIENCE) {
            const updatedJob = { ...session.data?.temp_job, experience: value === 'any' ? null : value };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_EDUCATION,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobEducationPrompt[lang], {
                replyMarkup: keyboards.jobEducationKeyboard(lang)
            });
            return;
        }

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = { ...session.data?.resume, experience_level: value, experience: value };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            const updatedData = { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume };
            await this.setSession(session, { data: updatedData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.experience = value;
            const updatedData = { ...session.data, subscription_draft: draft };
            await this.setSession(session, {
                state: BotState.SELECTING_EDUCATION,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.educationKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askEducation[lang], options);
            }
            return;
        }

        const updatedData = {
            ...session.data,
            resume: { ...session.data?.resume, experience_level: value, experience: value }
        };
        if (this.shouldAskWorkplace(updatedData.resume)) {
            await this.setSession(session, {
                state: BotState.ENTERING_WORKPLACE,
                data: { ...updatedData, workplace_stage: 'after_experience' }
            });
            await this.setFlowCancelKeyboard(chatId, session, 'back');
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
            await this.sendPrompt(chatId, session, botTexts.askWorkplace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'experience')
            });
            return;
        }

        await this.setSession(session, {
            state: BotState.SELECTING_EDUCATION,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.educationKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
    }

    private async handleEducationSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.state === BotState.POSTING_JOB_EDUCATION) {
            const updatedJob = { ...session.data?.temp_job, education_level: value };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_GENDER,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobGenderPrompt[lang], {
                replyMarkup: keyboards.jobGenderKeyboard(lang)
            });
            return;
        }

        if (session.data?.flow === 'geo_requirements') {
            const resumeId = session.data?.geo_requirements_resume_id || session.data?.active_resume_id;
            if (resumeId) {
                await this.saveResumePartial(session, resumeId, { education_level: value });
            }
            const nextData = {
                ...session.data,
                resume: { ...session.data?.resume, education_level: value },
                geo_requirements_need_education: false
            };
            if ((nextData as any).geo_requirements_need_gender) {
                await this.setSession(session, {
                    state: BotState.SELECTING_GENDER,
                    data: nextData
                });
                const options = { replyMarkup: keyboards.genderKeyboard(lang, false) };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askGender[lang], options);
                } else {
                    await this.sendPrompt(chatId, session, botTexts.askGender[lang], options);
                }
                return;
            }

            await this.setSession(session, {
                state: BotState.REQUESTING_LOCATION,
                data: {
                    ...nextData,
                    flow: null,
                    location_intent: 'job_search_geo',
                    clean_inputs: true
                }
            });
            await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
            return;
        }

        if (session.data?.flow === 'resume_requirements') {
            const resumeId = session.data?.resume_requirements_resume_id || session.data?.active_resume_id;
            if (resumeId) {
                await this.saveResumePartial(session, resumeId, { education_level: value });
            }
            const nextData = {
                ...session.data,
                resume: { ...session.data?.resume, education_level: value },
                resume_requirements_need_education: false
            };
            if ((nextData as any).resume_requirements_need_gender) {
                await this.setSession(session, {
                    state: BotState.SELECTING_GENDER,
                    data: nextData
                });
                const options = { replyMarkup: keyboards.genderKeyboard(lang, false) };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askGender[lang], options);
                } else {
                    await this.sendPrompt(chatId, session, botTexts.askGender[lang], options);
                }
                return;
            }

            await this.setSession(session, {
                state: BotState.BROWSING_JOBS,
                data: { ...nextData, flow: null, clean_inputs: true }
            });
            const refreshed = resumeId
                ? (await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle()).data
                : null;
            if (refreshed) {
                await this.startJobSearchByResume(chatId, session, refreshed);
            }
            return;
        }

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = { ...session.data?.resume, education_level: value };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            const updatedData = { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume };
            await this.setSession(session, { data: updatedData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.education_level = value;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_GENDER,
                data: { ...session.data, subscription_draft: draft }
            });
            const options = { replyMarkup: keyboards.genderKeyboard(lang, false) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askGender[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askGender[lang], options);
            }
            return;
        }

        const updatedData = {
            ...session.data,
            resume: { ...session.data?.resume, education_level: value }
        };

        const shouldAskEducationPlace = ['higher', 'master'].includes(String(value));
        if (shouldAskEducationPlace) {
            await this.setFlowCancelKeyboard(chatId, session, 'back');
            await this.setSession(session, {
                state: BotState.ENTERING_EDUCATION_PLACE,
                data: { ...updatedData, education_pending: null }
            });
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
            await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'education')
            });
            return;
        }

        await this.setSession(session, {
            state: BotState.SELECTING_GENDER,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.genderKeyboard(lang, false) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askGender[lang], options);
    }

    private async handleGenderSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.state === BotState.POSTING_JOB_GENDER) {
            const updatedJob = { ...session.data?.temp_job, gender: value === 'any' ? null : value };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_AGE,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobAgePrompt[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'job_gender')
            });
            return;
        }

        if (session.data?.flow === 'geo_requirements') {
            const resumeId = session.data?.geo_requirements_resume_id || session.data?.active_resume_id;
            if (resumeId) {
                await this.saveResumePartial(session, resumeId, { gender: value });
            }
            const nextData = {
                ...session.data,
                resume: { ...session.data?.resume, gender: value },
                geo_requirements_need_gender: false
            };
            if ((nextData as any).geo_requirements_need_education) {
                await this.setSession(session, {
                    state: BotState.SELECTING_EDUCATION,
                    data: nextData
                });
                const options = { replyMarkup: keyboards.educationKeyboard(lang) };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
                } else {
                    await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
                }
                return;
            }

            await this.setSession(session, {
                state: BotState.REQUESTING_LOCATION,
                data: {
                    ...nextData,
                    flow: null,
                    location_intent: 'job_search_geo',
                    clean_inputs: true
                }
            });
            await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
            return;
        }

        if (session.data?.flow === 'resume_requirements') {
            const resumeId = session.data?.resume_requirements_resume_id || session.data?.active_resume_id;
            if (resumeId) {
                await this.saveResumePartial(session, resumeId, { gender: value });
            }
            const nextData = {
                ...session.data,
                resume: { ...session.data?.resume, gender: value },
                resume_requirements_need_gender: false
            };
            if ((nextData as any).resume_requirements_need_education) {
                await this.setSession(session, {
                    state: BotState.SELECTING_EDUCATION,
                    data: nextData
                });
                const options = { replyMarkup: keyboards.educationKeyboard(lang) };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
                } else {
                    await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
                }
                return;
            }

            await this.setSession(session, {
                state: BotState.BROWSING_JOBS,
                data: { ...nextData, flow: null, clean_inputs: true }
            });
            const refreshed = resumeId
                ? (await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle()).data
                : null;
            if (refreshed) {
                await this.startJobSearchByResume(chatId, session, refreshed);
            }
            return;
        }

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = { ...session.data?.resume, gender: value };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            const updatedData = { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume };
            await this.setSession(session, { data: updatedData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.gender = value;
            const updatedData = { ...session.data, subscription_draft: draft };
            await this.setSession(session, {
                state: BotState.SELECTING_SALARY,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.salaryKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askSalary[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askSalary[lang], options);
            }
            return;
        }

        const updatedData = {
            ...session.data,
            resume: { ...session.data?.resume, gender: value }
        };
        await this.setSession(session, {
            state: BotState.ENTERING_BIRTH_DATE,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.cancelReplyKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askBirthDate[lang], options);
    }

    private async handleSpecialCriteria(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const currentSpecial = Array.isArray(session.data?.resume?.special) ? [...session.data.resume.special] : [];

        if (value === 'done') {
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, special: currentSpecial }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }

            const updatedData = { ...session.data, resume: { ...session.data?.resume, special: currentSpecial } };
            await this.setSession(session, {
                state: BotState.SELECTING_SALARY,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.salaryKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askSalary[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.askSalary[lang], options);
            }
            return;
        }

        const index = currentSpecial.indexOf(value);
        if (index === -1) {
            currentSpecial.push(value);
        } else {
            currentSpecial.splice(index, 1);
        }

        const updatedData = { ...session.data, resume: { ...session.data?.resume, special: currentSpecial } };
        await this.setSession(session, { data: updatedData });

        const options = { replyMarkup: keyboards.specialCriteriaKeyboard(lang, currentSpecial, 'birthdate') };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askSpecialCriteria[lang], options);
        } else {
            await this.sendPrompt(chatId, session, botTexts.askSpecialCriteria[lang], options);
        }
    }

    private async handleSalarySelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const salaryMin = parseInt(value) || 0;

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.salary_min = salaryMin > 0 ? salaryMin : 0;
            const updatedData = { ...session.data, subscription_draft: draft };
            await this.setSession(session, {
                state: BotState.SELECTING_SALARY_MAX,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.salaryMaxKeyboard(lang) };
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
            await this.sendPrompt(chatId, session, botTexts.askSalaryMax[lang], options);
            return;
        }

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                expected_salary_min: salaryMin > 0 ? salaryMin : null
            }
        };
        await this.setSession(session, {
            state: BotState.ENTERING_TITLE,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.cancelReplyKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askTitle[lang], options);
    }

    private async handleJobSalaryQuick(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.POSTING_JOB_SALARY) return;

        if (value === 'deal') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_REGION,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, salary_min: null, salary_max: null } }
            });
            const regions = await this.getRegions();
            await this.sendPrompt(chatId, session, botTexts.postJobRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'job_salary')
            });
            return;
        }
    }

    private async handleJobSalaryMaxQuick(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.POSTING_JOB_SALARY_MAX) return;

        if (value === 'skip') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_REGION,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, salary_max: null } }
            });
            const regions = await this.getRegions();
            await this.sendPrompt(chatId, session, botTexts.postJobRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'job_salary')
            });
            return;
        }
    }

    private async handleSalaryMaxSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (!this.isSubscriptionFlow(session)) return;

        const salaryMax = value === 'all' ? null : parseInt(value) || null;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.salary_max = salaryMax;
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_SUBSCRIPTION_FREQUENCY,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.subscriptionFrequencyKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askSubscriptionFrequency[lang], options);
    }

    private async handleEmploymentSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state === BotState.POSTING_JOB_EMPLOYMENT) {
            const updatedJob = { ...session.data?.temp_job, employment_type: value === 'all' ? null : value };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_WORK_DAYS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobWorkingDaysPrompt[lang], {
                replyMarkup: keyboards.jobWorkingDaysKeyboard(lang)
            });
            return;
        }

        if (!this.isSubscriptionFlow(session)) return;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.employment_type = value || 'all';
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_WORK_MODE,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.workModeKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askWorkMode[lang], options);
    }

    private async handleWorkModeSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state === BotState.POSTING_JOB_WORK_MODE) {
            const updatedJob = { ...session.data?.temp_job, work_mode: value === 'all' ? null : value };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_EMPLOYMENT,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobEmploymentPrompt[lang], {
                replyMarkup: keyboards.jobEmploymentKeyboard(lang)
            });
            return;
        }

        if (!this.isSubscriptionFlow(session)) return;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.work_mode = value || 'all';
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_WORKING_DAYS,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.workingDaysKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askWorkingDays[lang], options);
    }

    private async handleWorkingDaysSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state === BotState.POSTING_JOB_WORK_DAYS) {
            const updatedJob = { ...session.data?.temp_job, working_days: value || null };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_WORK_HOURS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobWorkingHoursPrompt[lang], {
                replyMarkup: keyboards.aboutSkipInlineKeyboard(lang)
            });
            return;
        }

        if (!this.isSubscriptionFlow(session)) return;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.working_days = value || 'all';
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_EXPERIENCE,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.experienceKeyboard(lang) };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askExperience[lang], options);
    }

    private async saveResume(session: TelegramSession, resumeData: any, resumeId?: string | null): Promise<string | null> {
        if (!session.user_id || !resumeData) return null;

        let existing: any | null = null;
        if (resumeId) {
            let selectError: any = null;
            let data: any = null;
            const primary = await this.supabase
                .from('resumes')
                .select('title, full_name, region_id, district_id, category_id, category_ids, skills, experience_details, education, expected_salary_min, gender, education_level, experience, birth_date, special')
                .eq('id', resumeId)
                .maybeSingle();
            data = primary.data || null;
            selectError = primary.error || null;
            if (selectError && String(selectError.message || '').includes('special')) {
                const fallback = await this.supabase
                    .from('resumes')
                    .select('title, full_name, region_id, district_id, category_id, category_ids, skills, experience_details, education, expected_salary_min, gender, education_level, experience, birth_date')
                    .eq('id', resumeId)
                    .maybeSingle();
                data = fallback.data || null;
                selectError = fallback.error || null;
            }
            if (selectError) {
                console.error('Resume fetch error:', selectError);
            }
            existing = data || null;
        }

        const {
            region_id, district_id, category_id, category_ids,
            experience, experience_level, education: educationData, education_level, gender,
            salary, title, name, about, skills, desired_position, full_name,
            expected_salary_min, birth_date, experience_details, special
        } = resumeData;

        const parseNumber = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            const cleaned = String(value).replace(/[^\d]/g, '');
            if (!cleaned) return null;
            const num = Number(cleaned);
            return Number.isFinite(num) ? num : null;
        };

        const hasProp = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

        const sourceCategoryIds = Array.isArray(category_ids) && category_ids.length > 0
            ? category_ids
            : (Array.isArray(existing?.category_ids) && existing?.category_ids?.length > 0 ? existing.category_ids : []);
        const finalCategoryIds = Array.from(new Set(sourceCategoryIds.map((id: any) => String(id))));
        const finalCategoryId = category_id
            ? String(category_id)
            : (existing?.category_id ? String(existing.category_id) : (finalCategoryIds.length > 0 ? finalCategoryIds[0] : null));
        const normalizedGender = gender === 'any' ? null : gender;
        const salaryMin = parseNumber(expected_salary_min ?? salary);
        const skillsSource = hasProp(resumeData, 'skills')
            ? skills
            : (existing?.skills ?? []);
        const normalizedSkills = Array.isArray(skillsSource)
            ? Array.from(new Set(skillsSource.map((s: any) => String(s).trim()).filter(Boolean)))
            : [];

        const specialSource = hasProp(resumeData, 'special')
            ? special
            : (existing?.special ?? []);
        const normalizedSpecial = Array.isArray(specialSource)
            ? Array.from(new Set(specialSource.map((s: any) => String(s).trim()).filter(Boolean)))
            : [];

        let safeTitle = String(
            title
            || desired_position
            || existing?.title
            || resumeData?.category_name
            || resumeData?.category_name_uz
            || resumeData?.category_name_ru
            || 'Mutaxassis'
        ).trim() || 'Mutaxassis';
        if (!safeTitle || ['undefined', 'null'].includes(safeTitle.toLowerCase())) {
            safeTitle = 'Mutaxassis';
        }

        const finalRegionId = region_id ?? existing?.region_id ?? null;
        const finalDistrictId = district_id ?? existing?.district_id ?? null;
        const finalAbout = hasProp(resumeData, 'about') ? about : (existing?.about ?? null);
        const finalBirthDate = hasProp(resumeData, 'birth_date') ? (birth_date || null) : (existing?.birth_date ?? null);
        const finalFullName = full_name || name || existing?.full_name || null;
        const finalExpectedSalary = parseNumber(expected_salary_min ?? salary ?? existing?.expected_salary_min ?? null);
        const finalExperienceDetails = hasProp(resumeData, 'experience_details')
            ? (Array.isArray(experience_details) ? experience_details : [])
            : (Array.isArray(existing?.experience_details) ? existing.experience_details : []);
        const finalEducation = hasProp(resumeData, 'education')
            ? (Array.isArray(educationData) ? educationData : [])
            : (Array.isArray(existing?.education) ? existing.education : []);

        const payload = {
            user_id: session.user_id,
            region_id: finalRegionId,
            district_id: finalDistrictId,
            category_id: finalCategoryId,
            category_ids: finalCategoryIds,
            title: safeTitle,
            full_name: finalFullName,
            about: finalAbout,
            skills: normalizedSkills,
            experience: experience_level || experience || existing?.experience || 'no_experience',
            experience_level: experience_level || experience || existing?.experience || 'no_experience',
            education_level: education_level || (typeof educationData === 'string' ? educationData : null) || existing?.education_level || 'secondary',
            experience_details: finalExperienceDetails,
            education: finalEducation,
            gender: normalizedGender,
            expected_salary_min: finalExpectedSalary,
            birth_date: finalBirthDate,
            special: normalizedSpecial,
            is_public: true,
            status: 'active',
            updated_at: new Date().toISOString(),
            phone: session.phone || null
        } as Record<string, any>;

        if (!payload.title || String(payload.title).trim().length === 0) {
            payload.title = 'Mutaxassis';
        }

        if (resumeId) {
            let { error } = await this.supabase
                .from('resumes')
                .update(payload)
                .eq('id', resumeId);
            if (error && String(error.message || '').includes('special')) {
                const { special, ...fallbackPayload } = payload;
                const retry = await this.supabase
                    .from('resumes')
                    .update(fallbackPayload)
                    .eq('id', resumeId);
                error = retry.error || null;
            }
            if (error && String(error.message || '').includes('experience_level')) {
                const { experience_level, ...fallbackPayload } = payload;
                const retry = await this.supabase
                    .from('resumes')
                    .update(fallbackPayload)
                    .eq('id', resumeId);
                error = retry.error || null;
            }
            if (error) {
                console.error('Save resume error:', error);
                return null;
            }
            await this.supabase.from('job_seeker_profiles').upsert({
                user_id: session.user_id,
                full_name: payload.full_name || null,
                phone: payload.phone || session.phone || null,
                region_id: payload.region_id || null,
                district_id: payload.district_id || null,
                birth_date: payload.birth_date || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
            return resumeId;
        }

        let { data, error } = await this.supabase
            .from('resumes')
            .insert({ ...payload, created_at: new Date().toISOString() })
            .select('id')
            .single();

        if (error && String(error.message || '').includes('special')) {
            const { special, ...fallbackPayload } = payload;
            const retry = await this.supabase
                .from('resumes')
                .insert({ ...fallbackPayload, created_at: new Date().toISOString() })
                .select('id')
                .single();
            data = retry.data;
            error = retry.error;
        }
        if (error && String(error.message || '').includes('experience_level')) {
            const { experience_level, ...fallbackPayload } = payload;
            const retry = await this.supabase
                .from('resumes')
                .insert({ ...fallbackPayload, created_at: new Date().toISOString() })
                .select('id')
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            console.error('Save resume error:', error);
            return null;
        }

        await this.supabase.from('job_seeker_profiles').upsert({
            user_id: session.user_id,
            full_name: payload.full_name || null,
            phone: payload.phone || session.phone || null,
            region_id: payload.region_id || null,
            district_id: payload.district_id || null,
            birth_date: payload.birth_date || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        return data?.id || null;
    }

    private async saveResumePartial(session: TelegramSession, resumeId: string, patch: Record<string, any>): Promise<void> {
        if (!session.user_id) return;
        const payload = { ...patch, updated_at: new Date().toISOString() };
        const { error } = await this.supabase
            .from('resumes')
            .update(payload)
            .eq('id', resumeId);
        if (error) {
            console.error('Save resume partial error:', error);
        }
    }

    private async handleTextByState(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const state = session.state;

        const skipTexts = ["O'tkazib yuborish", "O‘tkazib yuborish", 'Пропустить', "⏭️ O'tkazib yuborish", '⏭️ Пропустить'];
        const cancelTexts = ['Bekor qilish', 'Отмена', '❌ Bekor qilish', '❌ Отмена'];
        const backTexts = ['⬅️ Orqaga', 'Orqaga', '⬅️ Назад', 'Назад'];

        if (backTexts.includes(text)) {
            const target = this.getBackTargetForState(session);
            if (target) {
                await this.handleBack(chatId, target, session);
                return;
            }
        }
        if (skipTexts.includes(text)) {
            if (state === BotState.ENTERING_WORKPLACE || state === BotState.ENTERING_WORKPLACE_YEARS || state === BotState.ENTERING_WORKPLACE_END_YEAR) {
                const prompt = state === BotState.ENTERING_WORKPLACE_END_YEAR
                    ? botTexts.askWorkEndYear[lang]
                    : state === BotState.ENTERING_WORKPLACE_YEARS
                        ? botTexts.askWorkStartYear[lang]
                        : botTexts.askWorkplace[lang];
                const backTarget = state === BotState.ENTERING_WORKPLACE_END_YEAR ? 'workstart' : (state === BotState.ENTERING_WORKPLACE_YEARS ? 'workplace' : 'experience');
                await this.sendPrompt(chatId, session, prompt, { replyMarkup: keyboards.backKeyboard(lang, backTarget) });
                return;
            }
            await this.handleSkip(chatId, session);
            return;
        }
        if (cancelTexts.includes(text)) {
            await this.handleCancel(chatId, session);
            return;
        }

        // AUTH
        if (state === BotState.AWAITING_OTP) {
            await this.handleOTP(chatId, text, session);
            return;
        }
        if (state === BotState.AWAITING_PASSWORD) {
            await this.handlePasswordLogin(chatId, text, session);
            return;
        }

        if (state === BotState.REQUESTING_LOCATION) {
            await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
            return;
        }

        // EMPLOYER PROFILE FLOW
        if (state === BotState.EMPLOYER_PROFILE_COMPANY) {
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.company_name = text.trim();
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DIRECTOR, data: { ...session.data, employer_profile: draft } });
            await this.sendPrompt(chatId, session, botTexts.employerDirectorPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_company') });
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_DIRECTOR) {
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.director_name = text.trim();
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_INDUSTRY, data: { ...session.data, employer_profile: draft } });
            await this.sendPrompt(chatId, session, botTexts.employerIndustryPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_director') });
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_INDUSTRY) {
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.industry = text.trim();
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_SIZE, data: { ...session.data, employer_profile: draft } });
            await this.sendPrompt(chatId, session, botTexts.employerSizePrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_industry') });
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_SIZE) {
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.company_size = text.trim();
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_REGION, data: { ...session.data, employer_profile: draft } });
            const regions = await this.getRegions();
            await this.sendPrompt(chatId, session, botTexts.employerRegionPrompt[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'employer_size')
            });
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_ADDRESS) {
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.address = text.trim();
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DESCRIPTION, data: { ...session.data, employer_profile: draft } });
            await this.sendPrompt(chatId, session, botTexts.employerDescriptionPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_address') });
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_DESCRIPTION) {
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.description = text.trim();
            await this.finalizeEmployerProfile(chatId, session, draft);
            return;
        }

        if (state === BotState.POSTING_JOB_TITLE) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_CATEGORY,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, title: text } }
            });
            const categories = await this.getCategories();
            await this.sendPrompt(chatId, session, botTexts.postJobCategory[lang], {
                replyMarkup: keyboards.categoryKeyboard(lang, categories, 'job_title')
            });
            return;
        }

        if (state === BotState.POSTING_JOB_SALARY) {
            const normalized = text.trim().toLowerCase();
            if (normalized.includes('kelish')) {
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.POSTING_JOB_REGION,
                    data: { ...session.data, temp_job: { ...session.data?.temp_job, salary_min: null, salary_max: null } }
                });
                const regions = await this.getRegions();
                await this.sendPrompt(chatId, session, botTexts.postJobRegion[lang], {
                    replyMarkup: keyboards.regionKeyboard(lang, regions, 'job_salary')
                });
                return;
            }

            const cleaned = text.replace(/[^\d]/g, '');
            const salaryMin = cleaned ? parseInt(cleaned, 10) : 0;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_SALARY_MAX,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, salary_min: salaryMin || null } }
            });
            await this.sendPrompt(chatId, session, botTexts.postJobSalaryMax[lang], {
                replyMarkup: keyboards.jobSalaryMaxKeyboard(lang)
            });
            return;
        }

        if (state === BotState.POSTING_JOB_SALARY_MAX) {
            const cleaned = text.replace(/[^\d]/g, '');
            const salaryMaxRaw = cleaned ? parseInt(cleaned, 10) : null;
            const salaryMax = salaryMaxRaw && salaryMaxRaw > 0 ? salaryMaxRaw : null;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_REGION,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, salary_max: salaryMax } }
            });
            const regions = await this.getRegions();
            await this.sendPrompt(chatId, session, botTexts.postJobRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'job_salary')
            });
            return;
        }

        if (state === BotState.POSTING_JOB_ADDRESS) {
            const updatedJob = { ...session.data?.temp_job, address: text.trim() };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_WORK_MODE,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobWorkModePrompt[lang], { replyMarkup: keyboards.jobWorkModeKeyboard(lang) });
            return;
        }

        if (state === BotState.POSTING_JOB_WORK_HOURS) {
            const updatedJob = { ...session.data?.temp_job, working_hours: text.trim() || null };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_EXPERIENCE,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobExperiencePrompt[lang], { replyMarkup: keyboards.jobExperienceKeyboard(lang) });
            return;
        }

        if (state === BotState.POSTING_JOB_AGE) {
            const parsed = this.parseAgeRange(text);
            if (!parsed) {
                await this.sendPrompt(chatId, session, botTexts.jobAgeInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'job_gender')
                });
                return;
            }
            const updatedJob = { ...session.data?.temp_job, age_min: parsed.min, age_max: parsed.max };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_LANGUAGES,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobLanguagesPrompt[lang], {
                replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'job_age')
            });
            return;
        }

        if (state === BotState.POSTING_JOB_LANGUAGES) {
            const list = this.parseListInput(text);
            const updatedJob = { ...session.data?.temp_job, languages: list };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_BENEFITS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'job_languages')
            });
            return;
        }

        if (state === BotState.POSTING_JOB_BENEFITS) {
            const updatedJob = { ...session.data?.temp_job, benefits: text.trim() || null };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_HR_NAME,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobHrPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_benefits') });
            return;
        }

        if (state === BotState.POSTING_JOB_HR_NAME) {
            const updatedJob = { ...session.data?.temp_job, hr_name: text.trim() || null };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_CONTACT_PHONE,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobContactPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_hr') });
            return;
        }

        if (state === BotState.POSTING_JOB_CONTACT_PHONE) {
            const cleaned = text.replace(/[^\d+]/g, '');
            const updatedJob = { ...session.data?.temp_job, contact_phone: cleaned || text.trim() || null };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_DESCRIPTION,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.postJobDescription[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_contact') });
            return;
        }

        if (state === BotState.POSTING_JOB_DESCRIPTION) {
            const updatedJob = { ...session.data?.temp_job, description: text.trim() };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_CONFIRM,
                data: { ...session.data, temp_job: updatedJob }
            });
            const jobSummary = this.buildJobConfirmText(lang, updatedJob);
            await this.sendPrompt(chatId, session, jobSummary, { replyMarkup: keyboards.jobConfirmKeyboard(lang) });
            return;
        }


        // RESUME
        if (state === BotState.ENTERING_BIRTH_DATE) {
            const parsed = this.parseBirthDateInput(text);
            if (!parsed) {
                await this.sendPrompt(chatId, session, botTexts.birthDateInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'gender')
                });
                return;
            }

            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, birth_date: parsed }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }

            const updatedData = { ...session.data, resume: { ...session.data?.resume, birth_date: parsed } };
            await this.setSession(session, {
                state: BotState.SELECTING_SPECIAL,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.askSpecialCriteria[lang], {
                replyMarkup: keyboards.specialCriteriaKeyboard(lang, updatedData.resume?.special || [], 'birthdate')
            });
            return;
        }

        if (state === BotState.ENTERING_TITLE) {
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, title: text }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, title: text } };
            await this.setSession(session, {
                state: BotState.ENTERING_NAME,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.backKeyboard(lang, 'title') };
            await this.sendPrompt(chatId, session, botTexts.askName[lang], options);
            return;
        }

        if (state === BotState.ENTERING_NAME) {
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, full_name: text }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, full_name: text } };
            await this.setSession(session, {
                state: BotState.ENTERING_ABOUT,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'name') };
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], options);
            return;
        }

        if (state === BotState.ENTERING_ABOUT) {
            const lowerText = text.toLowerCase();
            if (lowerText === "o'tkazib yuborish" || lowerText === 'пропустить') {
                await this.handleSkip(chatId, session);
                return;
            }
            const aboutText = text;
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, about: aboutText }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, about: aboutText } };
            await this.setSession(session, {
                state: BotState.ADDING_SKILLS,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.skillsInlineKeyboard(lang, false, 'about') };
            await this.sendPrompt(chatId, session, botTexts.askSkills[lang], options);
            return;
        }

        if (state === BotState.ADDING_SKILLS) {
            const skipText = text.toLowerCase();
            if (skipText === "o'tkazib yuborish" || skipText === 'пропустить') {
                await this.handleSkip(chatId, session);
                return;
            }
            const lower = text.toLowerCase();
            if (lower === 'tayyor' || lower === 'готово') {
                await this.finishSkills(chatId, session);
                return;
            }
            const currentSkills = session.data?.resume?.skills || [];
            const items = text.split(',').map(item => item.trim()).filter(Boolean);
            items.forEach(item => {
                if (!currentSkills.includes(item)) currentSkills.push(item);
            });
            const updatedData = { ...session.data, resume: { ...session.data?.resume, skills: currentSkills } };
            await this.setSession(session, { data: updatedData });
            const addedItems = items.length > 0 ? items : [text];
            const addedText = addedItems.join(', ');
            await this.sendPrompt(chatId, session, `${botTexts.skillAdded[lang]} ${addedText}`, {
                parseMode: 'HTML',
                replyMarkup: keyboards.skillsInlineKeyboard(lang, currentSkills.length > 0, 'about')
            });
            return;
        }

        if (state === BotState.ENTERING_WORKPLACE) {
            const raw = text.trim();
            if (!raw) {
                await this.sendPrompt(chatId, session, botTexts.askWorkplace[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'experience')
                });
                return;
            }
            const parts = raw.split(/—|–|-/).map(p => p.trim()).filter(Boolean);
            const company = parts[0] || raw;
            const position = parts.length > 1 ? parts.slice(1).join(' - ') : '';
            await this.setSession(session, {
                state: BotState.ENTERING_WORKPLACE_YEARS,
                data: { ...session.data, workplace_pending: { company, position } }
            });
            await this.sendPrompt(chatId, session, botTexts.askWorkStartYear[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'workplace')
            });
            return;
        }

        if (state === BotState.ENTERING_WORKPLACE_YEARS) {
            const startYear = this.parseYearInput(text);
            if (!startYear) {
                await this.sendPrompt(chatId, session, botTexts.workStartYearInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'workplace')
                });
                return;
            }
            const pending = session.data?.workplace_pending || {};
            await this.setSession(session, {
                state: BotState.ENTERING_WORKPLACE_END_YEAR,
                data: { ...session.data, workplace_pending: { ...pending, start_year: startYear } }
            });
            await this.sendPrompt(chatId, session, botTexts.askWorkEndYear[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'workstart')
            });
            return;
        }

        if (state === BotState.ENTERING_WORKPLACE_END_YEAR) {
            const pending = session.data?.workplace_pending || {};
            const startYear = Number(pending.start_year);
            const endParsed = this.parseEndYearInput(text);
            if (!endParsed) {
                await this.sendPrompt(chatId, session, botTexts.workEndYearInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'workstart')
                });
                return;
            }
            const endYear = endParsed.end_year ?? null;
            if (endYear && startYear && endYear < startYear) {
                await this.sendPrompt(chatId, session, botTexts.workEndYearInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'workstart')
                });
                return;
            }
            const company = pending.company || '';
            const position = pending.position || '';
            const previous = Array.isArray(session.data?.resume?.experience_details) ? session.data?.resume?.experience_details : [];
            const experienceEntry = {
                company,
                position,
                start_year: startYear || undefined,
                end_year: endYear || undefined,
                is_current: endParsed.is_current || false
            };
            const experienceDetails = [...previous, experienceEntry];
            const updatedData = {
                ...session.data,
                resume: { ...session.data?.resume, experience_details: experienceDetails },
                workplace_stage: session.data?.workplace_stage ?? null,
                workplace_pending: null
            };
            await this.setSession(session, { data: updatedData });
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, experience_details: experienceDetails }, session.data.active_resume_id);
            }
            const yearsLabel = this.formatWorkYears(experienceEntry);
            await this.sendPrompt(
                chatId,
                session,
                `${botTexts.skillAdded[lang]} ${company}${position ? ` — ${position}` : ''}${yearsLabel ? ` (${yearsLabel})` : ''}`,
                { parseMode: 'HTML', replyMarkup: keyboards.workplaceContinueKeyboard(lang) }
            );
            return;
        }

        if (state === BotState.ENTERING_EDUCATION_PLACE) {
            const raw = text.trim();
            if (!raw) {
                await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'education')
                });
                return;
            }
            const parts = raw.split(/—|–|-/).map(p => p.trim()).filter(Boolean);
            const institution = parts[0] || raw;
            const field = parts.length > 1 ? parts.slice(1).join(' - ') : '';
            await this.setSession(session, {
                state: BotState.ENTERING_EDUCATION_START_YEAR,
                data: {
                    ...session.data,
                    education_pending: { institution, field }
                }
            });
            await this.sendPrompt(chatId, session, botTexts.askEducationStartYear[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'education_place')
            });
            return;
        }

        if (state === BotState.ENTERING_EDUCATION_START_YEAR) {
            const startYear = this.parseYearInput(text);
            if (!startYear) {
                await this.sendPrompt(chatId, session, botTexts.educationStartYearInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'education_place')
                });
                return;
            }
            const pending = session.data?.education_pending || {};
            await this.setSession(session, {
                state: BotState.ENTERING_EDUCATION_END_YEAR,
                data: { ...session.data, education_pending: { ...pending, start_year: startYear } }
            });
            await this.sendPrompt(chatId, session, botTexts.askEducationEndYear[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'edu_start')
            });
            return;
        }

        if (state === BotState.ENTERING_EDUCATION_END_YEAR) {
            const pending = session.data?.education_pending || {};
            const startYear = Number(pending.start_year);
            const endParsed = this.parseEndYearInput(text);
            if (!endParsed) {
                await this.sendPrompt(chatId, session, botTexts.educationEndYearInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'edu_start')
                });
                return;
            }
            const endYear = endParsed.end_year ?? null;
            if (endYear && startYear && endYear < startYear) {
                await this.sendPrompt(chatId, session, botTexts.educationEndYearInvalid[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'edu_start')
                });
                return;
            }
            const institution = pending.institution || '';
            const field = pending.field || '';
            const previous = Array.isArray(session.data?.resume?.education) ? session.data?.resume?.education : [];
            const educationEntry = {
                institution,
                field,
                start_year: startYear || undefined,
                end_year: endYear || undefined,
                is_current: endParsed.is_current || false
            };
            const education = [...previous, educationEntry];
            const updatedData = {
                ...session.data,
                resume: { ...session.data?.resume, education },
                education_pending: null
            };
            await this.setSession(session, { data: updatedData });
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, education }, session.data.active_resume_id);
            }
            const yearsLabel = this.formatWorkYears(educationEntry);
            await this.sendPrompt(chatId, session, `${botTexts.skillAdded[lang]} ${institution}${field ? ` — ${field}` : ''}${yearsLabel ? ` (${yearsLabel})` : ''}`, {
                parseMode: 'HTML',
                replyMarkup: keyboards.educationContinueKeyboard(lang)
            });
            return;
        }

        // AI JOB CREATION
        if (state === BotState.AI_JOB_INPUT) {
            try {
                await sendMessage(chatId, lang === 'uz' ? "🤖 AI ma'lumotlarni tayyorlamoqda..." : '🤖 AI обрабатывает вакансию...');
                const result = await extractVacancyData(text);
                const aiDescription = this.buildJobDescriptionFromSections(result.sections);
                const meta = result.meta || {};
                const updatedJob = {
                    ...session.data?.temp_job,
                    ai_input: text,
                    ai_meta: meta,
                    ai_sections: result.sections,
                    description: aiDescription || null,
                    gender: meta.gender || null,
                    education_level: meta.education_level || null,
                    experience: this.mapAiExperienceValue(meta.experience) || null,
                    work_mode: meta.work_mode || null,
                    employment_type: meta.employment_type || null,
                    working_hours: meta.working_hours || null,
                    working_days: meta.working_days || null,
                    age_min: meta.age_min || null,
                    age_max: meta.age_max || null,
                    languages: Array.isArray(result.sections?.tillar) ? result.sections.tillar : [],
                    benefits: Array.isArray(result.sections?.qulayliklar) ? result.sections.qulayliklar.join(', ') : null
                };
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.POSTING_JOB_TITLE,
                    data: { ...session.data, temp_job: updatedJob }
                });
                await this.sendPrompt(chatId, session, botTexts.postJobTitle[lang], {
                    replyMarkup: keyboards.cancelReplyKeyboard(lang)
                });
            } catch (err) {
                console.error('AI job parse error:', err);
                await this.sendPrompt(chatId, session, botTexts.error[lang], {
                    replyMarkup: keyboards.cancelReplyKeyboard(lang)
                });
            }
            return;
        }


        // Fallback - Handle reply keyboard button texts
        // These must match the actual button texts in mainMenuKeyboard / employerMainMenuKeyboard
        const menuTexts = {
            jobs: { uz: '🔎 Ish topish', ru: '🔎 Найти работу' },
            saved: { uz: '⭐ Saqlanganlar', ru: '⭐ Сохранённые' },
            resume: { uz: '🧾 Rezyume', ru: '🧾 Резюме' },
            settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки' },
            help: { uz: '🆘 Yordam', ru: '🆘 Помощь' }
        };
        const employerTexts = {
            post_job: { uz: '📢 Vakansiya joylash', ru: '📢 Разместить вакансию' },
            my_vacancies: { uz: '📋 Mening vakansiyalarim', ru: '📋 Мои вакансии' },
            find_worker: { uz: '🧑‍💼 Ishchi topish', ru: '🧑‍💼 Найти сотрудника' },
            applications: { uz: '📨 Arizalar', ru: '📨 Отклики' },
            help: { uz: '🆘 Yordam', ru: '🆘 Помощь' },
            settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки' }
        };
        const isEmployer = session.data?.active_role === 'employer';

        if (isEmployer) {
            if (text === employerTexts.post_job[lang]) {
                await this.handleEmployerMainMenu(chatId, 'post_job', session);
            } else if (text === employerTexts.my_vacancies[lang]) {
                await this.handleEmployerMainMenu(chatId, 'my_vacancies', session);
            } else if (text === employerTexts.find_worker[lang]) {
                await this.handleEmployerMainMenu(chatId, 'find_worker', session);
            } else if (text === employerTexts.applications[lang]) {
                await this.handleEmployerMainMenu(chatId, 'applications', session);
            } else if (text === employerTexts.help[lang]) {
                await this.handleAction(chatId, 'help', session);
            } else if (text === employerTexts.settings[lang]) {
                await this.handleAction(chatId, 'settings', session);
            } else {
                await this.showMainMenu(chatId, session);
            }
            return;
        }

        if (text === menuTexts.jobs[lang]) {
            await this.handleAction(chatId, 'jobs', session);
        } else if (text === menuTexts.resume[lang]) {
            await this.handleAction(chatId, 'profile', session);
        } else if (text === menuTexts.settings[lang]) {
            await this.handleAction(chatId, 'settings', session);
        } else if (text === menuTexts.saved[lang]) {
            await this.handleAction(chatId, 'saved', session);
        } else if (text === menuTexts.help[lang]) {
            await this.handleAction(chatId, 'help', session);
        } else {
            // Unknown text - show help + menu to avoid hard errors
            console.log('[BOT] Unknown text in state', state, ':', text);
            const isEmployer = session.data?.active_role === 'employer';
            await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                replyMarkup: isEmployer ? keyboards.employerMainMenuKeyboard(lang) : keyboards.mainMenuKeyboard(lang, 'seeker')
            });
        }

    }

    private async handleSkip(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const state = session.state;

        // Optional resume steps
        if (state === BotState.ENTERING_ABOUT) {
            const updatedData = { ...session.data, resume: { ...session.data?.resume, about: null } };
            await this.setSession(session, {
                state: BotState.ADDING_SKILLS,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.askSkills[lang], {
                replyMarkup: keyboards.skillsInlineKeyboard(lang, false, 'about')
            });
            return;
        }
        if (state === BotState.ADDING_SKILLS) {
            const updatedData = { ...session.data, resume: { ...session.data?.resume, skills: [] } };
            await this.setSession(session, { data: updatedData });
            await this.finishSkills(chatId, session);
            return;
        }

        // Optional job steps
        if (state === BotState.POSTING_JOB_LANGUAGES) {
            const updatedJob = { ...session.data?.temp_job, languages: [] };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_BENEFITS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'job_languages')
            });
            return;
        }
        if (state === BotState.POSTING_JOB_BENEFITS) {
            const updatedJob = { ...session.data?.temp_job, benefits: null };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_HR_NAME,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobHrPrompt[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'job_benefits')
            });
            return;
        }

        if (state === BotState.SELECTING_SALARY_MAX) {
            await this.handleSalaryMaxSelect(chatId, 'all', session);
            return;
        }

        // For required steps, ignore skip and re-ask
        if (state === BotState.REQUESTING_LOCATION) {
            await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
        }
    }

    private async handleCancel(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.clearFlowCancelKeyboard(chatId, session);
        const isEmployer = session.data?.active_role === 'employer';
        const activeRole = isEmployer ? 'employer' : 'seeker';
        const updatedData = {
            ...session.data,
            flow: null,
            edit_mode: false,
            edit_field: null,
            location_intent: null,
            role_switch_pending: false,
            geo_requirements_resume_id: null,
            geo_requirements_need_gender: false,
            geo_requirements_need_education: false,
            workplace_stage: null,
            clean_inputs: false,
            selected_categories: [],
            resume: {},
            temp_job: null
        };
        await this.setSession(session, {
            state: isEmployer ? BotState.EMPLOYER_MAIN_MENU : BotState.MAIN_MENU,
            data: updatedData
        });
        await this.sendPrompt(chatId, session, botTexts.mainMenu[lang], {
            replyMarkup: isEmployer ? keyboards.employerMainMenuKeyboard(lang) : keyboards.mainMenuKeyboard(lang, activeRole)
        });
    }

    private async handleBack(chatId: number, target: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (target === 'main_menu') {
            await this.showMainMenu(chatId, session);
            return;
        }

        if (target === 'employer_menu') {
            await this.setSession(session, { state: BotState.EMPLOYER_MAIN_MENU });
            await this.sendPrompt(chatId, session, botTexts.employerMainMenu[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
            return;
        }

        if (target === 'region') {
            const regions = await this.getRegions();
            await this.setSession(session, { state: BotState.SELECTING_REGION });
            await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'main_menu')
            });
            return;
        }

        if (target === 'district') {
            const districts = session.data?.districts || [];
            const districtCounts = session.data?.district_counts || {};
            await this.setSession(session, { state: BotState.SELECTING_DISTRICT });
            await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], {
                replyMarkup: keyboards.districtKeyboard(districts, lang, session.data?.districtPage || 0, districtCounts, 'region')
            });
            return;
        }

        if (target === 'category') {
            const fallbackCategories = await this.getCategories();
            const categories = this.getCategoryOptionsFromSession(session, fallbackCategories);
            const categoryCounts = session.data?.category_counts || {};
            await this.setSession(session, { state: BotState.SELECTING_CATEGORY });
            await this.sendPrompt(chatId, session, botTexts.askCategory[lang], {
                replyMarkup: keyboards.multiCategoryKeyboard(lang, session.data?.selected_categories || [], categories as any, categoryCounts, 'district')
            });
            return;
        }

        if (target === 'experience') {
            await this.setSession(session, { state: BotState.SELECTING_EXPERIENCE });
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], { replyMarkup: keyboards.experienceKeyboard(lang) });
            return;
        }

        if (target === 'workplace') {
            await this.setSession(session, { state: BotState.ENTERING_WORKPLACE, data: { ...session.data, workplace_pending: null } });
            await this.setFlowCancelKeyboard(chatId, session, 'back');
            await this.sendPrompt(chatId, session, botTexts.askWorkplace[lang], { replyMarkup: keyboards.backKeyboard(lang, 'experience') });
            return;
        }

        if (target === 'workstart') {
            await this.setSession(session, { state: BotState.ENTERING_WORKPLACE_YEARS });
            await this.sendPrompt(chatId, session, botTexts.askWorkStartYear[lang], { replyMarkup: keyboards.backKeyboard(lang, 'workplace') });
            return;
        }

        if (target === 'education') {
            await this.setSession(session, { state: BotState.SELECTING_EDUCATION });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], { replyMarkup: keyboards.educationKeyboard(lang) });
            return;
        }

        if (target === 'education_place') {
            await this.setSession(session, { state: BotState.ENTERING_EDUCATION_PLACE, data: { ...session.data, education_pending: null } });
            await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], { replyMarkup: keyboards.backKeyboard(lang, 'education') });
            return;
        }

        if (target === 'edu_start') {
            await this.setSession(session, { state: BotState.ENTERING_EDUCATION_START_YEAR });
            await this.sendPrompt(chatId, session, botTexts.askEducationStartYear[lang], { replyMarkup: keyboards.backKeyboard(lang, 'education_place') });
            return;
        }

        if (target === 'gender') {
            await this.setSession(session, { state: BotState.SELECTING_GENDER });
            await this.sendPrompt(chatId, session, botTexts.askGender[lang], { replyMarkup: keyboards.genderKeyboard(lang, false) });
            return;
        }

        if (target === 'birthdate') {
            await this.setSession(session, { state: BotState.ENTERING_BIRTH_DATE });
            await this.sendPrompt(chatId, session, botTexts.askBirthDate[lang], { replyMarkup: keyboards.backKeyboard(lang, 'gender') });
            return;
        }

        if (target === 'salary') {
            await this.setSession(session, { state: BotState.SELECTING_SALARY });
            await this.sendPrompt(chatId, session, botTexts.askSalary[lang], { replyMarkup: keyboards.salaryKeyboard(lang) });
            return;
        }

        if (target === 'title') {
            await this.setSession(session, { state: BotState.ENTERING_TITLE });
            await this.sendPrompt(chatId, session, botTexts.askTitle[lang], { replyMarkup: keyboards.backKeyboard(lang, 'salary') });
            return;
        }

        if (target === 'name') {
            await this.setSession(session, { state: BotState.ENTERING_NAME });
            await this.sendPrompt(chatId, session, botTexts.askName[lang], { replyMarkup: keyboards.backKeyboard(lang, 'title') });
            return;
        }

        if (target === 'about') {
            await this.setSession(session, { state: BotState.ENTERING_ABOUT });
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], { replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'name') });
            return;
        }

        if (target === 'skills') {
            const hasSkills = Array.isArray(session.data?.resume?.skills) && session.data.resume.skills.length > 0;
            await this.setSession(session, { state: BotState.ADDING_SKILLS });
            await this.sendPrompt(chatId, session, botTexts.askSkills[lang], { replyMarkup: keyboards.skillsInlineKeyboard(lang, hasSkills, 'about') });
            return;
        }

        if (target === 'employer_size') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_SIZE });
            await this.sendPrompt(chatId, session, botTexts.employerSizePrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_industry') });
            return;
        }

        if (target === 'employer_industry') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_INDUSTRY });
            await this.sendPrompt(chatId, session, botTexts.employerIndustryPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_director') });
            return;
        }

        if (target === 'employer_director') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DIRECTOR });
            await this.sendPrompt(chatId, session, botTexts.employerDirectorPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_company') });
            return;
        }

        if (target === 'employer_company') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_COMPANY });
            await this.sendPrompt(chatId, session, botTexts.companyNamePrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_menu') });
            return;
        }

        if (target === 'resume_view') {
            const resumeId = session.data?.active_resume_id;
            if (resumeId) {
                await this.showResumeById(chatId, resumeId, session);
                return;
            }
            await this.showResumeList(chatId, session);
            return;
        }
        if (target === 'employer_region') {
            const regions = await this.getRegions();
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_REGION });
            await this.sendPrompt(chatId, session, botTexts.employerRegionPrompt[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'employer_size')
            });
            return;
        }

        if (target === 'employer_address') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_ADDRESS });
            await this.sendPrompt(chatId, session, botTexts.employerAddressPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_region') });
            return;
        }

        if (target === 'job_title') {
            await this.setSession(session, { state: BotState.POSTING_JOB_TITLE });
            await this.sendPrompt(chatId, session, botTexts.postJobTitle[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_menu') });
            return;
        }

        if (target === 'job_category') {
            const categories = await this.getCategories();
            await this.setSession(session, { state: BotState.POSTING_JOB_CATEGORY });
            await this.sendPrompt(chatId, session, botTexts.postJobCategory[lang], {
                replyMarkup: keyboards.categoryKeyboard(lang, categories, 'job_title')
            });
            return;
        }

        if (target === 'job_salary') {
            await this.setSession(session, { state: BotState.POSTING_JOB_SALARY });
            await this.sendPrompt(chatId, session, botTexts.postJobSalary[lang], {
                replyMarkup: keyboards.jobSalaryKeyboard(lang)
            });
            return;
        }

        if (target === 'job_salary_max') {
            await this.setSession(session, { state: BotState.POSTING_JOB_SALARY_MAX });
            await this.sendPrompt(chatId, session, botTexts.postJobSalaryMax[lang], {
                replyMarkup: keyboards.jobSalaryMaxKeyboard(lang)
            });
            return;
        }

        if (target === 'job_region') {
            const regions = await this.getRegions();
            await this.setSession(session, { state: BotState.POSTING_JOB_REGION });
            await this.sendPrompt(chatId, session, botTexts.postJobRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'job_salary')
            });
            return;
        }

        if (target === 'job_district') {
            const districts = session.data?.districts || [];
            const districtCounts = session.data?.district_counts || {};
            await this.setSession(session, { state: BotState.POSTING_JOB_DISTRICT });
            await this.sendPrompt(chatId, session, botTexts.employerDistrictPrompt[lang], {
                replyMarkup: keyboards.districtKeyboard(districts, lang, session.data?.districtPage || 0, districtCounts, 'job_region', false)
            });
            return;
        }

        if (target === 'job_address') {
            await this.setSession(session, { state: BotState.POSTING_JOB_ADDRESS });
            await this.sendPrompt(chatId, session, botTexts.jobAddressPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_district') });
            return;
        }

        if (target === 'job_work_mode') {
            await this.setSession(session, { state: BotState.POSTING_JOB_WORK_MODE });
            await this.sendPrompt(chatId, session, botTexts.jobWorkModePrompt[lang], { replyMarkup: keyboards.jobWorkModeKeyboard(lang) });
            return;
        }

        if (target === 'job_employment') {
            await this.setSession(session, { state: BotState.POSTING_JOB_EMPLOYMENT });
            await this.sendPrompt(chatId, session, botTexts.jobEmploymentPrompt[lang], { replyMarkup: keyboards.jobEmploymentKeyboard(lang) });
            return;
        }

        if (target === 'job_work_days') {
            await this.setSession(session, { state: BotState.POSTING_JOB_WORK_DAYS });
            await this.sendPrompt(chatId, session, botTexts.jobWorkingDaysPrompt[lang], { replyMarkup: keyboards.jobWorkingDaysKeyboard(lang) });
            return;
        }

        if (target === 'job_work_hours') {
            await this.setSession(session, { state: BotState.POSTING_JOB_WORK_HOURS });
            await this.sendPrompt(chatId, session, botTexts.jobWorkingHoursPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_work_days') });
            return;
        }

        if (target === 'job_experience') {
            await this.setSession(session, { state: BotState.POSTING_JOB_EXPERIENCE });
            await this.sendPrompt(chatId, session, botTexts.jobExperiencePrompt[lang], { replyMarkup: keyboards.jobExperienceKeyboard(lang) });
            return;
        }

        if (target === 'job_education') {
            await this.setSession(session, { state: BotState.POSTING_JOB_EDUCATION });
            await this.sendPrompt(chatId, session, botTexts.jobEducationPrompt[lang], { replyMarkup: keyboards.jobEducationKeyboard(lang) });
            return;
        }

        if (target === 'job_gender') {
            await this.setSession(session, { state: BotState.POSTING_JOB_GENDER });
            await this.sendPrompt(chatId, session, botTexts.jobGenderPrompt[lang], { replyMarkup: keyboards.jobGenderKeyboard(lang) });
            return;
        }

        if (target === 'job_age') {
            await this.setSession(session, { state: BotState.POSTING_JOB_AGE });
            await this.sendPrompt(chatId, session, botTexts.jobAgePrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_gender') });
            return;
        }

        if (target === 'job_languages') {
            await this.setSession(session, { state: BotState.POSTING_JOB_LANGUAGES });
            await this.sendPrompt(chatId, session, botTexts.jobLanguagesPrompt[lang], {
                replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'job_age')
            });
            return;
        }

        if (target === 'job_benefits') {
            await this.setSession(session, { state: BotState.POSTING_JOB_BENEFITS });
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'job_languages')
            });
            return;
        }

        if (target === 'job_hr') {
            await this.setSession(session, { state: BotState.POSTING_JOB_HR_NAME });
            await this.sendPrompt(chatId, session, botTexts.jobHrPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_benefits') });
            return;
        }

        if (target === 'job_contact') {
            await this.setSession(session, { state: BotState.POSTING_JOB_CONTACT_PHONE });
            await this.sendPrompt(chatId, session, botTexts.jobContactPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_hr') });
            return;
        }

        if (target === 'job_description') {
            await this.setSession(session, { state: BotState.POSTING_JOB_DESCRIPTION });
            await this.sendPrompt(chatId, session, botTexts.postJobDescription[lang], { replyMarkup: keyboards.backKeyboard(lang, 'job_contact') });
            return;
        }

        await this.showMainMenu(chatId, session);
    }

    private async finishSkills(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const resume = { ...(session.data?.resume || {}) };
            await this.saveResume(session, resume, session.data.active_resume_id);
            const updatedData = { ...session.data, edit_mode: false, edit_field: null };
            await this.setSession(session, { data: updatedData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        const updatedData = { ...session.data };
        const resume = updatedData.resume || {};
        if (this.shouldAskWorkplace(resume)) {
            await this.setSession(session, {
                state: BotState.ENTERING_WORKPLACE,
                data: updatedData
            });
            await this.setFlowCancelKeyboard(chatId, session, 'back');
            await this.sendPrompt(chatId, session, botTexts.askWorkplace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'experience')
            });
            return;
        }

        if (this.shouldAskEducationPlace(resume)) {
            await this.setSession(session, {
                state: BotState.ENTERING_EDUCATION_PLACE,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'education')
            });
            return;
        }

        await this.setSession(session, {
            state: BotState.REQUESTING_LOCATION,
            data: { ...updatedData, location_intent: 'resume_final' }
        });
        await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
            replyMarkup: keyboards.locationRequestKeyboard(lang)
        });
    }

    private async finishWorkplaceStep(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const updatedData = { ...session.data };
        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const resume = updatedData.resume || {};
            await this.saveResume(session, resume, session.data.active_resume_id);
            const nextData = { ...updatedData, edit_mode: false, edit_field: null };
            await this.setSession(session, { data: nextData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }
        await this.setFlowCancelKeyboard(chatId, session);
        if (session.data?.workplace_stage === 'after_experience') {
            await this.setSession(session, {
                state: BotState.SELECTING_EDUCATION,
                data: { ...updatedData, workplace_stage: null }
            });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], {
                replyMarkup: keyboards.educationKeyboard(lang)
            });
            return;
        }
        if (this.shouldAskEducationPlace(updatedData.resume)) {
            await this.setSession(session, { state: BotState.ENTERING_EDUCATION_PLACE, data: updatedData });
            await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'education')
            });
            return;
        }
        await this.setSession(session, {
            state: BotState.REQUESTING_LOCATION,
            data: { ...updatedData, location_intent: 'resume_final' }
        });
        await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
            replyMarkup: keyboards.locationRequestKeyboard(lang)
        });
    }

    private async finishEducationStep(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const updatedData = { ...session.data };
        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const resume = updatedData.resume || {};
            await this.saveResume(session, resume, session.data.active_resume_id);
            const nextData = { ...updatedData, edit_mode: false, edit_field: null };
            await this.setSession(session, { data: nextData });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }
        await this.setSession(session, {
            state: BotState.REQUESTING_LOCATION,
            data: { ...updatedData, location_intent: 'resume_final' }
        });
        await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
            replyMarkup: keyboards.locationRequestKeyboard(lang)
        });
    }

    private async startResumeFlow(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.setFlowCancelKeyboard(chatId, session);
        const regions = await this.getRegions();
        const updatedData = {
            ...session.data,
            active_role: 'job_seeker',
            flow: null,
            subscription_draft: null,
            resume: {
                title: null,
                full_name: null,
                about: null,
                expected_salary_min: null,
                gender: null,
                education_level: null,
                experience: null,
                experience_level: null,
                category_id: null,
                category_ids: [],
                region_id: null,
                district_id: null,
                skills: [],
                experience_details: [],
                education: [],
                special: [],
                birth_date: null
            },
            selected_categories: [],
            active_resume_id: null,
            edit_mode: false,
            edit_field: null,
            workplace_stage: null,
            workplace_pending: null,
            clean_inputs: true
        };
        await this.setSession(session, {
            state: BotState.SELECTING_REGION,
            data: updatedData
        });
        await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
            replyMarkup: keyboards.regionKeyboard(lang, regions, 'main_menu')
        });
    }

    private async showResumeList(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) return;
        const { data: resumes } = await this.supabase
            .from('resumes')
            .select('id, title, created_at')
            .eq('user_id', session.user_id)
            .order('created_at', { ascending: false });

        if (!resumes || resumes.length === 0) {
            await this.startResumeFlow(chatId, session);
            return;
        }

        const listData = { ...session.data, active_role: 'job_seeker' };
        await this.setSession(session, {
            state: BotState.VIEWING_RESUME,
            data: listData
        });

        await this.sendPrompt(chatId, session, botTexts.resumeMenu[lang], {
            replyMarkup: keyboards.resumeListKeyboard(lang, resumes)
        });
    }

    private async showResumeById(chatId: number, resumeId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        const updatedData = { ...session.data, active_resume_id: resumeId };
        await this.setSession(session, {
            state: BotState.VIEWING_RESUME,
            data: updatedData
        });

        const text = await this.buildResumeText(resume, lang);
        await this.sendPrompt(chatId, session, text, { parseMode: 'HTML', replyMarkup: keyboards.resumeOptionsKeyboard(lang) });
    }

    private async handleResumeEdit(chatId: number, field: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const resumeId = session.data?.active_resume_id;
        if (!resumeId) {
            await this.showResumeList(chatId, session);
            return;
        }
        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        const updatedData = { ...session.data, edit_mode: true, edit_field: field, resume };
        await this.setSession(session, { data: updatedData });

        if (field === 'region') {
            const regions = await this.getRegions();
            await this.setSession(session, { state: BotState.SELECTING_REGION });
            await this.sendPrompt(chatId, session, botTexts.askRegion[lang], { replyMarkup: keyboards.regionKeyboard(lang, regions, 'resume_view') });
            return;
        }

        if (field === 'district') {
            if (!resume.region_id) {
                const regions = await this.getRegions();
                await this.setSession(session, { state: BotState.SELECTING_REGION });
                await this.sendPrompt(chatId, session, botTexts.askRegion[lang], { replyMarkup: keyboards.regionKeyboard(lang, regions, 'resume_view') });
                return;
            }
            const { data: districts } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', resume.region_id)
                .order('name_uz');
            const districtCounts = await this.getDistrictJobCounts(Number(resume.region_id));
            const sortedDistricts = this.sortDistrictsByDemand(districts || [], districtCounts);
            const districtData = {
                ...session.data,
                districts: sortedDistricts,
                districtPage: 0,
                district_counts: districtCounts
            };
            await this.setSession(session, {
                state: BotState.SELECTING_DISTRICT,
                data: districtData
            });
            await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], {
                replyMarkup: keyboards.districtKeyboard(sortedDistricts, lang, 0, districtCounts, 'resume_view')
            });
            return;
        }

        if (field === 'category') {
            const regionIdNum = this.toCoordinate(resume.region_id);
            const districtIdNum = this.toCoordinate(resume.district_id);
            const categoryCounts = await this.getCategoryJobCounts(regionIdNum, districtIdNum);
            const categories = this.sortCategoriesByDemand(await this.getCategories(), categoryCounts);
            const selected = Array.isArray(resume.category_ids) && resume.category_ids.length > 0
                ? resume.category_ids
                : resume.category_id ? [resume.category_id] : [];
            const catData = {
                ...session.data,
                selected_categories: selected,
                category_counts: categoryCounts,
                category_options: categories
            };
            await this.setSession(session, {
                state: BotState.SELECTING_CATEGORY,
                data: catData
            });
            await this.sendPrompt(chatId, session, botTexts.askCategory[lang], {
                replyMarkup: keyboards.multiCategoryKeyboard(lang, selected, categories as any, categoryCounts, 'resume_view')
            });
            return;
        }

        if (field === 'experience') {
            await this.setSession(session, { state: BotState.SELECTING_EXPERIENCE });
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], { replyMarkup: keyboards.experienceKeyboard(lang) });
            return;
        }

        if (field === 'education') {
            await this.setSession(session, { state: BotState.SELECTING_EDUCATION });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], { replyMarkup: keyboards.educationKeyboard(lang) });
            return;
        }

        if (field === 'gender') {
            await this.setSession(session, { state: BotState.SELECTING_GENDER });
            await this.sendPrompt(chatId, session, botTexts.askGender[lang], { replyMarkup: keyboards.genderKeyboard(lang, false) });
            return;
        }

        if (field === 'birth_date') {
            await this.setSession(session, { state: BotState.ENTERING_BIRTH_DATE });
            await this.sendPrompt(chatId, session, botTexts.askBirthDate[lang], { replyMarkup: keyboards.backKeyboard(lang, 'resume_view') });
            return;
        }

        if (field === 'special') {
            await this.setSession(session, { state: BotState.SELECTING_SPECIAL });
            await this.sendPrompt(chatId, session, botTexts.askSpecialCriteria[lang], {
                replyMarkup: keyboards.specialCriteriaKeyboard(lang, Array.isArray(resume.special) ? resume.special : [], 'birthdate')
            });
            return;
        }

        if (field === 'salary') {
            await this.setSession(session, { state: BotState.SELECTING_SALARY });
            await this.sendPrompt(chatId, session, botTexts.askSalary[lang], { replyMarkup: keyboards.salaryKeyboard(lang) });
            return;
        }

        if (field === 'title') {
            await this.setSession(session, { state: BotState.ENTERING_TITLE });
            await this.sendPrompt(chatId, session, botTexts.askTitle[lang], { replyMarkup: keyboards.backKeyboard(lang, 'resume_view') });
            return;
        }

        if (field === 'name') {
            await this.setSession(session, { state: BotState.ENTERING_NAME });
            await this.sendPrompt(chatId, session, botTexts.askName[lang], { replyMarkup: keyboards.backKeyboard(lang, 'resume_view') });
            return;
        }

        if (field === 'about') {
            await this.setSession(session, { state: BotState.ENTERING_ABOUT });
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], { replyMarkup: keyboards.aboutSkipInlineKeyboard(lang) });
            return;
        }

        if (field === 'skills') {
            await this.setSession(session, { state: BotState.ADDING_SKILLS });
            await this.sendPrompt(chatId, session, botTexts.askSkills[lang], {
                replyMarkup: keyboards.skillsInlineKeyboard(lang, Array.isArray(resume.skills) && resume.skills.length > 0, 'resume_view')
            });
            return;
        }

        if (field === 'workplace') {
            await this.setSession(session, { state: BotState.ENTERING_WORKPLACE, data: { ...session.data, workplace_pending: null } });
            await this.setFlowCancelKeyboard(chatId, session, 'back');
            await this.sendPrompt(chatId, session, botTexts.askWorkplace[lang], { replyMarkup: keyboards.backKeyboard(lang, 'experience') });
            return;
        }

        if (field === 'education_place') {
            await this.setSession(session, { state: BotState.ENTERING_EDUCATION_PLACE });
            await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], { replyMarkup: keyboards.backKeyboard(lang, 'resume_view') });
            return;
        }

        await this.showResumeById(chatId, resumeId, session);
    }

    private async buildResumeText(resume: any, lang: BotLang): Promise<string> {
        const lines: string[] = [];
        const title = resume.title || (lang === 'uz' ? 'Rezyume' : 'Резюме');
        lines.push(`🧾 | ${title}`);
        lines.push('— — — — — — — — — — — — — — — —');

        if (resume.full_name) lines.push(`🪪 | ${lang === 'uz' ? 'Ism' : 'Имя'}: ${resume.full_name}`);
        if (resume.phone) lines.push(`📱 | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${resume.phone}`);
        if (resume.birth_date) {
            let formatted = String(resume.birth_date);
            const parsed = new Date(resume.birth_date);
            if (!Number.isNaN(parsed.getTime())) {
                const dd = String(parsed.getDate()).padStart(2, '0');
                const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                const yyyy = parsed.getFullYear();
                formatted = `${dd}.${mm}.${yyyy}`;
            }
            lines.push(`🎂 | ${lang === 'uz' ? "Tug'ilgan sana" : 'Дата рождения'}: ${formatted}`);
        }

        const regions = await this.getRegions();
        const regionName = regions.find(r => r.id === resume.region_id);

        let districtName: string | null = null;
        if (resume.district_id) {
            const { data: district } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('id', resume.district_id)
                .maybeSingle();
            districtName = district ? (lang === 'uz' ? district.name_uz : district.name_ru) : null;
        }

        const location = [regionName ? (lang === 'uz' ? regionName.name_uz : regionName.name_ru) : null, districtName]
            .filter(Boolean)
            .join(', ');
        if (location) lines.push(`📍 | ${lang === 'uz' ? 'Joylashuv' : 'Локация'}: ${location}`);

        const categories = await this.getCategories();
        const categoryIds = Array.isArray(resume.category_ids) && resume.category_ids.length > 0
            ? resume.category_ids
            : resume.category_id ? [resume.category_id] : [];
        if (categoryIds.length > 0) {
            const names = categoryIds
                .map((id: string) => categories.find((cat: CategoryRef) => cat.id === id))
                .filter(Boolean)
                .map((cat: CategoryRef) => lang === 'uz' ? cat.name_uz : cat.name_ru);
            if (names.length > 0) lines.push(`🧭 | ${lang === 'uz' ? 'Soha' : 'Сфера'}: ${names.join(', ')}`);
        }

        const expKey = resume.experience_level || resume.experience;
        if (expKey && EXPERIENCE_LABELS[expKey as keyof typeof EXPERIENCE_LABELS]) {
            lines.push(`🧠 | ${lang === 'uz' ? 'Tajriba' : 'Опыт'}: ${EXPERIENCE_LABELS[expKey][lang]}`);
        }

        if (resume.education_level) {
            const eduMap: Record<string, { uz: string; ru: string }> = {
                secondary: { uz: "O'rta", ru: 'Среднее' },
                vocational: { uz: "O'rta maxsus", ru: 'Среднее спец.' },
                incomplete_higher: { uz: 'Oliy (tugallanmagan)', ru: 'Неоконченное высшее' },
                higher: { uz: 'Oliy', ru: 'Высшее' },
                master: { uz: 'Magistr', ru: 'Магистр' },
                phd: { uz: 'PhD', ru: 'PhD' }
            };
            const eduLabel = eduMap[resume.education_level]?.[lang] || resume.education_level;
            lines.push(`🎓 | ${lang === 'uz' ? "Ma'lumot" : 'Образование'}: ${eduLabel}`);
        }

        if (resume.gender && !['any', 'Ahamiyatsiz', 'Любой'].includes(resume.gender)) {
            const genderLabel = resume.gender === 'male' ? (lang === 'uz' ? 'Erkak' : 'Мужской') : (lang === 'uz' ? 'Ayol' : 'Женский');
            lines.push(`🚻 | ${lang === 'uz' ? 'Jins' : 'Пол'}: ${genderLabel}`);
        }

        if (resume.expected_salary_min) {
            lines.push(`💰 | ${lang === 'uz' ? 'Kutilayotgan maosh' : 'Ожидаемая зарплата'}: ${resume.expected_salary_min} so'm`);
        }

        if (Array.isArray(resume.special) && resume.special.length > 0) {
            const labels: Record<string, { uz: string; ru: string }> = {
                students: { uz: 'Talabalar uchun', ru: 'Для студентов' },
                graduates: { uz: 'Bitiruvchilar uchun', ru: 'Для выпускников' },
                disabled: { uz: "Nogironligi borlar uchun", ru: 'Для людей с инвалидностью' }
            };
            const specialText = resume.special
                .map((key: string) => labels[key]?.[lang])
                .filter(Boolean)
                .join(', ');
            if (specialText) lines.push(`⭐️ | ${lang === 'uz' ? 'Alohida toifalar' : 'Особые категории'}: ${specialText}`);
        }

        const expDetails = Array.isArray(resume.experience_details) ? resume.experience_details : [];
        if (expDetails.length > 0) {
            const expText = expDetails
                .map((exp: any) => {
                    const company = exp?.company || exp?.employer || '';
                    const position = exp?.position || exp?.role || '';
                    const years = this.formatWorkYears(exp);
                    const base = company && position ? `${company} — ${position}` : (company || position);
                    if (!base) return '';
                    return years ? `${base} (${years})` : base;
                })
                .filter(Boolean)
                .join('; ');
            if (expText) lines.push(`🏢 | ${lang === 'uz' ? 'Ish tajribasi' : 'Опыт работы'}: ${expText}`);
        }

        const eduDetails = Array.isArray(resume.education) ? resume.education : [];
        if (eduDetails.length > 0) {
            const eduText = eduDetails
                .map((edu: any) => {
                    const institution = edu?.institution || edu?.school || '';
                    const field = edu?.field || edu?.specialty || '';
                    const years = this.formatWorkYears(edu);
                    const base = institution && field ? `${institution} — ${field}` : (institution || field);
                    if (!base) return '';
                    return years ? `${base} (${years})` : base;
                })
                .filter(Boolean)
                .join('; ');
            if (eduText) lines.push(`🎓 | ${lang === 'uz' ? "O‘qigan joyi" : 'Место учебы'}: ${eduText}`);
        }

        if (Array.isArray(resume.skills) && resume.skills.length > 0) {
            lines.push(`🧠 | ${lang === 'uz' ? "Ko'nikmalar" : 'Навыки'}: ${resume.skills.join(', ')}`);
        }

        if (resume.about) {
            lines.push(`📝 | ${lang === 'uz' ? "O'zi haqida" : 'О себе'}: ${resume.about}`);
        }

        return lines.join('\n');
    }

    private async finalizeResume(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const resumeData = { ...(session.data?.resume || {}) } as any;
        if (!resumeData.title) {
            resumeData.title = resumeData.desired_position || 'Mutaxassis';
        }
        if (!Array.isArray(resumeData.skills)) {
            resumeData.skills = resumeData.skills ? [resumeData.skills].flat() : [];
        }
        if (!Array.isArray(resumeData.special)) {
            resumeData.special = resumeData.special ? [resumeData.special].flat() : [];
        }
        if (resumeData.region_id) resumeData.region_id = Number(resumeData.region_id) || resumeData.region_id;
        if (resumeData.district_id) resumeData.district_id = Number(resumeData.district_id) || resumeData.district_id;
        const resumeId = await this.saveResume(session, resumeData, session.data?.active_resume_id || null);

        if (!resumeId) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        await this.clearFlowCancelKeyboard(chatId, session);

        await this.supabase.from('job_seeker_profiles').upsert({
            user_id: session.user_id,
            full_name: resumeData?.full_name || null,
            phone: session.phone || null,
            region_id: resumeData?.region_id || null,
            district_id: resumeData?.district_id || null,
            birth_date: resumeData?.birth_date || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        const updatedData = { ...session.data, resume: {}, active_resume_id: resumeId, clean_inputs: false };
        await this.setSession(session, {
            state: BotState.VIEWING_RESUME,
            data: updatedData
        });

        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await sendMessage(chatId, botTexts.resumeSaved[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const text = `✅ ${botTexts.resumeSaved[lang]}\n\n${await this.buildResumeText(resume, lang)}`;
        await this.sendPrompt(chatId, session, text, { parseMode: 'HTML', replyMarkup: keyboards.resumeCompleteKeyboard(lang) });

        await this.offerHighMatchJobsForResume(chatId, session, resume);
    }

    private async offerHighMatchJobsForResume(chatId: number, session: TelegramSession, resume: any): Promise<void> {
        const lang = session.lang;
        const districtId = this.toCoordinate(resume?.district_id);
        const regionId = this.toCoordinate(resume?.region_id);

        const districtJobs = districtId !== null ? await this.fetchActiveJobs(600, { districtId }) : [];
        const regionJobs = regionId !== null ? await this.fetchActiveJobs(900, { regionId }) : [];
        const broadJobs = await this.fetchActiveJobs(1200);

        const localPool = districtJobs.length ? districtJobs : (regionJobs.length ? regionJobs : broadJobs);
        if (!localPool.length) return;

        const desiredTitle = resume?.title || resume?.desired_position || null;
        let scoped = localPool;
        if (desiredTitle) {
            const preferred = this.filterJobsByDesiredTitle(localPool, desiredTitle, false);
            if (preferred.length) scoped = preferred;
        }

        const profile = {
            region_id: regionId ?? resume.region_id ?? null,
            district_id: districtId ?? resume.district_id ?? null,
            category_id: resume.category_id,
            category_ids: resume.category_ids,
            expected_salary_min: resume.expected_salary_min,
            experience_level: resume.experience || resume.experience_level,
            gender: resume.gender,
            birth_date: resume.birth_date,
            education_level: resume.education_level
        };

        const matched = matchAndSortJobs(profile, scoped)
            .filter(job => typeof job.matchScore === 'number' && job.matchScore >= 90);

        if (!matched.length) return;

        await this.clearLastJobArtifacts(chatId, session);

        const updatedData = {
            ...session.data,
            job_list: matched,
            currentJobIndex: 0,
            job_source: 'auto',
            clean_inputs: false
        };
        await this.setSession(session, { state: BotState.BROWSING_JOBS, data: updatedData });
        await this.showJob(chatId, session, 0);
    }

    private async handleResumeSearchSelect(chatId: number, resumeId: string, session: TelegramSession): Promise<void> {
        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await sendMessage(chatId, botTexts.error[session.lang]);
            return;
        }
        await this.startJobSearchByResume(chatId, session, resume);
    }

    private async handleSearchMode(chatId: number, mode: string, session: TelegramSession): Promise<void> {
        // Геопоиск удалён — всегда ищем по резюме
        await this.showResumeSearchSelection(chatId, session);
    }

    private async getActiveOrLatestResume(session: TelegramSession): Promise<any | null> {
        if (!session.user_id) return null;

        const activeResumeId = session.data?.active_resume_id;
        if (activeResumeId) {
            const { data: activeResume } = await this.supabase
                .from('resumes')
                .select('*')
                .eq('id', activeResumeId)
                .eq('user_id', session.user_id)
                .maybeSingle();
            if (activeResume) return activeResume;
        }

        const { data: latestResume } = await this.supabase
            .from('resumes')
            .select('*')
            .eq('user_id', session.user_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        return latestResume || null;
    }

    private hasStrictGenderForSearch(value: any): boolean {
        const normalized = this.normalizeGenderValue(value);
        return normalized === 'male' || normalized === 'female';
    }

    private isEducationSpecifiedForSearch(value: any): boolean {
        if (value === null || value === undefined) return false;
        const raw = String(value).toLowerCase().trim();
        if (!raw) return false;
        if (['any', 'ahamiyatsiz', 'не важно', 'любой'].includes(raw)) return false;
        return true;
    }

    private async ensureGeoSearchCriteria(chatId: number, session: TelegramSession, resume: any): Promise<boolean> {
        const lang = session.lang;
        const needGender = !this.hasStrictGenderForSearch(resume?.gender);
        const needEducation = !this.isEducationSpecifiedForSearch(resume?.education_level);

        if (!needGender && !needEducation) {
            return true;
        }

        const updatedData = {
            ...session.data,
            flow: 'geo_requirements',
            geo_requirements_resume_id: resume.id,
            geo_requirements_need_gender: needGender,
            geo_requirements_need_education: needEducation,
            active_resume_id: resume.id,
            resume: {
                ...(session.data?.resume || {}),
                gender: resume?.gender ?? session.data?.resume?.gender ?? null,
                education_level: resume?.education_level ?? session.data?.resume?.education_level ?? null
            },
            clean_inputs: true
        };

        if (needEducation) {
            await this.setSession(session, {
                state: BotState.SELECTING_EDUCATION,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], {
                replyMarkup: keyboards.educationKeyboard(lang)
            });
            return false;
        }

        await this.setSession(session, {
            state: BotState.SELECTING_GENDER,
            data: updatedData
        });
        await this.sendPrompt(chatId, session, botTexts.askGender[lang], {
            replyMarkup: keyboards.genderKeyboard(lang, false)
        });
        return false;
    }

    private async ensureResumeSearchCriteria(chatId: number, session: TelegramSession, resume: any): Promise<boolean> {
        const lang = session.lang;
        const needGender = !this.hasStrictGenderForSearch(resume?.gender);
        const needEducation = !this.isEducationSpecifiedForSearch(resume?.education_level);

        if (!needGender && !needEducation) {
            return true;
        }

        const updatedData = {
            ...session.data,
            flow: 'resume_requirements',
            resume_requirements_resume_id: resume.id,
            resume_requirements_need_gender: needGender,
            resume_requirements_need_education: needEducation,
            active_resume_id: resume.id,
            resume: {
                ...(session.data?.resume || {}),
                gender: resume?.gender ?? session.data?.resume?.gender ?? null,
                education_level: resume?.education_level ?? session.data?.resume?.education_level ?? null
            },
            clean_inputs: true
        };

        if (needEducation) {
            await this.setSession(session, {
                state: BotState.SELECTING_EDUCATION,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], {
                replyMarkup: keyboards.educationKeyboard(lang)
            });
            return false;
        }

        await this.setSession(session, {
            state: BotState.SELECTING_GENDER,
            data: updatedData
        });
        await this.sendPrompt(chatId, session, botTexts.askGender[lang], {
            replyMarkup: keyboards.genderKeyboard(lang, false)
        });
        return false;
    }

    private async showResumeSearchSelection(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) return;
        const { data: resumes } = await this.supabase
            .from('resumes')
            .select('id, title, created_at')
            .eq('user_id', session.user_id)
            .order('created_at', { ascending: false });

        if (!resumes || resumes.length === 0) {
            await this.sendPrompt(chatId, session, botTexts.noResumeWarning[lang]);
            await this.startResumeFlow(chatId, session);
            return;
        }

        await this.sendPrompt(chatId, session, botTexts.resumeMenu[lang], {
            replyMarkup: keyboards.resumeSelectKeyboard(lang, resumes)
        });
    }

    private async startJobSearchByResume(chatId: number, session: TelegramSession, resume: any): Promise<void> {
        const lang = session.lang;
        await this.clearLastJobArtifacts(chatId, session);
        await this.sendPrompt(chatId, session, botTexts.searchingJobs[lang]);

        const criteriaOk = await this.ensureResumeSearchCriteria(chatId, session, resume);
        if (!criteriaOk) return;

        const districtId = this.toCoordinate(resume.district_id);
        const regionId = this.toCoordinate(resume.region_id);

        const districtJobs = districtId !== null ? await this.fetchActiveJobs(900, { districtId }) : [];
        const regionJobs = regionId !== null ? await this.fetchActiveJobs(1400, { regionId }) : [];
        const broadJobs = await this.fetchActiveJobs(1800);
        const districtNormalized = districtJobs.map(job => this.normalizeJob(job, lang));
        const regionNormalized = regionJobs.map(job => this.normalizeJob(job, lang));
        const broadNormalized = this.mergeJobsById([districtNormalized, regionNormalized, broadJobs.map(job => this.normalizeJob(job, lang))]);
        const hasDistrict = districtNormalized.length > 0;
        const hasRegion = regionNormalized.length > 0;
        const localPool = hasDistrict
            ? districtNormalized
            : (hasRegion ? regionNormalized : broadNormalized);

        if (!localPool.length) {
            await this.clearLastJobArtifacts(chatId, session);
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }
        const desiredTitle = resume?.title || resume?.desired_position || null;
        const titleTokens = this.tokenizeTitle(desiredTitle);
        const hasTitleTokens = titleTokens.length > 0;

        let scopedByTitle = localPool;
        if (hasTitleTokens) {
            const preferred = this.filterJobsByDesiredTitle(localPool, desiredTitle, false);
            if (preferred.length >= 5) {
                scopedByTitle = preferred;
            }
        }

        const profile = {
            region_id: regionId ?? resume.region_id ?? null,
            district_id: districtId ?? resume.district_id ?? null,
            category_id: resume.category_id,
            category_ids: resume.category_ids,
            expected_salary_min: resume.expected_salary_min,
            experience_level: resume.experience || resume.experience_level,
            gender: resume.gender,
            birth_date: resume.birth_date,
            education_level: resume.education_level
        };

        let matched = matchAndSortJobs(profile, scopedByTitle);
        const seekerGeo = await this.getSeekerGeo(session.user_id);

        if (!matched.length) {
            let fallbackPool = localPool;
            if (hasDistrict && regionNormalized.length) {
                fallbackPool = regionNormalized;
            } else if (!hasDistrict && hasRegion) {
                fallbackPool = regionNormalized;
            } else if (!hasDistrict && !hasRegion) {
                fallbackPool = broadNormalized;
            }

            if (hasTitleTokens) {
                const preferredFallback = this.filterJobsByDesiredTitle(fallbackPool, desiredTitle, false);
                if (preferredFallback.length) fallbackPool = preferredFallback;
            }

            if (!fallbackPool.length) fallbackPool = broadNormalized;

            matched = this.buildLooseMatches(profile, fallbackPool, seekerGeo || undefined);

            if (!matched.length && fallbackPool !== broadNormalized) {
                let broadPool = broadNormalized;
                if (hasTitleTokens) {
                    const preferredBroad = this.filterJobsByDesiredTitle(broadNormalized, desiredTitle, false);
                    if (preferredBroad.length) broadPool = preferredBroad;
                }
                if (seekerGeo) {
                    broadPool = this.sortJobsByDistance(broadPool, seekerGeo.latitude, seekerGeo.longitude);
                } else {
                    broadPool = this.sortJobsByRegionProximity(broadPool, regionId);
                }
                matched = this.buildLooseMatches(profile, broadPool, seekerGeo || undefined);
            }
        }

        if (!matched.length) {
            await this.clearLastJobArtifacts(chatId, session);
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const updatedData = {
            ...session.data,
            job_list: matched,
            currentJobIndex: 0,
            job_source: 'resume',
            active_resume_id: resume.id,
            clean_inputs: false
        };
        await this.setSession(session, {
            state: BotState.BROWSING_JOBS,
            data: updatedData
        });

        await this.showJob(chatId, session, 0);
    }

    private async searchJobsByLocation(
        chatId: number,
        session: TelegramSession,
        geo: { region_id?: number | null; district_id?: string | null; latitude?: number | null; longitude?: number | null }
    ): Promise<void> {
        const lang = session.lang;
        await this.clearLastJobArtifacts(chatId, session);
        await this.sendPrompt(chatId, session, botTexts.searchingJobs[lang]);

        const districtId = this.toCoordinate(geo?.district_id ?? null);
        const regionId = this.toCoordinate(geo?.region_id ?? null);

        const districtJobs = districtId !== null ? await this.fetchActiveJobs(900, { districtId }) : [];
        const regionJobs = regionId !== null ? await this.fetchActiveJobs(1400, { regionId }) : [];
        const broadJobs = await this.fetchActiveJobs(1800);
        const districtNormalized = districtJobs.map(job => this.normalizeJob(job, lang));
        const regionNormalized = regionJobs.map(job => this.normalizeJob(job, lang));
        const broadNormalized = this.mergeJobsById([districtNormalized, regionNormalized, broadJobs.map(job => this.normalizeJob(job, lang))]);
        const hasDistrict = districtNormalized.length > 0;
        const hasRegion = regionNormalized.length > 0;
        const localPool = hasDistrict
            ? districtNormalized
            : (hasRegion ? regionNormalized : broadNormalized);

        if (!localPool.length) {
            await this.clearLastJobArtifacts(chatId, session);
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const resume = await this.getActiveOrLatestResume(session);
        const resumeDistrict = this.toCoordinate(resume?.district_id ?? null);
        const resumeRegion = this.toCoordinate(resume?.region_id ?? null);
        const profileGender = resume?.gender ?? session.data?.resume?.gender ?? null;
        const profileEducation = resume?.education_level ?? session.data?.resume?.education_level ?? null;
        const profileExperience = resume?.experience ?? resume?.experience_level ?? session.data?.resume?.experience ?? session.data?.resume?.experience_level ?? null;
        const profileCategoryId = resume?.category_id ?? null;
        const profileCategoryIds = Array.isArray(resume?.category_ids) ? resume.category_ids : undefined;
        const profileTitle = resume?.title || resume?.desired_position || null;
        const titleTokens = this.tokenizeTitle(profileTitle);
        const hasTitleTokens = titleTokens.length > 0;

        let candidateJobs = localPool;
        if (hasTitleTokens) {
            const preferred = this.filterJobsByDesiredTitle(localPool, profileTitle, false);
            if (preferred.length >= 5) candidateJobs = preferred;
        }

        const geoProfile = {
            region_id: regionId ?? resumeRegion ?? null,
            district_id: districtId ?? resumeDistrict ?? null,
            gender: profileGender,
            education_level: profileEducation,
            experience_level: profileExperience,
            category_id: profileCategoryId,
            category_ids: profileCategoryIds
        };

        let matched = matchAndSortJobs(geoProfile, candidateJobs);

        if (!matched.length) {
            const hasCoords = typeof geo.latitude === 'number' && typeof geo.longitude === 'number';
            let fallbackPool = localPool;
            if (hasDistrict && regionNormalized.length) {
                fallbackPool = regionNormalized;
            } else if (!hasDistrict && hasRegion) {
                fallbackPool = regionNormalized;
            } else if (!hasDistrict && !hasRegion) {
                fallbackPool = broadNormalized;
            }

            if (hasTitleTokens) {
                const preferredFallback = this.filterJobsByDesiredTitle(fallbackPool, profileTitle, false);
                if (preferredFallback.length) fallbackPool = preferredFallback;
            }

            if (!fallbackPool.length) fallbackPool = broadNormalized;

            matched = this.buildLooseMatches(geoProfile, fallbackPool, hasCoords ? { latitude: geo.latitude!, longitude: geo.longitude! } : undefined);

            if (!matched.length && fallbackPool !== broadNormalized) {
                let broadPool = broadNormalized;
                if (hasTitleTokens) {
                    const preferredBroad = this.filterJobsByDesiredTitle(broadNormalized, profileTitle, false);
                    if (preferredBroad.length) broadPool = preferredBroad;
                }
                if (hasCoords) {
                    broadPool = this.sortJobsByDistance(broadPool, geo.latitude!, geo.longitude!);
                } else {
                    broadPool = this.sortJobsByRegionProximity(broadPool, regionId);
                }
                matched = this.buildLooseMatches(geoProfile, broadPool, hasCoords ? { latitude: geo.latitude!, longitude: geo.longitude! } : undefined);
            }
        }

        if (!matched.length) {
            await this.clearLastJobArtifacts(chatId, session);
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const updatedData = { ...session.data, job_list: matched, currentJobIndex: 0, job_source: 'geo', clean_inputs: false };
        await this.setSession(session, {
            state: BotState.BROWSING_JOBS,
            data: updatedData
        });
        await this.showJob(chatId, session, 0);
    }

    private normalizeJob(job: any, lang: BotLang): any {
        const regionName = job.regions ? (lang === 'uz' ? job.regions.name_uz : job.regions.name_ru) : job.region_name;
        const districtName = job.districts ? (lang === 'uz' ? job.districts.name_uz : job.districts.name_ru) : job.district_name;
        const companyName = job.company_name || job.employer_profiles?.company_name || null;
        const raw = job.raw_source_json || {};
        const normalized: any = {
            ...job,
            region_name: regionName,
            district_name: districtName,
            company_name: companyName
        };
        if (!normalized.gender && raw.gender) normalized.gender = raw.gender;
        if (!normalized.age_min && (raw.age_min || raw.age_from)) normalized.age_min = raw.age_min || raw.age_from;
        if (!normalized.age_max && (raw.age_max || raw.age_to)) normalized.age_max = raw.age_max || raw.age_to;
        if (!normalized.education_level && (raw.education_level || raw.min_education)) {
            normalized.education_level = raw.education_level || raw.min_education;
        }
        if (!normalized.experience && (raw.work_experiance || raw.experience)) {
            normalized.experience = raw.work_experiance || raw.experience;
        }
        if (!normalized.languages && (raw.languages || raw.language_ids || raw.language)) {
            normalized.languages = raw.languages || raw.language_ids || raw.language;
        }
        if (!normalized.benefits && raw.benefit_ids) normalized.benefits = raw.benefit_ids;
        if (!normalized.hr_name && raw?.hr?.name) normalized.hr_name = raw.hr.name;
        if (!normalized.address && (raw.address || raw.work_address)) normalized.address = raw.address || raw.work_address;
        if (!normalized.contact_phone && (raw.contact_phone || raw.phone)) normalized.contact_phone = raw.contact_phone || raw.phone;
        if (!normalized.contact_email && raw.contact_email) normalized.contact_email = raw.contact_email;
        return normalized;
    }

    private tokenizeTitle(value: any): string[] {
        if (!value) return [];
        const stopWords = new Set([
            'va', 'bilan', 'uchun', 'ish', 'lavozim', 'mutaxassis', 'xodim', 'bo`yicha', 'boyicha',
            'по', 'для', 'на', 'в', 'и', 'работа', 'должность', 'специалист', 'сотрудник',
            'for', 'and', 'the', 'job', 'position', 'specialist', 'employee'
        ]);
        const normalized = String(value)
            .toLowerCase()
            .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
            .replace(/[^a-zа-яё0-9\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return normalized
            .split(' ')
            .map(token => token.trim())
            .filter(token => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token));
    }

    private isGenericTitle(value: any): boolean {
        const tokens = this.tokenizeTitle(value);
        if (!tokens.length) return true;
        const generic = new Set(['mutaxassis', 'xodim', 'ishchi', 'operator', 'specialist', 'employee', 'worker']);
        return tokens.length === 1 && generic.has(tokens[0]);
    }

    private hasTitleOverlap(primary: any, secondary: any): boolean {
        const primaryTokens = this.tokenizeTitle(primary);
        const secondaryTokens = this.tokenizeTitle(secondary);
        if (!primaryTokens.length || !secondaryTokens.length) return false;
        return primaryTokens.some(token => secondaryTokens.includes(token));
    }

    private filterJobsByDesiredTitle(jobs: any[], desiredTitle: string | null | undefined, strict: boolean = false): any[] {
        const titleTokens = this.tokenizeTitle(desiredTitle);
        if (!titleTokens.length) return jobs;

        const desiredText = titleTokens.join(' ');
        const filtered = jobs.filter(job => {
            const jobTitle = job?.title_uz || job?.title_ru || '';
            const jobTokens = this.tokenizeTitle(jobTitle);
            if (!jobTokens.length) return false;

            const intersection = titleTokens.filter(token => jobTokens.includes(token));
            if (intersection.length > 0) return true;

            const jobText = jobTokens.join(' ');
            return jobText.includes(desiredText) || desiredText.includes(jobText);
        });

        if (filtered.length > 0) return filtered;
        return strict ? [] : jobs;
    }

    private async fetchActiveJobs(
        limit: number = 1200,
        filters: { regionId?: number | null; districtId?: number | null } = {}
    ): Promise<any[]> {
        const applyFilters = (query: any) => {
            let scoped = query;
            if (filters.regionId !== undefined && filters.regionId !== null) {
                scoped = scoped.eq('region_id', filters.regionId);
            }
            if (filters.districtId !== undefined && filters.districtId !== null) {
                scoped = scoped.eq('district_id', filters.districtId);
            }
            return scoped;
        };

        const baseSelect = '*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)';

        const primaryQuery = applyFilters(
            this.supabase
                .from('jobs')
                .select(baseSelect)
                .or('is_active.eq.true,status.eq.active,status.eq.published,status.eq.open,source_status.eq.active')
                .order('created_at', { ascending: false })
                .limit(limit)
        );

        const { data, error } = await primaryQuery;
        if (!error && Array.isArray(data) && data.length > 0) {
            return data;
        }
        if (error) {
            console.error('[BOT] fetchActiveJobs error:', error);
        }

        // Fallback for rows without normalized status flags.
        const fallbackQuery = applyFilters(
            this.supabase
                .from('jobs')
                .select(baseSelect)
                .order('created_at', { ascending: false })
                .limit(limit)
        );

        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) {
            console.error('[BOT] fetchActiveJobs fallback error:', fallbackError);
            return data || [];
        }
        return fallbackData || data || [];
    }

    private mergeJobsById(jobGroups: any[][]): any[] {
        const map = new Map<string, any>();
        for (const group of jobGroups) {
            for (const job of group || []) {
                if (!job?.id) continue;
                if (!map.has(job.id)) map.set(job.id, job);
            }
        }
        return Array.from(map.values());
    }

    private normalizeGenderValue(value: any): 'male' | 'female' | 'any' | null {
        if (value === null || value === undefined) return null;
        const raw = String(value).toLowerCase().trim();
        if (['1', 'male', 'erkak', 'мужской'].includes(raw)) return 'male';
        if (['2', 'female', 'ayol', 'женский'].includes(raw)) return 'female';
        if (['3', 'any', 'ahamiyatsiz', 'любое', 'любой', 'не важно'].includes(raw)) return 'any';
        return null;
    }

    private normalizeEducationLevel(value: any): number {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number') {
            if (value <= 0) return 0;
            if (value === 1) return 1;
            if (value === 2) return 2;
            if (value === 3) return 3;
            return 4;
        }
        const raw = String(value)
            .toLowerCase()
            .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!raw) return 0;
        if (['any', 'ahamiyatsiz', 'не важно', 'любой'].includes(raw)) return 0;
        if (raw.includes('magistr') || raw.includes('master') || raw.includes('магистр')) return 4;
        if (raw.includes('oliy') || raw.includes('higher') || raw.includes('высш')) return 3;
        const hasOrta =
            raw.includes('orta') ||
            raw.includes('o rta');
        const hasMaxsus = raw.includes('maxsus') || raw.includes('специаль') || raw.includes('spets');
        if (hasOrta && hasMaxsus) return 2;
        if (raw.includes('vocational') || raw.includes('средне специаль')) return 2;
        if (hasOrta || raw.includes('secondary') || raw.includes('средн')) return 1;
        return 0;
    }

    private normalizeExperienceLevel(value: any): number | null {
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
        if (raw === '1_3_years' || raw === '3_years' || /(1\s*[-–]\s*3)/.test(raw) || raw.includes('1 3')) return 2;
        if (raw === '3_5_years' || raw === '5_years' || /(3\s*[-–]\s*5)/.test(raw) || raw.includes('3 5')) return 3;
        if (
            raw === '5_plus' ||
            raw === '10_years' ||
            /5\s*\+/.test(raw) ||
            (/5\s*yil/.test(raw) && raw.includes('ortiq'))
        ) return 4;

        const numeric = Number(raw);
        if (Number.isFinite(numeric)) return this.normalizeExperienceLevel(numeric);
        return null;
    }

    private shouldAskWorkplace(resume: any): boolean {
        const level = resume?.experience_level ?? resume?.experience;
        if (!level) return false;
        if (Array.isArray(resume?.experience_details) && resume.experience_details.length > 0) return false;
        const normalized = String(level).toLowerCase().trim();
        return !['no_experience', 'tajribasiz', 'без опыта', 'talab etilmaydi', '0'].includes(normalized);
    }

    private shouldAskEducationPlace(resume: any): boolean {
        const level = String(resume?.education_level || '').toLowerCase().trim();
        if (Array.isArray(resume?.education) && resume.education.length > 0) return false;
        if (!level) return false;
        return (
            level.includes('higher') ||
            level.includes('oliy') ||
            level.includes('master') ||
            level.includes('magistr') ||
            level.includes('phd') ||
            level.includes('doktor') ||
            level.includes('aspir')
        );
    }

    private parseBirthDateInput(text: string): string | null {
        const raw = String(text || '').trim();
        if (!raw) return null;

        const fromParts = (day: number, month: number, year: number): string | null => {
            if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
            if (year < 1940 || year > new Date().getFullYear()) return null;
            if (month < 1 || month > 12) return null;
            if (day < 1 || day > 31) return null;
            const date = new Date(year, month - 1, day);
            if (Number.isNaN(date.getTime())) return null;
            // Basic month/day validation
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        };

        if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
            const [dd, mm, yyyy] = raw.split('.').map(Number);
            return fromParts(dd, mm, yyyy);
        }
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
            const [dd, mm, yyyy] = raw.split('/').map(Number);
            return fromParts(dd, mm, yyyy);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const [yyyy, mm, dd] = raw.split('-').map(Number);
            return fromParts(dd, mm, yyyy);
        }

        return null;
    }

    private parseYearInput(text: string): number | null {
        const raw = String(text || '').trim();
        const match = raw.match(/(19\d{2}|20\d{2})/);
        if (!match) return null;
        const year = Number(match[1]);
        const nowYear = new Date().getFullYear();
        if (!Number.isFinite(year) || year < 1950 || year > nowYear + 1) return null;
        return year;
    }

    private parseEndYearInput(text: string): { end_year?: number; is_current?: boolean } | null {
        const raw = String(text || '').trim().toLowerCase();
        if (!raw) return null;
        if (['hozir', 'hoz', 'hozircha', 'present', 'current', 'сейчас', 'настоящее'].includes(raw)) {
            return { end_year: undefined, is_current: true };
        }
        const year = this.parseYearInput(raw);
        if (year) return { end_year: year, is_current: false };
        return null;
    }

    private formatWorkYears(entry: { start_year?: number; end_year?: number; is_current?: boolean; years?: number } | null | undefined): string | null {
        if (!entry) return null;
        if (entry.start_year && entry.end_year) return `${entry.start_year}-${entry.end_year}`;
        if (entry.start_year && entry.is_current) return `${entry.start_year}-hozir`;
        if (entry.start_year && !entry.end_year) return `${entry.start_year}+`;
        if (entry.years) return `${entry.years} yil`;
        return null;
    }

    private parseAgeRange(text: string): { min: number | null; max: number | null } | null {
        const raw = String(text || '').trim();
        if (!raw) return { min: null, max: null };

        const normalized = raw
            .toLowerCase()
            .replace(/[^\d+\-–—]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return { min: null, max: null };

        const plusMatch = normalized.match(/(\d{1,2})\s*\+/);
        if (plusMatch) {
            const min = Number(plusMatch[1]);
            if (Number.isFinite(min) && min > 0) return { min, max: null };
        }

        const rangeMatch = normalized.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/);
        if (rangeMatch) {
            const min = Number(rangeMatch[1]);
            const max = Number(rangeMatch[2]);
            if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
                return { min, max };
            }
        }

        const singleMatch = normalized.match(/(\d{1,2})/);
        if (singleMatch) {
            const min = Number(singleMatch[1]);
            if (Number.isFinite(min) && min > 0) return { min, max: null };
        }

        return null;
    }

    private parseListInput(text: string): string[] {
        const raw = String(text || '').trim();
        if (!raw) return [];
        const parts = raw
            .split(/[,\n;]/)
            .map(item => item.trim())
            .filter(Boolean);
        return Array.from(new Set(parts));
    }

    private buildLooseMatches(
        profile: Record<string, any>,
        jobs: any[],
        geo?: { latitude: number; longitude: number }
    ): MatchedJob[] {
        const userGender = this.normalizeGenderValue(profile?.gender);
        const userRegion = this.toCoordinate(profile?.region_id);
        const userDistrict = this.toCoordinate(profile?.district_id);
        const userEducation = this.normalizeEducationLevel(profile?.education_level);
        const userExperience = this.normalizeExperienceLevel(profile?.experience_level ?? profile?.experience) ?? 0;
        const expectedMinSalary = this.toCoordinate(profile?.expected_salary_min) || 0;
        const profileCategories = Array.isArray(profile?.category_ids)
            ? profile.category_ids.map((id: any) => String(id))
            : (profile?.category_id ? [String(profile.category_id)] : []);

        const results: MatchedJob[] = [];

        for (const job of jobs) {
            const jobGender = this.normalizeGenderValue(job?.gender);
            if (jobGender && jobGender !== 'any') {
                if (!userGender || userGender === 'any') continue;
                if (jobGender !== userGender) continue;
            }

            const jobRegion = this.toCoordinate(job?.region_id);
            const jobDistrict = this.toCoordinate(job?.district_id);
            const sameDistrict = userDistrict !== null && jobDistrict !== null && userDistrict === jobDistrict;
            const sameRegion = !sameDistrict && userRegion !== null && jobRegion !== null && userRegion === jobRegion;
            const hasLocation = Boolean(jobRegion || jobDistrict);
            const hasCategory = Boolean(job?.category_id);
            const categoryMatch = hasCategory && profileCategories.length > 0
                ? profileCategories.includes(String(job.category_id))
                : false;
            const jobEducation = this.normalizeEducationLevel(job?.education_level ?? job?.raw_source_json?.min_education);
            const hasEducationRequirement = jobEducation > 0;
            const jobExperience = this.normalizeExperienceLevel(
                job?.experience
                ?? job?.experience_years
                ?? job?.raw_source_json?.work_experiance
                ?? job?.raw_source_json?.experience
            );
            const hasExperienceRequirement = jobExperience !== null;

            if (hasEducationRequirement && userEducation < jobEducation) {
                continue;
            }
            if (hasExperienceRequirement && userExperience < (jobExperience as number)) {
                continue;
            }
            // Category mismatch is allowed in loose matching fallback.

            let score = 10;
            const criteria = {
                location: false,
                category: false,
                gender: false,
                age: false,
                education: false,
                salary: false,
                experience: false
            };

            if (jobGender === 'any' || !jobGender) {
                criteria.gender = true;
                score += 4;
            } else if (userGender && userGender === jobGender) {
                criteria.gender = true;
                score += 10;
            }

            if (sameDistrict) {
                criteria.location = true;
                score += 60;
            } else if (sameRegion) {
                criteria.location = true;
                score += 10;
            } else if (!hasLocation) {
                criteria.location = true;
                score += 2;
            } else if (geo) {
                const distanceKm = this.getDistanceToJob(job, geo.latitude, geo.longitude);
                if (distanceKm !== null) {
                    criteria.location = true;
                    if (distanceKm <= 5) score += 12;
                    else if (distanceKm <= 15) score += 8;
                    else if (distanceKm <= 30) score += 4;
                    else if (distanceKm <= 60) score += 1;
                    else score -= 30;
                }
            } else {
                score -= 30;
            }

            if (categoryMatch) {
                criteria.category = true;
                score += 18;
            }

            if (hasEducationRequirement) {
                criteria.education = true;
                score += 7;
            } else {
                criteria.education = true;
                score += 3;
            }

            if (hasExperienceRequirement) {
                criteria.experience = true;
                score += 3;
            } else {
                criteria.experience = true;
                score += 1;
            }

            if (expectedMinSalary > 0) {
                const salaryMin = this.toCoordinate(job?.salary_min) || 0;
                const salaryMax = this.toCoordinate(job?.salary_max) || 0;
                if ((salaryMax > 0 && salaryMax >= expectedMinSalary) || (salaryMin > 0 && salaryMin >= expectedMinSalary) || (salaryMin === 0 && salaryMax === 0)) {
                    criteria.salary = true;
                    score += 5;
                }
            } else {
                criteria.salary = true;
                score += 3;
            }

            score = Math.max(1, Math.min(100, score));
            results.push({
                ...job,
                matchScore: score,
                matchCriteria: criteria,
                explanation: {
                    uz: "Asosiy mezonlar bo'yicha saralandi",
                    ru: 'Отсортировано по основным критериям'
                }
            } as MatchedJob);
        }

        return results.sort((a: any, b: any) => {
            if ((b.matchScore || 0) !== (a.matchScore || 0)) {
                return (b.matchScore || 0) - (a.matchScore || 0);
            }
            if (geo) {
                const distA = this.getDistanceToJob(a, geo.latitude, geo.longitude);
                const distB = this.getDistanceToJob(b, geo.latitude, geo.longitude);
                const safeA = typeof distA === 'number' ? distA : Number.POSITIVE_INFINITY;
                const safeB = typeof distB === 'number' ? distB : Number.POSITIVE_INFINITY;
                return safeA - safeB;
            }
            return 0;
        });
    }

    private async getSeekerGeo(userId: string | null): Promise<{ latitude: number; longitude: number } | null> {
        if (!userId) return null;
        const { data } = await this.supabase
            .from('job_seeker_profiles')
            .select('latitude, longitude')
            .eq('user_id', userId)
            .maybeSingle();
        const latitude = this.toCoordinate(data?.latitude);
        const longitude = this.toCoordinate(data?.longitude);
        if (latitude === null || longitude === null) return null;
        return { latitude, longitude };
    }

    private toCoordinate(value: any): number | null {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) return null;
        return num;
    }

    private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private getDistanceToJob(job: any, fromLat: number, fromLon: number): number | null {
        let lat = this.toCoordinate(job.latitude);
        let lon = this.toCoordinate(job.longitude);

        if (lat === null || lon === null) {
            const regionId = this.toCoordinate(job.region_id);
            if (regionId !== null && REGION_COORDINATES[regionId]) {
                lat = REGION_COORDINATES[regionId].lat;
                lon = REGION_COORDINATES[regionId].lng;
            }
        }

        if (lat === null || lon === null) return null;
        return this.haversineKm(fromLat, fromLon, lat, lon);
    }

    private sortJobsByDistance(jobs: any[], fromLat: number, fromLon: number): any[] {
        return [...jobs].sort((a, b) => {
            const distA = this.getDistanceToJob(a, fromLat, fromLon);
            const distB = this.getDistanceToJob(b, fromLat, fromLon);
            const safeA = distA === null ? Number.POSITIVE_INFINITY : distA;
            const safeB = distB === null ? Number.POSITIVE_INFINITY : distB;
            return safeA - safeB;
        });
    }

    private sortJobsByRegionProximity(jobs: any[], userRegionId: number | null): any[] {
        if (userRegionId === null || !REGION_COORDINATES[userRegionId]) {
            return jobs;
        }
        const from = REGION_COORDINATES[userRegionId];
        return [...jobs].sort((a, b) => {
            const regionA = this.toCoordinate(a.region_id);
            const regionB = this.toCoordinate(b.region_id);
            const coordA = regionA !== null ? REGION_COORDINATES[regionA] : null;
            const coordB = regionB !== null ? REGION_COORDINATES[regionB] : null;
            const distA = coordA ? this.haversineKm(from.lat, from.lng, coordA.lat, coordA.lng) : Number.POSITIVE_INFINITY;
            const distB = coordB ? this.haversineKm(from.lat, from.lng, coordB.lat, coordB.lng) : Number.POSITIVE_INFINITY;
            return distA - distB;
        });
    }

    private async handleFavorite(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        const { data: existing } = await this.supabase
            .from('favorites')
            .select('id')
            .eq('user_id', session.user_id)
            .eq('job_id', jobId)
            .maybeSingle();

        if (existing) {
            await this.supabase.from('favorites').delete().eq('id', existing.id);
        } else {
            await this.supabase.from('favorites').insert({ user_id: session.user_id, job_id: jobId });
        }

        const currentIndex = Number.isFinite(session.data?.currentJobIndex) ? session.data.currentJobIndex : 0;
        await this.showJob(chatId, session, currentIndex);
    }

    private async showSavedJobs(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) return;
        const { data: favorites } = await this.supabase
            .from('favorites')
            .select('job_id')
            .eq('user_id', session.user_id)
            .order('created_at', { ascending: false });

        if (!favorites || favorites.length === 0) {
            await this.sendPrompt(chatId, session, botTexts.savedEmpty[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        const jobIds = favorites.map(f => f.job_id);
        const { data: jobs, error: jobsError } = await this.supabase
            .from('jobs')
            .select('*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)')
            .in('id', jobIds)
            .or('status.eq.active,status.eq.published,status.eq.open,status.is.null,is_active.eq.true,is_active.is.null,source_status.eq.active,source_status.is.null');
        if (jobsError) {
            console.error('Saved jobs query error:', jobsError);
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        const normalized = (jobs || []).map(job => this.normalizeJob(job, lang));

        const updatedData = { ...session.data, job_list: normalized, currentJobIndex: 0, job_source: 'favorites' };
        await this.setSession(session, {
            state: BotState.BROWSING_JOBS,
            data: updatedData
        });

        await this.showJob(chatId, session, 0);
    }


    private async deleteSkill(chatId: number, index: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const currentSkills = session.data?.resume?.skills || [];
        if (index >= 0 && index < currentSkills.length) {
            currentSkills.splice(index, 1);
            const updatedData = { ...session.data, resume: { ...session.data?.resume, skills: currentSkills } };
            await this.setSession(session, { data: updatedData });
            await sendMessage(chatId, botTexts.skillDeleted[lang], {
                replyMarkup: keyboards.skillsInlineKeyboard(lang, currentSkills.length > 0)
            });
        }
    }

    private getBackTargetForState(session: TelegramSession): string | null {
        const state = session.state;
        switch (state) {
            case BotState.ENTERING_TITLE:
                return 'salary';
            case BotState.ENTERING_NAME:
                return 'title';
            case BotState.ENTERING_ABOUT:
                return 'name';
            case BotState.ADDING_SKILLS:
                return 'about';
            case BotState.ENTERING_WORKPLACE:
                return 'experience';
            case BotState.ENTERING_WORKPLACE_YEARS:
                return 'workplace';
            case BotState.ENTERING_WORKPLACE_END_YEAR:
                return 'workstart';
            case BotState.ENTERING_EDUCATION_PLACE:
                return 'education';
            case BotState.ENTERING_EDUCATION_START_YEAR:
                return 'education_place';
            case BotState.ENTERING_EDUCATION_END_YEAR:
                return 'edu_start';
            case BotState.ENTERING_BIRTH_DATE:
                return 'gender';
            case BotState.SELECTING_SPECIAL:
                return 'birthdate';
            case BotState.REQUESTING_LOCATION: {
                const intent = session.data?.location_intent;
                if (intent === 'resume_final') return 'skills';
                if (intent === 'job_search_geo') return 'main_menu';
                if (intent === 'subscription_geo' || intent === 'update_only') return 'main_menu';
                return 'main_menu';
            }
            case BotState.EMPLOYER_PROFILE_COMPANY:
                return 'employer_menu';
            case BotState.EMPLOYER_PROFILE_DIRECTOR:
                return 'employer_company';
            case BotState.EMPLOYER_PROFILE_INDUSTRY:
                return 'employer_director';
            case BotState.EMPLOYER_PROFILE_SIZE:
                return 'employer_industry';
            case BotState.EMPLOYER_PROFILE_REGION:
                return 'employer_size';
            case BotState.EMPLOYER_PROFILE_ADDRESS:
                return 'employer_region';
            case BotState.EMPLOYER_PROFILE_DESCRIPTION:
                return 'employer_address';
            case BotState.POSTING_JOB_TITLE:
                return 'employer_menu';
            case BotState.POSTING_JOB_CATEGORY:
                return 'job_title';
            case BotState.POSTING_JOB_SALARY:
                return 'job_category';
            case BotState.POSTING_JOB_SALARY_MAX:
                return 'job_salary';
            case BotState.POSTING_JOB_REGION:
                return 'job_salary';
            case BotState.POSTING_JOB_DISTRICT:
                return 'job_region';
            case BotState.POSTING_JOB_ADDRESS:
                return 'job_district';
            case BotState.POSTING_JOB_WORK_MODE:
                return 'job_address';
            case BotState.POSTING_JOB_EMPLOYMENT:
                return 'job_work_mode';
            case BotState.POSTING_JOB_WORK_DAYS:
                return 'job_employment';
            case BotState.POSTING_JOB_WORK_HOURS:
                return 'job_work_days';
            case BotState.POSTING_JOB_EXPERIENCE:
                return 'job_work_hours';
            case BotState.POSTING_JOB_EDUCATION:
                return 'job_experience';
            case BotState.POSTING_JOB_GENDER:
                return 'job_education';
            case BotState.POSTING_JOB_AGE:
                return 'job_gender';
            case BotState.POSTING_JOB_LANGUAGES:
                return 'job_age';
            case BotState.POSTING_JOB_BENEFITS:
                return 'job_languages';
            case BotState.POSTING_JOB_HR_NAME:
                return 'job_benefits';
            case BotState.POSTING_JOB_CONTACT_PHONE:
                return 'job_hr_name';
            case BotState.POSTING_JOB_DESCRIPTION:
                return 'job_contact_phone';
            case BotState.POSTING_JOB_CONFIRM:
                return 'job_description';
            default:
                return null;
        }
    }

    private async clearLastJobArtifacts(chatId: number, session: TelegramSession): Promise<void> {
        const lastJobMessageId = session.data?.last_job_message_id;
        if (lastJobMessageId) {
            try {
                await deleteMessage(chatId, lastJobMessageId);
            } catch {
                // ignore
            }
        }

        const lastJobLocationId = session.data?.last_job_location_message_id;
        if (lastJobLocationId) {
            try {
                await deleteMessage(chatId, lastJobLocationId);
            } catch {
                // ignore
            }
        }
        const lastJobLocationTextId = session.data?.last_job_location_text_message_id;
        if (lastJobLocationTextId) {
            try {
                await deleteMessage(chatId, lastJobLocationTextId);
            } catch {
                // ignore
            }
        }

        if (lastJobMessageId || lastJobLocationId || lastJobLocationTextId) {
            await this.setSession(session, {
                data: {
                    ...session.data,
                    last_job_message_id: null,
                    last_job_location_message_id: null,
                    last_job_location_text_message_id: null
                }
            });
        }
    }

    private async showMainMenu(chatId: number, session: TelegramSession): Promise<void> {
        await this.clearFlowCancelKeyboard(chatId, session);
        const updatedData = { ...session.data, clean_inputs: false };
        await this.setSession(session, { state: BotState.MAIN_MENU, data: updatedData });
        const lang = session.lang;
        const isEmployer = session.data?.active_role === 'employer';
        await this.clearLastJobArtifacts(chatId, session);
        if (isEmployer) {
            await this.sendPrompt(chatId, session, botTexts.employerMainMenu[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }
        await this.sendPrompt(chatId, session, botTexts.mainMenu[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
    }

    private async handleAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (action === 'jobs' || action === 'search') {
            if (action === 'search' && session.data?.active_resume_id) {
                const { data: resume } = await this.supabase
                    .from('resumes')
                    .select('*')
                    .eq('id', session.data.active_resume_id)
                    .maybeSingle();
                if (resume) {
                    await this.startJobSearchByResume(chatId, session, resume);
                    return;
                }
            }
            await this.setSession(session, { state: BotState.BROWSING_JOBS });
            await this.sendPrompt(chatId, session, botTexts.searchModePrompt[lang], {
                replyMarkup: keyboards.searchModeKeyboard(lang)
            });
        } else if (action === 'profile') {
            await this.showResumeList(chatId, session);
        } else if (action === 'settings') {
            await this.showSettings(chatId, session);
        } else if (action === 'create_resume') {
            await this.handleRoleSelect(chatId, 'seeker', session);
        } else if (action === 'post_job') {
            await this.handleEmployerMainMenu(chatId, 'post_job', session);
        } else if (action === 'saved') {
            await this.showSavedJobs(chatId, session);
        } else if (action === 'help') {
            const isEmployer = session.data?.active_role === 'employer';
            await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                replyMarkup: isEmployer ? keyboards.employerMainMenuKeyboard(lang) : keyboards.mainMenuKeyboard(lang, 'seeker')
            });
        } else if (action === 'viewresume') {
            const resumeId = session.data?.active_resume_id;
            if (resumeId) {
                const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
                if (resume) {
                    const text = await this.buildResumeText(resume, lang);
                    await this.sendPrompt(chatId, session, text, { parseMode: 'HTML', replyMarkup: keyboards.resumeSearchOnlyKeyboard(lang) });
                } else {
                    await this.showResumeList(chatId, session);
                }
            } else {
                await this.showResumeList(chatId, session);
            }
        }
    }

    private async handleEmployerMainMenu(chatId: number, action: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (action === 'post_job') {
            await this.setFlowCancelKeyboard(chatId, session);
            const { data: employer } = await this.supabase
                .from('employer_profiles')
                .select('company_name, phone, director_name')
                .eq('user_id', session.user_id)
                .maybeSingle();
            const baseJob = {
                company_name: employer?.company_name || null,
                contact_phone: employer?.phone || session.phone || null,
                hr_name: employer?.director_name || null
            };
            const updatedData = { ...session.data, temp_job: baseJob, clean_inputs: true };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_TITLE,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.postJobTitle[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'employer_menu')
            });
            return;
        }

        if (action === 'my_vacancies') {
            const { data: employer } = await this.supabase
                .from('employer_profiles')
                .select('id')
                .eq('user_id', session.user_id)
                .maybeSingle();
            const employerId = employer?.id || null;
            let query = this.supabase
                .from('jobs')
                .select('id, title_uz, title_ru')
                .order('created_at', { ascending: false })
                .limit(30);
            if (employerId && session.user_id) {
                query = query.or(`employer_id.eq.${employerId},created_by.eq.${session.user_id}`);
            } else if (employerId) {
                query = query.eq('employer_id', employerId);
            } else if (session.user_id) {
                query = query.eq('created_by', session.user_id);
            }
            const { data: jobs } = await query;
            if (!jobs || jobs.length === 0) {
                await sendMessage(chatId, lang === 'uz' ? "Hali vakansiya yo'q." : 'Вакансий пока нет.', { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
                return;
            }
            if (jobs.length === 1) {
                const { data: job } = await this.supabase.from('jobs').select('*').eq('id', jobs[0].id).maybeSingle();
                if (job) {
                    await this.showEmployerJobDetails(chatId, session, job);
                }
                return;
            }
            await this.sendPrompt(chatId, session, lang === 'uz' ? "📋 Mening vakansiyalarim:" : '📋 Мои вакансии:', {
                replyMarkup: keyboards.employerVacanciesKeyboard(lang, jobs)
            });
            return;
        }
        if (action === 'applications') {
            await this.showEmployerApplications(chatId, session);
            return;
        }
        if (action === 'find_worker') {
            const { data: employer } = await this.supabase
                .from('employer_profiles')
                .select('id')
                .eq('user_id', session.user_id)
                .maybeSingle();
            const employerId = employer?.id || null;
            let query = this.supabase
                .from('jobs')
                .select('id, title_uz, title_ru')
                .order('created_at', { ascending: false })
                .limit(20);
            if (employerId && session.user_id) {
                query = query.or(`employer_id.eq.${employerId},created_by.eq.${session.user_id}`);
            } else if (employerId) {
                query = query.eq('employer_id', employerId);
            } else if (session.user_id) {
                query = query.eq('created_by', session.user_id);
            }
            const { data: jobs } = await query;
            if (!jobs || jobs.length === 0) {
                await sendMessage(chatId, lang === 'uz' ? "Hali vakansiya yo'q." : 'Вакансий пока нет.', { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
                return;
            }
            if (jobs.length === 1) {
                const { data: job } = await this.supabase.from('jobs').select('*').eq('id', jobs[0].id).maybeSingle();
                if (job) {
                    await this.showMatchingResumesForJob(chatId, session, job);
                }
                return;
            }
            await this.sendPrompt(chatId, session, lang === 'uz' ? "🧑‍💼 Qaysi vakansiya uchun ishchi topamiz?" : '🧑‍💼 Для какой вакансии ищем кандидатов?', {
                replyMarkup: keyboards.employerJobsKeyboard(lang, jobs)
            });
            return;
        }
    }

    private async showEmployerApplications(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const { data: employer } = await this.supabase
            .from('employer_profiles')
            .select('id')
            .eq('user_id', session.user_id)
            .maybeSingle();
        const employerId = employer?.id || null;

        const { data: apps, error } = await this.supabase
            .from('job_applications')
            .select('id, created_at, status, full_name, resume_id, user_id, applicant_id, job:jobs(id,title_uz,title_ru,employer_id,created_by)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Applications fetch error:', error);
            await sendMessage(chatId, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const filtered = (apps || []).filter((app: any) => {
            const job = app?.job;
            if (!job) return false;
            if (employerId && String(job.employer_id || '') === String(employerId)) return true;
            if (session.user_id && String(job.created_by || '') === String(session.user_id)) return true;
            return false;
        });

        if (!filtered.length) {
            await sendMessage(chatId, lang === 'uz' ? "Arizalar yo'q." : 'Откликов пока нет.', { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const list = filtered.map((app: any) => {
            const jobRow = Array.isArray(app.job) ? app.job[0] : app.job;
            return {
                id: app.id,
                applicant: app.full_name || null,
                jobTitle: lang === 'uz'
                    ? (jobRow?.title_uz || jobRow?.title_ru || 'Vakansiya')
                    : (jobRow?.title_ru || jobRow?.title_uz || 'Вакансия')
            };
        });

        await this.setSession(session, {
            data: { ...session.data, applications_list: list }
        });

        await this.sendPrompt(chatId, session, lang === 'uz' ? '📨 Arizalar:' : '📨 Отклики:', {
            replyMarkup: keyboards.employerApplicationsKeyboard(lang, list)
        });
    }

    private async handleApplicationView(chatId: number, applicationId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const { data: app, error } = await this.supabase
            .from('job_applications')
            .select('id, resume_id, user_id, applicant_id, full_name, phone, job:jobs(id,title_uz,title_ru)')
            .eq('id', applicationId)
            .maybeSingle();

        if (error || !app) {
            await sendMessage(chatId, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        let resume: any | null = null;
        if (app.resume_id) {
            const { data: resumeRow } = await this.supabase.from('resumes').select('*').eq('id', app.resume_id).maybeSingle();
            resume = resumeRow || null;
        }
        if (!resume) {
            const userId = app.user_id || app.applicant_id;
            if (userId) {
                const { data: resumeRow } = await this.supabase
                    .from('resumes')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                resume = resumeRow || null;
            }
        }

        try {
            await this.supabase
                .from('job_applications')
                .update({ viewed_at: new Date().toISOString() })
                .eq('id', applicationId);
        } catch {
            // ignore
        }

        const jobRow = Array.isArray(app.job) ? app.job[0] : app.job;
        const jobTitle = lang === 'uz'
            ? (jobRow?.title_uz || jobRow?.title_ru || 'Vakansiya')
            : (jobRow?.title_ru || jobRow?.title_uz || 'Вакансия');

        if (!resume) {
            const fallback = `${lang === 'uz' ? 'Nomzod' : 'Кандидат'}: ${app.full_name || '—'}\n${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${app.phone || '—'}\n${lang === 'uz' ? 'Vakansiya' : 'Вакансия'}: ${jobTitle}`;
            await this.sendPrompt(chatId, session, fallback, { replyMarkup: keyboards.applicationViewKeyboard(lang) });
            return;
        }

        const resumeText = await this.buildResumeText(resume, lang);
        const header = `${lang === 'uz' ? '📨 Ariza' : '📨 Отклик'}\n${lang === 'uz' ? 'Vakansiya' : 'Вакансия'}: ${jobTitle}`;
        await this.sendPrompt(chatId, session, `${header}\n\n${resumeText}`, {
            parseMode: 'HTML',
            replyMarkup: keyboards.applicationViewKeyboard(lang)
        });
    }

    private async handleEmployerJobClose(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const { error } = await this.supabase
            .from('jobs')
            .update({
                status: 'filled',
                source_status: 'filled',
                is_active: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);

        if (error) {
            console.error('Job close error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        await this.sendPrompt(chatId, session, lang === 'uz' ? '✅ Vakansiya yopildi.' : '✅ Вакансия закрыта.', {
            replyMarkup: keyboards.employerMainMenuKeyboard(lang)
        });
    }

    private async handleMatchJob(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const { data: job } = await this.supabase
            .from('jobs')
            .select('*')
            .eq('id', jobId)
            .maybeSingle();
        if (!job) {
            await this.sendPrompt(chatId, session, botTexts.error[session.lang], { replyMarkup: keyboards.employerMainMenuKeyboard(session.lang) });
            return;
        }
        await this.showMatchingResumesForJob(chatId, session, job);
    }

    private async handleEmployerJobView(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const { data: job } = await this.supabase
            .from('jobs')
            .select('*')
            .eq('id', jobId)
            .maybeSingle();
        if (!job) {
            await this.sendPrompt(chatId, session, botTexts.error[session.lang], { replyMarkup: keyboards.employerMainMenuKeyboard(session.lang) });
            return;
        }
        await this.showEmployerJobDetails(chatId, session, job);
    }

    private async showEmployerJobDetails(chatId: number, session: TelegramSession, job: any): Promise<void> {
        const lang = session.lang;
        const text = formatFullJobCard(job, lang);
        await this.sendPrompt(chatId, session, text, {
            replyMarkup: keyboards.employerJobViewKeyboard(lang, job.id)
        });
    }

    private async handleRoleSwitch(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.phone) {
            await this.sendPrompt(chatId, session, botTexts.startWelcome[lang], {
                replyMarkup: keyboards.startKeyboard(lang),
                parseMode: 'HTML'
            });
            return;
        }
        const { data: userRow } = await this.supabase
            .from('users')
            .select('password_hash')
            .eq('phone', session.phone)
            .maybeSingle();
        const hasPassword = Boolean(userRow?.password_hash && String(userRow.password_hash).trim().length > 0);
        const updatedData = {
            ...session.data,
            role_switch_pending: true,
            password_flow: hasPassword ? 'login' : 'create'
        };
        await this.setSession(session, { state: BotState.AWAITING_PASSWORD, data: updatedData });
        const prompt = hasPassword ? botTexts.enterPassword[lang] : botTexts.createPasswordPrompt[lang];
        await this.sendPrompt(chatId, session, prompt, { replyMarkup: keyboards.cancelReplyKeyboard(lang) });
    }

    private async handleLogout(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.clearFlowCancelKeyboard(chatId, session);
        await this.setSession(session, {
            user_id: null,
            phone: null,
            otp_code: null,
            otp_expires_at: null,
            state: BotState.START,
            data: {}
        });
        await this.sendPrompt(chatId, session, botTexts.logoutDone[lang], {
            replyMarkup: keyboards.startKeyboard(lang)
        });
    }

    private async handleJobPublish(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const jobData = session.data?.temp_job;
        const { data: employer } = await this.supabase
            .from('employer_profiles')
            .select('id, company_name, director_name, phone, region_id, district_id, address, default_address')
            .eq('user_id', session.user_id)
            .maybeSingle();

        if (!employer?.id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const title = jobData?.title || (lang === 'uz' ? 'Vakansiya' : 'Вакансия');
        const aiSections = jobData?.ai_sections || null;
        const description = jobData?.description || this.buildJobDescriptionFromSections(aiSections) || title;
        const companyName = jobData?.company_name || employer.company_name || 'Kompaniya';
        const address = jobData?.address || employer.address || employer.default_address || null;

        const rawMeta = jobData?.ai_meta || {};
        const languages = Array.isArray(jobData?.languages)
            ? jobData.languages
            : (Array.isArray(aiSections?.tillar) ? aiSections.tillar : []);
        const benefitsText = jobData?.benefits
            ? String(jobData.benefits)
            : (Array.isArray(aiSections?.qulayliklar) ? aiSections.qulayliklar.join(', ') : null);
        const special = Array.isArray(jobData?.special) ? jobData.special : [];
        const raw_source_json = {
            ...(jobData?.raw_source_json || {}),
            working_days: jobData?.working_days || rawMeta?.working_days || null,
            working_hours: jobData?.working_hours || rawMeta?.working_hours || null,
            talablar: aiSections?.talablar || [],
            ish_vazifalari: aiSections?.ish_vazifalari || [],
            qulayliklar: aiSections?.qulayliklar || []
        };

        const normalizedEmployment = jobData?.employment_type || 'full_time';
        const normalizedExperience = jobData?.experience || 'no_experience';
        const normalizedEducation = jobData?.education_level || 'any';
        const normalizedGender = jobData?.gender || 'any';

        const payload: Record<string, any> = {
            employer_id: employer.id,
            created_by: session.user_id,
            title_uz: title,
            title_ru: title,
            description_uz: description,
            description_ru: description,
            company_name: companyName,
            category_id: jobData?.category_id || null,
            region_id: jobData?.region_id || employer.region_id || null,
            district_id: jobData?.district_id || employer.district_id || null,
            region_name: jobData?.region_name || null,
            district_name: jobData?.district_name || null,
            address,
            salary_min: Number.isFinite(jobData?.salary_min) ? jobData?.salary_min : (jobData?.salary_min ? Number(jobData.salary_min) : null),
            salary_max: Number.isFinite(jobData?.salary_max) ? jobData?.salary_max : (jobData?.salary_max ? Number(jobData.salary_max) : null),
            contact_phone: jobData?.contact_phone || employer.phone || session.phone || null,
            hr_name: jobData?.hr_name || employer.director_name || null,
            gender: normalizedGender,
            education_level: normalizedEducation,
            experience: normalizedExperience,
            age_min: jobData?.age_min || null,
            age_max: jobData?.age_max || null,
            work_mode: jobData?.work_mode || null,
            employment_type: normalizedEmployment,
            working_hours: jobData?.working_hours || null,
            benefits: benefitsText,
            languages,
            is_for_students: special.includes('students'),
            is_for_graduates: special.includes('graduates'),
            is_for_disabled: special.includes('disabled'),
            raw_source_json,
            is_active: true,
            status: 'active',
            source: 'local',
            is_imported: false,
            created_at: new Date().toISOString()
        };

        const { data: createdJob, error } = await this.supabase
            .from('jobs')
            .insert(payload)
            .select('*')
            .single();

        if (error) {
            console.error('Job publish error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        await sendMessage(chatId, botTexts.jobPublished[lang], { replyMarkup: keyboards.jobPublishedKeyboard(lang, createdJob?.id) });
        await this.clearFlowCancelKeyboard(chatId, session);
        await this.setSession(session, { state: BotState.EMPLOYER_MAIN_MENU, data: { ...session.data, temp_job: null, clean_inputs: false } });

        if (createdJob) {
            await this.showMatchingResumesForJob(chatId, session, createdJob);
        }
    }

    private async showMatchingResumesForJob(chatId: number, session: TelegramSession, job: any): Promise<void> {
        const lang = session.lang;
        const selectWithExperience = 'id, full_name, title, region_id, district_id, category_id, category_ids, expected_salary_min, experience, experience_level, education_level, gender, birth_date';
        let resumes: any[] | null = null;
        let error: any = null;
        const primary = await this.supabase
            .from('resumes')
            .select(selectWithExperience)
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(50);
        resumes = primary.data || null;
        error = primary.error || null;
        if (error && (error.code === '42703' || String(error.message || '').includes('experience_level'))) {
            const fallback = await this.supabase
                .from('resumes')
                .select('id, full_name, title, region_id, district_id, category_id, category_ids, expected_salary_min, experience, education_level, gender, birth_date')
                .eq('status', 'active')
                .order('updated_at', { ascending: false })
                .limit(50);
            resumes = fallback.data || null;
            error = fallback.error || null;
        }

        if (error) {
            console.error('Resume fetch error:', error);
            return;
        }

        const jobTitle = job?.title_uz || job?.title_ru || job?.title || '';
        const requireTitleMatch = !this.isGenericTitle(jobTitle);

        const scored = (resumes || []).map(resume => {
            const match = calculateMatchScore({
                region_id: resume.region_id,
                district_id: resume.district_id,
                category_id: resume.category_id,
                category_ids: resume.category_ids,
                expected_salary_min: resume.expected_salary_min,
                experience: resume.experience ?? resume.experience_level,
                gender: resume.gender,
                birth_date: resume.birth_date,
                education_level: resume.education_level
            }, job);
            return { resume, score: match.matchScore };
        });

        const filtered = scored
            .filter(item => item.score >= 90)
            .filter(item => {
                if (!requireTitleMatch) return true;
                const resumeTitle = item.resume?.title || '';
                const resumeTokens = this.tokenizeTitle(resumeTitle);
                if (!resumeTokens.length) return true;
                return this.hasTitleOverlap(jobTitle, resumeTitle);
            });

        const top = filtered
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        if (!top.length) {
            await sendMessage(chatId, lang === 'uz' ? "Mos rezyumelar topilmadi." : 'Подходящие резюме не найдены.');
            return;
        }

        const lines = top.map((item, idx) => {
            const name = item.resume.full_name || (lang === 'uz' ? 'Nomzod' : 'Кандидат');
            const title = item.resume.title || (lang === 'uz' ? 'Mutaxassis' : 'Специалист');
            return `${idx + 1}. ${name} — ${title} (${item.score}%)`;
        });

        await sendMessage(chatId, lang === 'uz' ? `🧾 Mos rezyumelar:\n${lines.join('\n')}` : `🧾 Подходящие резюме:\n${lines.join('\n')}`, {
            replyMarkup: keyboards.resumeMatchKeyboard(lang, top.map(item => ({
                id: item.resume.id,
                full_name: item.resume.full_name,
                title: item.resume.title,
                score: item.score
            })))
        });
    }

    // JOB SEARCH
    private async startJobSearch(chatId: number, session: TelegramSession): Promise<void> {
        await this.sendPrompt(chatId, session, botTexts.searchModePrompt[session.lang], {
            replyMarkup: keyboards.searchModeKeyboard(session.lang)
        });
    }

    private async showJob(chatId: number, session: TelegramSession, index: number): Promise<void> {
        const lang = session.lang;
        const jobList: MatchedJob[] = Array.isArray(session.data?.job_list) ? session.data.job_list : [];
        if (!jobList.length) {
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        let safeIndex = index;
        if (safeIndex < 0) safeIndex = 0;
        if (safeIndex >= jobList.length) safeIndex = jobList.length - 1;

        const job = jobList[safeIndex] as any;
        const jobId = job.id || 'unknown';

        // Build match block
        let matchBlock = '';
        if (typeof job.matchScore === 'number') {
            const criteria = job.matchCriteria || {};
            const labels = {
                location: lang === 'uz' ? 'Joylashuv' : 'Локация',
                category: lang === 'uz' ? 'Soha' : 'Сфера',
                salary: lang === 'uz' ? 'Maosh' : 'Зарплата',
                experience: lang === 'uz' ? 'Tajriba' : 'Опыт',
                education: lang === 'uz' ? "Ma'lumot" : 'Образование',
                age: lang === 'uz' ? 'Yosh' : 'Возраст'
            };
            const lines: string[] = [];
            const hasLocationReq = Boolean(job.region_id || job.district_id);
            const hasCategoryReq = Boolean(job.category_id);
            const hasSalary = Boolean(job.salary_min || job.salary_max);
            const hasExpReq = Boolean(job.experience || job.experience_years || job.raw_source_json?.work_experiance);
            const hasEduReq = Boolean(job.education_level || job.raw_source_json?.min_education);
            const hasAgeReq = Boolean(job.age_min || job.age_max);

            if (criteria.location && hasLocationReq) lines.push(`<i>✅ ${labels.location}</i>`);
            if (criteria.category && hasCategoryReq) lines.push(`<i>✅ ${labels.category}</i>`);
            if (criteria.salary && hasSalary) lines.push(`<i>✅ ${labels.salary}</i>`);
            if (criteria.experience && hasExpReq) lines.push(`<i>✅ ${labels.experience}</i>`);
            if (criteria.education && hasEduReq) lines.push(`<i>✅ ${labels.education}</i>`);
            if (criteria.age && hasAgeReq && job.ageKnown !== false) lines.push(`<i>✅ ${labels.age}</i>`);
            if (lines.length > 0) {
                matchBlock = `${botTexts.matchScore[lang](job.matchScore)}\n\n${lines.join('\n')}`;
            }
        }

        const jobLatitude = this.toCoordinate(job.latitude);
        const jobLongitude = this.toCoordinate(job.longitude);
        let text = matchBlock ? `${formatFullJobCard(job, lang)}\n\n${matchBlock}` : formatFullJobCard(job, lang);
        if (jobLatitude !== null && jobLongitude !== null) {
            text = text.replace(/\n📌 \| (Ish joy manzili|Адрес): .*/g, '');
        }

        const isFavorite = session.user_id
            ? !!(await this.supabase
                .from('favorites')
                .select('id')
                .eq('user_id', session.user_id)
                .eq('job_id', jobId)
                .maybeSingle()).data
            : false;

        const lastPromptId = session.data?.last_prompt_message_id;
        if (lastPromptId) {
            try {
                await deleteMessage(chatId, lastPromptId);
            } catch {
                // ignore
            }
        }

        const lastJobMessageId = session.data?.last_job_message_id;
        if (lastJobMessageId) {
            try {
                await deleteMessage(chatId, lastJobMessageId);
            } catch (err) {
                // ignore
            }
        }

        const sent = await sendMessage(chatId, text, {
            parseMode: 'HTML',
            replyMarkup: keyboards.jobNavigationKeyboard(lang, safeIndex, jobList.length, jobId, session.data?.job_source, isFavorite)
        });

        let lastLocationMessageId = session.data?.last_job_location_message_id;
        if (lastLocationMessageId) {
            try {
                await deleteMessage(chatId, lastLocationMessageId);
            } catch (err) {
                // ignore
            }
            lastLocationMessageId = null;
        }
        let lastLocationTextMessageId = session.data?.last_job_location_text_message_id;
        if (lastLocationTextMessageId) {
            try {
                await deleteMessage(chatId, lastLocationTextMessageId);
            } catch (err) {
                // ignore
            }
            lastLocationTextMessageId = null;
        }
        if (jobLatitude !== null && jobLongitude !== null) {
            try {
                const loc = await sendLocation(chatId, jobLatitude, jobLongitude);
                lastLocationMessageId = loc?.message_id || null;
                const regionName = job.region_name || await this.getRegionNameById(job.region_id, lang);
                const districtName = job.district_name || await this.getDistrictNameById(job.district_id, lang);
                const fallbackAddress = [regionName, districtName].filter(Boolean).join(', ');
                const address =
                    job.address
                    || job.raw_source_json?.address
                    || job.raw_source_json?.work_address
                    || fallbackAddress
                    || null;
                if (address) {
                    const locationText = `📌 | ${lang === 'uz' ? 'Ish joy manzili' : 'Адрес'}: ${address}`;
                    const info = await sendMessage(chatId, locationText);
                    lastLocationTextMessageId = info?.message_id || null;
                }
            } catch (err) {
                // ignore location errors
            }
        }

        const updatedData = {
            ...session.data,
            currentJobIndex: safeIndex,
            last_prompt_message_id: null,
            last_job_message_id: sent?.message_id,
            last_job_location_message_id: lastLocationMessageId,
            last_job_location_text_message_id: lastLocationTextMessageId
        };
        await this.setSession(session, { data: updatedData });
    }

    private async getRegionNameById(regionId: any, lang: BotLang): Promise<string | null> {
        const idNum = this.toCoordinate(regionId);
        if (idNum === null) return null;
        const regions = await this.getRegions();
        const match = regions.find(r => Number(r.id) === idNum);
        if (!match) return null;
        return lang === 'uz' ? match.name_uz : match.name_ru;
    }

    private async getDistrictNameById(districtId: any, lang: BotLang): Promise<string | null> {
        const idNum = this.toCoordinate(districtId);
        if (idNum === null) return null;
        const { data } = await this.supabase
            .from('districts')
            .select('name_uz, name_ru')
            .eq('id', idNum)
            .maybeSingle();
        if (!data) return null;
        return lang === 'uz' ? data.name_uz : data.name_ru;
    }

    private async handleJobNavigation(chatId: number, direction: string, session: TelegramSession, messageId?: number): Promise<void> {
        const list: any[] = Array.isArray(session.data?.job_list) ? session.data.job_list : [];
        if (!list.length) {
            await this.showMainMenu(chatId, session);
            return;
        }
        const index = session.data?.currentJobIndex || 0;
        let newIndex = index;
        if (direction === 'next') newIndex += 1;
        if (direction === 'prev') newIndex -= 1;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= list.length) newIndex = list.length - 1;

        await this.showJob(chatId, session, newIndex);
    }

    private async handleJobApply(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        const { data: resume } = await this.supabase
            .from('resumes')
            .select('id, full_name, phone, email')
            .eq('id', session.data?.active_resume_id || '')
            .maybeSingle();

        const resumeRecord = resume || (await this.supabase
            .from('resumes')
            .select('id, full_name, phone, email')
            .eq('user_id', session.user_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()).data;

        if (!resumeRecord) {
            await this.sendPrompt(chatId, session, botTexts.noResumeWarning[lang]);
            return;
        }

        let alreadyApplied = false;
        try {
            const { data: existing } = await this.supabase
                .from('job_applications')
                .select('id')
                .eq('job_id', jobId)
                .eq('resume_id', resumeRecord.id)
                .maybeSingle();
            if (existing) alreadyApplied = true;
        } catch (err) {
            // ignore if resume_id column not available
        }

        if (alreadyApplied) {
            await sendMessage(chatId, botTexts.applicationExists[lang]);
            return;
        }

        const payload: Record<string, any> = {
            job_id: jobId,
            full_name: resumeRecord.full_name || 'Nomzod',
            phone: resumeRecord.phone || session.phone || null,
            resume_id: resumeRecord.id,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        if (session.user_id) payload.user_id = session.user_id;

        if (!payload.phone) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        const { error } = await this.supabase.from('job_applications').insert(payload);
        if (error) {
            console.error('Apply error:', error);
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        await sendMessage(chatId, botTexts.applicationSent[lang], { replyMarkup: keyboards.removeKeyboard() });
    }

    // PROFILE
    private async showProfile(chatId: number, session: TelegramSession): Promise<void> {
        await this.showResumeList(chatId, session);
    }

    private async handleProfileAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        if (action === 'edit') {
            // Edit flow
        } else if (action === 'back') {
            await this.showMainMenu(chatId, session);
        }
    }

    // SETTINGS
    private async showSettings(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, { state: BotState.SETTINGS });
        await this.sendPrompt(chatId, session, botTexts.settings[lang], { replyMarkup: keyboards.settingsKeyboard(lang) });
    }

    private async handleSettingsAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (action === 'language') {
            await this.sendPrompt(chatId, session, botTexts.selectLanguage[lang], { replyMarkup: keyboards.languageKeyboard() });
        } else if (action === 'switch_role') {
            await this.handleRoleSwitch(chatId, session);
        } else {
            await this.showMainMenu(chatId, session);
        }
    }


    // SUBSCRIPTION
    private isSubscriptionFlow(session: TelegramSession): boolean {
        const subscriptionStates = new Set<BotState>([
            BotState.SELECTING_EMPLOYMENT,
            BotState.SELECTING_WORK_MODE,
            BotState.SELECTING_WORKING_DAYS,
            BotState.SELECTING_SUBSCRIPTION_FREQUENCY,
            BotState.SELECTING_SALARY_MAX
        ]);
        return session.data?.flow === 'subscription' || subscriptionStates.has(session.state);
    }

    private async handleSubscriptionCheck(chatId: number, session: TelegramSession): Promise<void> {
        // Check active subs
        await this.showSubscriptionMenu(chatId, session);
    }

    private async showSubscriptionMenu(chatId: number, session: TelegramSession): Promise<void> {
        const active = Boolean(session.data?.subscription?.active);
        await this.sendPrompt(chatId, session, botTexts.subscriptionSettings[session.lang], {
            replyMarkup: keyboards.subscriptionManageKeyboard(session.lang, active)
        });
    }

    private async handleSubscriptionAction(chatId: number, action: string, extra: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (action === 'setup') {
            await this.startSubscriptionSetup(chatId, session);
            return;
        }
        if (action === 'disable') {
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, subscription: { ...session.data?.subscription, active: false } }
            });
            await this.sendPrompt(chatId, session, botTexts.subscriptionDisabled[lang], {
                replyMarkup: keyboards.subscriptionManageKeyboard(lang, false)
            });
            return;
        }
        if (action === 'frequency') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_SUBSCRIPTION_FREQUENCY });
            await this.sendPrompt(chatId, session, botTexts.askSubscriptionFrequency[lang], {
                replyMarkup: keyboards.subscriptionFrequencyKeyboard(lang)
            });
            return;
        }
        if (action === 'freq') {
            const frequency = extra === 'daily' ? 'daily' : 'instant';
            const subscription = {
                active: true,
                frequency,
                filters: session.data?.subscription_draft || {},
                last_notified_at: null
            };
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, subscription, subscription_draft: null }
            });
            await this.sendPrompt(chatId, session, botTexts.subscriptionSaved[lang], {
                replyMarkup: keyboards.subscriptionManageKeyboard(lang, true)
            });
            return;
        }
        if (action === 'geo') {
            const useGeo = extra === 'yes';
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.use_geo = useGeo;
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, subscription_draft: draft }
            });
            if (useGeo) {
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.REQUESTING_LOCATION,
                    data: { ...session.data, location_intent: 'subscription_geo', subscription_draft: draft }
                });
                await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                    replyMarkup: keyboards.locationRequestKeyboard(lang)
                });
                return;
            }
            const regions = await this.getRegions();
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
            await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions)
            });
        }
    }

    private async startSubscriptionSetup(chatId: number, session: TelegramSession): Promise<void> {
        // Init subscription draft
        await this.updateSession(session.telegram_user_id, {
            state: BotState.REQUESTING_LOCATION,
            data: { ...session.data, subscription_draft: { is_active: true } }
        });
        await this.sendPrompt(chatId, session, botTexts.askRegion[session.lang], { replyMarkup: keyboards.locationRequestKeyboard(session.lang) });
    }

    // AI
    private async handleAiAction(chatId: number, action: string, extra: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (action === 'job') {
            if (extra === 'cancel') {
                await this.handleJobCreateMode(chatId, 'manual', session);
                return;
            }
            await this.handleJobCreateMode(chatId, 'ai', session);
            return;
        }
        if (action === 'resume') {
            await this.sendPrompt(chatId, session, lang === 'uz' ? "AI resume bo'limi tayyorlanmoqda." : 'AI резюме в разработке.');
        }
    }

    // HELPERS
    private async resolveLocationToRegionDistrict(lat: number, lon: number): Promise<{ region_id?: number; district_id?: string } | null> {
        try {
            const normalize = (value: string) => value
                .toLowerCase()
                .replace(/(viloyati|viloyat|shahri|shahar|sh\.|tumani|tuman|oblast|region|gorod|г\.|область|республика|respublikasi|respublika)/gi, '')
                .replace(/["'`’]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'ISHDASIZBot/1.0', Accept: 'application/json' }
            });
            if (!res.ok) return null;
            const data = await res.json();
            const addr = data?.address || {};

            const regionName = addr.state || addr.region || addr.province || addr.county || '';
            const districtName = addr.city_district || addr.city || addr.municipality || addr.county || '';

            const regions = await this.getRegions();
            const normalizedRegion = normalize(regionName);
            const regionMatch = regions.find(r =>
                normalize(r.name_uz) === normalizedRegion || normalize(r.name_ru) === normalizedRegion
            ) || regions.find(r => {
                const uz = normalize(r.name_uz);
                const ru = normalize(r.name_ru);
                return normalizedRegion.includes(uz) || normalizedRegion.includes(ru);
            });

            let districtId: string | undefined;
            if (regionMatch && districtName) {
                const { data: districts } = await this.supabase
                    .from('districts')
                    .select('id, name_uz, name_ru')
                    .eq('region_id', regionMatch.id);
                const normalizedDistrict = normalize(districtName);
                const districtMatch = (districts || []).find(d =>
                    normalize(d.name_uz) === normalizedDistrict || normalize(d.name_ru) === normalizedDistrict
                ) || (districts || []).find(d => {
                    const uz = normalize(d.name_uz);
                    const ru = normalize(d.name_ru);
                    return normalizedDistrict.includes(uz) || normalizedDistrict.includes(ru);
                });
                districtId = districtMatch?.id;
            }

            return {
                region_id: regionMatch?.id,
                district_id: districtId
            };
        } catch (e) {
            return null;
        }
    }

}

export const telegramBot = new TelegramBot();
