/**
 * Telegram Bot - Complete Resume Creation Flow
 * Handles all incoming updates and state transitions
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendMessage, editMessage, answerCallbackQuery, isUserSubscribed } from './telegram-api';
import * as keyboards from './keyboards';
import { botTexts, BotLang, formatJobCard, EXPERIENCE_LABELS } from './texts';
import { matchAndSortJobs, getMatchPercentage } from './job-matcher';

// ============================================
// FSM States
// ============================================
export enum BotState {
    START = 'start',
    AWAITING_LANG = 'awaiting_lang',
    AWAITING_PHONE = 'awaiting_phone',
    AWAITING_OTP = 'awaiting_otp',
    AWAITING_PASSWORD = 'awaiting_password', // New state for password

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
    ENTERING_TITLE = 'entering_title',
    ENTERING_NAME = 'entering_name',
    ENTERING_ABOUT = 'entering_about',
    ADDING_SKILLS = 'adding_skills',
    RESUME_COMPLETE = 'resume_complete',

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
    phone: string | null; // Stores phone during auth
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

        if (!userId) return;

        const session = await this.getOrCreateSession(userId);
        if (!session) return;

        if (this.isDuplicateUpdate(session, updateId, messageId, callbackId)) {
            return;
        }

        await this.trackUpdate(session, updateId, messageId, callbackId);

        if (message) {
            await this.handleMessage(message, session);
        } else if (callback) {
            await this.handleCallbackQuery(callback, session);
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

            // Handle /start command
            if (text === '/start') {
                await this.handleStart(chatId, session);
                return;
            }

            // Handle contact (phone sharing)
            if (msg.contact) {
                await this.handlePhone(chatId, msg.contact.phone_number, session);
                return;
            }

            // Handle location
            if (msg.location) {
                await this.handleLocation(chatId, msg.location, session);
                return;
            }

            // Handle text based on state
            await this.handleTextByState(chatId, text, session);

        } catch (err) {
            console.error('Bot message error:', {
                error: err,
                chatId,
                userId,
                messageId: msg.message_id,
                state: sessionOverride?.state
            });
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

            // Ensure session has required fields if missing
            if (!session.data) session.data = {};

            const chatId = message.chat.id;
            const [action, value] = data.split(':');

            switch (action) {
                case 'lang':
                    await this.handleLangSelect(chatId, value as BotLang, session);
                    break;
                case 'auth':
                    await this.handleAuthCallback(chatId, value, session);
                    break;
                case 'role':
                    await this.handleRoleSelect(chatId, value, session);
                    break;
                case 'region':
                    await this.handleRegionSelect(chatId, value, session, message.message_id);
                    break;
                case 'district':
                    await this.handleDistrictSelect(chatId, value, session, message.message_id);
                    break;
                case 'distpage':
                    await this.showDistrictPage(chatId, parseInt(value), session, message.message_id);
                    break;
                case 'category':
                    await this.handleCategorySelect(chatId, value, session, message.message_id);
                    break;
                case 'experience':
                    await this.handleExperienceSelect(chatId, value, session, message.message_id);
                    break;
                case 'education':
                    await this.handleEducationSelect(chatId, value, session, message.message_id);
                    break;
                case 'gender':
                    await this.handleGenderSelect(chatId, value, session, message.message_id);
                    break;
                case 'salary':
                    await this.handleSalarySelect(chatId, value, session, message.message_id);
                    break;
                case 'skip':
                    await this.handleSkip(chatId, session);
                    break;
                case 'skills':
                    if (value === 'done') await this.finishSkills(chatId, session);
                    break;
                case 'delskill':
                    await this.deleteSkill(chatId, parseInt(value), session);
                    break;
                case 'back':
                    await this.handleBack(chatId, value, session);
                    break;
                case 'menu':
                    if (value === 'main') await this.showMainMenu(chatId, session);
                    break;
                case 'action':
                    await this.handleAction(chatId, value, session);
                    break;
                case 'job':
                    if (value === 'publish') {
                        await this.handleJobPublish(chatId, session);
                    } else {
                        await this.handleJobNavigation(chatId, value, session, message.message_id);
                    }
                    break;
                case 'apply':
                    await this.handleJobApply(chatId, value, session);
                    break;
                case 'profile':
                    await this.handleProfileAction(chatId, value, session);
                    break;
                case 'settings':
                    if (value === 'switch_role') {
                        await this.handleRoleSwitch(chatId, session);
                    } else {
                        await this.handleSettingsAction(chatId, value, session);
                    }
                    break;
                case 'sub':
                    if (value === 'check') {
                        await this.handleSubscriptionCheck(chatId, session);
                    }
                    break;
                case 'resume':
                    if (value === 'update') {
                        const regions = await this.getRegions();
                        await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
                        await sendMessage(chatId, botTexts.askRegion[session.lang], {
                            replyMarkup: keyboards.regionKeyboard(session.lang, regions)
                        });
                    } else if (value === 'delete') {
                        await this.handleResumeDelete(chatId, session);
                    }
                    break;
                case 'mcat':
                    await this.handleMultiCategory(chatId, value, session, message.message_id);
                    break;
                default:
                    console.log('Unknown callback:', data);
            }
        } catch (err) {
            console.error('Callback error:', {
                error: err,
                userId: from.id,
                callbackId: id,
                messageId: message?.message_id
            });
            if (message) {
                const lang = sessionOverride?.lang || 'uz';
                await sendMessage(message.chat.id, botTexts.error[lang]);
            }
        }

    }

    private async handleAuthCallback(chatId: number, value: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const phone = session.data?.temp_phone || session.phone;

        if (value === 'password') {
            await this.updateSession(session.telegram_user_id, {
                state: BotState.AWAITING_PASSWORD,
                phone: phone
            });
            await sendMessage(chatId, botTexts.enterPassword[lang]);
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

            // Check if profile exists
            const { data: profile } = await this.supabase
                .from('employer_profiles')
                .select('company_name')
                .eq('user_id', session.user_id)
                .single();

            if (!profile) {
                await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_COMPANY_NAME });
                await sendMessage(chatId, botTexts.companyNamePrompt[lang]);
            } else {
                await sendMessage(chatId, botTexts.employerWelcome[lang], {
                    replyMarkup: keyboards.employerMainMenuKeyboard(lang)
                });
            }

        } else if (role === 'seeker') {
            // Check if resume exists
            const { data: resume } = await this.supabase
                .from('resumes')
                .select('id')
                .eq('user_id', session.user_id)
                .single();

            if (resume) {
                await this.showExistingResumeMenu(chatId, session);
            } else {
                // New Resume Flow: Start with Location
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.REQUESTING_LOCATION,
                    data: { ...session.data, active_role: 'job_seeker' }
                });

                await sendMessage(chatId,
                    lang === 'uz' ? "Ish qidirishda yordam berishimiz uchun lokatsiyangizni yuboring:" : "Чтобы мы могли подобрать вакансии рядом, отправьте вашу локацию:",
                    { replyMarkup: keyboards.locationRequestKeyboard(lang) }
                );
            }
        }
    }

    private async showExistingResumeMenu(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, { state: BotState.MAIN_MENU });

        await sendMessage(chatId,
            lang === 'uz' ? "Sizda allaqachon rezyume mavjud. Nima qilmoqchisiz?" : "У вас уже есть резюме. Что вы хотите сделать?",
            { replyMarkup: keyboards.resumeOptionsKeyboard(lang) }
        );
    }

    private async handleLocation(chatId: number, location: { latitude: number; longitude: number }, session: TelegramSession): Promise<void> {
        const lang = session.lang;

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

        await sendMessage(chatId, lang === 'uz' ? "📍 Lokatsiya qabul qilindi!" : "📍 Локация принята!", { replyMarkup: keyboards.removeKeyboard() });

        // Proceed to Region Select
        await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
        const regions = await this.getRegions();
        await sendMessage(chatId, botTexts.askRegion[lang], {
            replyMarkup: keyboards.regionKeyboard(lang, regions)
        });
    }

    private async handleResumeDelete(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (session.user_id) {
            await this.supabase.from('resumes').delete().eq('user_id', session.user_id);
            // Also optionally clear profile data or keeping it is fine? 
            // Ideally we clear 'resume_file' if it was a file, etc.
        }
        await sendMessage(chatId, lang === 'uz' ? "✅ Rezyume o'chirildi." : "✅ Резюме удалено.", { replyMarkup: keyboards.removeKeyboard() });
        // Restart creation
        await this.handleRoleSelect(chatId, 'seeker', session);
    }

    // ============================================
    // Start Flow
    // ============================================
    private async handleStart(chatId: number, session: TelegramSession): Promise<void> {
        await this.updateSession(session.telegram_user_id, {
            state: BotState.AWAITING_LANG,
            data: {}
        });

        await sendMessage(chatId, botTexts.selectLanguage.uz, {
            replyMarkup: keyboards.languageKeyboard()
        });
    }

    private async handleLangSelect(chatId: number, lang: BotLang, session: TelegramSession): Promise<void> {
        await this.updateSession(session.telegram_user_id, { lang });

        // Smart Check: If user is already fully authenticated in DB, skip to main menu
        if (session.user_id) {
            await this.showMainMenu(chatId, { ...session, lang });
            return;
        }

        // Smart Check: If we already have their phone from previous session (even if not verified), verify it
        if (session.phone) {
            // ... logic to verify existing phone ...
        }

        // Standard Flow: Ask for phone to link account
        await this.updateSession(session.telegram_user_id, { state: BotState.AWAITING_PHONE });

        const welcomeText = lang === 'uz'
            ? "👋 Xush kelibsiz!\n\nTizimga kirish uchun telefon raqamingizni yuboring:"
            : "👋 Добро пожаловать!\n\nОтправьте номер телефона для входа в систему:";

        await sendMessage(chatId, welcomeText, {
            replyMarkup: keyboards.phoneRequestKeyboard(lang)
        });
    }

    // ============================================
    // Phone & Auth Flow
    // ============================================
    private async handlePhone(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const normalized = phone.replace(/\D/g, '').slice(-9); // Keep last 9 digits without +998
        if (normalized.length !== 9) {
            await sendMessage(chatId, botTexts.error[lang]);
            return;
        }
        const fullPhone = `+998${normalized}`;

        console.log(`[AUTH] Checking phone: ${fullPhone}`);

        // Store phone temporarily
        await this.updateSession(session.telegram_user_id, {
            phone: fullPhone,
            data: { ...session.data, temp_phone: fullPhone }
        });

        // Check if user exists in public table
        const { data: user } = await this.supabase
            .from('users')
            .select('id')
            .eq('phone', fullPhone)
            .single();

        if (user) {
            // User exists - ask for login method
            await sendMessage(chatId, botTexts.accountFound[lang], {
                replyMarkup: keyboards.loginChoiceKeyboard(lang)
            });
        } else {
            // New user - start SMS flow
            await this.startSMSAuth(chatId, fullPhone, session);
        }
    }

    private async startSMSAuth(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        // Import sendSMS dynamically to avoid circular deps if any
        const { sendSMS, generateOTP, getSMSText } = await import('../eskiz');

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // Send SMS using the same template as website
        const message = getSMSText(otp);
        const smsResult = await sendSMS(phone, message);

        if (!smsResult.success) {
            console.error(`[AUTH] SMS failed: ${smsResult.error}`);

            // Show specific error message for moderation issues
            const isModerationError = smsResult.error?.includes('модерацию') || smsResult.error?.includes('moderation');
            const errorMessage = isModerationError
                ? `⚠️ SMS shablon Eskiz.uz tomonidan tasdiqlanmagan.\n\nIltimos, my.eskiz.uz saytiga kiring va shablon qo'shing.`
                : botTexts.error[lang];

            await sendMessage(chatId, errorMessage);
            return;
        }

        await this.updateSession(session.telegram_user_id, {
            state: BotState.AWAITING_OTP,
            otp_code: otp,
            otp_expires_at: expiresAt
        });

        await sendMessage(chatId, botTexts.otpSent[lang], {
            replyMarkup: keyboards.removeKeyboard()
        });
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
            // Restart auth
            await sendMessage(chatId, botTexts.askPhone[lang], {
                replyMarkup: keyboards.phoneRequestKeyboard(lang)
            });
            return;
        }

        if (code !== session.otp_code) {
            await sendMessage(chatId, botTexts.otpInvalid[lang]);
            return;
        }

        // Auth successful
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

        // Attempt login via Supabase Auth
        const { data, error } = await this.supabase.auth.signInWithPassword({
            phone: phone,
            password: password
        });

        if (error || !data.user) {
            console.error('[AUTH] Password login failed:', error);
            await sendMessage(chatId, botTexts.passwordInvalid[lang]);
            return;
        }

        // Login success
        await sendMessage(chatId, botTexts.loginSuccess[lang]);
        await this.finalizeLogin(chatId, phone, session);
    }

    private async finalizeLogin(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const userId = await this.findOrCreateUser(phone, session.telegram_user_id);

        // Fetch existing profiles
        const { data: seekerProfile } = await this.supabase
            .from('job_seeker_profiles')
            .select('id')
            .eq('user_id', userId)
            .single();

        const { data: employerProfile } = await this.supabase
            .from('employer_profiles')
            .select('id')
            .eq('user_id', userId)
            .single();

        await this.updateSession(session.telegram_user_id, {
            user_id: userId,
            otp_code: null,
            otp_expires_at: null,
            data: { ...session.data, resume: {} }
        });

        await sendMessage(chatId, botTexts.authSuccess[lang]);

        // Logic for role routing
        if (seekerProfile && employerProfile) {
            // Has both - ask to choose
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_ROLE });
            await sendMessage(chatId, botTexts.selectRole[lang], {
                replyMarkup: keyboards.roleSelectionKeyboard(lang)
            });
        } else if (employerProfile) {
            // Only employer
            await this.updateSession(session.telegram_user_id, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: { ...session.data, active_role: 'employer' }
            });
            await sendMessage(chatId, botTexts.employerWelcome[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
        } else if (seekerProfile) {
            // Only seeker
            await this.updateSession(session.telegram_user_id, {
                state: BotState.MAIN_MENU,
                data: { ...session.data, active_role: 'job_seeker' }
            });
            await this.showMainMenu(chatId, { ...session, user_id: userId });
        } else {
            // New user (or no profile) - ask role
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_ROLE });
            await sendMessage(chatId, botTexts.selectRole[lang], {
                replyMarkup: keyboards.roleSelectionKeyboard(lang)
            });
        }
    }

    // ============================================
    // Resume Creation Flow
    // ============================================
    private async handleRegionSelect(chatId: number, regionId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const regions = await this.getRegions();
        const regionName = regions.find(r => r.id === parseInt(regionId));

        if (session.state === BotState.POSTING_JOB_REGION) {
            // Employer Flow
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

            // For text input phase, we usually send a new message or edit text and remove buttons
            // Sending new message is safer for "Reply" context
            await sendMessage(chatId, botTexts.postJobDescription[lang], { replyMarkup: keyboards.removeKeyboard() });
            return;
        }

        // Resume Flow
        // Fetch districts for this region
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

        const options = {
            replyMarkup: keyboards.districtKeyboard(districts || [], lang, 0)
        };

        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askDistrict[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askDistrict[lang], options);
        }
    }

    private async showDistrictPage(chatId: number, page: number, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];

        await this.updateSession(session.telegram_user_id, {
            data: { ...session.data, districtPage: page }
        });

        const options = {
            replyMarkup: keyboards.districtKeyboard(districts, lang, page)
        };

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

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_CATEGORY,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    district_id: districtId,
                    district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
                },
                selected_categories: [] // Reset for multi-select
            }
        });

        const categories = await this.getCategories();
        const options = {
            replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories)
        };

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
            // Employer Flow
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
            // Text input next, so sendMessage (or edit to text prompt)
            await sendMessage(chatId, botTexts.postJobSalary[lang], { replyMarkup: keyboards.removeKeyboard() });
            return;
        }

        // Resume Flow
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

        const options = {
            replyMarkup: keyboards.experienceKeyboard(lang)
        };

        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askExperience[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askExperience[lang], options);
        }
    }

    private async handleExperienceSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_EDUCATION,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    experience_level: value
                }
            }
        });

        const options = {
            replyMarkup: keyboards.educationKeyboard(lang)
        };

        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askEducation[lang], options);
        }
    }

    private async handleEducationSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_GENDER,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    education_level: value
                }
            }
        });

        const options = {
            replyMarkup: keyboards.genderKeyboard(lang)
        };

        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askGender[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askGender[lang], options);
        }
    }

    private async handleGenderSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, {
            state: BotState.SELECTING_SALARY,
            data: {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    gender: value
                }
            }
        });

        const options = {
            replyMarkup: keyboards.salaryKeyboard(lang)
        };

        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askSalary[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askSalary[lang], options);
        }
    }
    private async handleSalarySelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const salaryMin = parseInt(value) || 0;

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

        const options = {
            replyMarkup: keyboards.skipKeyboard(lang, 'salary')
        };

        if (messageId) {
            await editMessage(chatId, messageId, botTexts.askTitle[lang], options);
        } else {
            await sendMessage(chatId, botTexts.askTitle[lang], options);
        }
    }

    // ============================================
    // Text Input States
    // ============================================
    private async handleTextByState(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const state = session.state as BotState;

        switch (state) {
            case BotState.AWAITING_PHONE:
                await this.handlePhone(chatId, text.trim(), session);
                break;

            case BotState.AWAITING_OTP:
                await this.handleOTP(chatId, text.trim(), session);
                break;

            case BotState.AWAITING_PASSWORD:
                await this.handlePasswordLogin(chatId, text.trim(), session);
                break;

            case BotState.ENTERING_TITLE:
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.ENTERING_NAME,
                    data: {
                        ...session.data,
                        resume: { ...session.data?.resume, title: text.trim() }
                    }
                });
                await sendMessage(chatId, botTexts.askName[lang], {
                    replyMarkup: keyboards.skipKeyboard(lang, 'title')
                });
                break;

            case BotState.ENTERING_NAME:
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.ENTERING_ABOUT,
                    data: {
                        ...session.data,
                        resume: { ...session.data?.resume, full_name: text.trim() }
                    }
                });
                await sendMessage(chatId, botTexts.askAbout[lang], {
                    replyMarkup: keyboards.skipKeyboard(lang, 'name')
                });
                break;

            case BotState.ENTERING_ABOUT:
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.ADDING_SKILLS,
                    data: {
                        ...session.data,
                        resume: { ...session.data?.resume, about: text.trim() },
                        skills: []
                    }
                });
                await sendMessage(chatId, botTexts.askSkills[lang], {
                    replyMarkup: keyboards.skillsKeyboard(lang, [])
                });
                break;

            case BotState.ADDING_SKILLS:
                const skillText = text.trim();
                if (!skillText) {
                    await sendMessage(chatId, botTexts.askSkills[lang], {
                        replyMarkup: keyboards.skillsKeyboard(lang, session.data?.skills || [])
                    });
                    break;
                }
                const skills = [...(session.data?.skills || []), skillText];
                await this.updateSession(session.telegram_user_id, {
                    data: { ...session.data, skills }
                });
                await sendMessage(chatId, botTexts.skillAdded[lang], {
                    replyMarkup: keyboards.skillsKeyboard(lang, skills)
                });
                break;

            case BotState.MAIN_MENU:
                await this.handleMainMenuText(chatId, text, session);
                break;

            // Employer States
            case BotState.ENTERING_COMPANY_NAME:
                await this.handleCompanyName(chatId, text, session);
                break;

            case BotState.EMPLOYER_MAIN_MENU:
                await this.handleEmployerMainMenu(chatId, text, session);
                break;

            case BotState.POSTING_JOB_TITLE:
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.POSTING_JOB_CATEGORY,
                    data: { ...session.data, temp_job: { ...session.data?.temp_job || {}, title: text } }
                });
                const categories = await this.getCategories();
                await sendMessage(chatId, botTexts.postJobCategory[lang], {
                    replyMarkup: keyboards.categoryKeyboard(lang, categories)
                });
                break;

            case BotState.POSTING_JOB_SALARY:
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.POSTING_JOB_REGION,
                    data: { ...session.data, temp_job: { ...session.data?.temp_job || {}, salary_text: text } }
                });
                const regions = await this.getRegions();
                await sendMessage(chatId, botTexts.postJobRegion[lang], {
                    replyMarkup: keyboards.regionKeyboard(lang, regions)
                });
                break;

            case BotState.POSTING_JOB_DESCRIPTION:
                await this.handleJobDescription(chatId, text, session);
                break;

            default:
                await sendMessage(chatId, botTexts.unknownCommand[lang]);
        }
    }

    private async handleSkip(chatId: number, session: TelegramSession): Promise<void> {
        const state = session.state as BotState;
        const lang = session.lang;

        switch (state) {
            case BotState.ENTERING_TITLE:
                await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_NAME });
                await sendMessage(chatId, botTexts.askName[lang], {
                    replyMarkup: keyboards.skipKeyboard(lang, 'title')
                });
                break;
            case BotState.ENTERING_NAME:
                await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_ABOUT });
                await sendMessage(chatId, botTexts.askAbout[lang], {
                    replyMarkup: keyboards.skipKeyboard(lang, 'name')
                });
                break;
            case BotState.ENTERING_ABOUT:
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.ADDING_SKILLS,
                    data: { ...session.data, skills: [] }
                });
                await sendMessage(chatId, botTexts.askSkills[lang], {
                    replyMarkup: keyboards.skillsKeyboard(lang, [])
                });
                break;
        }
    }

    private async deleteSkill(chatId: number, index: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const skills = [...(session.data?.skills || [])];
        skills.splice(index, 1);

        await this.updateSession(session.telegram_user_id, {
            data: { ...session.data, skills }
        });
        await sendMessage(chatId, botTexts.askSkills[lang], {
            replyMarkup: keyboards.skillsKeyboard(lang, skills)
        });
    }

    private async finishSkills(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const resume = session.data?.resume || {};
        const skills = session.data?.skills || [];

        // Save resume to database
        await this.saveResume(session, { ...resume, skills });

        await this.updateSession(session.telegram_user_id, {
            state: BotState.RESUME_COMPLETE
        });

        await sendMessage(chatId, botTexts.resumeComplete[lang], {
            replyMarkup: keyboards.resumeCompleteKeyboard(lang)
        });
    }

    // ============================================
    // Employer Flow Handlers
    // ============================================
    private async handleCompanyName(chatId: number, name: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        // Save employer profile
        await this.supabase
            .from('employer_profiles')
            .upsert({
                user_id: session.user_id,
                company_name: name,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        await this.updateSession(session.telegram_user_id, { state: BotState.EMPLOYER_MAIN_MENU });
        await sendMessage(chatId, botTexts.employerWelcome[lang], {
            replyMarkup: keyboards.employerMainMenuKeyboard(lang)
        });
    }

    private async handleEmployerMainMenu(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (text.includes("Vakansiya joylash") || text.includes("Разместить вакансию")) {
            // Check subscription
            const isSubscribed = await isUserSubscribed(this.getChannelUsername(), session.telegram_user_id);
            if (!isSubscribed) {
                await this.updateSession(session.telegram_user_id, {
                    data: { ...session.data, pending_action: 'post_job' }
                });
                await sendMessage(chatId, this.formatChannelText(botTexts.subscriptionRequired[lang]), {
                    replyMarkup: keyboards.subscriptionRequiredKeyboard(lang, this.getChannelUsername())
                });
                return;
            }

            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_TITLE,
                data: { ...session.data, temp_job: {} }
            });
            await sendMessage(chatId, botTexts.postJobTitle[lang], { replyMarkup: keyboards.removeKeyboard() });
        } else if (text.includes("Mening vakansiyalarim") || text.includes("Мои вакансии")) {
            await this.showMyVacancies(chatId, session);
        } else if (text.includes("Sozlamalar") || text.includes("Настройки")) {
            await this.updateSession(session.telegram_user_id, { state: BotState.SETTINGS });
            await sendMessage(chatId, botTexts.settings[lang], { replyMarkup: keyboards.settingsKeyboard(lang) });
        } else {
            await sendMessage(chatId, botTexts.unknownCommand[lang]);
        }
    }

    private async handleJobDescription(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const job = { ...session.data?.temp_job, description: text };

        await this.updateSession(session.telegram_user_id, {
            state: BotState.POSTING_JOB_CONFIRM,
            data: { ...session.data, temp_job: job }
        });

        await sendMessage(chatId, botTexts.postJobConfirm[lang](job.title), {
            replyMarkup: keyboards.jobConfirmKeyboard(lang)
        });
    }

    private parseSalaryInput(input?: string): { min: number | null; max: number | null } {
        if (!input) return { min: null, max: null };

        const normalized = input.toLowerCase();
        const hasMln = /mln|млн|million/.test(normalized);
        const hasThousand = /ming|тыс|k/.test(normalized);
        const matches = normalized.match(/\d+(?:[.,]\d+)?/g);

        if (!matches || matches.length === 0) {
            return { min: null, max: null };
        }

        const toAmount = (raw: string): number => {
            const num = parseFloat(raw.replace(',', '.'));
            if (!Number.isFinite(num)) return NaN;
            if (hasMln) return Math.round(num * 1_000_000);
            if (hasThousand) return Math.round(num * 1_000);
            return Math.round(num);
        };

        const amounts = matches.map(toAmount).filter(n => Number.isFinite(n)) as number[];
        if (amounts.length === 0) return { min: null, max: null };

        let min = amounts[0];
        let max = amounts.length > 1 ? amounts[1] : null;
        if (max !== null && min > max) {
            const tmp = min;
            min = max;
            max = tmp;
        }
        return { min, max };
    }

    private async showMyVacancies(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        const { data: jobs } = await this.supabase
            .from('jobs')
            .select('title_uz, title_ru, created_at, status')
            .eq('created_by', session.user_id)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!jobs || jobs.length === 0) {
            await sendMessage(chatId, botTexts.noVacancies[lang]);
            return;
        }

        await sendMessage(chatId, botTexts.myVacancies[lang]);
        for (const job of jobs) {
            const title = lang === 'uz' ? (job.title_uz || job.title_ru) : (job.title_ru || job.title_uz);
            const status = job.status === 'active' ? '✅' : '⏸';
            await sendMessage(chatId, `${status} ${title}\n📅 ${new Date(job.created_at).toLocaleDateString()}`);
        }
    }

    private async handleJobPublish(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const job = session.data?.temp_job;

        if (!job || !session.user_id) return;

        try {
            // Get employer profile for company name
            const { data: profile } = await this.supabase
                .from('employer_profiles')
                .select('company_name, phone, email, telegram')
                .eq('user_id', session.user_id)
                .single();

            const salaryRange = this.parseSalaryInput(job.salary_text);

            const { error: insertError } = await this.supabase.from('jobs').insert({
                created_by: session.user_id,
                title_uz: job.title,
                title_ru: job.title,
                description_uz: job.description,
                description_ru: job.description,
                category_id: job.category_id,
                region_id: job.region_id,
                district_id: job.district_id || null,
                salary_min: salaryRange.min ?? 0,
                salary_max: salaryRange.max ?? 0,
                employment_type: 'full_time',
                contact_phone: profile?.phone || session.phone,
                contact_email: profile?.email || null,
                contact_telegram: profile?.telegram || null,
                company_name: profile?.company_name || 'Kompaniya',
                status: 'active',
                is_active: true,
                source: 'bot',
                is_imported: false,
                source_status: 'active',
                created_at: new Date().toISOString()
            });

            if (insertError) throw insertError;

            await this.updateSession(session.telegram_user_id, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: { ...session.data, temp_job: null }
            });

            await sendMessage(chatId, botTexts.jobPublished[lang]);
            await sendMessage(chatId, botTexts.employerWelcome[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });

        } catch (err) {
            console.error('Error publishing job:', err);
            await sendMessage(chatId, botTexts.error[lang]);
        }
    }

    private async handleRoleSwitch(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_ROLE });
        await sendMessage(chatId, botTexts.selectRole[lang], {
            replyMarkup: keyboards.roleSelectionKeyboard(lang)
        });
    }

    private async handleSubscriptionCheck(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const isSubscribed = await isUserSubscribed(this.getChannelUsername(), session.telegram_user_id);

        if (isSubscribed) {
            const pendingAction = session.data?.pending_action;

            if (pendingAction === 'job_search') {
                await this.updateSession(session.telegram_user_id, {
                    data: { ...session.data, pending_action: null }
                });
                await this.startJobSearch(chatId, session);
            } else if (pendingAction === 'post_job') {
                await this.updateSession(session.telegram_user_id, {
                    state: BotState.POSTING_JOB_TITLE,
                    data: { ...session.data, temp_job: {}, pending_action: null }
                });
                await sendMessage(chatId, botTexts.postJobTitle[lang], { replyMarkup: keyboards.removeKeyboard() });
            } else {
                await this.showMainMenu(chatId, session);
            }
        } else {
            await sendMessage(chatId, this.formatChannelText(botTexts.notSubscribed[lang]), {
                replyMarkup: keyboards.subscriptionRequiredKeyboard(lang, this.getChannelUsername())
            });
        }
    }

    private async handleMultiCategory(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const categories = await this.getCategories();

        if (value === 'done') {
            const selectedCategories = session.data?.selected_categories || [];
            if (selectedCategories.length === 0) {
                const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, [], categories) };
                if (messageId) {
                    await editMessage(chatId, messageId, botTexts.askCategory[lang], options);
                } else {
                    await sendMessage(chatId, botTexts.askCategory[lang], options);
                }
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
                        category_id: selectedCategories[0] // Primary category
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
        const selectedCategories = session.data?.selected_categories || [];
        const index = selectedCategories.indexOf(value);

        if (index === -1) {
            selectedCategories.push(value);
        } else {
            selectedCategories.splice(index, 1);
        }

        await this.updateSession(session.telegram_user_id, {
            data: { ...session.data, selected_categories: selectedCategories }
        });

        const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, selectedCategories, categories) };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.categorySelected[lang], options);
        } else {
            await sendMessage(chatId, botTexts.categorySelected[lang], options);
        }
    }

    // ============================================
    // Resume Save
    // ============================================


    // ============================================
    // Back Navigation
    // ============================================
    private async handleBack(chatId: number, target: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        switch (target) {
            case 'region':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
                const regions = await this.getRegions();
                await sendMessage(chatId, botTexts.askRegion[lang], {
                    replyMarkup: keyboards.regionKeyboard(lang, regions)
                });
                break;
            case 'district':
                await this.handleRegionSelect(chatId, String(session.data?.resume?.region_id), session);
                break;
            case 'category':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_CATEGORY });
                const categories = await this.getCategories();
                await sendMessage(chatId, botTexts.askCategory[lang], {
                    replyMarkup: keyboards.categoryKeyboard(lang, categories)
                });
                break;
            case 'experience':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_EXPERIENCE });
                await sendMessage(chatId, botTexts.askExperience[lang], {
                    replyMarkup: keyboards.experienceKeyboard(lang)
                });
                break;
            case 'education':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_EDUCATION });
                await sendMessage(chatId, botTexts.askEducation[lang], {
                    replyMarkup: keyboards.educationKeyboard(lang)
                });
                break;
            case 'gender':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_GENDER });
                await sendMessage(chatId, botTexts.askGender[lang], {
                    replyMarkup: keyboards.genderKeyboard(lang)
                });
                break;
            case 'salary':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_SALARY });
                await sendMessage(chatId, botTexts.askSalary[lang], {
                    replyMarkup: keyboards.salaryKeyboard(lang)
                });
                break;
            case 'title':
                await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_SALARY });
                await sendMessage(chatId, botTexts.askSalary[lang], {
                    replyMarkup: keyboards.salaryKeyboard(lang)
                });
                break;
            case 'name':
                await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_TITLE });
                await sendMessage(chatId, botTexts.askTitle[lang], {
                    replyMarkup: keyboards.skipKeyboard(lang, 'salary')
                });
                break;
            case 'about':
                await this.updateSession(session.telegram_user_id, { state: BotState.ENTERING_NAME });
                await sendMessage(chatId, botTexts.askName[lang], {
                    replyMarkup: keyboards.skipKeyboard(lang, 'title')
                });
                break;
        }
    }

    // ============================================
    // Main Menu
    // ============================================
    private async showMainMenu(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, { state: BotState.MAIN_MENU });
        await sendMessage(chatId, botTexts.mainMenu[lang], {
            replyMarkup: keyboards.mainMenuKeyboard(lang)
        });
    }

    private async handleMainMenuText(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lower = text.toLowerCase();

        if (lower.includes('ish topish') || lower.includes('найти работу') || lower.includes('🔍')) {
            await this.startJobSearch(chatId, session);
        } else if (lower.includes('rezyume') || lower.includes('резюме') || lower.includes('📄')) {
            await this.showProfile(chatId, session);
        } else if (lower.includes('profil') || lower.includes('профиль') || lower.includes('👤')) {
            await this.showProfile(chatId, session);
        } else if (lower.includes('sozlamalar') || lower.includes('настройки') || lower.includes('⚙️')) {
            await this.showSettings(chatId, session);
        } else {
            await sendMessage(chatId, botTexts.unknownCommand[session.lang]);
        }
    }

    private async handleAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        switch (action) {
            case 'search':
                await this.startJobSearch(chatId, session);
                break;
            case 'viewresume':
                await this.showProfile(chatId, session);
                break;
        }
    }

    // ============================================
    // Job Search
    // ============================================
    private async startJobSearch(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (!session.user_id) {
            await this.updateSession(session.telegram_user_id, { state: BotState.AWAITING_PHONE });
            await sendMessage(chatId, botTexts.askPhone[lang], {
                replyMarkup: keyboards.phoneRequestKeyboard(lang)
            });
            return;
        }

        // Check channel subscription first
        const isSubscribed = await isUserSubscribed(this.getChannelUsername(), session.telegram_user_id);
        if (!isSubscribed) {
            await this.updateSession(session.telegram_user_id, {
                data: { ...session.data, pending_action: 'job_search' }
            });
            await sendMessage(chatId, this.formatChannelText(botTexts.subscriptionRequired[lang]), {
                replyMarkup: keyboards.subscriptionRequiredKeyboard(lang, this.getChannelUsername())
            });
            return;
        }

        await sendMessage(chatId, botTexts.searchingJobs[lang]);

        // Get user resume for matching
        const { data: resume } = await this.supabase
            .from('resumes')
            .select('region_id, district_id, category_id, expected_salary_min, expected_salary_max, experience')
            .eq('user_id', session.user_id)
            .single();

        // Get active jobs with full details for display
        const { data: jobs, error } = await this.supabase
            .from('jobs')
            .select('id, title_uz, title_ru, company_name, salary_min, salary_max, region_id, district_id, region_name, district_name, category_id, experience_years, employment_type, description_uz, description_ru, raw_source_json, contact_phone, contact_email, contact_telegram, source')
            .eq('status', 'active')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error || !jobs?.length) {
            await sendMessage(chatId, botTexts.noJobsFound[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang)
            });
            return;
        }

        // Match and sort
        const profile = {
            region_id: resume?.region_id,
            district_id: resume?.district_id,
            category_id: resume?.category_id,
            expected_salary_min: resume?.expected_salary_min,
            expected_salary_max: resume?.expected_salary_max,
            experience_level: resume?.experience
        };

        const matchedJobs = matchAndSortJobs(profile, jobs);
        const topJobs = matchedJobs.slice(0, 20);

        await this.updateSession(session.telegram_user_id, {
            state: BotState.BROWSING_JOBS,
            data: { ...session.data, jobs: topJobs, jobIndex: 0 }
        });

        const countFn = botTexts.jobsFound[lang] as (c: number) => string;
        await sendMessage(chatId, countFn(topJobs.length));

        if (topJobs.length > 0) {
            await this.showJob(chatId, topJobs[0], 0, topJobs.length, session);
        }
    }

    private async showJob(chatId: number, job: any, index: number, total: number, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const matchPercent = getMatchPercentage(job.matchScore || 0);

        // Use formatFullJobCard for complete display with contacts
        const { formatFullJobCard } = await import('./texts');
        const card = formatFullJobCard(job, lang);

        let matchLine = `\n📊 ${lang === 'uz' ? 'Mos kelish' : 'Совпадение'}: ${matchPercent}%`;

        if (job.explanation) {
            const reason = lang === 'uz' ? job.explanation.uz : job.explanation.ru;
            if (reason) {
                matchLine += `\n💡 ${reason}`;
            }
        }

        const options = {
            replyMarkup: keyboards.jobNavigationKeyboard(lang, index, total, job.id, job.source)
        };

        if (messageId) {
            const { editMessage } = await import('./telegram-api');
            await editMessage(chatId, messageId, card + matchLine, options);
        } else {
            await sendMessage(chatId, card + matchLine, options);
        }
    }

    private async handleJobNavigation(chatId: number, direction: string, session: TelegramSession, messageId?: number): Promise<void> {
        const jobs = session.data?.jobs || [];
        let index = session.data?.jobIndex || 0;

        if (direction === 'next' && index < jobs.length - 1) {
            index++;
        } else if (direction === 'prev' && index > 0) {
            index--;
        }

        await this.updateSession(session.telegram_user_id, {
            data: { ...session.data, jobIndex: index }
        });

        await this.showJob(chatId, jobs[index], index, jobs.length, session, messageId);
    }

    private async handleJobApply(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        try {
            if (!session.user_id) {
                await sendMessage(chatId, botTexts.error[lang]);
                return;
            }

            // Check if already applied
            const { data: existing, error: existingError } = await this.supabase
                .from('applications')
                .select('id')
                .eq('user_id', session.user_id)
                .eq('job_id', jobId)
                .maybeSingle();

            if (existing) {
                await sendMessage(chatId, botTexts.applicationExists[lang]);
                return;
            }
            if (existingError && (existingError as any).code !== 'PGRST116') {
                console.error('Apply check error:', existingError);
            }

            // Get resume for application
            const { data: resume } = await this.supabase
                .from('resumes')
                .select('id')
                .eq('user_id', session.user_id)
                .single();

            // Create application
            const { error: insertError } = await this.supabase.from('applications').insert({
                user_id: session.user_id,
                job_id: jobId,
                resume_id: resume?.id,
                status: 'pending',
                created_at: new Date().toISOString()
            });

            if (insertError) {
                if ((insertError as any).code === '23505') {
                    await sendMessage(chatId, botTexts.applicationExists[lang]);
                    return;
                }
                throw insertError;
            }

            await sendMessage(chatId, botTexts.applicationSent[lang]);

        } catch (err) {
            console.error('Apply error:', err);
            await sendMessage(chatId, botTexts.error[lang]);
        }
    }

    // ============================================
    // Profile
    // ============================================
    private async showProfile(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        const { data: resume } = await this.supabase
            .from('resumes')
            .select('*')
            .eq('user_id', session.user_id)
            .single();

        if (!resume) {
            // Start resume creation
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
            const regions = await this.getRegions();
            await sendMessage(chatId, botTexts.askRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions)
            });
            return;
        }

        const expLabel = EXPERIENCE_LABELS[resume.experience]?.[lang] || resume.experience;
        const salary = resume.expected_salary_min
            ? `${(resume.expected_salary_min / 1000000).toFixed(1)} mln+`
            : (lang === 'uz' ? 'Kelishiladi' : 'Договорная');

        let regionLabel = resume.region_name || null;
        if (!regionLabel && resume.region_id) {
            const regions = await this.getRegions();
            const region = regions.find(r => r.id === resume.region_id);
            regionLabel = region ? (lang === 'uz' ? region.name_uz : region.name_ru) : null;
        }

        let districtLabel = resume.district_name || resume.city || null;
        if (!districtLabel && resume.district_id) {
            const { data: district } = await this.supabase
                .from('districts')
                .select('name_uz, name_ru')
                .eq('id', resume.district_id)
                .maybeSingle();
            if (district) {
                districtLabel = lang === 'uz' ? district.name_uz : district.name_ru;
            }
        }

        let categoryLabel = resume.category_name || null;
        if (!categoryLabel && resume.category_id) {
            const categories = await this.getCategories();
            const category = categories.find(c => c.id === resume.category_id);
            if (category) {
                categoryLabel = lang === 'uz' ? category.name_uz : category.name_ru;
            }
        }

        const profileFn = botTexts.yourProfile[lang];
        const text = profileFn({
            name: resume.full_name || '-',
            region: regionLabel || '-',
            district: districtLabel || '-',
            category: categoryLabel || '-',
            experience: expLabel,
            salary
        });

        await this.updateSession(session.telegram_user_id, { state: BotState.VIEWING_PROFILE });
        await sendMessage(chatId, text, {
            replyMarkup: keyboards.profileKeyboard(lang)
        });
    }

    private async handleProfileAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (action === 'edit') {
            await this.updateSession(session.telegram_user_id, { state: BotState.SELECTING_REGION });
            const regions = await this.getRegions();
            await sendMessage(chatId, botTexts.askRegion[lang], {
                replyMarkup: keyboards.regionKeyboard(lang, regions)
            });
        } else if (action === 'resume') {
            // Show resume link to website
            const websiteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ishdasiz.uz';
            const resumeLink = `${websiteUrl}/profile/job-seeker`;
            await sendMessage(chatId,
                lang === 'uz'
                    ? `📄 To'liq rezyumeni saytda ko'ring:\n\n🔗 ${resumeLink}`
                    : `📄 Полное резюме на сайте:\n\n🔗 ${resumeLink}`
            );
        }
    }

    // ============================================
    // Settings
    // ============================================
    private async showSettings(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.updateSession(session.telegram_user_id, { state: BotState.SETTINGS });
        await sendMessage(chatId, botTexts.settings[lang], {
            replyMarkup: keyboards.settingsKeyboard(lang)
        });
    }

    private async handleSettingsAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        if (action === 'language') {
            await sendMessage(chatId, botTexts.selectLanguage[session.lang], {
                replyMarkup: keyboards.languageKeyboard()
            });
        } else if (action === 'switch_role') {
            await this.handleRoleSwitch(chatId, session);
        }
    }

    // ============================================
    // Helper Methods
    // ============================================
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
                // Handle race condition on unique index
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

    private async saveResume(session: TelegramSession, resumeData: any): Promise<void> {
        if (!session.user_id) return;

        // Extract fields
        const {
            region_id, district_id, category_id, category_ids,
            experience, experience_level, education, education_level, gender, salary, // some might be named differently in session
            expect_salary, title, name, about, skills, desired_position, full_name, category_name, region_name, district_name
        } = resumeData;

        const parseNumber = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            const cleaned = String(value).replace(/[^\d]/g, '');
            if (!cleaned) return null;
            const num = Number(cleaned);
            return Number.isFinite(num) && num > 0 ? num : null;
        };

        const regionId = parseNumber(region_id);
        const districtId = district_id ? String(district_id) : null;
        const categoryId = category_id || (Array.isArray(category_ids) ? category_ids[0] : null);
        const experienceValue = experience_level || experience;
        const educationValue = education_level || education;
        const expectedSalary = parseNumber(salary ?? expect_salary);
        const safeTitle = String(title || desired_position || category_name || 'Mutaxassis').trim();
        const resolvedFullName = full_name || name || session.data?.resume?.full_name || null;

        // Map session data names to DB columns
        const dbData = {
            user_id: session.user_id,
            region_id: regionId,
            district_id: districtId,
            category_id: categoryId,
            experience: experienceValue,
            education_level: educationValue,
            gender: gender,
            expected_salary_min: expectedSalary,
            title: safeTitle,
            full_name: resolvedFullName,
            phone: session.phone, // Ensure phone is saved
            skills: skills || [],
            about: about,
            status: 'active',
            updated_at: new Date().toISOString()
        };

        try {
            // 1. Save to Resumes
            const { error: resumeError } = await this.supabase
                .from('resumes')
                .upsert(dbData, { onConflict: 'user_id' });

            if (resumeError) console.error('Error saving resume:', resumeError);

            // 2. Sync to Job Seeker Profile (Request #1)
            await this.supabase
                .from('job_seeker_profiles')
                .upsert({
                    user_id: session.user_id,
                    full_name: dbData.full_name,
                    phone: session.phone,
                    region_id: dbData.region_id,
                    district_id: dbData.district_id,
                    city: district_name || region_name || null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

        } catch (err) {
            console.error('saveResume execution error:', err);
        }
    }

    private async updateSession(telegramUserId: number, updates: Partial<TelegramSession>): Promise<void> {
        try {
            await this.supabase
                .from('telegram_sessions')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('telegram_user_id', telegramUserId);
        } catch (err) {
            console.error('Update session error:', err);
        }
    }

    private async findOrCreateUser(phone: string, telegramUserId?: number): Promise<string> {
        const { data: existing } = await this.supabase
            .from('users')
            .select('id, telegram_user_id')
            .eq('phone', phone)
            .single();

        if (existing) {
            if (telegramUserId && !existing.telegram_user_id) {
                await this.supabase
                    .from('users')
                    .update({ telegram_user_id: telegramUserId })
                    .eq('id', existing.id);
            }
            return existing.id;
        }

        const { data: newUser } = await this.supabase
            .from('users')
            .insert({
                phone,
                role: 'job_seeker',
                telegram_user_id: telegramUserId || null,
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        // Create profile
        if (newUser) {
            await this.supabase.from('job_seeker_profiles').insert({
                user_id: newUser.id,
                phone,
                created_at: new Date().toISOString()
            });
        }

        return newUser?.id || '';
    }
}

// Export singleton
export const telegramBot = new TelegramBot();

