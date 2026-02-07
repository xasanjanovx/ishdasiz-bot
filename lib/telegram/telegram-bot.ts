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
import { mapOsonishCategory } from '../mappers/osonish-mapper';
import { matchAndSortJobs, MatchedJob, calculateMatchScore } from './job-matcher';
import { extractVacancyData } from '../ai/deepseek';
import { rerankJobsForResumeAI, rerankResumesForJobAI } from '../ai/job-recommender';
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
    SELECTING_FIELD = 'selecting_field',
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

interface OsonishField {
    id: number | string;
    title: string;
    title_uz?: string | null;
    title_ru?: string | null;
    vacancies_count?: number | null;
    category_id?: string | number | null;
    category_title?: string | null;
    type?: string | null;
    mmk_code?: number | null;
    group_id?: number | null;
    category_code?: string | null;
}

const DEFAULT_CATEGORIES: CategoryRef[] = [
    { id: 'a0000001-0001-4000-8000-000000000001', name_uz: 'IT', name_ru: 'IT', icon: '', sort_order: 1 },
    { id: 'a0000002-0002-4000-8000-000000000002', name_uz: 'Sanoat va ishlab chiqarish', name_ru: 'Производство', icon: '', sort_order: 2 },
    { id: 'a0000003-0003-4000-8000-000000000003', name_uz: 'Xizmatlar', name_ru: 'Услуги', icon: '', sort_order: 3 },
    { id: 'a0000004-0004-4000-8000-000000000004', name_uz: "Ta'lim, madaniyat, sport", name_ru: 'Образование', icon: '', sort_order: 4 },
    { id: 'a0000005-0005-4000-8000-000000000005', name_uz: "Sog'liqni saqlash", name_ru: 'Медицина', icon: '', sort_order: 5 },
    { id: 'a0000006-0006-4000-8000-000000000006', name_uz: 'Moliya, iqtisod, boshqaruv', name_ru: 'Финансы, экономика, управление', icon: 'Wallet', sort_order: 6 },
    { id: 'a0000007-0007-4000-8000-000000000007', name_uz: 'Qurilish', name_ru: 'Строительство', icon: '', sort_order: 7 },
    { id: 'a0000008-0008-4000-8000-000000000008', name_uz: "Qishloq xo'jaligi", name_ru: 'Сельское хоз.', icon: '', sort_order: 8 },
    { id: 'a0000009-0009-4000-8000-000000000009', name_uz: 'Transport', name_ru: 'Транспорт', icon: '', sort_order: 9 },
    { id: 'a0000010-0010-4000-8000-000000000010', name_uz: 'Savdo va marketing', name_ru: 'Продажи', icon: '', sort_order: 10 }
];

const MODERN_PROFESSIONS: Array<{ id: string; title_uz: string; title_ru: string; category_id: string }> = [
    { id: 'm-1001', title_uz: 'Frontend dasturchi', title_ru: 'Frontend разработчик', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1002', title_uz: 'Backend dasturchi', title_ru: 'Backend разработчик', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1003', title_uz: 'Fullstack dasturchi', title_ru: 'Fullstack разработчик', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1004', title_uz: 'Mobile dasturchi', title_ru: 'Mobile разработчик', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1005', title_uz: 'Flutter dasturchi', title_ru: 'Flutter разработчик', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1006', title_uz: 'QA muhandis', title_ru: 'QA инженер', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1007', title_uz: 'DevOps muhandis', title_ru: 'DevOps инженер', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1008', title_uz: 'Data analyst', title_ru: 'Data analyst', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1009', title_uz: 'Data engineer', title_ru: 'Data engineer', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1010', title_uz: 'BI analyst', title_ru: 'BI аналитик', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1011', title_uz: 'Sistem administrator', title_ru: 'Системный администратор', category_id: 'a0000001-0001-4000-8000-000000000001' },
    { id: 'm-1012', title_uz: 'Kiberxavfsizlik mutaxassisi', title_ru: 'Специалист по кибербезопасности', category_id: 'a0000001-0001-4000-8000-000000000001' },

    { id: 'm-1101', title_uz: 'Bosh hisobchi', title_ru: 'Главный бухгалтер', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1102', title_uz: 'Hisobchi', title_ru: 'Бухгалтер', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1103', title_uz: 'Moliyaviy menejer', title_ru: 'Финансовый менеджер', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1104', title_uz: 'Iqtisodchi', title_ru: 'Экономист', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1105', title_uz: 'Audit mutaxassisi', title_ru: 'Аудитор', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1106', title_uz: 'Soliq mutaxassisi', title_ru: 'Налоговый специалист', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1107', title_uz: 'HR menejer', title_ru: 'HR менеджер', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1108', title_uz: 'Operatsion menejer', title_ru: 'Операционный менеджер', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1109', title_uz: 'Loyiha menejeri', title_ru: 'Менеджер проектов', category_id: 'a0000006-0006-4000-8000-000000000006' },
    { id: 'm-1110', title_uz: 'Ofis menejer', title_ru: 'Офис-менеджер', category_id: 'a0000006-0006-4000-8000-000000000006' },

    { id: 'm-1201', title_uz: 'Sotuv menejeri', title_ru: 'Менеджер по продажам', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1202', title_uz: 'Sotuvchi', title_ru: 'Продавец', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1203', title_uz: 'Kassir', title_ru: 'Кассир', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1204', title_uz: 'SMM menejer', title_ru: 'SMM менеджер', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1205', title_uz: 'Digital marketolog', title_ru: 'Digital-маркетолог', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1206', title_uz: 'Targetolog', title_ru: 'Таргетолог', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1207', title_uz: 'Kontent menejer', title_ru: 'Контент-менеджер', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1208', title_uz: 'Brend menejer', title_ru: 'Бренд-менеджер', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1209', title_uz: 'Call-markaz operatori', title_ru: 'Оператор call-центра', category_id: 'a0000010-0010-4000-8000-000000000010' },
    { id: 'm-1210', title_uz: 'Mijozlar bilan ishlash mutaxassisi', title_ru: 'Специалист по работе с клиентами', category_id: 'a0000010-0010-4000-8000-000000000010' },

    { id: 'm-1301', title_uz: 'Shifokor', title_ru: 'Врач', category_id: 'a0000005-0005-4000-8000-000000000005' },
    { id: 'm-1302', title_uz: 'Hamshira', title_ru: 'Медсестра', category_id: 'a0000005-0005-4000-8000-000000000005' },
    { id: 'm-1303', title_uz: 'Farmatsevt', title_ru: 'Фармацевт', category_id: 'a0000005-0005-4000-8000-000000000005' },
    { id: 'm-1304', title_uz: 'Laborant', title_ru: 'Лаборант', category_id: 'a0000005-0005-4000-8000-000000000005' },
    { id: 'm-1305', title_uz: 'Stomatolog', title_ru: 'Стоматолог', category_id: 'a0000005-0005-4000-8000-000000000005' },
    { id: 'm-1306', title_uz: 'Reabilitolog', title_ru: 'Реабилитолог', category_id: 'a0000005-0005-4000-8000-000000000005' },

    { id: 'm-1401', title_uz: "Boshlang'ich sinf o'qituvchisi", title_ru: 'Учитель начальных классов', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-1402', title_uz: "Ingliz tili o'qituvchisi", title_ru: 'Учитель английского языка', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-1403', title_uz: 'Matematika o qituvchisi', title_ru: 'Учитель математики', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-1404', title_uz: 'Tarbiyachi', title_ru: 'Воспитатель', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-1405', title_uz: 'Pedagog-psixolog', title_ru: 'Педагог-психолог', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-1406', title_uz: 'O quv markaz treneri', title_ru: 'Тренер учебного центра', category_id: 'a0000004-0004-4000-8000-000000000004' },

    { id: 'm-1501', title_uz: 'Haydovchi', title_ru: 'Водитель', category_id: 'a0000009-0009-4000-8000-000000000009' },
    { id: 'm-1502', title_uz: 'Kuryer', title_ru: 'Курьер', category_id: 'a0000009-0009-4000-8000-000000000009' },
    { id: 'm-1503', title_uz: 'Logist', title_ru: 'Логист', category_id: 'a0000009-0009-4000-8000-000000000009' },
    { id: 'm-1504', title_uz: 'Ekspeditor', title_ru: 'Экспедитор', category_id: 'a0000009-0009-4000-8000-000000000009' },
    { id: 'm-1505', title_uz: 'Avto mexanik', title_ru: 'Автомеханик', category_id: 'a0000009-0009-4000-8000-000000000009' },
    { id: 'm-1506', title_uz: 'Ombor mudiri', title_ru: 'Заведующий складом', category_id: 'a0000009-0009-4000-8000-000000000009' },

    { id: 'm-1601', title_uz: 'Operator', title_ru: 'Оператор', category_id: 'a0000002-0002-4000-8000-000000000002' },
    { id: 'm-1602', title_uz: 'Texnolog', title_ru: 'Технолог', category_id: 'a0000002-0002-4000-8000-000000000002' },
    { id: 'm-1603', title_uz: 'Payvandchi', title_ru: 'Сварщик', category_id: 'a0000002-0002-4000-8000-000000000002' },
    { id: 'm-1604', title_uz: 'Elektrik', title_ru: 'Электрик', category_id: 'a0000002-0002-4000-8000-000000000002' },
    { id: 'm-1605', title_uz: 'Mexanik', title_ru: 'Механик', category_id: 'a0000002-0002-4000-8000-000000000002' },
    { id: 'm-1606', title_uz: 'Sifat nazoratchisi', title_ru: 'Контролер качества', category_id: 'a0000002-0002-4000-8000-000000000002' },

    { id: 'm-1701', title_uz: 'Usta', title_ru: 'Мастер', category_id: 'a0000007-0007-4000-8000-000000000007' },
    { id: 'm-1702', title_uz: 'Muhandis quruvchi', title_ru: 'Инженер-строитель', category_id: 'a0000007-0007-4000-8000-000000000007' },
    { id: 'm-1703', title_uz: 'Arxitektor', title_ru: 'Архитектор', category_id: 'a0000007-0007-4000-8000-000000000007' },
    { id: 'm-1704', title_uz: 'Smeta mutaxassisi', title_ru: 'Сметчик', category_id: 'a0000007-0007-4000-8000-000000000007' },
    { id: 'm-1705', title_uz: 'Bo yoqchi', title_ru: 'Маляр', category_id: 'a0000007-0007-4000-8000-000000000007' },
    { id: 'm-1706', title_uz: 'Plitkachi', title_ru: 'Плиточник', category_id: 'a0000007-0007-4000-8000-000000000007' },

    { id: 'm-1801', title_uz: 'Oshpaz', title_ru: 'Повар', category_id: 'a0000003-0003-4000-8000-000000000003' },
    { id: 'm-1802', title_uz: 'Ofitsiant', title_ru: 'Официант', category_id: 'a0000003-0003-4000-8000-000000000003' },
    { id: 'm-1803', title_uz: 'Barista', title_ru: 'Бариста', category_id: 'a0000003-0003-4000-8000-000000000003' },
    { id: 'm-1804', title_uz: 'Administrator', title_ru: 'Администратор', category_id: 'a0000003-0003-4000-8000-000000000003' },
    { id: 'm-1805', title_uz: 'Farrosh', title_ru: 'Уборщик', category_id: 'a0000003-0003-4000-8000-000000000003' },
    { id: 'm-1806', title_uz: 'Qo riqlovchi', title_ru: 'Охранник', category_id: 'a0000003-0003-4000-8000-000000000003' },

    { id: 'm-1901', title_uz: 'Agronom', title_ru: 'Агроном', category_id: 'a0000008-0008-4000-8000-000000000008' },
    { id: 'm-1902', title_uz: 'Veterinar', title_ru: 'Ветеринар', category_id: 'a0000008-0008-4000-8000-000000000008' },
    { id: 'm-1903', title_uz: 'Fermer yordamchisi', title_ru: 'Помощник фермера', category_id: 'a0000008-0008-4000-8000-000000000008' }
];

// ============================================
// Bot Class
// ============================================
export class TelegramBot {
    private supabase: SupabaseClient;
    private regionsCache: { data: RegionRef[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private categoriesCache: { data: CategoryRef[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private fieldsCache: { data: OsonishField[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private fieldsCatalogCache: { data: OsonishField[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private fieldsSearchCache: Map<string, { data: OsonishField[]; loadedAt: number }> = new Map();
    private professionCategoryCache: { map: Record<string, string>; loadedAt: number } = { map: {}, loadedAt: 0 };
    private jobsProfessionCache: { data: OsonishField[]; loadedAt: number } = { data: [], loadedAt: 0 };
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
                const ensuredDefault = await this.ensureRequiredCategories(DEFAULT_CATEGORIES);
                this.categoriesCache = { data: ensuredDefault, loadedAt: Date.now() };
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
            const ensuredFallback = await this.ensureRequiredCategories(filteredFallback.length ? filteredFallback : DEFAULT_CATEGORIES);
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
        const ensured = await this.ensureRequiredCategories(filtered.length ? filtered : DEFAULT_CATEGORIES);
        this.categoriesCache = { data: ensured, loadedAt: Date.now() };
        return this.categoriesCache.data;
    }

    private mapProfessionRows(rows: any[]): OsonishField[] {
        return (rows || [])
            .map((row: any) => ({
                id: row.id,
                title: row.title_uz || row.title_ru || '',
                title_uz: row.title_uz || row.title_ru || null,
                title_ru: row.title_ru || row.title_uz || null,
                vacancies_count: row.vacancies_count ?? null,
                category_id: row.category_id ?? null,
                category_title: row.category_title ?? null
            }))
            .filter((field: OsonishField) => field.id && String(field.title || '').trim().length > 0);
    }

    private async getOsonishFieldsFromDb(query?: string | null): Promise<OsonishField[]> {
        const cleanedQuery = String(query || '').replace(/[%_,]/g, ' ').trim();
        try {
            let request: any = this.supabase
                .from('osonish_professions')
                .select('id, title_uz, title_ru, vacancies_count, category_id, category_title');

            if (cleanedQuery) {
                request = request
                    .or(`title_uz.ilike.%${cleanedQuery}%,title_ru.ilike.%${cleanedQuery}%`)
                    .limit(150);
            } else {
                request = request
                    .order('vacancies_count', { ascending: false })
                    .limit(40);
            }

            const { data, error } = await request;
            if (error) return [];
            return this.mapProfessionRows(data || []);
        } catch {
            return [];
        }
    }

    private async getOsonishFieldsCatalog(limit: number = 1800): Promise<OsonishField[]> {
        if (this.fieldsCatalogCache.data.length > 0 && this.isCacheFresh(this.fieldsCatalogCache.loadedAt)) {
            return this.fieldsCatalogCache.data.slice(0, limit);
        }
        try {
            const { data, error } = await this.supabase
                .from('osonish_professions')
                .select('id, title_uz, title_ru, vacancies_count, category_id, category_title')
                .order('vacancies_count', { ascending: false })
                .limit(limit);
            if (!error && Array.isArray(data) && data.length > 0) {
                const mapped = this.mapProfessionRows(data);
                this.fieldsCatalogCache = { data: mapped, loadedAt: Date.now() };
                return mapped;
            }
        } catch {
            // Fallback to jobs below.
        }
        const fallback = await this.buildOsonishFieldsFromJobs(null);
        this.fieldsCatalogCache = { data: fallback, loadedAt: Date.now() };
        return fallback.slice(0, limit);
    }

    private async buildOsonishFieldsFromJobs(query?: string | null): Promise<OsonishField[]> {
        try {
            const normalizedQuery = this.normalizeLoose(query || '');
            if (this.jobsProfessionCache.data.length > 0 && this.isCacheFresh(this.jobsProfessionCache.loadedAt)) {
                const cached = this.jobsProfessionCache.data;
                if (!normalizedQuery) return cached.slice(0, 140);
                return cached
                    .filter(field =>
                        this.normalizeLoose(`${field.title_uz || ''} ${field.title_ru || ''}`).includes(normalizedQuery)
                    )
                    .slice(0, 140);
            }

            const { data, error } = await this.supabase
                .from('jobs')
                .select('category_id, raw_source_json')
                .eq('source', 'osonish')
                .eq('is_active', true)
                .order('last_seen_at', { ascending: false })
                .limit(9000);

            if (error || !data) return [];

            const categories = await this.getCategories();
            const acc = new Map<string, OsonishField>();

            for (const row of data as any[]) {
                const raw = row?.raw_source_json || {};
                const mmkIdRaw = raw?.mmk_position?.id ?? raw?.mmk_position_id ?? null;
                const mmkId = Number(mmkIdRaw);
                const title = String(
                    raw?.mmk_position?.position_name
                    || raw?.mmk_position?.name
                    || raw?.field_title
                    || ''
                ).trim();
                if (!Number.isFinite(mmkId) || mmkId <= 0 || title.length < 2) continue;

                const key = String(mmkId);
                const existing = acc.get(key);
                if (!existing) {
                    const cat = row?.category_id
                        ? categories.find(c => String(c.id) === String(row.category_id))
                        : null;
                    const field: OsonishField = {
                        id: key,
                        title,
                        title_uz: title,
                        title_ru: title,
                        vacancies_count: 1,
                        category_id: row?.category_id ? String(row.category_id) : null,
                        category_title: cat?.name_uz || cat?.name_ru || null
                    };
                    acc.set(key, field);
                    continue;
                }
                existing.vacancies_count = (existing.vacancies_count || 0) + 1;
                if (!existing.category_id && row?.category_id) {
                    const cat = categories.find(c => String(c.id) === String(row.category_id));
                    existing.category_id = String(row.category_id);
                    existing.category_title = cat?.name_uz || cat?.name_ru || existing.category_title || null;
                }
            }

            let rows = Array.from(acc.values());
            rows.sort((a, b) => (b.vacancies_count || 0) - (a.vacancies_count || 0));
            this.jobsProfessionCache = {
                data: rows,
                loadedAt: Date.now()
            };
            if (!normalizedQuery) return rows.slice(0, 140);
            return rows
                .filter(field =>
                    this.normalizeLoose(`${field.title_uz || ''} ${field.title_ru || ''}`).includes(normalizedQuery)
                )
                .slice(0, 140);
        } catch {
            return [];
        }
    }

    private async getOsonishFieldsFromRemote(query: string): Promise<OsonishField[]> {
        try {
            const authToken = process.env.OSONISH_BEARER_TOKEN || process.env.OSONISH_API_TOKEN || '';
            const cookie = process.env.OSONISH_COOKIE;
            const userId = process.env.OSONISH_USER_ID || process.env.OSONISH_CURRENT_USER_ID;
            const headers: Record<string, string> = {
                Accept: 'application/json',
                Referer: 'https://osonish.uz/10095/seeker/resumes/create',
                Origin: 'https://osonish.uz',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language': 'uz,ru;q=0.9,en;q=0.8'
            };
            if (authToken) {
                headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
            }
            if (cookie) headers.Cookie = cookie;
            if (userId) headers['x-current-user-id'] = userId;

            const apiBaseEnv = process.env.OSONISH_API_BASE?.trim();
            const trimBase = (value: string) => value.replace(/\/+$/, '');
            const toBaseCandidates = (value: string): string[] => {
                const cleaned = trimBase(value);
                if (!cleaned) return [];
                if (cleaned.endsWith('/api/api/v1')) return [cleaned.replace('/api/api/v1', '/api/v1'), cleaned];
                if (cleaned.endsWith('/api/v1')) return [cleaned, cleaned.replace('/api/v1', '/api/api/v1')];
                return [`${cleaned}/api/v1`, `${cleaned}/api/api/v1`];
            };
            const bases = Array.from(new Set([
                ...(apiBaseEnv ? toBaseCandidates(apiBaseEnv) : []),
                'https://osonish.uz/api/v1',
                'https://osonish.uz/api/api/v1'
            ]));

            let payload: any = null;
            for (const base of bases) {
                const url = `${base}/mmk-positions?search=${encodeURIComponent(query)}`;
                const res = await fetch(url, { headers, cache: 'no-store' });
                if (res.status === 404) continue;
                if (!res.ok) continue;
                payload = await res.json();
                break;
            }

            const rawList = Array.isArray(payload?.data?.data)
                ? payload.data.data
                : Array.isArray(payload?.data)
                    ? payload.data
                    : Array.isArray(payload)
                        ? payload
                        : [];

            return (rawList || [])
                .map((field: any) => ({
                    id: field.id ?? field.position_id ?? field.value ?? field.code,
                    title: field.position_name ?? field.name ?? field.title ?? '',
                    title_uz: field.position_name ?? field.name_uz ?? field.name ?? null,
                    title_ru: field.position_name ?? field.name_ru ?? field.name ?? null,
                    vacancies_count: field.vacancies_count ?? field.count ?? field.total ?? null,
                    category_id: null,
                    category_title: null,
                    type: field.type ?? null,
                    mmk_code: field.mmk_code ?? null,
                    group_id: field.group_id ?? null,
                    category_code: field.category ?? null
                }))
                .filter((field: OsonishField) => field.id && String(field.title || '').trim().length > 0);
        } catch {
            return [];
        }
    }

    private async getOsonishFields(query?: string | null): Promise<OsonishField[]> {
        const normalizedQuery = this.normalizeLoose(query || '');
        if (!normalizedQuery || normalizedQuery.length < 3) {
            return [];
        }

        const cached = this.fieldsSearchCache.get(normalizedQuery);
        if (cached && this.isCacheFresh(cached.loadedAt)) {
            return cached.data;
        }

        try {
            let loaded = await this.getOsonishFieldsFromDb(normalizedQuery);
            if (!loaded.length) {
                loaded = await this.buildOsonishFieldsFromJobs(normalizedQuery);
            }
            if (!loaded.length) {
                const catalog = await this.getOsonishFieldsCatalog(1800);
                loaded = this.pickFieldMatches(catalog, normalizedQuery, 300);
            }
            if (!loaded.length) {
                loaded = await this.getOsonishFieldsFromRemote(normalizedQuery);
            }
            const modern = this.getModernProfessionMatches(normalizedQuery);
            if (modern.length > 0) {
                loaded = this.mergeProfessionLists(loaded, modern);
            }

            const enriched = await this.enrichProfessionsWithCategory(loaded);
            this.fieldsSearchCache.set(normalizedQuery, { data: enriched, loadedAt: Date.now() });
            if (this.fieldsSearchCache.size > 60) {
                const oldestKey = this.fieldsSearchCache.keys().next().value;
                if (oldestKey) this.fieldsSearchCache.delete(oldestKey);
            }
            if (enriched.length > 0) {
                this.fieldsCache = { data: enriched, loadedAt: Date.now() };
            }
            return enriched;
        } catch (err) {
            console.warn('[BOT] Failed to load Osonish professions:', err);
            return [];
        }
    }

    private async getProfessionCategoryMap(): Promise<Record<string, string>> {
        if (Object.keys(this.professionCategoryCache.map).length > 0 && this.isCacheFresh(this.professionCategoryCache.loadedAt)) {
            return this.professionCategoryCache.map;
        }

        const counts: Record<string, Record<string, number>> = {};
        const pageSize = 1000;
        let offset = 0;

        while (true) {
            const { data, error } = await this.supabase
                .from('jobs')
                .select('category_id, raw_source_json')
                .not('category_id', 'is', null)
                .range(offset, offset + pageSize - 1);

            if (error) {
                console.warn('[BOT] Failed to build profession category map:', error);
                break;
            }
            if (!data || data.length === 0) break;

            for (const row of data as any[]) {
                const raw = row?.raw_source_json;
                const mmkId = raw?.mmk_position?.id ?? raw?.mmk_position_id ?? null;
                const categoryId = row?.category_id ? String(row.category_id) : null;
                if (!mmkId || !categoryId) continue;
                const key = String(mmkId);
                counts[key] = counts[key] || {};
                counts[key][categoryId] = (counts[key][categoryId] || 0) + 1;
            }

            if (data.length < pageSize) break;
            offset += pageSize;
        }

        const map: Record<string, string> = {};
        for (const [mmkId, categoryCounts] of Object.entries(counts)) {
            const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) {
                map[mmkId] = sorted[0][0];
            }
        }

        this.professionCategoryCache = { map, loadedAt: Date.now() };
        return map;
    }

    private async enrichProfessionsWithCategory(fields: OsonishField[]): Promise<OsonishField[]> {
        if (!Array.isArray(fields) || fields.length === 0) return [];
        const categories = await this.getCategories();
        const professionMap = await this.getProfessionCategoryMap();

        return fields.map((field) => {
            let categoryId = field.category_id ? String(field.category_id) : null;
            if (!categoryId && field.id !== null && field.id !== undefined) {
                categoryId = professionMap[String(field.id)] || null;
            }
            if (!categoryId) {
                const mapped = mapOsonishCategory(
                    field.title_uz || field.title || '',
                    null,
                    field.title_uz || field.title || ''
                );
                if (mapped?.categoryId) categoryId = mapped.categoryId;
            }
            const category = categoryId
                ? categories.find(cat => String(cat.id) === String(categoryId))
                : null;
            return {
                ...field,
                category_id: category?.id || categoryId || null,
                category_title: category
                    ? (category.name_uz || category.name_ru || null)
                    : field.category_title || null
            };
        });
    }

    private normalizeLoose(text?: string | null): string {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
            .replace(/[^a-z0-9\u0400-\u04FF\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private escapeHtml(value: string): string {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private buildFieldPromptText(lang: BotLang, query: string, total: number, page: number, perPage: number): string {
        const start = total > 0 ? (page * perPage) + 1 : 0;
        const end = Math.min((page + 1) * perPage, total);
        const safeQuery = this.escapeHtml(query);
        if (lang === 'ru') {
            return `<b>🧭 | Близкая профессия к должности</b>\n<i>Запрос: ${safeQuery}</i>\n<i>Результаты ${start}-${end} из ${total}</i>`;
        }
        return `<b>🧭 | Lavozimga yaqin bo'lgan kasb</b>\n<i>So'rov: ${safeQuery}</i>\n<i>Natijalar ${start}-${end} / ${total}</i>`;
    }

    private buildFieldNoResultText(lang: BotLang, query: string): string {
        const safeQuery = this.escapeHtml(query);
        if (lang === 'ru') {
            return `<b>⚠️ | По вашему запросу ничего не найдено</b>\n<i>Запрос: ${safeQuery}</i>\n<i>Попробуйте другой вариант (минимум 3 буквы).</i>`;
        }
        return `<b>🔎 | So'rov bo'yicha kasb topilmadi</b>\n<i>So'rov: ${safeQuery}</i>\n<i>Boshqa variant bilan qayta qidiring (kamida 3 ta harf).</i>`;
    }

    private buildBigrams(text: string): string[] {
        const source = String(text || '').trim();
        if (source.length < 2) return [];
        const grams: string[] = [];
        for (let i = 0; i < source.length - 1; i += 1) {
            grams.push(source.slice(i, i + 2));
        }
        return grams;
    }

    private diceSimilarity(a: string, b: string): number {
        if (!a || !b) return 0;
        if (a === b) return 1;
        const aBigrams = this.buildBigrams(a);
        const bBigrams = this.buildBigrams(b);
        if (!aBigrams.length || !bBigrams.length) return 0;
        const bCount = new Map<string, number>();
        for (const g of bBigrams) bCount.set(g, (bCount.get(g) || 0) + 1);
        let overlap = 0;
        for (const g of aBigrams) {
            const count = bCount.get(g) || 0;
            if (count > 0) {
                overlap += 1;
                bCount.set(g, count - 1);
            }
        }
        return (2 * overlap) / (aBigrams.length + bBigrams.length);
    }

    private extractMissingColumn(error: any): string | null {
        if (!error) return null;
        const message = [error.message, error.details, error.hint].filter(Boolean).join(' ');
        const lower = String(message).toLowerCase();
        if (!lower.includes('does not exist')
            && !lower.includes('not found')
            && !lower.includes('could not find')
            && !lower.includes('schema cache')) {
            return null;
        }
        const match =
            message.match(/column ["']?([a-z0-9_]+)["']? (?:does not exist|not found)/i)
            || message.match(/Could not find the '([^']+)' column/i)
            || message.match(/column ([a-z0-9_]+) does not exist/i);
        if (!match) return null;
        return match[1] ? String(match[1]) : null;
    }

    private stripColumnFromSelect(select: string, column: string): string {
        if (!select) return select;
        const normalized = column.trim();
        const parts = select
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .filter(part => {
                if (part === normalized) return false;
                if (part.startsWith(`${normalized} `)) return false;
                if (part.startsWith(`${normalized},`)) return false;
                return true;
            });
        return parts.join(', ');
    }

    private shouldEnforceAlphabet(state: BotState): boolean {
        return [
            BotState.ENTERING_NAME,
            BotState.ENTERING_TITLE,
            BotState.SELECTING_FIELD,
            BotState.ENTERING_ABOUT,
            BotState.ADDING_SKILLS,
            BotState.ENTERING_WORKPLACE,
            BotState.ENTERING_EDUCATION_PLACE,
            BotState.POSTING_JOB_TITLE,
            BotState.POSTING_JOB_ADDRESS,
            BotState.POSTING_JOB_LANGUAGES,
            BotState.POSTING_JOB_BENEFITS,
            BotState.POSTING_JOB_HR_NAME,
            BotState.POSTING_JOB_DESCRIPTION,
            BotState.EMPLOYER_PROFILE_COMPANY,
            BotState.EMPLOYER_PROFILE_DIRECTOR,
            BotState.EMPLOYER_PROFILE_INDUSTRY,
            BotState.EMPLOYER_PROFILE_DESCRIPTION
        ].includes(state);
    }

    private violatesAlphabet(text: string, lang: BotLang): boolean {
        if (!text) return false;
        const trimmed = text.trim();
        if (!trimmed) return false;
        const hasCyrillic = /[\u0400-\u04FF]/.test(trimmed);
        const hasLatin = /[A-Za-z]/.test(trimmed);
        if (lang === 'uz') {
            return hasCyrillic && hasLatin === false ? true : hasCyrillic;
        }
        if (lang === 'ru') {
            return hasLatin && hasCyrillic === false ? true : hasLatin;
        }
        return false;
    }

    private async resolveCategoryFromTitleOrField(
        title: string,
        fieldTitle?: string | null
    ): Promise<{ id: string; name_uz?: string | null; name_ru?: string | null } | null> {
        const categories = await this.getCategories();
        const fieldSource = fieldTitle || '';
        const mapped = mapOsonishCategory(fieldSource, null, title) || mapOsonishCategory('', null, title);
        if (mapped?.categoryId) {
            const match = categories.find(cat => cat.id === mapped.categoryId);
            return {
                id: mapped.categoryId,
                name_uz: match?.name_uz || mapped.categoryName,
                name_ru: match?.name_ru || mapped.categoryName
            };
        }

        if (fieldSource) {
            const normField = this.normalizeLoose(fieldSource);
            const byName = categories.find(cat => {
                const uz = this.normalizeLoose(cat.name_uz || '');
                const ru = this.normalizeLoose(cat.name_ru || '');
                return normField === uz || normField === ru || normField.includes(uz) || normField.includes(ru);
            });
            if (byName) {
                return { id: byName.id, name_uz: byName.name_uz, name_ru: byName.name_ru };
            }
        }

        return null;
    }

    private async resolveCategoryFromFieldId(
        fieldId: string | number,
        title: string,
        fieldOptions?: OsonishField[]
    ): Promise<{ id: string; name_uz?: string | null; name_ru?: string | null } | null> {
        const fields = Array.isArray(fieldOptions) && fieldOptions.length > 0
            ? fieldOptions
            : await this.getOsonishFields(String(title || '').trim());
        const match = fields.find(field => String(field.id) === String(fieldId));
        const fieldTitle = match?.title_uz || match?.title_ru || match?.title || null;
        const categoryTitle = match?.category_title || null;
        const categoryIdRaw = match?.category_id ?? null;
        if (categoryIdRaw) {
            const categories = await this.getCategories();
            const normalizedId = String(categoryIdRaw);
            const cat = categories.find(item => String(item.id) === normalizedId);
            if (cat) {
                return {
                    id: cat.id,
                    name_uz: cat.name_uz,
                    name_ru: cat.name_ru
                };
            }
        }
        return this.resolveCategoryFromTitleOrField(title, categoryTitle || fieldTitle);
    }

    private pickFieldMatches(fields: OsonishField[], query?: string | null, limit: number = 300): OsonishField[] {
        if (!Array.isArray(fields) || fields.length === 0) return [];
        const normalizedQuery = this.normalizeLoose(query || '');
        if (!normalizedQuery || normalizedQuery.length < 3) return [];
        const tokens = normalizedQuery.split(' ').filter(Boolean);

        const scored = fields.map(field => {
            const title = this.normalizeLoose(field.title_uz || field.title_ru || field.title || '');
            let score = 0;
            if (normalizedQuery && title === normalizedQuery) score += 100;
            if (normalizedQuery && title.startsWith(normalizedQuery)) score += 60;
            if (normalizedQuery && title.includes(normalizedQuery)) score += 40;
            if (tokens.length) {
                tokens.forEach(token => {
                    if (title.includes(token)) score += 10;
                });
            }
            if (score === 0) {
                const fullSimilarity = this.diceSimilarity(title, normalizedQuery);
                const tokenSimilarity = Math.max(
                    0,
                    ...title
                        .split(' ')
                        .filter(Boolean)
                        .map((token) => this.diceSimilarity(token, normalizedQuery))
                );
                const bestSimilarity = Math.max(fullSimilarity, tokenSimilarity);
                if (bestSimilarity >= 0.62) {
                    score = Math.round(bestSimilarity * 100);
                }
            }
            return { field, score };
        });

        const filtered = scored.filter(item => item.score > 0);
        if (!filtered.length) return [];

        filtered.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const countA = a.field.vacancies_count ?? 0;
            const countB = b.field.vacancies_count ?? 0;
            return countB - countA;
        });

        return filtered.slice(0, limit).map(item => item.field);
    }

    private getModernProfessionMatches(query: string): OsonishField[] {
        const normalizedQuery = this.normalizeLoose(query || '');
        if (!normalizedQuery || normalizedQuery.length < 3) return [];
        const tokens = normalizedQuery.split(' ').filter(Boolean);

        const scored = MODERN_PROFESSIONS.map(item => {
            const title = this.normalizeLoose(`${item.title_uz} ${item.title_ru}`);
            let score = 0;
            if (title === normalizedQuery) score += 120;
            if (title.startsWith(normalizedQuery)) score += 80;
            if (title.includes(normalizedQuery)) score += 50;
            if (tokens.length > 0) {
                for (const token of tokens) {
                    if (title.includes(token)) score += 15;
                }
            }
            return { item, score };
        }).filter(entry => entry.score > 0);

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 160).map(({ item }) => ({
            id: item.id,
            title: item.title_uz,
            title_uz: item.title_uz,
            title_ru: item.title_ru,
            vacancies_count: 0,
            category_id: item.category_id,
            category_title: null
        }));
    }

    private mergeProfessionLists(primary: OsonishField[], secondary: OsonishField[]): OsonishField[] {
        const map = new Map<string, OsonishField>();
        const put = (field: OsonishField) => {
            const key = this.normalizeLoose(field.title_uz || field.title_ru || field.title || '');
            if (!key) return;
            const current = map.get(key);
            if (!current) {
                map.set(key, field);
                return;
            }
            const currentCount = Number(current.vacancies_count || 0);
            const nextCount = Number(field.vacancies_count || 0);
            if (nextCount > currentCount) {
                map.set(key, { ...current, ...field });
                return;
            }
            if (!current.category_id && field.category_id) {
                map.set(key, { ...current, category_id: field.category_id, category_title: field.category_title || current.category_title || null });
            }
        };

        for (const field of primary) put(field);
        for (const field of secondary) put(field);
        return Array.from(map.values());
    }

    private async ensureRequiredCategories(categories: CategoryRef[]): Promise<CategoryRef[]> {
        const required: CategoryRef[] = DEFAULT_CATEGORIES;

        const missing = required.filter(req => {
            const reqUz = this.normalizeLoose(req.name_uz);
            const reqRu = this.normalizeLoose(req.name_ru);
            return !categories.some(cat => {
                if (cat.id === req.id) return true;
                const uz = this.normalizeLoose(cat.name_uz || '');
                const ru = this.normalizeLoose(cat.name_ru || '');
                return (reqUz && (uz === reqUz || uz.includes(reqUz)))
                    || (reqRu && (ru === reqRu || ru.includes(reqRu)));
            });
        });
        if (!missing.length) {
            return categories
                .slice()
                .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
        }

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

        return [...categories, ...missing]
            .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
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

        const normalizedFallback = normalize(fallback.length ? fallback : DEFAULT_CATEGORIES);
        for (const req of required) {
            if (!normalizedFallback.some(cat => cat.id === req.id)) normalizedFallback.push(req);
        }
        for (const cat of DEFAULT_CATEGORIES) {
            if (!normalizedFallback.some(item => item.id === cat.id)) normalizedFallback.push(cat);
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
            BotState.ENTERING_BIRTH_DATE,
            BotState.SELECTING_SALARY,
            BotState.SELECTING_SALARY_MAX,
            BotState.ENTERING_WORKPLACE_YEARS,
            BotState.ENTERING_WORKPLACE_END_YEAR,
            BotState.ENTERING_EDUCATION_START_YEAR,
            BotState.ENTERING_EDUCATION_END_YEAR
        ];
        if (skipStates.includes(state)) return true;
        if (!text) return false;
        const numericLike = /^[\d\s+.,-]+$/.test(text.trim());
        return numericLike || skipStates.includes(state);
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
        let result: any = null;
        try {
            result = await sendMessage(chatId, safeText, {
                parseMode: options.parseMode ?? 'HTML',
                replyMarkup: options.replyMarkup
            });
        } catch (err: any) {
            // Fallback for malformed HTML/Markdown content so the flow does not break.
            const fallbackText = this.stripHtmlTags(safeText);
            result = await sendMessage(chatId, fallbackText, {
                replyMarkup: options.replyMarkup
            });
        }
        const messageId = result?.message_id;
        if (messageId) {
            const updatedData = { ...session.data, last_prompt_message_id: messageId };
            session.data = updatedData;
            await this.updateSession(session.telegram_user_id, { data: updatedData });
        }
    }

    private stripHtmlTags(value: string): string {
        return String(value || '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    }

    private normalizePhoneValue(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).replace(/\D/g, '');
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
            try {
                await answerCallbackQuery(id);
            } catch {
                // Old/expired callback query should not break the whole flow.
            }
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
                case 'field': await this.handleFieldSelect(chatId, value, session, message.message_id); break;
                case 'fieldpage': await this.showFieldPage(chatId, parseInt(value), session, message.message_id); break;
                case 'experience': await this.handleExperienceSelect(chatId, value, session, message.message_id); break;
                case 'education':
                    if (value === 'add') {
                        await this.setSession(session, { state: BotState.ENTERING_EDUCATION_PLACE, data: { ...session.data, education_pending: null } });
                        await this.setFlowCancelKeyboard(chatId, session, 'back');
                        await this.sendPrompt(chatId, session, botTexts.askEducationPlace[session.lang], {
                            replyMarkup: keyboards.backKeyboard(session.lang, 'education')
                        });
                    } else if (value === 'done') {
                        await this.finishEducationStep(chatId, session);
                    } else {
                        await this.handleEducationSelect(chatId, value, session, message.message_id);
                    }
                    break;
                case 'educont':
                    if (value === 'add') {
                        await this.setSession(session, { state: BotState.ENTERING_EDUCATION_PLACE, data: { ...session.data, education_pending: null } });
                        await this.setFlowCancelKeyboard(chatId, session, 'back');
                        await this.sendPrompt(chatId, session, botTexts.askEducationPlace[session.lang], {
                            replyMarkup: keyboards.backKeyboard(session.lang, 'education')
                        });
                    } else {
                        await this.finishEducationStep(chatId, session);
                    }
                    break;
                case 'gender': await this.handleGenderSelect(chatId, value, session, message.message_id); break;
                case 'special': await this.handleSpecialCriteria(chatId, value, session, message.message_id); break;
                case 'salary': await this.handleSalarySelect(chatId, value, session, message.message_id); break;
                case 'jobsalary': await this.handleJobSalaryQuick(chatId, value, session, message.message_id); break;
                case 'jobsalarymax': await this.handleJobSalaryMaxQuick(chatId, value, session, message.message_id); break;
                case 'matchjob': await this.handleMatchJob(chatId, value, session); break;
                case 'matchrelated':
                    if (value === 'open') {
                        const relatedResumes: Array<{ id: string; full_name?: string | null; title?: string | null; score?: number | null }> =
                            Array.isArray(session.data?.related_resume_list) ? session.data.related_resume_list : [];
                        if (!relatedResumes.length) {
                            await this.sendPrompt(chatId, session, botTexts.noJobsFound[session.lang], {
                                replyMarkup: keyboards.employerMainMenuKeyboard(session.lang)
                            });
                            break;
                        }
                        await this.sendPrompt(chatId, session, session.lang === 'uz' ? '🧾 Yaqin rezyumelar:' : '🧾 Похожие резюме:', {
                            replyMarkup: keyboards.resumeMatchKeyboard(session.lang, relatedResumes)
                        });
                    }
                    break;
                case 'jobview': await this.handleEmployerJobView(chatId, value, session); break;
                case 'jobclose': await this.handleEmployerJobClose(chatId, value, session); break;
                case 'autojobs':
                    if (value === 'open') {
                        const autoList: MatchedJob[] = Array.isArray(session.data?.auto_job_list)
                            ? session.data.auto_job_list
                            : [];
                        if (!autoList.length) {
                            await this.sendPrompt(chatId, session, botTexts.noJobsFound[session.lang], {
                                replyMarkup: keyboards.mainMenuKeyboard(session.lang, 'seeker')
                            });
                            break;
                        }
                        await this.setSession(session, {
                            state: BotState.BROWSING_JOBS,
                            data: { ...session.data, job_list: autoList, currentJobIndex: 0, job_source: 'auto' }
                        });
                        await this.showJob(chatId, session, 0);
                    }
                    break;
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
                case 'workend':
                    if (value === 'current') await this.handleWorkEndCurrent(chatId, session);
                    break;
                case 'eduend':
                    if (value === 'current') await this.handleEducationEndCurrent(chatId, session);
                    break;
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
                case 'noop': break;
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
            const showCounts = session.data?.active_role !== 'employer';

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

            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'region', showCounts) };
            const promptText = showCounts ? botTexts.askDistrictWithCounts[lang] : botTexts.askDistrict[lang];
            if (messageId) {
                await editMessage(chatId, messageId, promptText, options);
            } else {
                await this.sendPrompt(chatId, session, promptText, options);
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

            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'employer_region', false) };
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
            const showCounts = session.data?.active_role !== 'employer';

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

            const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'region', showCounts) };
            const promptText = showCounts ? botTexts.askDistrictWithCounts[lang] : botTexts.askDistrict[lang];
            if (messageId) {
                await editMessage(chatId, messageId, promptText, options);
            } else {
                await sendMessage(chatId, promptText, options);
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
        const showCounts = session.data?.active_role !== 'employer';

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

        const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, 0, districtCounts, 'region', showCounts) };
        const promptText = showCounts ? botTexts.askDistrictWithCounts[lang] : botTexts.askDistrict[lang];
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, promptText, options);
    }

    private async showDistrictPage(chatId: number, page: number, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];
        const districtCounts = session.data?.district_counts || {};
        await this.setSession(session, { data: { ...session.data, districtPage: page } });
        const isJobFlow = session.state === BotState.POSTING_JOB_DISTRICT;
        const isEmployerProfileFlow = session.state === BotState.EMPLOYER_PROFILE_DISTRICT;
        const backAction = isJobFlow
            ? 'job_region'
            : isEmployerProfileFlow
                ? 'employer_region'
                : 'region';
        const showCounts = !(isJobFlow || isEmployerProfileFlow) && session.data?.active_role !== 'employer';
        const options = { replyMarkup: keyboards.districtKeyboard(districts, lang, page, districtCounts, backAction, showCounts) };
        const promptText = isJobFlow || isEmployerProfileFlow
            ? botTexts.employerDistrictPrompt[lang]
            : (showCounts ? botTexts.askDistrictWithCounts[lang] : botTexts.askDistrict[lang]);
        if (messageId) {
            await editMessage(chatId, messageId, promptText, options);
        } else {
            await sendMessage(chatId, promptText, options);
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

    private async showFieldPage(chatId: number, page: number, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const fields: OsonishField[] = Array.isArray(session.data?.field_options) ? session.data.field_options : [];
        const query = String(session.data?.field_query || '').trim();
        const context = session.data?.field_context === 'job' ? 'job' : 'resume';
        const backAction = context === 'job' ? 'job_title' : 'title';

        if (!fields.length) {
            const text = query.length >= 3
                ? this.buildFieldNoResultText(lang, query)
                : `${botTexts.fieldMinChars[lang]}\n\n${botTexts.askField[lang]}`;
            const options = { replyMarkup: keyboards.backKeyboard(lang, backAction) };
            if (messageId) {
                await editMessage(chatId, messageId, text, options);
            } else {
                await sendMessage(chatId, text, options);
            }
            return;
        }

        const perPage = 10;
        const totalPages = Math.max(1, Math.ceil(fields.length / perPage));
        const safePage = Number.isFinite(page) ? Math.max(0, Math.min(page, totalPages - 1)) : 0;
        await this.setSession(session, {
            data: { ...session.data, field_page: safePage }
        });

        const promptText = this.buildFieldPromptText(lang, query, fields.length, safePage, perPage);
        const options = {
            replyMarkup: keyboards.fieldsKeyboard(lang, fields, backAction, safePage, perPage)
        };
        if (messageId) {
            await editMessage(chatId, messageId, promptText, options);
        } else {
            await sendMessage(chatId, promptText, options);
        }
    }

    private async handleFieldSelect(chatId: number, fieldId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const context = session.data?.field_context || 'resume';
        const title = context === 'job'
            ? (session.data?.temp_job?.title || '')
            : (session.data?.resume?.title || '');
        const currentFieldOptions: OsonishField[] = Array.isArray(session.data?.field_options) ? session.data.field_options : [];
        const resolved = await this.resolveCategoryFromFieldId(fieldId, title, currentFieldOptions);
        if (!resolved) {
            const fields = await this.getOsonishFields(session.data?.field_query || title || '');
            const fallback = currentFieldOptions.length ? currentFieldOptions : this.pickFieldMatches(fields, session.data?.field_query || title || '', 300);
            const page = Number.isFinite(Number(session.data?.field_page)) ? Number(session.data?.field_page) : 0;
            await this.setSession(session, {
                state: BotState.SELECTING_FIELD,
                data: {
                    ...session.data,
                    field_context: context,
                    field_query: session.data?.field_query || title,
                    field_options: fallback,
                    field_page: page
                }
            });
            const promptText = this.buildFieldPromptText(lang, String(session.data?.field_query || title || ''), fallback.length, page, 10);
            await this.sendPrompt(chatId, session, promptText, {
                replyMarkup: keyboards.fieldsKeyboard(lang, fallback, context === 'job' ? 'job_title' : 'title', page, 10)
            });
            return;
        }

        const fields = currentFieldOptions.length ? currentFieldOptions : await this.getOsonishFields(session.data?.field_query || title || '');
        const selectedField = fields.find(field => String(field.id) === String(fieldId));
        const fieldTitle = selectedField?.title_uz || selectedField?.title_ru || selectedField?.title || null;

        if (context === 'job') {
            const updatedJob = {
                ...session.data?.temp_job,
                category_id: resolved.id,
                category_name: lang === 'uz' ? resolved.name_uz : resolved.name_ru,
                field_id: fieldId,
                field_title: fieldTitle
            };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_SALARY,
                data: { ...session.data, temp_job: updatedJob, field_context: null, field_query: '', field_options: [], field_page: 0 }
            });
            await this.sendPrompt(chatId, session, botTexts.postJobSalary[lang], {
                replyMarkup: keyboards.jobSalaryKeyboard(lang)
            });
            return;
        }

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                category_id: resolved.id,
                category_ids: [resolved.id],
                category_name: lang === 'uz' ? resolved.name_uz : resolved.name_ru,
                field_id: fieldId,
                field_title: fieldTitle
            },
            field_context: null,
            field_query: '',
            field_options: [],
            field_page: 0
        };
        await this.setSession(session, { state: BotState.SELECTING_REGION, data: updatedData });
        const regions = await this.getRegions();
        await this.sendPrompt(chatId, session, botTexts.askRegion[lang], {
            replyMarkup: keyboards.regionKeyboard(lang, regions, 'title')
        });
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
        if (value === 'done') {
            await this.finishEducationStep(chatId, session);
            return;
        }

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
            state: BotState.SELECTING_SPECIAL,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.specialCriteriaKeyboard(lang, updatedData.resume?.special || [], 'education') };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askSpecialCriteria[lang], options);
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
            state: BotState.ENTERING_TITLE,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.backKeyboard(lang, 'gender') };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askTitle[lang], options);
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

            const options = { replyMarkup: keyboards.specialCriteriaKeyboard(lang, currentSpecial, 'education') };
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
            state: BotState.ENTERING_ABOUT,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.aboutSkipInlineKeyboard(lang, 'salary') };
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
        await this.sendPrompt(chatId, session, botTexts.askAbout[lang], options);
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

    private sanitizeYearValue(value: any): number | null {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return null;
        const year = Math.round(numeric);
        const nowYear = new Date().getFullYear();
        if (year < 1950 || year > nowYear) return null;
        return year;
    }

    private sanitizeExperienceDetails(list: any): any[] {
        if (!Array.isArray(list)) return [];
        const sanitized: any[] = [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const company = String(item.company || item.employer || '').trim();
            const position = String(item.position || item.role || '').trim();
            const startYear = this.sanitizeYearValue(item.start_year);
            const endYearRaw = item.end_year === undefined || item.end_year === null || item.end_year === '' ? null : this.sanitizeYearValue(item.end_year);
            const isCurrent = Boolean(item.is_current);
            if (!company && !position) continue;
            if (startYear && endYearRaw && endYearRaw < startYear) continue;
            sanitized.push({
                company: company || undefined,
                position: position || undefined,
                start_year: startYear || undefined,
                end_year: isCurrent ? undefined : (endYearRaw || undefined),
                is_current: isCurrent
            });
        }
        return sanitized;
    }

    private sanitizeEducationEntries(list: any): any[] {
        if (!Array.isArray(list)) return [];
        const sanitized: any[] = [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const institution = String(item.institution || item.school || '').trim();
            const field = String(item.field || item.specialty || '').trim();
            const startYear = this.sanitizeYearValue(item.start_year);
            const endYearRaw = item.end_year === undefined || item.end_year === null || item.end_year === '' ? null : this.sanitizeYearValue(item.end_year);
            const isCurrent = Boolean(item.is_current);
            if (!institution && !field) continue;
            if (startYear && endYearRaw && endYearRaw < startYear) continue;
            sanitized.push({
                institution: institution || undefined,
                field: field || undefined,
                start_year: startYear || undefined,
                end_year: isCurrent ? undefined : (endYearRaw || undefined),
                is_current: isCurrent
            });
        }
        return sanitized;
    }

    private async saveResume(session: TelegramSession, resumeData: any, resumeId?: string | null): Promise<string | null> {
        if (!session.user_id || !resumeData) return null;

        let existing: any | null = null;
        if (resumeId) {
            let selectError: any = null;
            let data: any = null;
            const primary = await this.supabase
                .from('resumes')
                .select('title, full_name, about, phone, region_id, district_id, category_id, category_ids, field_id, field_title, skills, experience_details, education, expected_salary_min, expected_salary_max, gender, education_level, experience, birth_date, special')
                .eq('id', resumeId)
                .maybeSingle();
            data = primary.data || null;
            selectError = primary.error || null;
            if (selectError && String(selectError.message || '').includes('special')) {
                const fallback = await this.supabase
                    .from('resumes')
                    .select('title, full_name, about, phone, region_id, district_id, category_id, category_ids, field_id, field_title, skills, experience_details, education, expected_salary_min, expected_salary_max, gender, education_level, experience, birth_date')
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
            expected_salary_min, birth_date, experience_details, special, field_id, field_title
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
        const combinedCategoryIds = new Set<string>();
        sourceCategoryIds.forEach((id: any) => {
            if (id !== null && id !== undefined) combinedCategoryIds.add(String(id));
        });
        if (category_id) combinedCategoryIds.add(String(category_id));
        if (existing?.category_id) combinedCategoryIds.add(String(existing.category_id));
        const finalCategoryIds = Array.from(combinedCategoryIds);
        const finalCategoryId = category_id
            ? String(category_id)
            : (existing?.category_id ? String(existing.category_id) : (finalCategoryIds.length > 0 ? finalCategoryIds[0] : null));
        const finalFieldId = hasProp(resumeData, 'field_id')
            ? (field_id ?? null)
            : (existing?.field_id ?? null);
        const finalFieldTitle = hasProp(resumeData, 'field_title')
            ? (field_title ?? null)
            : (existing?.field_title ?? null);
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
        const finalExperienceDetails = this.sanitizeExperienceDetails(
            hasProp(resumeData, 'experience_details')
                ? (Array.isArray(experience_details) ? experience_details : [])
                : (Array.isArray(existing?.experience_details) ? existing.experience_details : [])
        );
        const finalEducation = this.sanitizeEducationEntries(
            hasProp(resumeData, 'education')
                ? (Array.isArray(educationData) ? educationData : [])
                : (Array.isArray(existing?.education) ? existing.education : [])
        );

        const educationCandidate = hasProp(resumeData, 'education_level')
            ? education_level
            : (typeof educationData === 'string' ? educationData : existing?.education_level);
        const normalizedEducationLevel = this.normalizeEducationLevelKey(educationCandidate);

        const payload = {
            user_id: session.user_id,
            region_id: finalRegionId,
            district_id: finalDistrictId,
            category_id: finalCategoryId,
            category_ids: finalCategoryIds,
            field_id: finalFieldId,
            field_title: finalFieldTitle,
            title: safeTitle,
            full_name: finalFullName,
            about: finalAbout,
            skills: normalizedSkills,
            experience: experience_level || experience || existing?.experience || 'no_experience',
            experience_level: experience_level || experience || existing?.experience || 'no_experience',
            education_level: normalizedEducationLevel,
            experience_details: finalExperienceDetails,
            education: finalEducation,
            gender: normalizedGender,
            expected_salary_min: finalExpectedSalary,
            birth_date: finalBirthDate,
            special: normalizedSpecial,
            is_public: true,
            status: 'active',
            updated_at: new Date().toISOString(),
            phone: session.phone || existing?.phone || null
        } as Record<string, any>;

        if (!payload.title || String(payload.title).trim().length === 0) {
            payload.title = 'Mutaxassis';
        }

        if (resumeId) {
            let payloadToUse: Record<string, any> = { ...payload };
            let error: any = null;
            for (let attempt = 0; attempt < 5; attempt += 1) {
                const updateResult = await this.supabase
                    .from('resumes')
                    .update(payloadToUse)
                    .eq('id', resumeId);
                error = updateResult.error || null;
                if (!error) break;
                const missingColumn = this.extractMissingColumn(error);
                if (missingColumn && Object.prototype.hasOwnProperty.call(payloadToUse, missingColumn)) {
                    delete payloadToUse[missingColumn];
                    continue;
                }
                // Handle known missing columns for legacy schemas.
                if (String(error.message || '').includes('special') && payloadToUse.special) {
                    delete payloadToUse.special;
                    continue;
                }
                if (String(error.message || '').includes('experience_level') && payloadToUse.experience_level) {
                    delete payloadToUse.experience_level;
                    continue;
                }
                if (String(error.message || '').includes('category_ids') && payloadToUse.category_ids) {
                    delete payloadToUse.category_ids;
                    continue;
                }
                if (String(error.message || '').includes('experience_details') && payloadToUse.experience_details) {
                    delete payloadToUse.experience_details;
                    continue;
                }
                if (String(error.message || '').includes('education') && payloadToUse.education) {
                    delete payloadToUse.education;
                    continue;
                }
                break;
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
                category_id: payload.category_id || null,
                gender: payload.gender || null,
                experience: payload.experience || null,
                education_level: payload.education_level || null,
                expected_salary_min: payload.expected_salary_min || null,
                birth_date: payload.birth_date || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
            return resumeId;
        }

        let payloadToUse: Record<string, any> = { ...payload };
        let data: any = null;
        let error: any = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const insertResult = await this.supabase
                .from('resumes')
                .insert({ ...payloadToUse, created_at: new Date().toISOString() })
                .select('id')
                .single();
            data = insertResult.data;
            error = insertResult.error || null;
            if (!error) break;
            const missingColumn = this.extractMissingColumn(error);
            if (missingColumn && Object.prototype.hasOwnProperty.call(payloadToUse, missingColumn)) {
                delete payloadToUse[missingColumn];
                continue;
            }
            if (String(error.message || '').includes('special') && payloadToUse.special) {
                delete payloadToUse.special;
                continue;
            }
            if (String(error.message || '').includes('experience_level') && payloadToUse.experience_level) {
                delete payloadToUse.experience_level;
                continue;
            }
            if (String(error.message || '').includes('category_ids') && payloadToUse.category_ids) {
                delete payloadToUse.category_ids;
                continue;
            }
            if (String(error.message || '').includes('experience_details') && payloadToUse.experience_details) {
                delete payloadToUse.experience_details;
                continue;
            }
            if (String(error.message || '').includes('education') && payloadToUse.education) {
                delete payloadToUse.education;
                continue;
            }
            break;
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
            category_id: payload.category_id || null,
            gender: payload.gender || null,
            experience: payload.experience || null,
            education_level: payload.education_level || null,
            expected_salary_min: payload.expected_salary_min || null,
            birth_date: payload.birth_date || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        return data?.id || null;
    }

    private async saveResumePartial(session: TelegramSession, resumeId: string, patch: Record<string, any>): Promise<void> {
        if (!session.user_id) return;
        let payload = { ...patch, updated_at: new Date().toISOString() } as Record<string, any>;
        if (typeof payload.education_level === 'string') {
            const normalized = this.normalizeEducationLevelKey(payload.education_level);
            if (!normalized) {
                payload.education_level = null;
            } else {
                payload.education_level = normalized;
            }
        }
        let error: any = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const result = await this.supabase
                .from('resumes')
                .update(payload)
                .eq('id', resumeId);
            error = result.error || null;
            if (!error) break;
            const missingColumn = this.extractMissingColumn(error);
            if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
                delete payload[missingColumn];
                continue;
            }
            if (String(error.message || '').includes('special') && payload.special) {
                delete payload.special;
                continue;
            }
            if (String(error.message || '').includes('experience_level') && payload.experience_level) {
                delete payload.experience_level;
                continue;
            }
            if (String(error.message || '').includes('category_ids') && payload.category_ids) {
                delete payload.category_ids;
                continue;
            }
            if (String(error.message || '').includes('experience_details') && payload.experience_details) {
                delete payload.experience_details;
                continue;
            }
            if (String(error.message || '').includes('education') && payload.education) {
                delete payload.education;
                continue;
            }
            break;
        }
        if (error) console.error('Save resume partial error:', error);
    }

    private async handleTextByState(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        let state = session.state;

        // Migrate legacy state where job category was asked before profession.
        if (state === BotState.POSTING_JOB_CATEGORY) {
            const existingTitle = String(session.data?.temp_job?.title || '').trim();
            if (existingTitle.length >= 3) {
                const fields = await this.getOsonishFields(existingTitle);
                const matches = fields.length ? this.pickFieldMatches(fields, existingTitle, 300) : [];
                await this.setSession(session, {
                    state: BotState.SELECTING_FIELD,
                    data: {
                        ...session.data,
                        field_context: 'job',
                        field_query: existingTitle,
                        field_options: matches,
                        field_page: 0
                    }
                });
                state = BotState.SELECTING_FIELD;
                const replyMarkup = matches.length
                    ? keyboards.fieldsKeyboard(lang, matches, 'job_title', 0, 10)
                    : keyboards.backKeyboard(lang, 'job_title');
                const promptText = matches.length
                    ? this.buildFieldPromptText(lang, existingTitle, matches.length, 0, 10)
                    : this.buildFieldNoResultText(lang, existingTitle);
                await this.sendPrompt(chatId, session, promptText, { replyMarkup });
                return;
            }

            await this.setSession(session, { state: BotState.POSTING_JOB_TITLE });
            await this.sendPrompt(chatId, session, botTexts.postJobTitle[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'employer_menu')
            });
            return;
        }

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

        if (this.shouldEnforceAlphabet(state) && this.violatesAlphabet(text, lang)) {
            if (state === BotState.ENTERING_TITLE) {
                await this.sendPrompt(chatId, session, `${botTexts.titleInvalidAlphabet[lang]}\n\n${botTexts.askTitle[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'salary')
                });
                return;
            }
            if (state === BotState.SELECTING_FIELD) {
                const fieldQuery = String(session.data?.field_query || '').trim();
                const options = Array.isArray(session.data?.field_options) ? session.data.field_options : [];
                const page = Number.isFinite(Number(session.data?.field_page)) ? Number(session.data?.field_page) : 0;
                const backAction = session.data?.field_context === 'job' ? 'job_title' : 'title';
                const followUp = options.length > 0
                    ? this.buildFieldPromptText(lang, fieldQuery, options.length, page, 10)
                    : botTexts.askField[lang];
                await this.sendPrompt(chatId, session, `${botTexts.fieldInvalidAlphabet[lang]}\n\n${followUp}`, {
                    replyMarkup: options.length > 0
                        ? keyboards.fieldsKeyboard(lang, options, backAction, page, 10)
                        : keyboards.backKeyboard(lang, backAction)
                });
                return;
            }
            await this.sendPrompt(chatId, session, botTexts.invalidAlphabet[lang]);
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
            const title = text.trim();
            const fields = await this.getOsonishFields(title);
            const matches = fields.length ? this.pickFieldMatches(fields, title, 300) : [];
            await this.updateSession(session.telegram_user_id, {
                state: BotState.SELECTING_FIELD,
                data: {
                    ...session.data,
                    temp_job: { ...session.data?.temp_job, title },
                    field_context: 'job',
                    field_query: title,
                    field_options: matches,
                    field_page: 0
                }
            });
            const replyMarkup = matches.length
                ? keyboards.fieldsKeyboard(lang, matches, 'job_title', 0, 10)
                : keyboards.backKeyboard(lang, 'job_title');
            const promptText = matches.length
                ? this.buildFieldPromptText(lang, title, matches.length, 0, 10)
                : this.buildFieldNoResultText(lang, title);
            await this.sendPrompt(chatId, session, promptText, { replyMarkup });
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
                    replyMarkup: keyboards.backKeyboard(lang, 'name')
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
                state: BotState.SELECTING_GENDER,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.askGender[lang], {
                replyMarkup: keyboards.genderKeyboard(lang, false)
            });
            return;
        }

        if (state === BotState.SELECTING_FIELD) {
            const query = text.trim();
            if (query.length < 3) {
                await this.setSession(session, {
                    data: { ...session.data, field_query: query, field_options: [], field_page: 0 }
                });
                await this.sendPrompt(chatId, session, botTexts.fieldMinChars[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, session.data?.field_context === 'job' ? 'job_title' : 'title')
                });
                return;
            }
            const fields = await this.getOsonishFields(query);
            const matches = this.pickFieldMatches(fields, query, 300);
            if (!matches.length) {
                const backAction = session.data?.field_context === 'job' ? 'job_title' : 'title';
                await this.setSession(session, {
                    data: { ...session.data, field_query: query, field_options: [], field_page: 0 }
                });
                await this.sendPrompt(chatId, session, this.buildFieldNoResultText(lang, query), {
                    replyMarkup: keyboards.backKeyboard(lang, backAction)
                });
                return;
            }
            const backAction = session.data?.field_context === 'job' ? 'job_title' : 'title';
            const page = 0;
            await this.setSession(session, {
                data: { ...session.data, field_query: query, field_options: matches, field_page: page }
            });
            await this.sendPrompt(chatId, session, this.buildFieldPromptText(lang, query, matches.length, page, 10), {
                replyMarkup: keyboards.fieldsKeyboard(lang, matches, backAction, page, 10)
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
            const title = text.trim();
            if (title.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.titleTooShort[lang]}\n\n${botTexts.askTitle[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'salary')
                });
                return;
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, title } };
            const fields = await this.getOsonishFields(title);
            const matches = fields.length ? this.pickFieldMatches(fields, title) : [];
            if (!matches.length) {
                const queryTokens = this.tokenizeTitle(title);
                let suggested: OsonishField[] = [];
                for (const token of queryTokens) {
                    if (token.length < 3) continue;
                    const tokenFields = await this.getOsonishFields(token);
                    const tokenMatches = tokenFields.length ? this.pickFieldMatches(tokenFields, token) : [];
                    if (tokenMatches.length) {
                        suggested = tokenMatches;
                        break;
                    }
                }

                if (!suggested.length) {
                    await this.setSession(session, {
                        state: BotState.ENTERING_TITLE,
                        data: { ...updatedData, field_context: null, field_query: '', field_options: [] }
                    });
                    await this.sendPrompt(chatId, session, `${botTexts.titleNotRecognized[lang]}\n\n${botTexts.askTitle[lang]}`, {
                        replyMarkup: keyboards.backKeyboard(lang, 'salary')
                    });
                    return;
                }

                await this.setSession(session, {
                    state: BotState.SELECTING_FIELD,
                    data: {
                        ...updatedData,
                        field_context: 'resume',
                        field_query: title,
                        field_options: suggested,
                        field_page: 0
                    }
                });
                await this.sendPrompt(chatId, session, `${botTexts.titleSuggestions[lang]}\n${this.buildFieldPromptText(lang, title, suggested.length, 0, 10)}`, {
                    replyMarkup: keyboards.fieldsKeyboard(lang, suggested, 'title', 0, 10)
                });
                return;
            }
            await this.setSession(session, {
                state: BotState.SELECTING_FIELD,
                data: { ...updatedData, field_context: 'resume', field_query: title, field_options: matches, field_page: 0 }
            });
            const replyMarkup = keyboards.fieldsKeyboard(lang, matches, 'title', 0, 10);
            await this.sendPrompt(chatId, session, this.buildFieldPromptText(lang, title, matches.length, 0, 10), { replyMarkup });
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
                state: BotState.ENTERING_BIRTH_DATE,
                data: updatedData
            });
            const options = { replyMarkup: keyboards.backKeyboard(lang, 'name') };
            await this.sendPrompt(chatId, session, botTexts.askBirthDate[lang], options);
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
            const currentSkills = session.data?.resume?.skills || [];
            if ((skipText === "o'tkazib yuborish" || skipText === 'пропустить') && currentSkills.length === 0) {
                await this.handleSkip(chatId, session);
                return;
            }
            const lower = text.toLowerCase();
            if (lower === 'tayyor' || lower === 'готово') {
                await this.finishSkills(chatId, session);
                return;
            }
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
                replyMarkup: keyboards.workEndYearKeyboard(lang)
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
                `${botTexts.skillAdded[lang]} ${company}${position ? ` — ${position}` : ''}${yearsLabel ? ` (${yearsLabel})` : ''}\n${botTexts.entryContinueHint[lang]}`,
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
                replyMarkup: keyboards.educationEndYearKeyboard(lang)
            });
            return;
        }

        if (state === BotState.ENTERING_EDUCATION_END_YEAR) {
            const pending = session.data?.education_pending || {};
            const startYear = Number(pending.start_year);
            const endParsed = this.parseEndYearInput(text);
            if (!endParsed) {
                await this.sendPrompt(chatId, session, botTexts.educationEndYearInvalid[lang], {
                    replyMarkup: keyboards.educationEndYearKeyboard(lang)
                });
                return;
            }
            const endYear = endParsed.end_year ?? null;
            if (endYear && startYear && endYear < startYear) {
                await this.sendPrompt(chatId, session, botTexts.educationEndYearInvalid[lang], {
                    replyMarkup: keyboards.educationEndYearKeyboard(lang)
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
            const yearsLabel = this.formatEducationYears(educationEntry);
            await this.sendPrompt(chatId, session, `${botTexts.skillAdded[lang]} ${institution}${field ? ` — ${field}` : ''}${yearsLabel ? ` (${yearsLabel})` : ''}\n${botTexts.entryContinueHint[lang]}`, {
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
            const existingTitle = String(session.data?.temp_job?.title || '').trim();
            if (existingTitle.length >= 3) {
                const fields = await this.getOsonishFields(existingTitle);
                const matches = fields.length ? this.pickFieldMatches(fields, existingTitle, 300) : [];
                await this.setSession(session, {
                    state: BotState.SELECTING_FIELD,
                    data: {
                        ...session.data,
                        field_context: 'job',
                        field_query: existingTitle,
                        field_options: matches,
                        field_page: 0
                    }
                });
                const replyMarkup = matches.length
                    ? keyboards.fieldsKeyboard(lang, matches, 'job_title', 0, 10)
                    : keyboards.backKeyboard(lang, 'job_title');
                const promptText = matches.length
                    ? this.buildFieldPromptText(lang, existingTitle, matches.length, 0, 10)
                    : this.buildFieldNoResultText(lang, existingTitle);
                await this.sendPrompt(chatId, session, promptText, { replyMarkup });
                return;
            }

            await this.setSession(session, { state: BotState.POSTING_JOB_TITLE });
            await this.sendPrompt(chatId, session, botTexts.postJobTitle[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_menu') });
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
        await this.setSession(session, {
            state: BotState.REQUESTING_LOCATION,
            data: { ...updatedData, location_intent: 'resume_final' }
        });
        await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
            replyMarkup: keyboards.locationRequestKeyboard(lang, { showBack: true, showCancel: false })
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
        await this.setSession(session, {
            state: BotState.SELECTING_EDUCATION,
            data: { ...updatedData, workplace_stage: null }
        });
        await this.sendPrompt(chatId, session, botTexts.askEducation[lang], {
            replyMarkup: keyboards.educationKeyboard(lang)
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
            state: BotState.SELECTING_SPECIAL,
            data: { ...updatedData }
        });
        await this.sendPrompt(chatId, session, botTexts.askSpecialCriteria[lang], {
            replyMarkup: keyboards.specialCriteriaKeyboard(lang, updatedData.resume?.special || [], 'education')
        });
    }

    private async handleWorkEndCurrent(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const pending = session.data?.workplace_pending || {};
        const startYear = Number(pending.start_year);
        const company = pending.company || '';
        const position = pending.position || '';
        const previous = Array.isArray(session.data?.resume?.experience_details) ? session.data?.resume?.experience_details : [];
        const experienceEntry = {
            company,
            position,
            start_year: startYear || undefined,
            end_year: undefined,
            is_current: true
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
            `${botTexts.skillAdded[lang]} ${company}${position ? ` — ${position}` : ''}${yearsLabel ? ` (${yearsLabel})` : ''}\n${botTexts.entryContinueHint[lang]}`,
            { parseMode: 'HTML', replyMarkup: keyboards.workplaceContinueKeyboard(lang) }
        );
    }

    private async handleEducationEndCurrent(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const pending = session.data?.education_pending || {};
        const startYear = Number(pending.start_year);
        const institution = pending.institution || '';
        const field = pending.field || '';
        const previous = Array.isArray(session.data?.resume?.education) ? session.data?.resume?.education : [];
        const educationEntry = {
            institution,
            field,
            start_year: startYear || undefined,
            end_year: undefined,
            is_current: true
        };
        const updatedList = [...previous, educationEntry];
        const updatedData = {
            ...session.data,
            resume: { ...session.data?.resume, education: updatedList },
            education_pending: null
        };
        await this.setSession(session, { data: updatedData });
        if (session.data?.edit_mode && session.data?.active_resume_id) {
            await this.saveResume(session, { ...session.data?.resume, education: updatedList }, session.data.active_resume_id);
        }
        const yearsLabel = this.formatEducationYears(educationEntry);
        await this.sendPrompt(
            chatId,
            session,
            `${botTexts.skillAdded[lang]} ${institution}${field ? ` — ${field}` : ''}${yearsLabel ? ` (${yearsLabel})` : ''}\n${botTexts.entryContinueHint[lang]}`,
            { parseMode: 'HTML', replyMarkup: keyboards.educationContinueKeyboard(lang) }
        );
    }

    private async startResumeFlow(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
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
            state: BotState.ENTERING_NAME,
            data: updatedData
        });
        await this.setFlowCancelKeyboard(chatId, session, 'back');
        await this.sendPrompt(chatId, session, botTexts.askName[lang], {
            replyMarkup: keyboards.backKeyboard(lang, 'main_menu')
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
            await this.sendPrompt(chatId, session, botTexts.askDistrictWithCounts[lang], {
                replyMarkup: keyboards.districtKeyboard(sortedDistricts, lang, 0, districtCounts, 'resume_view', true)
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
        const normalizedEducation = this.normalizeEducationLevelKey(resume?.education_level);
        if (!normalizedEducation) {
            resume = { ...resume, education_level: null };
        } else {
            resume = { ...resume, education_level: normalizedEducation };
        }
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
            const normalizedEdu = this.normalizeEducationLevelKey(resume.education_level);
            if (normalizedEdu && normalizedEdu !== 'any') {
                const eduMap: Record<string, { uz: string; ru: string }> = {
                    secondary: { uz: "O'rta", ru: 'Среднее' },
                    vocational: { uz: "O'rta maxsus", ru: 'Среднее спец.' },
                    incomplete_higher: { uz: 'Oliy (tugallanmagan)', ru: 'Неоконченное высшее' },
                    higher: { uz: 'Oliy', ru: 'Высшее' },
                    master: { uz: 'Magistr', ru: 'Магистр' },
                    phd: { uz: 'PhD', ru: 'PhD' }
                };
                const eduLabel = eduMap[normalizedEdu]?.[lang] || String(resume.education_level);
                const normalizedLabel = String(eduLabel || '').trim().toLowerCase();
                if (!['done', 'undefined', 'null'].includes(normalizedLabel)) {
                    lines.push(`🎓 | ${lang === 'uz' ? "Ma'lumot" : 'Образование'}: ${eduLabel}`);
                }
            }
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

        const expDetails = this.sanitizeExperienceDetails(resume.experience_details);
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

        const eduDetails = this.sanitizeEducationEntries(resume.education);
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
        if (String(resumeData.education_level || '').toLowerCase().trim() === 'done') {
            resumeData.education_level = null;
        }
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
        await this.offerHighMatchJobsForResume(chatId, session, resume, false);
    }

    private async saveMatchRecommendations(
        direction: 'seeker_to_job' | 'employer_to_resume',
        sourceId: string | null | undefined,
        entries: Array<{ targetId: string | null | undefined; score: number; strictScore?: number; aiScore?: number; reason?: string | null }>
    ): Promise<void> {
        const normalizedSourceId = String(sourceId || '').trim();
        if (!normalizedSourceId) return;
        if (!Array.isArray(entries) || entries.length === 0) return;

        const rows = entries
            .map(entry => {
                const target = String(entry.targetId || '').trim();
                if (!target) return null;
                const score = Math.max(0, Math.min(100, Math.round(Number(entry.score) || 0)));
                if (score < 90) return null;
                const strictScore = typeof entry.strictScore === 'number'
                    ? Math.max(0, Math.min(100, Math.round(entry.strictScore)))
                    : score;
                const aiScore = typeof entry.aiScore === 'number'
                    ? Math.max(0, Math.min(100, Math.round(entry.aiScore)))
                    : null;
                return {
                    direction,
                    source_id: normalizedSourceId,
                    target_id: target,
                    score,
                    strict_score: strictScore,
                    ai_score: aiScore,
                    reason: entry.reason || null,
                    is_active: true
                };
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row));

        if (!rows.length) return;

        try {
            const { error } = await this.supabase
                .from('telegram_match_recommendations')
                .upsert(rows, { onConflict: 'direction,source_id,target_id' });
            if (error) {
                // Migration might not be applied in every environment.
                if (!String(error.message || '').toLowerCase().includes('does not exist')) {
                    console.warn('[BOT] saveMatchRecommendations error:', error);
                }
            }
        } catch (err) {
            console.warn('[BOT] saveMatchRecommendations failed:', err);
        }
    }

    private async applyAiRerankToMatchedJobs(
        resume: any,
        matched: MatchedJob[],
        lang: BotLang
    ): Promise<MatchedJob[]> {
        if (!Array.isArray(matched) || matched.length === 0) return matched;
        const aiMap = await rerankJobsForResumeAI(resume, matched as any[], lang);
        if (!aiMap.size) return matched;

        const withAi = matched.map(job => {
            const ai = aiMap.get(String(job.id));
            const strict = Number(job.matchScore || 0);
            if (!ai) {
                return { ...job, aiScore: null, strictScore: strict, matchScore: strict } as MatchedJob & any;
            }
            const combined = Math.round((strict * 0.75) + (ai.aiScore * 0.25));
            return {
                ...job,
                aiScore: ai.aiScore,
                strictScore: strict,
                matchScore: Math.max(0, Math.min(100, combined)),
                explanation: {
                    uz: ai.reason || job.explanation?.uz || '',
                    ru: ai.reason || job.explanation?.ru || ''
                }
            } as MatchedJob & any;
        });

        return withAi.sort((a: any, b: any) => {
            const aLoc = a.matchCriteria?.location ? 1 : 0;
            const bLoc = b.matchCriteria?.location ? 1 : 0;
            if (bLoc !== aLoc) return bLoc - aLoc;
            const aTitle = Number(a.titleRelevance || 0);
            const bTitle = Number(b.titleRelevance || 0);
            if (bTitle !== aTitle) return bTitle - aTitle;
            return Number(b.matchScore || 0) - Number(a.matchScore || 0);
        });
    }

    private async applyAiRerankToResumeMatches(
        job: any,
        matches: Array<{ resume: any; score: number }>,
        lang: BotLang
    ): Promise<Array<{ resume: any; score: number; strictScore: number; aiScore?: number }>> {
        if (!Array.isArray(matches) || matches.length === 0) return [];
        const aiMap = await rerankResumesForJobAI(job, matches.map(item => item.resume), lang);

        const combined = matches.map(item => {
            const strictScore = Math.max(0, Math.min(100, Math.round(Number(item.score) || 0)));
            const ai = aiMap.get(String(item.resume?.id || ''));
            if (!ai) return { ...item, score: strictScore, strictScore, aiScore: undefined };
            const score = Math.round((strictScore * 0.75) + (ai.aiScore * 0.25));
            return { ...item, score: Math.max(0, Math.min(100, score)), strictScore, aiScore: ai.aiScore };
        });

        return combined.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    }

    private async offerHighMatchJobsForResume(chatId: number, session: TelegramSession, resume: any, notify: boolean = true): Promise<void> {
        const lang = session.lang;
        const districtId = this.toCoordinate(resume?.district_id);
        const regionId = this.toCoordinate(resume?.region_id);

        const districtJobs = districtId !== null ? await this.fetchActiveJobs(600, { districtId }) : [];
        const regionJobs = regionId !== null ? await this.fetchActiveJobs(900, { regionId }) : [];
        const broadJobs = await this.fetchActiveJobs(1200);

        const localPool = districtJobs.length ? districtJobs : (regionJobs.length ? regionJobs : broadJobs);
        if (!localPool.length) return;

        const desiredTitle = resume?.field_title || resume?.title || resume?.desired_position || null;
        let scoped = localPool;
        if (desiredTitle) {
            const strictTitle = !this.isGenericTitle(desiredTitle);
            const preferred = this.filterJobsByDesiredTitle(localPool, desiredTitle, strictTitle);
            if (preferred.length) {
                scoped = preferred;
            } else if (strictTitle) {
                scoped = [];
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
            education_level: resume.education_level,
            title: desiredTitle
        };

        let matched = matchAndSortJobs(profile, scoped);
        matched = await this.applyAiRerankToMatchedJobs(resume, matched, lang);
        matched = matched.filter(job => typeof job.matchScore === 'number' && job.matchScore >= 90);

        if (!matched.length) return;

        await this.saveMatchRecommendations(
            'seeker_to_job',
            String(resume?.id || session.data?.active_resume_id || ''),
            matched.map(job => ({
                targetId: String(job.id || ''),
                score: Number(job.matchScore || 0),
                strictScore: Number((job as any).strictScore ?? job.matchScore ?? 0),
                aiScore: Number((job as any).aiScore ?? 0),
                reason: job?.explanation?.uz || job?.explanation?.ru || null
            }))
        );

        if (!notify) return;

        await this.setSession(session, {
            data: { ...session.data, auto_job_list: matched }
        });

        await sendMessage(chatId,
            lang === 'uz'
                ? `🔔 Mos vakansiyalar topildi (90%+).`
                : `🔔 Найдены подходящие вакансии (90%+).`,
            { replyMarkup: keyboards.autoMatchJobsKeyboard(lang) }
        );
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
        if (mode === 'region') {
            const regionJobs = Array.isArray(session.data?.region_job_list) ? session.data.region_job_list : [];
            if (regionJobs.length) {
                const updatedData = {
                    ...session.data,
                    job_list: regionJobs,
                    currentJobIndex: 0,
                    job_source: 'resume',
                    clean_inputs: false,
                    region_job_list: []
                };
                await this.setSession(session, { state: BotState.BROWSING_JOBS, data: updatedData });
                await this.showJob(chatId, session, 0);
                return;
            }
        }

        if (mode === 'related') {
            const relatedJobs = Array.isArray(session.data?.related_job_list) ? session.data.related_job_list : [];
            if (relatedJobs.length) {
                const updatedData = {
                    ...session.data,
                    job_list: relatedJobs,
                    currentJobIndex: 0,
                    job_source: 'resume',
                    clean_inputs: false,
                    related_job_list: []
                };
                await this.setSession(session, { state: BotState.BROWSING_JOBS, data: updatedData });
                await this.showJob(chatId, session, 0);
                return;
            }
        }

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

        if (districtId !== null && !hasDistrict && hasRegion) {
            const pendingData = {
                ...session.data,
                region_job_list: regionNormalized,
                job_source: 'resume',
                active_resume_id: resume.id,
                clean_inputs: false
            };
            await this.setSession(session, { state: BotState.BROWSING_JOBS, data: pendingData });
            await this.sendPrompt(chatId, session, botTexts.noDistrictJobs[lang], {
                replyMarkup: keyboards.regionFallbackKeyboard(lang)
            });
            return;
        }
        const desiredTitle = resume?.field_title || resume?.title || resume?.desired_position || null;
        const titleTokens = this.tokenizeTitle(desiredTitle);
        const hasTitleTokens = titleTokens.length > 0;
        const strictTitleSearch = hasTitleTokens && !this.isGenericTitle(desiredTitle);

        let scopedByTitle = localPool;
        if (hasTitleTokens) {
            const strictTitle = !this.isGenericTitle(desiredTitle);
            const preferred = this.filterJobsByDesiredTitle(localPool, desiredTitle, strictTitle);
            if (preferred.length >= 5) {
                scopedByTitle = preferred;
            } else if (strictTitle && preferred.length) {
                scopedByTitle = preferred;
            } else if (strictTitle && preferred.length === 0) {
                scopedByTitle = [];
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
            education_level: resume.education_level,
            title: desiredTitle
        };

        let matched = matchAndSortJobs(profile, scopedByTitle);
        const seekerGeo = await this.getSeekerGeo(session.user_id);

        if (!matched.length && !strictTitleSearch) {
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
            if (seekerGeo) {
                fallbackPool = this.sortJobsByDistance(fallbackPool, seekerGeo.latitude, seekerGeo.longitude);
            } else {
                fallbackPool = this.sortJobsByRegionProximity(fallbackPool, regionId);
            }
            matched = matchAndSortJobs(profile, fallbackPool);

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
                matched = matchAndSortJobs(profile, broadPool);
            }
        }

        if (!matched.length && districtId !== null && regionNormalized.length > 0) {
            let regionFallback = regionNormalized;
            if (hasTitleTokens) {
                const preferredRegion = this.filterJobsByDesiredTitle(regionFallback, desiredTitle, false);
                if (preferredRegion.length) regionFallback = preferredRegion;
            }
            if (seekerGeo) {
                regionFallback = this.sortJobsByDistance(regionFallback, seekerGeo.latitude, seekerGeo.longitude);
            } else {
                regionFallback = this.sortJobsByRegionProximity(regionFallback, regionId);
            }
            const regionMatched = matchAndSortJobs(profile, regionFallback);
            if (regionMatched.length > 0) {
                const aiRegionMatched = await this.applyAiRerankToMatchedJobs(resume, regionMatched, lang);
                const pendingData = {
                    ...session.data,
                    region_job_list: aiRegionMatched,
                    job_source: 'resume',
                    active_resume_id: resume.id,
                    clean_inputs: false
                };
                await this.setSession(session, { state: BotState.BROWSING_JOBS, data: pendingData });
                await this.sendPrompt(chatId, session, botTexts.noDistrictJobs[lang], {
                    replyMarkup: keyboards.regionFallbackKeyboard(lang)
                });
                return;
            }
        }

        if (matched.length > 0) {
            matched = await this.applyAiRerankToMatchedJobs(resume, matched, lang);
        }

        if (!matched.length) {
            let relatedPool = broadNormalized;
            if (hasTitleTokens) {
                const preferredRelated = this.filterJobsByDesiredTitle(broadNormalized, desiredTitle, false);
                if (preferredRelated.length) relatedPool = preferredRelated;
            }
            if (seekerGeo) {
                relatedPool = this.sortJobsByDistance(relatedPool, seekerGeo.latitude, seekerGeo.longitude);
            } else {
                relatedPool = this.sortJobsByRegionProximity(relatedPool, regionId);
            }

            const relaxedProfile = { ...profile, title: 'Mutaxassis' };
            const relatedRanked = relatedPool
                .map(job => {
                    const base = calculateMatchScore(relaxedProfile as any, job as any);
                    const titleRelevance = this.getTitleOverlapScore(desiredTitle, this.extractJobTitle(job));
                    const blended = Math.max(1, Math.min(100, Math.round((base.matchScore * 0.75) + (titleRelevance * 25))));
                    return {
                        ...job,
                        matchScore: blended,
                        matchCriteria: base.matchCriteria,
                        explanation: base.explanation,
                        titleRelevance
                    };
                })
                .filter(item => item.matchScore >= 60 || item.titleRelevance >= 0.2)
                .sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0))
                .slice(0, 30);

            if (relatedRanked.length > 0) {
                const updatedData = {
                    ...session.data,
                    related_job_list: relatedRanked,
                    active_resume_id: resume.id,
                    clean_inputs: false
                };
                await this.setSession(session, {
                    state: BotState.BROWSING_JOBS,
                    data: updatedData
                });
                await this.sendPrompt(chatId, session, botTexts.noJobsByProfession[lang], {
                    replyMarkup: keyboards.relatedJobsKeyboard(lang)
                });
                return;
            }

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
            clean_inputs: false,
            related_job_list: []
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
        const profileTitle = resume?.field_title || resume?.title || resume?.desired_position || null;
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
            category_ids: profileCategoryIds,
            title: profileTitle
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
            if (hasCoords) {
                fallbackPool = this.sortJobsByDistance(fallbackPool, geo.latitude!, geo.longitude!);
            } else {
                fallbackPool = this.sortJobsByRegionProximity(fallbackPool, regionId);
            }
            matched = matchAndSortJobs(geoProfile, fallbackPool);

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
                matched = matchAndSortJobs(geoProfile, broadPool);
            }
        }

        if (!matched.length) {
            await this.clearLastJobArtifacts(chatId, session);
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const updatedData = { ...session.data, job_list: matched, currentJobIndex: 0, job_source: 'geo', clean_inputs: false, related_job_list: [] };
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

    private getTitleOverlapScore(primary: any, secondary: any): number {
        const primaryTokens = this.tokenizeTitle(primary);
        const secondaryTokens = this.tokenizeTitle(secondary);
        if (!primaryTokens.length || !secondaryTokens.length) return 0;
        const a = new Set(primaryTokens);
        const b = new Set(secondaryTokens);
        let shared = 0;
        for (const token of Array.from(a)) {
            if (b.has(token)) shared += 1;
        }
        if (!shared) return 0;
        const overlap = shared / Math.max(a.size, b.size);
        const contains = String(primary || '').toLowerCase().includes(String(secondary || '').toLowerCase())
            || String(secondary || '').toLowerCase().includes(String(primary || '').toLowerCase());
        return Math.max(0, Math.min(1, overlap + (contains ? 0.2 : 0)));
    }

    private extractJobTitle(job: any): string {
        return String(
            job?.title_uz
            || job?.title_ru
            || job?.title
            || job?.field_title
            || job?.raw_source_json?.position_name
            || job?.raw_source_json?.title
            || ''
        ).trim();
    }

    private filterJobsByDesiredTitle(jobs: any[], desiredTitle: string | null | undefined, strict: boolean = false): any[] {
        const titleTokens = this.tokenizeTitle(desiredTitle);
        if (!titleTokens.length) return jobs;

        const desiredText = titleTokens.join(' ');
        const filtered = jobs.filter(job => {
            const jobTitleParts = [
                job?.title_uz,
                job?.title_ru,
                job?.title,
                job?.field_title,
                job?.raw_source_json?.title,
                job?.raw_source_json?.position,
                job?.raw_source_json?.position_name,
                job?.raw_source_json?.job_title
            ].filter(Boolean);
            const jobTokens = this.tokenizeTitle(jobTitleParts.join(' '));
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
        if (['any', 'ahamiyatsiz', 'не важно', 'любой', 'done'].includes(raw)) return 0;
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

    private normalizeEducationLevelKey(value: any): string | null {
        if (value === null || value === undefined) return null;
        const raw = String(value)
            .toLowerCase()
            .replace(/[\u2018\u2019\u02BC\u02BB`']/g, '')
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!raw || ['done', 'undefined', 'null'].includes(raw) || raw.includes('done')) return null;
        if (['any', 'ahamiyatsiz', 'не важно', 'любой'].includes(raw)) return 'any';
        if (raw.includes('magistr') || raw.includes('master') || raw.includes('магистр')) return 'master';
        if (raw.includes('oliy') || raw.includes('higher') || raw.includes('высш')) return 'higher';
        if (raw.includes('incomplete') || raw.includes('tugallanmagan') || raw.includes('неокончен')) return 'incomplete_higher';
        const hasOrta = raw.includes('orta') || raw.includes('o rta');
        const hasMaxsus = raw.includes('maxsus') || raw.includes('специаль') || raw.includes('spets');
        if (hasOrta && hasMaxsus) return 'vocational';
        if (raw.includes('vocational') || raw.includes('средне специаль')) return 'vocational';
        if (hasOrta || raw.includes('secondary') || raw.includes('средн')) return 'secondary';
        return null;
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
        const matches = raw.match(/\b(19\d{2}|20\d{2})\b/g) || [];
        // Accept exactly one year token to avoid accidental ranges like 2020-2027.
        if (matches.length !== 1) return null;
        const year = Number(matches[0]);
        const nowYear = new Date().getFullYear();
        if (!Number.isFinite(year) || year < 1950 || year > nowYear) return null;
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

    private formatEducationYears(entry: { start_year?: number; end_year?: number; is_current?: boolean } | null | undefined): string | null {
        if (!entry) return null;
        if (entry.start_year && entry.end_year) return `${entry.start_year}-${entry.end_year}`;
        if (entry.start_year && entry.is_current) return `${entry.start_year}-hozir`;
        if (entry.start_year && !entry.end_year) return `${entry.start_year}+`;
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
            if (Number.isFinite(min) && min >= 14 && min <= 80) return { min, max: null };
        }

        const rangeMatch = normalized.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/);
        if (rangeMatch) {
            const min = Number(rangeMatch[1]);
            const max = Number(rangeMatch[2]);
            if (
                Number.isFinite(min)
                && Number.isFinite(max)
                && min >= 14
                && max <= 80
                && max >= min
            ) {
                return { min, max };
            }
        }

        const singleMatch = normalized.match(/(\d{1,2})/);
        if (singleMatch) {
            const min = Number(singleMatch[1]);
            if (Number.isFinite(min) && min >= 14 && min <= 80) return { min, max: null };
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
        } else if (action === 'editresume') {
            const resumeId = session.data?.active_resume_id;
            if (resumeId) {
                await this.showResumeById(chatId, resumeId, session);
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
            const jobs = await this.getEmployerJobs(session, 30);
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
            const jobs = await this.getEmployerJobs(session, 20);
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

    private async getEmployerJobs(session: TelegramSession, limit: number = 30): Promise<Array<{ id: string; title_uz?: string; title_ru?: string; title?: string | null; employer_id?: string | null; user_id?: string | null; created_by?: string | null; contact_phone?: string | null; company_name?: string | null; created_at?: string | null }>> {
        const { data: employer } = await this.supabase
            .from('employer_profiles')
            .select('id, company_name, phone')
            .eq('user_id', session.user_id)
            .maybeSingle();
        const employerId = employer?.id || null;
        const userId = session.user_id || null;
        const phone = employer?.phone || session.phone || null;
        const normalizedPhone = this.normalizePhoneValue(phone);
        const companyName = employer?.company_name || null;
        const normalizedCompanyName = String(companyName || '').trim().toLowerCase();

        const selectVariants = [
            'id, title_uz, title_ru, title, employer_id, user_id, created_by, contact_phone, company_name, created_at',
            'id, title_uz, title, employer_id, user_id, created_by, contact_phone, company_name, created_at',
            'id, title_ru, title, employer_id, user_id, created_by, contact_phone, company_name, created_at',
            'id, title, employer_id, user_id, created_by, contact_phone, company_name, created_at',
            'id, title, employer_id, user_id, created_by, created_at'
        ];
        const jobsMap = new Map<string, any>();
        const mergeRows = (rows: any[] | null | undefined) => {
            for (const row of rows || []) {
                if (!row?.id) continue;
                const key = String(row.id);
                if (!jobsMap.has(key)) {
                    jobsMap.set(key, row);
                }
            }
        };
        const runQuery = async (label: string, queryBuilder: (selectClause: string) => PromiseLike<{ data: any[] | null; error: any }>) => {
            let lastError: any = null;
            for (const selectClause of selectVariants) {
                const result: any = await queryBuilder(selectClause);
                if (!result?.error) {
                    mergeRows(result?.data || []);
                    return;
                }
                lastError = result.error;
                const msg = String(lastError?.message || '').toLowerCase();
                if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column')) {
                    continue;
                }
                break;
            }
            if (lastError) {
                console.error(`[BOT] getEmployerJobs ${label} error:`, lastError);
            }
        };

        if (userId) {
            await runQuery(
                'user_id',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 3, 50))
            );
        }

        if (userId) {
            await runQuery(
                'created_by',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .eq('created_by', userId)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 3, 50))
            );
        }

        if (employerId) {
            await runQuery(
                'employer_id',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .eq('employer_id', employerId)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 3, 50))
            );
        }

        if (phone) {
            await runQuery(
                'phone_exact',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .eq('contact_phone', phone)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 2, 40))
            );
        }

        if (companyName) {
            await runQuery(
                'company_ilike',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .ilike('company_name', `%${companyName}%`)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 2, 40))
            );
        }

        let jobs = Array.from(jobsMap.values());

        // Legacy catch-all: broaden selection and filter in memory by creator/phone/company.
        if (!jobs.length) {
            let broadRows: any[] = [];
            for (const selectClause of selectVariants) {
                const broad = await this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 30, 800));
                if (!broad.error) {
                    broadRows = broad.data || [];
                    break;
                }
                const msg = String(broad.error?.message || '').toLowerCase();
                if (!(msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column'))) {
                    break;
                }
            }
            const filtered = broadRows.filter((job: any) => {
                const byEmployer = employerId && String(job?.employer_id || '') === String(employerId);
                const byCreator = userId && String(job?.created_by || '') === String(userId);
                const byPhone = normalizedPhone && this.normalizePhoneValue(job?.contact_phone) === normalizedPhone;
                const byCompany = normalizedCompanyName
                    && String(job?.company_name || '').trim().toLowerCase().includes(normalizedCompanyName);
                return Boolean(byEmployer || byCreator || byPhone || byCompany);
            });
            jobs = filtered;
        }

        jobs = jobs
            .sort((a: any, b: any) => {
                const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            })
            .slice(0, limit);

        const updatePayload: Record<string, any> = {};
        if (employerId) updatePayload.employer_id = employerId;
        if (userId) updatePayload.created_by = userId;
        if (jobs.length && Object.keys(updatePayload).length > 0) {
            const idsToUpdate = jobs
                .filter(job => (employerId && !job.employer_id) || (userId && !job.created_by))
                .map(job => job.id);
            if (idsToUpdate.length) {
                try {
                    await this.supabase.from('jobs').update(updatePayload).in('id', idsToUpdate);
                } catch {
                    // ignore
                }
            }
        }

        return jobs;
    }

    private async showEmployerApplications(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const employerJobs = await this.getEmployerJobs(session, 200);
        const employerJobIds = new Set((employerJobs || []).map(job => String(job.id)));

        const { data: apps, error } = await this.supabase
            .from('job_applications')
            .select('id, created_at, status, full_name, resume_id, user_id, applicant_id, job:jobs(id,title,employer_id,created_by)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Applications fetch error:', error);
            await sendMessage(chatId, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const filtered = (apps || []).filter((app: any) => {
            const jobRow = Array.isArray(app?.job) ? app.job[0] : app?.job;
            if (!jobRow) return false;
            if (employerJobIds.has(String(jobRow.id))) return true;
            if (session.user_id && String(jobRow.created_by || '') === String(session.user_id)) return true;
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
                    ? (jobRow?.title || 'Vakansiya')
                    : (jobRow?.title || 'Вакансия')
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
            .select('id, resume_id, user_id, applicant_id, full_name, phone, job:jobs(id,title)')
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
            ? (jobRow?.title || 'Vakansiya')
            : (jobRow?.title || 'Вакансия');

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

        let employerProfile = employer;
        if (!employerProfile?.id && session.user_id) {
            const fallbackCompany = jobData?.company_name || 'Kompaniya';
            const { data: createdEmployer, error: createError } = await this.supabase
                .from('employer_profiles')
                .upsert({
                    user_id: session.user_id,
                    company_name: fallbackCompany,
                    phone: session.phone || null,
                    director_name: jobData?.hr_name || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                .select('id, company_name, director_name, phone, region_id, district_id, address, default_address')
                .single();
            if (!createError && createdEmployer) {
                employerProfile = createdEmployer;
            }
        }

        if (!employerProfile?.id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const employerId = employerProfile.id;
        const title = jobData?.title || jobData?.field_title || (lang === 'uz' ? 'Vakansiya' : 'Вакансия');
        const aiSections = jobData?.ai_sections || null;
        const description = jobData?.description || this.buildJobDescriptionFromSections(aiSections) || title;
        const companyName = jobData?.company_name || employerProfile.company_name || 'Kompaniya';
        const address = jobData?.address || employerProfile.address || employerProfile.default_address || null;

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
            description_text: description,
            working_days: jobData?.working_days || rawMeta?.working_days || null,
            working_hours: jobData?.working_hours || rawMeta?.working_hours || null,
            talablar: aiSections?.talablar || [],
            ish_vazifalari: aiSections?.ish_vazifalari || [],
            qulayliklar: aiSections?.qulayliklar || (benefitsText ? [benefitsText] : []),
            tillar: languages
        };

        const normalizedEmployment = jobData?.employment_type || 'full_time';
        const normalizedExperience = jobData?.experience || 'no_experience';
        const normalizedEducation = jobData?.education_level || 'any';
        const normalizedGender = jobData?.gender || 'any';

        const payload: Record<string, any> = {
            employer_id: employerId,
            created_by: session.user_id,
            title,
            title_uz: title,
            title_ru: title,
            description,
            description_uz: description,
            description_ru: description,
            company_name: companyName,
            category_id: jobData?.category_id || null,
            field_id: jobData?.field_id || null,
            field_title: jobData?.field_title || null,
            region_id: jobData?.region_id || employerProfile.region_id || null,
            district_id: jobData?.district_id || employerProfile.district_id || null,
            region_name: jobData?.region_name || null,
            district_name: jobData?.district_name || null,
            address,
            salary_min: Number.isFinite(jobData?.salary_min) ? jobData?.salary_min : (jobData?.salary_min ? Number(jobData.salary_min) : null),
            salary_max: Number.isFinite(jobData?.salary_max) ? jobData?.salary_max : (jobData?.salary_max ? Number(jobData.salary_max) : null),
            contact_phone: jobData?.contact_phone || employerProfile.phone || session.phone || null,
            hr_name: jobData?.hr_name || employerProfile.director_name || null,
            gender: normalizedGender,
            education_level: normalizedEducation,
            experience: normalizedExperience,
            age_min: jobData?.age_min || null,
            age_max: jobData?.age_max || null,
            work_mode: jobData?.work_mode || null,
            employment_type: normalizedEmployment,
            working_days: jobData?.working_days || null,
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

        let insertPayload: Record<string, any> = { ...payload };
        let createdJob: any = null;
        let insertError: any = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const result = await this.supabase
                .from('jobs')
                .insert(insertPayload)
                .select('*')
                .single();
            createdJob = result.data || null;
            insertError = result.error || null;
            if (!insertError) break;
            const missingColumn = this.extractMissingColumn(insertError);
            if (missingColumn && Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)) {
                delete insertPayload[missingColumn];
                continue;
            }
            break;
        }

        if (insertError) {
            console.error('Job publish error:', insertError);
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
        let selectClause = 'id, full_name, title, region_id, district_id, category_id, category_ids, expected_salary_min, experience, education_level, gender, birth_date';
        let resumes: any[] | null = null;
        let error: any = null;
        let useStatusFilter = true;

        for (let attempt = 0; attempt < 5; attempt += 1) {
            let query = this.supabase
                .from('resumes')
                .select(selectClause)
                .order('updated_at', { ascending: false })
                .limit(50);
            if (useStatusFilter) {
                query = query.eq('status', 'active');
            }
            const primary = await query;
            resumes = primary.data || null;
            error = primary.error || null;
            if (!error) break;
            const missingColumn = this.extractMissingColumn(error);
            if (missingColumn) {
                const nextSelect = this.stripColumnFromSelect(selectClause, missingColumn);
                if (nextSelect === selectClause) break;
                selectClause = nextSelect;
                continue;
            }
            if (String(error.message || '').includes('experience_level')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'experience_level');
                continue;
            }
            if (String(error.message || '').includes('education_level')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'education_level');
                continue;
            }
            if (String(error.message || '').includes('experience')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'experience');
                continue;
            }
            if (String(error.message || '').includes('category_ids')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'category_ids');
                continue;
            }
            if (String(error.message || '').toLowerCase().includes('status')) {
                useStatusFilter = false;
                continue;
            }
            break;
        }

        if (error) {
            console.error('Resume fetch error:', error);
            return;
        }

        const jobTitle = job?.field_title || job?.title_uz || job?.title_ru || job?.title || '';
        const requireTitleMatch = !this.isGenericTitle(jobTitle);

        const scored = (resumes || []).map(resume => {
            const match = calculateMatchScore({
                region_id: resume.region_id,
                district_id: resume.district_id,
                category_id: resume.category_id,
                category_ids: resume.category_ids,
                expected_salary_min: resume.expected_salary_min,
                experience: resume.experience ?? resume.experience_level ?? null,
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
                const resumeTitle = item.resume?.field_title || item.resume?.title || '';
                const resumeTokens = this.tokenizeTitle(resumeTitle);
                if (!resumeTokens.length) return false;
                return this.hasTitleOverlap(jobTitle, resumeTitle);
            });

        const aiRanked = await this.applyAiRerankToResumeMatches(job, filtered, lang);
        const top = aiRanked
            .filter(item => Number(item.score || 0) >= 90)
            .slice(0, 5);

        if (!top.length) {
            const relatedCandidates = (resumes || [])
                .map(resume => {
                    const base = calculateMatchScore({
                        region_id: resume.region_id,
                        district_id: resume.district_id,
                        category_id: resume.category_id,
                        category_ids: resume.category_ids,
                        expected_salary_min: resume.expected_salary_min,
                        experience: resume.experience ?? resume.experience_level ?? null,
                        gender: resume.gender,
                        birth_date: resume.birth_date,
                        education_level: resume.education_level,
                        title: null
                    }, job);
                    const resumeTitle = resume?.field_title || resume?.title || '';
                    const titleRel = this.getTitleOverlapScore(jobTitle, resumeTitle);
                    const score = Math.max(1, Math.min(100, Math.round((base.matchScore * 0.75) + (titleRel * 25))));
                    return { resume, score, strictScore: base.matchScore, titleRel };
                })
                .filter(item => Number(item.score || 0) >= 60 || Number(item.titleRel || 0) >= 0.2)
                .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
                .slice(0, 10);

            if (!relatedCandidates.length) {
                await sendMessage(chatId, lang === 'uz' ? "Mos rezyumelar topilmadi." : 'Подходящие резюме не найдены.');
                return;
            }

            const relatedRanked = await this.applyAiRerankToResumeMatches(job, relatedCandidates, lang);
            const relatedTop = relatedRanked
                .filter(item => Number(item.score || 0) >= 60)
                .slice(0, 5);

            if (!relatedTop.length) {
                await sendMessage(chatId, lang === 'uz' ? "Mos rezyumelar topilmadi." : 'Подходящие резюме не найдены.');
                return;
            }

            await this.setSession(session, {
                data: {
                    ...session.data,
                    related_resume_list: relatedTop.map(item => ({
                        id: item.resume.id,
                        full_name: item.resume.full_name,
                        title: item.resume.title,
                        score: Number(item.score || 0)
                    }))
                }
            });
            await this.sendPrompt(chatId, session, botTexts.noResumesByProfession[lang], {
                replyMarkup: keyboards.relatedResumesKeyboard(lang)
            });
            return;
        }

        await this.saveMatchRecommendations(
            'employer_to_resume',
            String(job?.id || ''),
            top.map(item => ({
                targetId: String(item.resume?.id || ''),
                score: Number(item.score || 0),
                strictScore: Number(item.strictScore || item.score || 0),
                aiScore: Number(item.aiScore || 0),
                reason: lang === 'uz' ? 'Lavozim va mezonlar mosligi' : 'Совпадение по должности и критериям'
            }))
        );

        await this.setSession(session, {
            data: { ...session.data, related_resume_list: [] }
        });

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
