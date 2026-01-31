/**
 * Telegram Bot - Complete Resume Creation Flow
 * Handles all incoming updates and state transitions
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendMessage, editMessage, answerCallbackQuery, isUserSubscribed, sendLocation, deleteMessage } from './telegram-api';
import * as keyboards from './keyboards';
import { botTexts, BotLang, formatJobCard, formatFullJobCard, EXPERIENCE_LABELS } from './texts';
import { matchAndSortJobs, getMatchPercentage, MatchedJob } from './job-matcher';
import { checkForAbuse } from '../ai/moderation';

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
    POSTING_JOB_TITLE = 'posting_job_title',
    POSTING_JOB_CATEGORY = 'posting_job_category',
    POSTING_JOB_SALARY = 'posting_job_salary',
    POSTING_JOB_REGION = 'posting_job_region',
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
    icon?: string | null;
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

            this.categoriesCache = { data: fallback.data || [], loadedAt: Date.now() };
            return this.categoriesCache.data;
        }

        this.categoriesCache = { data: data || [], loadedAt: Date.now() };
        return this.categoriesCache.data;
    }

    private getChannelUsername(): string {
        const raw = process.env.TELEGRAM_CHANNEL_USERNAME || 'ishdasiz';
        return raw.startsWith('@') ? raw.slice(1) : raw;
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
        await this.updateSession(session.telegram_user_id, { data: updatedData });
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

    private async sendPrompt(
        chatId: number,
        session: TelegramSession,
        text: string,
        options: { replyMarkup?: any; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' } = {}
    ): Promise<void> {
        const lastPromptId = session.data?.last_prompt_message_id;
        if (lastPromptId) {
            try {
                await deleteMessage(chatId, lastPromptId);
            } catch (err) {
                // ignore delete errors
            }
        }
        const result = await sendMessage(chatId, text, {
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
        const updatedData = { ...data, profanity_count: profanityCount };

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

        console.log('[BOT] handleUpdate called, userId:', userId, 'hasMessage:', !!message, 'hasCallback:', !!callback);

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

            if (trimmedText && !msg.contact && !msg.location && !this.isPasswordState(session.state)) {
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
                await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                    replyMarkup: keyboards.mainMenuKeyboard(lang, session.data?.active_role === 'employer' ? 'employer' : 'seeker'),
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
                case 'salary': await this.handleSalarySelect(chatId, value, session, message.message_id); break;
                case 'salarymax': await this.handleSalaryMaxSelect(chatId, value, session, message.message_id); break;
                case 'employment': await this.handleEmploymentSelect(chatId, value, session, message.message_id); break;
                case 'workmode': await this.handleWorkModeSelect(chatId, value, session, message.message_id); break;
                case 'workingdays': await this.handleWorkingDaysSelect(chatId, value, session, message.message_id); break;
                case 'skip': await this.handleSkip(chatId, session); break;
                case 'skills': if (value === 'done') await this.finishSkills(chatId, session); break;
                case 'delskill': await this.deleteSkill(chatId, parseInt(value), session); break;
                case 'back': await this.handleBack(chatId, value, session); break;
                case 'menu': if (value === 'main') await this.showMainMenu(chatId, session); break;
                case 'action': await this.handleAction(chatId, value, session); break;
                case 'job':
                    if (value === 'publish') await this.handleJobPublish(chatId, session);
                    else await this.handleJobNavigation(chatId, value, session, message.message_id);
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
                case 'resume_new': await this.startResumeFlow(chatId, session); break;
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
            await this.updateSession(session.telegram_user_id, { state: BotState.AWAITING_PHONE });
            await this.sendPrompt(chatId, session, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
        } else if (value === 'password') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.AWAITING_PASSWORD,
                phone: phone
            });
            await this.sendPrompt(chatId, session, botTexts.enterPassword[lang]);
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
            await this.updateSession(session.telegram_user_id, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: { ...session.data, active_role: 'employer' }
            });

            const { data: profile } = await this.supabase
                .from('employer_profiles')
                .select('company_name')
                .eq('user_id', session.user_id)
                .single();

            if (!profile) {
                await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_COMPANY_NAME });
                await this.sendPrompt(chatId, session, botTexts.companyNamePrompt[lang]);
            } else {
                await this.sendPrompt(chatId, session, botTexts.employerWelcome[lang], {
                    replyMarkup: keyboards.employerMainMenuKeyboard(lang)
                });
            }

        } else if (role === 'seeker') {
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, active_role: 'job_seeker' }
            });
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
        if (locationIntent === 'resume_final') {
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, location_intent: null }
            });
            await this.finalizeResume(chatId, session);
            return;
        }

        if (locationIntent === 'job_search_geo') {
            const resolved = await this.resolveLocationToRegionDistrict(location.latitude, location.longitude);
            const searchGeo = {
                region_id: resolved?.region_id ?? null,
                district_id: resolved?.district_id ?? null
            };
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, location_intent: null, search_geo: searchGeo }
            });
            await this.searchJobsByLocation(chatId, session, searchGeo);
            return;
        }

        if (this.isSubscriptionFlow(session) || locationIntent === 'subscription_geo') {
            const resolved = await this.resolveLocationToRegionDistrict(location.latitude, location.longitude);
            const draft = { ...(session.data?.subscription_draft || {}) };
            if (resolved?.region_id) draft.region_id = resolved.region_id;
            if (resolved?.district_id) draft.district_id = resolved.district_id;
            draft.use_geo = true;

            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, subscription_draft: draft, location_intent: null, selected_categories: [] }
            });

            if (!draft.region_id) {
                const regions = await this.getRegions();
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
                await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
                    replyMarkup: keyboards.regionKeyboard(lang, regions)
                });
                return;
            }

            const categories = await this.getCategories();
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_CATEGORY });
            await this.sendPrompt(chatId, session, botTexts.askCategory[lang], {
                replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories as any)
            });
            return;
        }

        if (locationIntent === 'update_only') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SETTINGS,
                data: { ...session.data, location_intent: null }
            });
            await this.sendPrompt(chatId, session, botTexts.locationAccepted[lang], {
                replyMarkup: keyboards.settingsKeyboard(lang)
            });
            return;
        }

        await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
        const regions = await this.getRegions();
        await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
            replyMarkup: keyboards.regionKeyboard(lang, regions)
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
        await this.updateSession(session.telegram_user_id, { data: { ...session.data, active_resume_id: null } });
        await sendMessage(chatId, lang === 'uz' ? "✅ Rezyume o'chirildi." : "✅ Резюме удалено.", { replyMarkup: keyboards.removeKeyboard() });
        await this.showResumeList(chatId, session);
    }

    private async handleStart(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang || 'uz';
        if (!session.lang) {
            await this.updateSession(session.telegram_user_id, { state: BotState.AWAITING_LANG });
            await this.sendPrompt(chatId, session, botTexts.selectLanguage.uz, { replyMarkup: keyboards.languageKeyboard() });
            return;
        }
        if (session.user_id) {
            await this.showMainMenu(chatId, session);
            return;
        }
        await this.updateSession(session.telegram_user_id, { state: BotState.START });
        await this.sendPrompt(chatId, session, botTexts.startWelcome[lang], {
            replyMarkup: keyboards.startKeyboard(lang),
            parseMode: 'HTML'
        });
    }

    private async handleLangSelect(chatId: number, lang: BotLang, session: TelegramSession): Promise<void> {
        await this.updateSession(session.telegram_user_id, { lang });
        if (session.user_id) {
            await this.showMainMenu(chatId, { ...session, lang });
            return;
        }
        await this.updateSession(session.telegram_user_id, { state: BotState.START });
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
        await this.updateSession(session.telegram_user_id, {
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

            await this.updateSession(session.telegram_user_id, {
                state: BotState.AWAITING_OTP,
                otp_code: otp,
                otp_expires_at: expiresAt
            });
            await sendMessage(chatId, botTexts.otpSent[lang], { replyMarkup: keyboards.removeKeyboard() });
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
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }
        if (new Date() > new Date(session.otp_expires_at)) {
            await sendMessage(chatId, botTexts.otpExpired[lang]);
            await this.updateSession(session.telegram_user_id, {
                state: BotState.AWAITING_PHONE,
                otp_code: null,
                otp_expires_at: null
            });
            await sendMessage(chatId, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
            return;
        }
        if (code !== session.otp_code) {
            await sendMessage(chatId, botTexts.otpInvalid[lang]);
            return;
        }
        if (!session.phone) {
            await sendMessage(chatId, botTexts.error[lang]);
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
        const { data, error } = await this.supabase.auth.signInWithPassword({
            phone: phone,
            password: password
        });
        if (error || !data.user) {
            await sendMessage(chatId, botTexts.passwordInvalid[lang]);
            return;
        }
        await sendMessage(chatId, botTexts.loginSuccess[lang]);
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

        await this.updateSession(session.telegram_user_id, {
            user_id: userId,
            otp_code: null,
            otp_expires_at: null,
            data: { ...session.data, resume: {} }
        });

        await this.sendPrompt(chatId, session, botTexts.authSuccess[lang]);

        if (session.data?.role_switch_pending) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_ROLE,
                data: { ...session.data, role_switch_pending: false }
            });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
            return;
        }

        if (seekerProfile && employerProfile) {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_ROLE });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
        } else if (employerProfile) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: { ...session.data, active_role: 'employer' }
            });
            await this.sendPrompt(chatId, session, botTexts.employerWelcome[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
        } else if (seekerProfile) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.MAIN_MENU,
                data: { ...session.data, active_role: 'job_seeker' }
            });
            await this.showResumeList(chatId, { ...session, user_id: userId });
        } else {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_ROLE });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
        }
    }

    private async findOrCreateUser(phone: string, telegramId: number): Promise<string | null> {
        const now = new Date().toISOString();
        const { data: existing } = await this.supabase
            .from('users')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();
        if (existing?.id) return existing.id;

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
        const { error } = await this.supabase
            .from('telegram_sessions')
            .update(updates)
            .eq('telegram_user_id', telegramUserId);
        if (error) console.error('Session update error:', error);
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
        const regions = await this.getRegions();
        const regionName = regions.find(r => r.id === parseInt(regionId));

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const { data: districts } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', parseInt(regionId))
                .order('name_uz');

            const updatedResume = {
                ...session.data?.resume,
                region_id: parseInt(regionId),
                region_name: lang === 'uz' ? regionName?.name_uz : regionName?.name_ru,
                district_id: null,
                district_name: null
            };

            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_DISTRICT,
                data: {
                    ...session.data,
                    resume: updatedResume,
                    districts: districts || [],
                    districtPage: 0
                }
            });

            const options = { replyMarkup: keyboards.districtKeyboard(districts || [], lang, 0) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], options);
            }
            return;
        }

        if (session.state === BotState.POSTING_JOB_REGION) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_DESCRIPTION,
                data: {
                    ...session.data,
                    temp_job: {
                        ...session.data?.temp_job,
                        region_id: parseInt(regionId),
                        region_name: lang === 'uz' ? regionName?.name_uz : regionName?.name_ru
                    }
                }
            });
            await sendMessage(chatId, botTexts.postJobDescription[lang], { replyMarkup: keyboards.jobDescriptionKeyboard(lang) });
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const { data: districts } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', parseInt(regionId))
                .order('name_uz');

            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.region_id = parseInt(regionId);
            draft.district_id = null;

            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_DISTRICT,
                data: {
                    ...session.data,
                    subscription_draft: draft,
                    districts: districts || [],
                    districtPage: 0
                }
            });

            const options = { replyMarkup: keyboards.districtKeyboard(districts || [], lang, 0) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askDistrict[lang], options);
            }
            return;
        }

        const { data: districts } = await this.supabase
            .from('districts')
            .select('id, name_uz, name_ru')
            .eq('region_id', parseInt(regionId))
            .order('name_uz');

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_DISTRICT,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    region_id: parseInt(regionId),
                    region_name: lang === 'uz' ? regionName?.name_uz : regionName?.name_ru
                },
                districts: districts || [],
                districtPage: 0
            }
        });

        const options = { replyMarkup: keyboards.districtKeyboard(districts || [], lang, 0) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askDistrict[lang], options);
        }
    }

    private async showDistrictPage(chatId: number, page: number, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];
        await this.updateSession(session.telegram_user_id, { data: { ...session.data, districtPage: page } });
        const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, page) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askDistrict[lang], options);
        }
    }

    private async handleDistrictSelect(chatId: number, districtId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];
        const district = districts.find((d: any) => d.id === districtId);

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = {
                ...session.data?.resume,
                district_id: districtId,
                district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
            };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume }
            });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.district_id = districtId;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_CATEGORY,
                data: { ...session.data, subscription_draft: draft, selected_categories: [] }
            });
            const categories = await this.getCategories();
            const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories as any) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askCategory[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askCategory[lang], options);
            }
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_CATEGORY,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    district_id: districtId,
                    district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
                },
                selected_categories: []
            }
        });

        const categories = await this.getCategories();
        const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories as any) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askCategory[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askCategory[lang], options);
        }
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
            await sendMessage(chatId, botTexts.postJobSalary[lang], { replyMarkup: keyboards.removeKeyboard() });
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

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_EXPERIENCE,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    category_id: categoryId,
                    category_name: lang === 'uz' ? category?.name_uz : category?.name_ru
                }
            }
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
        const categories = await this.getCategories();

        if (value === 'done') {
            const selectedCategories = session.data?.selected_categories || [];
            if (selectedCategories.length === 0) {
                const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories as any) };
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

            if (session.data?.edit_mode && session.data?.active_resume_id) {
                const updatedResume = {
                    ...session.data?.resume,
                    category_ids: selectedCategories,
                    category_id: selectedCategories[0] || null
                };
                await this.saveResume(session, updatedResume, session.data.active_resume_id);
                await this.updateSession(session.telegram_user_id, {
                    data: { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume }
                });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }

            // Proceed to next step
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_EXPERIENCE,
                data: {
                    ...session.data,
                    resume: {
                        ...session.data?.resume,
                        category_ids: selectedCategories,
                        category_id: selectedCategories[0]
                    }
                }
            });
            const options = { replyMarkup: keyboards.experienceKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askExperience[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askExperience[lang], options);
            }
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

        await this.updateSession(session.telegram_user_id, {
            data: { ...session.data, selected_categories: selectedCategories }
        });

        const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, selectedCategories, categories as any) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.categorySelected[lang], options);
        } else {
            await sendMessage(chatId, botTexts.categorySelected[lang], options);
        }
    }

    private async handleExperienceSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = { ...session.data?.resume, experience_level: value, experience: value };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            await this.updateSession(session.telegram_user_id, { data: { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume } });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.experience = value;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_EDUCATION,
                data: { ...session.data, subscription_draft: draft }
            });
            const options = { replyMarkup: keyboards.educationKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askEducation[lang], options);
            }
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_EDUCATION,
            data: {
                ...session.data,
                resume: { ...session.data?.resume, experience_level: value }
            }
        });
        const options = { replyMarkup: keyboards.educationKeyboard(lang) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
        } else {
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
        }
    }

    private async handleEducationSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = { ...session.data?.resume, education_level: value };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            await this.updateSession(session.telegram_user_id, { data: { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume } });
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

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_GENDER,
            data: {
                ...session.data,
                resume: { ...session.data?.resume, education_level: value }
            }
        });
        const options = { replyMarkup: keyboards.genderKeyboard(lang, false) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askGender[lang], options);
        } else {
            await this.sendPrompt(chatId, session, botTexts.askGender[lang], options);
        }
    }

    private async handleGenderSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = { ...session.data?.resume, gender: value };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            await this.updateSession(session.telegram_user_id, { data: { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume } });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.gender = value;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_SALARY,
                data: { ...session.data, subscription_draft: draft }
            });
            const options = { replyMarkup: keyboards.salaryKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askSalary[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askSalary[lang], options);
            }
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_SALARY,
            data: {
                ...session.data,
                resume: { ...session.data?.resume, gender: value }
            }
        });
        const options = { replyMarkup: keyboards.salaryKeyboard(lang) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askSalary[lang], options);
        } else {
            await this.sendPrompt(chatId, session, botTexts.askSalary[lang], options);
        }
    }

    private async handleSalarySelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const salaryMin = parseInt(value) || 0;

        if (this.isSubscriptionFlow(session)) {
            const draft = { ...(session.data?.subscription_draft || {}) };
            draft.salary_min = salaryMin > 0 ? salaryMin : 0;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_SALARY_MAX,
                data: { ...session.data, subscription_draft: draft }
            });
            const options = { replyMarkup: keyboards.salaryMaxKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askSalaryMax[lang], options);
            } else {
                await sendMessage(chatId, botTexts.askSalaryMax[lang], options);
            }
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.ENTERING_TITLE,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    expected_salary_min: salaryMin > 0 ? salaryMin : null
                }
            }
        });
        const options = { replyMarkup: keyboards.backCancelKeyboard(lang, 'salary') };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askTitle[lang], options);
        } else {
            await this.sendPrompt(chatId, session, botTexts.askTitle[lang], options);
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
            await editMessage(chatId, messageId, botTexts.askSubscriptionFrequency[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askSubscriptionFrequency[lang], options);
        }
    }

    private async handleEmploymentSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (!this.isSubscriptionFlow(session)) return;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.employment_type = value || 'all';
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_WORK_MODE,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.workModeKeyboard(lang) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askWorkMode[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askWorkMode[lang], options);
        }
    }

    private async handleWorkModeSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (!this.isSubscriptionFlow(session)) return;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.work_mode = value || 'all';
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_WORKING_DAYS,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.workingDaysKeyboard(lang) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askWorkingDays[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askWorkingDays[lang], options);
        }
    }

    private async handleWorkingDaysSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (!this.isSubscriptionFlow(session)) return;
        const draft = { ...(session.data?.subscription_draft || {}) };
        draft.working_days = value || 'all';
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_EXPERIENCE,
            data: { ...session.data, subscription_draft: draft }
        });
        const options = { replyMarkup: keyboards.experienceKeyboard(lang) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askExperience[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askExperience[lang], options);
        }
    }

    private async saveResume(session: TelegramSession, resumeData: any, resumeId?: string | null): Promise<string | null> {
        if (!session.user_id || !resumeData) return null;

        const {
            region_id, district_id, category_id, category_ids,
            experience, experience_level, education, education_level, gender,
            salary, title, name, about, skills, desired_position, full_name,
            expected_salary_min, birth_date
        } = resumeData;

        const parseNumber = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            const cleaned = String(value).replace(/[^\d]/g, '');
            if (!cleaned) return null;
            const num = Number(cleaned);
            return Number.isFinite(num) ? num : null;
        };

        const finalCategoryIds = Array.isArray(category_ids) && category_ids.length > 0
            ? category_ids
            : (category_id ? [category_id] : []);
        const finalCategoryId = category_id || (finalCategoryIds.length > 0 ? finalCategoryIds[0] : null);
        const normalizedGender = gender === 'any' ? null : gender;
        const salaryMin = parseNumber(expected_salary_min ?? salary);

        const payload = {
            user_id: session.user_id,
            region_id: region_id ?? null,
            district_id: district_id ?? null,
            category_id: finalCategoryId,
            category_ids: finalCategoryIds,
            title: title || desired_position || null,
            full_name: full_name || name || null,
            about: about || null,
            skills: Array.isArray(skills) ? skills : [],
            experience: experience_level || experience || 'no_experience',
            education_level: education_level || education || 'secondary',
            gender: normalizedGender,
            expected_salary_min: salaryMin,
            birth_date: birth_date || null,
            is_public: true,
            status: 'active',
            updated_at: new Date().toISOString(),
            phone: session.phone || null
        } as Record<string, any>;

        if (resumeId) {
            const { error } = await this.supabase
                .from('resumes')
                .update(payload)
                .eq('id', resumeId);
            if (error) {
                console.error('Save resume error:', error);
                return null;
            }
            return resumeId;
        }

        const { data, error } = await this.supabase
            .from('resumes')
            .insert({ ...payload, created_at: new Date().toISOString() })
            .select('id')
            .single();

        if (error) {
            console.error('Save resume error:', error);
            return null;
        }

        return data?.id || null;
    }

    private async handleTextByState(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const state = session.state;

        const skipTexts = ["O'tkazib yuborish", "O‘tkazib yuborish", 'Пропустить'];
        const cancelTexts = ['Bekor qilish', 'Отмена'];
        if (skipTexts.includes(text)) {
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

        // EMPLOYER
        if (state === BotState.ENTERING_COMPANY_NAME) {
            const { error } = await this.supabase
                .from('employer_profiles')
                .upsert({ user_id: session.user_id, company_name: text }, { onConflict: 'user_id' });

            if (error) {
                console.error('Save company error:', error);
            }
            await this.updateSession(session.telegram_user_id, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: { ...session.data, active_role: 'employer' }
            });
            await this.sendPrompt(chatId, session, botTexts.employerWelcome[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        if (state === BotState.POSTING_JOB_TITLE) {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_CATEGORY,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, title: text } }
            });
            const categories = await this.getCategories();
            await sendMessage(chatId, botTexts.postJobCategory[lang], { replyMarkup: keyboards.categoryKeyboard(lang, categories) });
            return;
        }

        if (state === BotState.POSTING_JOB_SALARY) {
            const cleaned = text.replace(/[^\d]/g, '');
            const salaryMin = cleaned ? parseInt(cleaned, 10) : 0;
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_REGION,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, salary_min: salaryMin || null } }
            });
            const regions = await this.getRegions();
            await sendMessage(chatId, botTexts.askRegion[lang], { replyMarkup: keyboards.regionKeyboard(lang, regions) });
            return;
        }

        if (state === BotState.POSTING_JOB_DESCRIPTION) {
            // ... (Simple flow for description, moving to salary/confirm)
            // For now assuming description leads to confirm or salary. 
            // Based on earlier logic, description was late stage.
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_CONFIRM,
                data: { ...session.data, temp_job: { ...session.data?.temp_job, description: text } }
            });
            // Show summary and confirm
            const jobSummary = `Title: ${session.data?.temp_job?.title}\nDesc: ${text}`;
            await sendMessage(chatId, jobSummary, { replyMarkup: keyboards.jobConfirmKeyboard(lang) });
            return;
        }


        // RESUME
        if (state === BotState.ENTERING_TITLE) {
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, title: text }, session.data.active_resume_id);
                await this.updateSession(session.telegram_user_id, { data: { ...session.data, edit_mode: false, edit_field: null } });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            await this.updateSession(session.telegram_user_id, {
                state: BotState.ENTERING_NAME,
                data: { ...session.data, resume: { ...session.data?.resume, title: text } }
            });
            const options = { replyMarkup: keyboards.backCancelKeyboard(lang, 'title') };
            await this.sendPrompt(chatId, session, botTexts.askName[lang], options);
            return;
        }

        if (state === BotState.ENTERING_NAME) {
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, full_name: text }, session.data.active_resume_id);
                await this.updateSession(session.telegram_user_id, { data: { ...session.data, edit_mode: false, edit_field: null } });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            await this.updateSession(session.telegram_user_id, {
                state: BotState.ENTERING_ABOUT,
                data: { ...session.data, resume: { ...session.data?.resume, full_name: text } }
            });
            const options = { replyMarkup: keyboards.skipKeyboard(lang, 'name') };
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], options);
            return;
        }

        if (state === BotState.ENTERING_ABOUT) {
            const aboutText = text;
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, about: aboutText }, session.data.active_resume_id);
                await this.updateSession(session.telegram_user_id, { data: { ...session.data, edit_mode: false, edit_field: null } });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            await this.updateSession(session.telegram_user_id, {
                state: BotState.ADDING_SKILLS,
                data: { ...session.data, resume: { ...session.data?.resume, about: aboutText } }
            });
            const options = { replyMarkup: keyboards.skillsKeyboard(lang, []) };
            await this.sendPrompt(chatId, session, botTexts.askSkills[lang], options);
            return;
        }

        if (state === BotState.ADDING_SKILLS) {
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
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, resume: { ...session.data?.resume, skills: currentSkills } }
            });
            const addedItems = items.length > 0 ? items : [text];
            const addedText = addedItems.map(item => `✅ ${item}`).join('\n');
            await sendMessage(chatId, `${botTexts.skillAdded[lang]}\n${addedText}`, {
                replyMarkup: keyboards.skillsKeyboard(lang, currentSkills)
            });
            return;
        }

        // AI CHAT
        if (state === BotState.AI_JOB_INPUT) {
            // Process basic job search query text
            await sendMessage(chatId, "🔎 Qidiruv ishlanmoqda...", { replyMarkup: keyboards.removeKeyboard() });
            // Here we would call AI search
            await this.updateSession(session.telegram_user_id, { state: BotState.BROWSING_JOBS });
            // Mock result
            return;
        }


        // Fallback - Handle reply keyboard button texts
        // These must match the actual button texts in mainMenuKeyboard
        const menuTexts = {
            jobs: { uz: '🔎 Ish topish', ru: '🔎 Найти работу' },
            saved: { uz: '⭐ Saqlanganlar', ru: '⭐ Сохранённые' },
            resume: { uz: '🧾 Rezyume', ru: '🧾 Резюме' },
            settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки' },
            help: { uz: '🆘 Yordam', ru: '🆘 Помощь' }
        };

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
            await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, session.data?.active_role === 'employer' ? 'employer' : 'seeker')
            });
        }

    }

    private async handleSkip(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const state = session.state;

        // Skip logic based on state
        if (state === BotState.ENTERING_NAME) {
            // Skip name? Maybe use telegram name?
            // For now just empty or placeholder
            await this.handleTextByState(chatId, session.data?.temp_phone || "User", session);
        } else if (state === BotState.ENTERING_ABOUT) {
            await this.handleTextByState(chatId, "", session);
        } else if (state === BotState.ADDING_SKILLS) {
            await this.finishSkills(chatId, session);
        } else if (state === BotState.REQUESTING_LOCATION && session.data?.location_intent === 'resume_final') {
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, location_intent: null }
            });
            await this.sendPrompt(chatId, session, botTexts.locationSkipped[lang]);
            await this.finalizeResume(chatId, session);
        } else if (state === BotState.SELECTING_SALARY_MAX) { // e.g. 'all'
            await this.handleSalaryMaxSelect(chatId, 'all', session);
        } else if (state === BotState.REQUESTING_LOCATION && session.data?.location_intent === 'job_search_geo') {
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, location_intent: null }
            });
            await this.showMainMenu(chatId, session);
        }
    }

    private async handleCancel(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const updatedData = {
            ...session.data,
            edit_mode: false,
            edit_field: null,
            location_intent: null,
            role_switch_pending: false
        };
        await this.updateSession(session.telegram_user_id, {
            state: BotState.MAIN_MENU,
            data: updatedData
        });
        await this.sendPrompt(chatId, session, botTexts.mainMenu[lang], {
            replyMarkup: keyboards.mainMenuKeyboard(lang, updatedData.active_role === 'employer' ? 'employer' : 'seeker')
        });
    }

    private async handleBack(chatId: number, target: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

        if (target === 'region') {
            const regions = await this.getRegions();
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
            await this.sendPrompt(chatId, session, botTexts.askRegion[lang], { replyMarkup: keyboards.regionKeyboard(lang, regions) });
            return;
        }

        if (target === 'district') {
            const districts = session.data?.districts || [];
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_DISTRICT });
            await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], { replyMarkup: keyboards.districtKeyboard(districts, lang, session.data?.districtPage || 0) });
            return;
        }

        if (target === 'category') {
            const categories = await this.getCategories();
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_CATEGORY });
            await this.sendPrompt(chatId, session, botTexts.askCategory[lang], {
                replyMarkup: keyboards.multiCategoryKeyboard(lang, session.data?.selected_categories || [], categories as any)
            });
            return;
        }

        if (target === 'experience') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_EXPERIENCE });
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], { replyMarkup: keyboards.experienceKeyboard(lang) });
            return;
        }

        if (target === 'education') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_EDUCATION });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], { replyMarkup: keyboards.educationKeyboard(lang) });
            return;
        }

        if (target === 'gender') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_GENDER });
            await this.sendPrompt(chatId, session, botTexts.askGender[lang], { replyMarkup: keyboards.genderKeyboard(lang, false) });
            return;
        }

        if (target === 'salary') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_SALARY });
            await this.sendPrompt(chatId, session, botTexts.askSalary[lang], { replyMarkup: keyboards.salaryKeyboard(lang) });
            return;
        }

        if (target === 'title') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_TITLE });
            await this.sendPrompt(chatId, session, botTexts.askTitle[lang], { replyMarkup: keyboards.skipKeyboard(lang, 'title') });
            return;
        }

        if (target === 'name') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_NAME });
            await this.sendPrompt(chatId, session, botTexts.askName[lang], { replyMarkup: keyboards.skipKeyboard(lang, 'name') });
            return;
        }

        if (target === 'about') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_ABOUT });
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], { replyMarkup: keyboards.skipKeyboard(lang, 'about') });
            return;
        }

        await this.showMainMenu(chatId, session);
    }

    private async finishSkills(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, {
            state: BotState.REQUESTING_LOCATION,
            data: { ...session.data, location_intent: 'resume_final' }
        });
        await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
            replyMarkup: keyboards.locationRequestKeyboard(lang)
        });
    }

    private async startResumeFlow(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const regions = await this.getRegions();
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_REGION,
            data: { ...session.data, active_role: 'job_seeker', resume: {}, selected_categories: [] }
        });
        await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
            replyMarkup: keyboards.regionKeyboard(lang, regions)
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

        await this.updateSession(session.telegram_user_id, {
            state: BotState.VIEWING_RESUME,
            data: { ...session.data, active_role: 'job_seeker' }
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

        await this.updateSession(session.telegram_user_id, {
            state: BotState.VIEWING_RESUME,
            data: { ...session.data, active_resume_id: resumeId }
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

        await this.updateSession(session.telegram_user_id, {
            data: { ...session.data, edit_mode: true, edit_field: field, resume }
        });

        if (field === 'region') {
            const regions = await this.getRegions();
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
            await this.sendPrompt(chatId, session, botTexts.askRegion[lang], { replyMarkup: keyboards.regionKeyboard(lang, regions) });
            return;
        }

        if (field === 'district') {
            if (!resume.region_id) {
                const regions = await this.getRegions();
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
                await this.sendPrompt(chatId, session, botTexts.askRegion[lang], { replyMarkup: keyboards.regionKeyboard(lang, regions) });
                return;
            }
            const { data: districts } = await this.supabase
                .from('districts')
                .select('id, name_uz, name_ru')
                .eq('region_id', resume.region_id)
                .order('name_uz');
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_DISTRICT,
                data: { ...session.data, districts: districts || [], districtPage: 0 }
            });
            await this.sendPrompt(chatId, session, botTexts.askDistrict[lang], {
                replyMarkup: keyboards.districtKeyboard(districts || [], lang, 0)
            });
            return;
        }

        if (field === 'category') {
            const categories = await this.getCategories();
            const selected = Array.isArray(resume.category_ids) && resume.category_ids.length > 0
                ? resume.category_ids
                : resume.category_id ? [resume.category_id] : [];
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_CATEGORY,
                data: { ...session.data, selected_categories: selected }
            });
            await this.sendPrompt(chatId, session, botTexts.askCategory[lang], {
                replyMarkup: keyboards.multiCategoryKeyboard(lang, selected, categories as any)
            });
            return;
        }

        if (field === 'experience') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_EXPERIENCE });
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], { replyMarkup: keyboards.experienceKeyboard(lang) });
            return;
        }

        if (field === 'education') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_EDUCATION });
            await this.sendPrompt(chatId, session, botTexts.askEducation[lang], { replyMarkup: keyboards.educationKeyboard(lang) });
            return;
        }

        if (field === 'gender') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_GENDER });
            await this.sendPrompt(chatId, session, botTexts.askGender[lang], { replyMarkup: keyboards.genderKeyboard(lang, false) });
            return;
        }

        if (field === 'salary') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_SALARY });
            await this.sendPrompt(chatId, session, botTexts.askSalary[lang], { replyMarkup: keyboards.salaryKeyboard(lang) });
            return;
        }

        if (field === 'title') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_TITLE });
            await this.sendPrompt(chatId, session, botTexts.askTitle[lang], { replyMarkup: keyboards.backCancelKeyboard(lang, 'salary') });
            return;
        }

        if (field === 'name') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_NAME });
            await this.sendPrompt(chatId, session, botTexts.askName[lang], { replyMarkup: keyboards.backCancelKeyboard(lang, 'title') });
            return;
        }

        if (field === 'about') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_ABOUT });
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], { replyMarkup: keyboards.skipKeyboard(lang, 'about') });
            return;
        }

        if (field === 'skills') {
            await this.updateSession(session.telegram_user_id, { state: BotState.ADDING_SKILLS });
            await this.sendPrompt(chatId, session, botTexts.askSkills[lang], { replyMarkup: keyboards.skillsKeyboard(lang, resume.skills || []) });
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
                .map((id: string) => categories.find(cat => cat.id === id))
                .filter(Boolean)
                .map(cat => lang === 'uz' ? cat!.name_uz : cat!.name_ru);
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
        const resumeData = session.data?.resume;
        const resumeId = await this.saveResume(session, resumeData, session.data?.active_resume_id || null);

        if (!resumeId) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }

        await this.supabase.from('job_seeker_profiles').upsert({
            user_id: session.user_id,
            full_name: resumeData?.full_name || null,
            phone: session.phone || null,
            region_id: resumeData?.region_id || null,
            district_id: resumeData?.district_id || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        await this.updateSession(session.telegram_user_id, {
            state: BotState.VIEWING_RESUME,
            data: { ...session.data, resume: {}, active_resume_id: resumeId }
        });

        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await sendMessage(chatId, botTexts.resumeSaved[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const text = `✅ ${botTexts.resumeSaved[lang]}\n\n${await this.buildResumeText(resume, lang)}`;
        await this.sendPrompt(chatId, session, text, { parseMode: 'HTML', replyMarkup: keyboards.resumeSearchOnlyKeyboard(lang) });
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
        if (mode === 'geo') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.REQUESTING_LOCATION,
                data: { ...session.data, location_intent: 'job_search_geo' }
            });
            await this.sendPrompt(chatId, session, botTexts.locationRequest[session.lang], {
                replyMarkup: keyboards.locationRequestKeyboard(session.lang)
            });
            return;
        }

        await this.showResumeSearchSelection(chatId, session);
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
        await this.sendPrompt(chatId, session, botTexts.searchingJobs[lang]);

        const { data: jobs } = await this.supabase
            .from('jobs')
            .select('*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)')
            .eq('status', 'active')
            .limit(300);

        const normalized = (jobs || []).map(job => this.normalizeJob(job, lang));
        const profile = {
            region_id: resume.region_id,
            district_id: resume.district_id,
            category_id: resume.category_id,
            category_ids: resume.category_ids,
            expected_salary_min: resume.expected_salary_min,
            experience_level: resume.experience || resume.experience_level,
            gender: resume.gender,
            birth_date: resume.birth_date,
            education_level: resume.education_level
        };

        const matched = matchAndSortJobs(profile, normalized);
        if (!matched.length) {
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.BROWSING_JOBS,
            data: { ...session.data, job_list: matched, currentJobIndex: 0, job_source: 'resume', active_resume_id: resume.id }
        });

        await this.showJob(chatId, session, 0);
    }

    private async searchJobsByLocation(chatId: number, session: TelegramSession, geo: { region_id?: number | null; district_id?: string | null }): Promise<void> {
        const lang = session.lang;
        await this.sendPrompt(chatId, session, botTexts.searchingJobs[lang]);

        let query = this.supabase
            .from('jobs')
            .select('*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)')
            .eq('status', 'active')
            .limit(300);

        if (geo?.region_id) query = query.eq('region_id', geo.region_id);
        if (geo?.district_id) query = query.eq('district_id', geo.district_id);

        const { data: jobs } = await query;
        const normalized = (jobs || []).map(job => this.normalizeJob(job, lang));

        if (!normalized.length) {
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.BROWSING_JOBS,
            data: { ...session.data, job_list: normalized, currentJobIndex: 0, job_source: 'geo' }
        });
        await this.showJob(chatId, session, 0);
    }

    private normalizeJob(job: any, lang: BotLang): any {
        const regionName = job.regions ? (lang === 'uz' ? job.regions.name_uz : job.regions.name_ru) : job.region_name;
        const districtName = job.districts ? (lang === 'uz' ? job.districts.name_uz : job.districts.name_ru) : job.district_name;
        const companyName = job.company_name || job.employer_profiles?.company_name || null;
        return {
            ...job,
            region_name: regionName,
            district_name: districtName,
            company_name: companyName
        };
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
            await sendMessage(chatId, botTexts.favoriteRemoved[lang]);
        } else {
            await this.supabase.from('favorites').insert({ user_id: session.user_id, job_id: jobId });
            await sendMessage(chatId, botTexts.favoriteAdded[lang]);
        }
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
        const { data: jobs } = await this.supabase
            .from('jobs')
            .select('*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)')
            .in('id', jobIds)
            .eq('status', 'active');

        const normalized = (jobs || []).map(job => this.normalizeJob(job, lang));

        await this.updateSession(session.telegram_user_id, {
            state: BotState.BROWSING_JOBS,
            data: { ...session.data, job_list: normalized, currentJobIndex: 0, job_source: 'favorites' }
        });

        await this.showJob(chatId, session, 0);
    }


    private async deleteSkill(chatId: number, index: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const currentSkills = session.data?.resume?.skills || [];
        if (index >= 0 && index < currentSkills.length) {
            currentSkills.splice(index, 1);
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, resume: { ...session.data?.resume, skills: currentSkills } }
            });
            await sendMessage(chatId, botTexts.skillDeleted[lang], {
                replyMarkup: keyboards.skillsKeyboard(lang, currentSkills)
            });
        }
    }

    private async showMainMenu(chatId: number, session: TelegramSession): Promise<void> {
        await this.updateSession(session.telegram_user_id, { state: BotState.MAIN_MENU });
        const lang = session.lang;
        const role = session.data?.active_role === 'employer' ? 'employer' : 'seeker';
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
        await this.sendPrompt(chatId, session, botTexts.mainMenu[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, role) });
    }

    private async handleAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (action === 'jobs' || action === 'search') {
            await this.updateSession(session.telegram_user_id, { state: BotState.BROWSING_JOBS });
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
            await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, session.data?.active_role === 'employer' ? 'employer' : 'seeker')
            });
        }
    }

    private async handleEmployerMainMenu(chatId: number, action: string, session: TelegramSession): Promise<void> {
        // Mock Employer Flow for now or basic implementation
        // Since the primary focus is seeker resume flow restoration, I will keep this minimal but functional
        const lang = session.lang;
        if (action === 'post_job') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_TITLE,
                data: { ...session.data, temp_job: {} }
            });
            await sendMessage(chatId, botTexts.postJobTitle[lang], { replyMarkup: keyboards.removeKeyboard() });
        } else if (action === 'my_vacancies') {
            // Show vacancies logic
            await sendMessage(chatId, "📋 Bo'lim ishlab chiqilmoqda.", { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
        }
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
        await this.updateSession(session.telegram_user_id, {
            state: BotState.AWAITING_PASSWORD,
            data: { ...session.data, role_switch_pending: true }
        });
        await this.sendPrompt(chatId, session, botTexts.enterPassword[lang], {
            replyMarkup: keyboards.cancelInlineKeyboard(lang)
        });
    }

    private async handleLogout(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, {
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
            .select('company_name')
            .eq('user_id', session.user_id)
            .maybeSingle();

        const title = jobData?.title || 'Vakansiya';
        const description = jobData?.description || '';
        const companyName = jobData?.company_name || employer?.company_name || 'Kompaniya';

        await this.supabase.from('jobs').insert({
            employer_id: session.user_id,
            title_uz: title,
            title_ru: title,
            description_uz: description,
            description_ru: description,
            company_name: companyName,
            category_id: jobData?.category_id || null,
            region_id: jobData?.region_id || null,
            salary_min: jobData?.salary_min || null,
            is_active: true,
            status: 'active',
            created_at: new Date().toISOString()
        });

        await sendMessage(chatId, botTexts.jobPublished[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
        await this.updateSession(session.telegram_user_id, { state: BotState.EMPLOYER_MAIN_MENU, data: { ...session.data, temp_job: null } });
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
                gender: lang === 'uz' ? 'Jins' : 'Пол',
                age: lang === 'uz' ? 'Yosh' : 'Возраст',
                education: lang === 'uz' ? "Ma'lumot" : 'Образование',
                salary: lang === 'uz' ? 'Maosh' : 'Зарплата',
                experience: lang === 'uz' ? 'Tajriba' : 'Опыт'
            };
            const lines: string[] = [];
            if (criteria.location) lines.push(`✅ ${labels.location}`);
            if (criteria.category) lines.push(`✅ ${labels.category}`);
            if (criteria.gender) lines.push(`✅ ${labels.gender}`);
            const hasAgeReq = Boolean(job.age_min || job.age_max);
            if (criteria.age && hasAgeReq && job.ageKnown !== false) lines.push(`✅ ${labels.age}`);
            const hasEduReq = Boolean(job.education_level || job.raw_source_json?.min_education);
            if (criteria.education && hasEduReq) lines.push(`✅ ${labels.education}`);
            const hasSalary = Boolean(job.salary_min || job.salary_max);
            if (criteria.salary && hasSalary) lines.push(`✅ ${labels.salary}`);
            const hasExpReq = Boolean(job.experience || job.experience_years || job.raw_source_json?.work_experiance);
            if (criteria.experience && hasExpReq) lines.push(`✅ ${labels.experience}`);
            if (lines.length > 0) {
                matchBlock = `${botTexts.matchScore[lang](job.matchScore)}\n\n${lines.join('\n')}`;
            }
        }

        const text = matchBlock ? `${formatFullJobCard(job, lang)}\n\n${matchBlock}` : formatFullJobCard(job, lang);

        const isFavorite = session.user_id
            ? !!(await this.supabase
                .from('favorites')
                .select('id')
                .eq('user_id', session.user_id)
                .eq('job_id', jobId)
                .maybeSingle()).data
            : false;

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
        if (job.latitude && job.longitude) {
            try {
                const loc = await sendLocation(chatId, job.latitude, job.longitude);
                lastLocationMessageId = loc?.message_id || null;
            } catch (err) {
                // ignore location errors
            }
        }

        await this.updateSession(session.telegram_user_id, {
            data: {
                ...session.data,
                currentJobIndex: safeIndex,
                last_job_message_id: sent?.message_id,
                last_job_location_message_id: lastLocationMessageId
            }
        });
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
        } else if (action === 'subscriptions') {
            await this.handleSubscriptionCheck(chatId, session);
        } else if (action === 'location') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.REQUESTING_LOCATION,
                data: { ...session.data, location_intent: 'update_only' }
            });
            await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
        } else if (action === 'switch_role') {
            await this.handleRoleSwitch(chatId, session);
        } else {
            await this.showMainMenu(chatId, session);
        }
    }


    // SUBSCRIPTION
    private isSubscriptionFlow(session: TelegramSession): boolean {
        return session.data?.subscription_draft?.is_active === true || session.state.includes('SELECTING_SUBSCRIPTION'); // Simple check logic
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
        // AI handlers
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
            );

            let districtId: string | undefined;
            if (regionMatch && districtName) {
                const { data: districts } = await this.supabase
                    .from('districts')
                    .select('id, name_uz, name_ru')
                    .eq('region_id', regionMatch.id);
                const normalizedDistrict = normalize(districtName);
                const districtMatch = (districts || []).find(d =>
                    normalize(d.name_uz) === normalizedDistrict || normalize(d.name_ru) === normalizedDistrict
                );
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
