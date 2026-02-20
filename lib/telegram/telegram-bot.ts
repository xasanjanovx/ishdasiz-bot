/**
 * Telegram Bot - Complete Resume Creation Flow
 * Handles all incoming updates and state transitions
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendMessage, editMessage, answerCallbackQuery, isUserSubscribed, sendLocation, deleteMessage, callTelegramAPI } from './telegram-api';
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
import { callDeepSeekText, extractVacancyData } from '../ai/deepseek';
import { rerankJobsForResumeAI, rerankResumesForJobAI } from '../ai/job-recommender';
import { checkForAbuse } from '../ai/moderation';
import { REGION_COORDINATES } from '../constants';
import { buildJobChannelMessage, buildResumeChannelMessage, getChannelByRegionSlug, hashMessage } from './channel-sync';
import bcrypt from 'bcryptjs';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

type StickerTone = 'loading' | 'announce' | 'success' | 'warning' | 'error';

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
    POSTING_JOB_SPECIAL = 'posting_job_special',
    POSTING_JOB_LANGUAGES = 'posting_job_languages',
    POSTING_JOB_BENEFITS = 'posting_job_benefits',
    POSTING_JOB_HR_NAME = 'posting_job_hr_name',
    POSTING_JOB_CONTACT_PHONE = 'posting_job_contact_phone',
    POSTING_JOB_DESCRIPTION = 'posting_job_description',
    POSTING_JOB_CONFIRM = 'posting_job_confirm',
    ENTERING_COMPANY_NAME = 'entering_company_name',

    // Resume Creation Flow
    REQUESTING_LOCATION = 'requesting_location',
    RESUME_CHANNEL_CONFIRM = 'resume_channel_confirm',
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
    SELECTING_RESUME_LANGUAGES = 'selecting_resume_languages',
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

    // Admin
    ADMIN_MENU = 'admin_menu',
    ADMIN_BROADCAST_INPUT = 'admin_broadcast_input',
    ADMIN_BROADCAST_CONFIRM = 'admin_broadcast_confirm',

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
    caption?: string;
    photo?: Array<{ file_id: string; width?: number; height?: number; file_size?: number }>;
    video?: { file_id: string };
    animation?: { file_id: string };
    document?: { file_id: string };
    audio?: { file_id: string };
    voice?: { file_id: string };
    video_note?: { file_id: string };
    sticker?: { file_id: string };
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
    { id: 'm-1903', title_uz: 'Fermer yordamchisi', title_ru: 'Помощник фермера', category_id: 'a0000008-0008-4000-8000-000000000008' },

    // Sports and coaching
    { id: 'm-2001', title_uz: "Jismoniy tarbiya o'qituvchisi", title_ru: 'Учитель физкультуры', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2002', title_uz: 'Sport murabbiyi', title_ru: 'Спортивный тренер', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2003', title_uz: 'Futbol murabbiyi', title_ru: 'Тренер по футболу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2004', title_uz: 'Mini futbol murabbiyi', title_ru: 'Тренер по мини-футболу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2005', title_uz: 'Voleybol murabbiyi', title_ru: 'Тренер по волейболу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2006', title_uz: 'Basketbol murabbiyi', title_ru: 'Тренер по баскетболу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2007', title_uz: 'Gandbol murabbiyi', title_ru: 'Тренер по гандболу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2008', title_uz: 'Suzish murabbiyi', title_ru: 'Тренер по плаванию', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2009', title_uz: 'Tennis murabbiyi', title_ru: 'Тренер по теннису', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2010', title_uz: 'Stol tennisi murabbiyi', title_ru: 'Тренер по настольному теннису', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2011', title_uz: 'Boks murabbiyi', title_ru: 'Тренер по боксу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2012', title_uz: 'Kurash murabbiyi', title_ru: 'Тренер по борьбе', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2013', title_uz: 'Dzyudo murabbiyi', title_ru: 'Тренер по дзюдо', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2014', title_uz: 'Taekvondo murabbiyi', title_ru: 'Тренер по тхэквондо', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2015', title_uz: 'Karate murabbiyi', title_ru: 'Тренер по карате', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2016', title_uz: 'Gimnastika murabbiyi', title_ru: 'Тренер по гимнастике', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2017', title_uz: 'Yengil atletika murabbiyi', title_ru: 'Тренер по легкой атлетике', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2018', title_uz: 'Shaxmat murabbiyi', title_ru: 'Тренер по шахматам', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2019', title_uz: 'Fitness murabbiyi', title_ru: 'Фитнес-тренер', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2020', title_uz: 'Bodybuilding murabbiyi', title_ru: 'Тренер по бодибилдингу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2021', title_uz: 'Yoga instruktori', title_ru: 'Инструктор по йоге', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2022', title_uz: 'Pilates murabbiyi', title_ru: 'Тренер по пилатесу', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2023', title_uz: 'Raqs murabbiyi', title_ru: 'Тренер по танцам', category_id: 'a0000004-0004-4000-8000-000000000004' },
    { id: 'm-2024', title_uz: 'Sport menejeri', title_ru: 'Спортивный менеджер', category_id: 'a0000004-0004-4000-8000-000000000004' }
];

// ============================================
// Bot Class
// ============================================
export class TelegramBot {
    private supabase: SupabaseClient;
    private readonly adminIds: Set<number>;
    private userUpdateQueue: Map<number, Promise<void>> = new Map();
    private regionsCache: { data: RegionRef[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private categoriesCache: { data: CategoryRef[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private fieldsCache: { data: OsonishField[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private fieldsCatalogCache: { data: OsonishField[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private fieldsSearchCache: Map<string, { data: OsonishField[]; loadedAt: number }> = new Map();
    private professionCategoryCache: { map: Record<string, string>; loadedAt: number } = { map: {}, loadedAt: 0 };
    private jobsProfessionCache: { data: OsonishField[]; loadedAt: number } = { data: [], loadedAt: 0 };
    private mainMenuStatsCache: { value: { jobs: number | null; jobsDisabled: number | null; resumes: number | null; users: number | null } | null; loadedAt: number } = {
        value: null,
        loadedAt: 0
    };
    private readonly referenceTtlMs = 10 * 60 * 1000;

    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        this.adminIds = this.parseAdminIds(process.env.ADMIN_IDS);
    }

    private parseAdminIds(raw?: string): Set<number> {
        const ids = new Set<number>();
        for (const token of String(raw || '').split(',')) {
            const value = Number.parseInt(token.trim(), 10);
            if (Number.isInteger(value) && value > 0) {
                ids.add(value);
            }
        }
        return ids;
    }

    private isAdminTelegramUser(telegramUserId: number): boolean {
        return this.adminIds.has(Number(telegramUserId));
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
                const remote = await this.getOsonishFieldsFromRemote(normalizedQuery);
                loaded = this.pickFieldMatches(remote, normalizedQuery, 300);
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
        const dotted =
            message.match(/column ["']?([a-z0-9_]+)\.([a-z0-9_]+)["']? (?:does not exist|not found)/i)
            || message.match(/column ([a-z0-9_]+)\.([a-z0-9_]+) does not exist/i);
        if (dotted) {
            return String(dotted[2] || '').trim() || null;
        }
        const match =
            message.match(/column ["']?([a-z0-9_.]+)["']? (?:does not exist|not found)/i)
            || message.match(/Could not find the '([^']+)' column/i)
            || message.match(/column ([a-z0-9_.]+) does not exist/i);
        if (!match) return null;
        const raw = match[1] ? String(match[1]) : null;
        if (!raw) return null;
        const normalized = raw.includes('.') ? raw.split('.').pop() : raw;
        return normalized ? String(normalized) : null;
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
            BotState.SELECTING_RESUME_LANGUAGES,
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
            BotState.EMPLOYER_PROFILE_ADDRESS,
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

    private buildAlphabetRetryPrompt(session: TelegramSession): { text: string; replyMarkup?: any } | null {
        const lang = session.lang;
        const state = session.state;
        const backTarget = this.getBackTargetForState(session);
        const backMarkup = backTarget ? keyboards.backKeyboard(lang, backTarget) : undefined;

        switch (state) {
            case BotState.ENTERING_NAME:
                return { text: botTexts.askName[lang], replyMarkup: backMarkup };
            case BotState.ENTERING_ABOUT:
                return {
                    text: botTexts.askAbout[lang],
                    replyMarkup: keyboards.aiResumeAboutPreviewKeyboard(lang, session.data?.edit_mode ? 'resume_view' : 'salary')
                };
            case BotState.SELECTING_RESUME_LANGUAGES: {
                const selected = Array.isArray(session.data?.resume?.language_keys)
                    ? session.data.resume.language_keys
                    : this.getDefaultJobLanguageKeys(lang);
                return {
                    text: botTexts.resumeLanguagesPrompt[lang],
                    replyMarkup: keyboards.resumeLanguagesKeyboard(lang, selected)
                };
            }
            case BotState.ADDING_SKILLS: {
                const skills = Array.isArray(session.data?.resume?.skills) ? session.data.resume.skills : [];
                const suggestions = Array.isArray(session.data?.ai_resume_skill_suggestions)
                    ? session.data.ai_resume_skill_suggestions
                    : [];
                return {
                    text: this.buildResumeSkillsPrompt(lang, suggestions),
                    replyMarkup: keyboards.skillsInlineKeyboard(
                        lang,
                        skills.length > 0,
                        session.data?.edit_mode ? 'resume_view' : 'resume_languages',
                        suggestions.length > 0
                    )
                };
            }
            case BotState.ENTERING_WORKPLACE:
                return { text: botTexts.askWorkplace[lang], replyMarkup: backMarkup };
            case BotState.ENTERING_EDUCATION_PLACE:
                return { text: botTexts.askEducationPlace[lang], replyMarkup: backMarkup };
            case BotState.POSTING_JOB_TITLE:
                return { text: botTexts.postJobTitle[lang], replyMarkup: backMarkup };
            case BotState.POSTING_JOB_ADDRESS:
                return { text: botTexts.jobAddressPrompt[lang], replyMarkup: backMarkup };
            case BotState.POSTING_JOB_LANGUAGES:
                return {
                    text: botTexts.jobLanguagesPrompt[lang],
                    replyMarkup: keyboards.jobLanguagesKeyboard(lang, Array.isArray(session.data?.temp_job?.language_keys) ? session.data.temp_job.language_keys : [])
                };
            case BotState.POSTING_JOB_BENEFITS:
                return {
                    text: botTexts.jobBenefitsPrompt[lang],
                    replyMarkup: keyboards.jobBenefitsKeyboard(lang, Array.isArray(session.data?.temp_job?.benefit_keys) ? session.data.temp_job.benefit_keys : [])
                };
            case BotState.POSTING_JOB_HR_NAME:
                return { text: botTexts.jobHrPrompt[lang], replyMarkup: backMarkup };
            case BotState.POSTING_JOB_DESCRIPTION:
                return { text: botTexts.postJobDescription[lang], replyMarkup: keyboards.jobDescriptionKeyboard(lang) };
            case BotState.EMPLOYER_PROFILE_COMPANY:
                return { text: botTexts.companyNamePrompt[lang], replyMarkup: backMarkup };
            case BotState.EMPLOYER_PROFILE_DIRECTOR:
                return { text: botTexts.employerDirectorPrompt[lang], replyMarkup: backMarkup };
            case BotState.EMPLOYER_PROFILE_ADDRESS:
                return { text: botTexts.employerAddressPrompt[lang], replyMarkup: backMarkup };
            case BotState.EMPLOYER_PROFILE_DESCRIPTION:
                return { text: botTexts.employerDescriptionPrompt[lang], replyMarkup: backMarkup };
            default:
                return null;
        }
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

    private getStrictProfessionTokens(tokens: string[]): string[] {
        const generic = new Set([
            "oqituvchi",
            "oqituvchisi",
            "o'qituvchi",
            "o'qituvchisi",
            'teacher',
            'prepodavatel',
            'преподаватель',
            'учитель',
            'mutaxassis',
            'specialist',
            'специалист',
            'xodim',
            'rabotnik',
            'работник'
        ]);
        return tokens.filter((token) => token.length >= 4 && !generic.has(token));
    }

    private pickFieldMatches(fields: OsonishField[], query?: string | null, limit: number = 300): OsonishField[] {
        if (!Array.isArray(fields) || fields.length === 0) return [];
        const normalizedQuery = this.normalizeLoose(query || '');
        if (!normalizedQuery || normalizedQuery.length < 3) return [];
        const tokens = normalizedQuery.split(' ').filter(Boolean);
        const strictTokens = this.getStrictProfessionTokens(tokens);

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
            if (strictTokens.length > 0) {
                const strictHits = strictTokens.reduce((acc, token) => acc + (title.includes(token) ? 1 : 0), 0);
                if (strictHits === 0) {
                    score = 0;
                } else {
                    score += strictHits * 24;
                    score -= Math.max(0, strictTokens.length - strictHits) * 10;
                }
            }
            if (score === 0 && normalizedQuery.length >= 4) {
                const fullSimilarity = this.diceSimilarity(title, normalizedQuery);
                const tokenSimilarity = Math.max(
                    0,
                    ...title
                        .split(' ')
                        .filter(Boolean)
                        .map((token) => this.diceSimilarity(token, normalizedQuery))
                );
                const bestSimilarity = Math.max(fullSimilarity, tokenSimilarity);
                const minSimilarity = normalizedQuery.length <= 5 ? 0.78 : 0.72;
                if (bestSimilarity >= minSimilarity) {
                    score = Math.round(bestSimilarity * 100);
                }
            }
            return { field, score, title };
        });

        let filtered = scored.filter(item => item.score > 0);
        if (strictTokens.length > 0) {
            const strictOnly = filtered.filter((item) => strictTokens.some((token) => item.title.includes(token)));
            if (strictOnly.length > 0) {
                filtered = strictOnly;
            }
        }
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
        const strictTokens = this.getStrictProfessionTokens(tokens);

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
            if (strictTokens.length > 0) {
                const strictHits = strictTokens.reduce((acc, token) => acc + (title.includes(token) ? 1 : 0), 0);
                if (strictHits === 0) {
                    score = 0;
                } else {
                    score += strictHits * 24;
                    score -= Math.max(0, strictTokens.length - strictHits) * 10;
                }
            }
            return { item, score, title };
        }).filter(entry => entry.score > 0);

        let ranked = scored;
        if (strictTokens.length > 0) {
            const strictOnly = scored.filter((entry) => strictTokens.some((token) => entry.title.includes(token)));
            if (strictOnly.length > 0) {
                ranked = strictOnly;
            }
        }

        ranked.sort((a, b) => b.score - a.score);
        return ranked.slice(0, 160).map(({ item }) => ({
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
        const raw = process.env.TELEGRAM_CHANNEL_USERNAME || 'ishdasizbot';
        return raw.startsWith('@') ? raw.slice(1) : raw;
    }

    private isMenuButtonText(text: string, lang: BotLang): boolean {
        const candidates = [
            lang === 'uz' ? '🔎 Ish topish' : '🔎 Найти работу',
            lang === 'uz' ? '⭐ Saqlanganlar' : '⭐ Сохранённые',
            lang === 'uz' ? '📨 Takliflar' : '📨 Приглашения',
            lang === 'uz' ? '🧾 Rezyume' : '🧾 Резюме',
            lang === 'uz' ? '⚙️ Sozlamalar' : '⚙️ Настройки',
            lang === 'uz' ? '🆘 Yordam' : '🆘 Помощь',
            lang === 'uz' ? '📢 Vakansiya joylash' : '📢 Разместить вакансию',
            lang === 'uz' ? '📋 Mening vakansiyalarim' : '📋 Мои вакансии',
            lang === 'uz' ? '🔎 Ishchi topish' : '🔎 Найти кандидатов',
            lang === 'uz' ? '👥 Ishchi topish' : '👥 Найти кандидатов',
            lang === 'uz' ? '🧑‍💼 Ishchi topish' : '🧑‍💼 Найти сотрудника',
            lang === 'uz' ? '📨 Arizalar' : '📨 Отклики',
            lang === 'uz' ? '📊 Statistika' : '📊 Статистика',
            lang === 'uz' ? '🚨 Qoidabuzarlar' : '🚨 Нарушители',
            lang === 'uz' ? '📣 Hammaga xabar yuborish' : '📣 Рассылка всем',
            lang === 'uz' ? '🏠 Asosiy menyu' : '🏠 Главное меню'
        ];
        const normalizedText = this.normalizeMenuButtonText(text);
        return candidates.some((candidate) => this.normalizeMenuButtonText(candidate) === normalizedText);
    }

    private normalizeMenuButtonText(value: string): string {
        const source = String(value || '').trim();
        if (!source) return '';
        return source
            .replace(/^(\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)\s*(?:[|:：\-–—]\s*)?/u, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    private equalsMenuText(actual: string, expected: string): boolean {
        return this.normalizeMenuButtonText(actual) === this.normalizeMenuButtonText(expected);
    }

    private formatChannelText(text: string): string {
        const channelTag = `@${this.getChannelUsername()}`;
        return text.replace(/@ishdasiz(?:_bot|bot)?\b/gi, channelTag);
    }

    private normalizeChannelUsername(value: string | null | undefined): string | null {
        const raw = String(value || '').trim();
        if (!raw) return null;
        return raw.startsWith('@') ? raw : `@${raw}`;
    }

    private async getRegionChannelUsernameById(regionId: any): Promise<string | null> {
        const idNum = this.toCoordinate(regionId);
        if (idNum === null) return null;
        const regions = await this.getRegions();
        const region = regions.find((item) => Number(item.id) === idNum);
        if (!region?.slug) return null;
        return this.normalizeChannelUsername(getChannelByRegionSlug(region.slug));
    }

    private mapExperienceKeyToRaw(value: any): number {
        const raw = String(value || '').trim().toLowerCase();
        const map: Record<string, number> = {
            any: 0,
            no_experience: 1,
            '1_year': 2,
            '1_3_years': 3,
            '3_5_years': 4,
            '5_plus': 5,
            '1': 1,
            '2': 2,
            '3': 3,
            '4': 4,
            '5': 5
        };
        return map[raw] ?? 0;
    }

    private mapEducationKeyToRaw(value: any): number {
        const raw = String(value || '').trim().toLowerCase();
        const map: Record<string, number> = {
            any: 0,
            secondary: 1,
            vocational: 2,
            higher: 3,
            incomplete_higher: 3,
            master: 4,
            phd: 5,
            '0': 0,
            '1': 1,
            '2': 2,
            '3': 3,
            '4': 4,
            '5': 5
        };
        return map[raw] ?? 0;
    }

    private async publishJobToRegionChannel(jobId: string, job: any): Promise<boolean> {
        try {
            const regionId = this.toCoordinate(job?.region_id);
            const regions = await this.getRegions();
            let region = regionId !== null
                ? (regions.find((item) => Number(item.id) === regionId) || null)
                : null;

            if (!region && job?.region_name) {
                const regionName = String(job.region_name).trim().toLowerCase();
                region = regions.find((item) =>
                    String(item?.name_uz || '').trim().toLowerCase() === regionName
                    || String(item?.name_ru || '').trim().toLowerCase() === regionName
                ) || null;
            }

            const regionSlug = String(region?.slug || '').trim() || null;
            if (!regionSlug) return false;

            const channelUsername = this.normalizeChannelUsername(getChannelByRegionSlug(regionSlug));
            if (!channelUsername) return false;

            let districtName = String(job?.district_name || '').trim() || null;
            if (!districtName && job?.district_id !== null && job?.district_id !== undefined) {
                const { data: district } = await this.supabase
                    .from('districts')
                    .select('name_uz, name_ru')
                    .eq('id', job.district_id)
                    .maybeSingle();
                districtName = String(district?.name_uz || district?.name_ru || '').trim() || null;
            }

            const regionName = String(job?.region_name || region?.name_uz || region?.name_ru || '').trim() || null;
            const payload = {
                ...job,
                region_name: regionName,
                district_name: districtName,
                districts: { regions: { slug: regionSlug } }
            };
            const message = buildJobChannelMessage(payload, regionSlug);
            const sent = await sendMessage(channelUsername, message, {
                parseMode: 'HTML',
                disableWebPagePreview: true
            });
            const messageId = Number(sent?.message_id);
            if (Number.isFinite(messageId) && messageId > 0) {
                const messageHash = hashMessage(message);
                await this.supabase
                    .from('channel_posts')
                    .upsert({
                        entity_type: 'job',
                        entity_id: jobId,
                        channel_username: channelUsername,
                        message_id: messageId,
                        message_hash: messageHash,
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'entity_type,entity_id,channel_username' });
            }

            await this.supabase
                .from('sync_events')
                .update({
                    status: 'done',
                    processed_at: new Date().toISOString(),
                    last_error: null
                })
                .eq('entity_type', 'job')
                .eq('entity_id', jobId)
                .in('status', ['pending', 'failed', 'processing']);
            return Number.isFinite(messageId) && messageId > 0;
        } catch (error) {
            console.error('[BOT] Job channel publish error:', error);
            return false;
        }
    }

    private async publishResumeToRegionChannel(
        resumeId: string,
        resume: any,
        explicitChoice?: boolean | null
    ): Promise<void> {
        try {
            const shouldPost = explicitChoice === null || explicitChoice === undefined
                ? resume?.post_to_channel !== false
                : Boolean(explicitChoice);
            if (!shouldPost) return;

            const regionId = this.toCoordinate(resume?.region_id);
            if (regionId === null) return;

            const regions = await this.getRegions();
            const region = regions.find((item) => Number(item.id) === regionId) || null;
            const regionSlug = String(region?.slug || '').trim() || null;
            if (!regionSlug) return;

            const channelUsername = this.normalizeChannelUsername(getChannelByRegionSlug(regionSlug));
            if (!channelUsername) return;

            let districtName = String(resume?.district_name || '').trim() || null;
            if (!districtName && resume?.district_id !== null && resume?.district_id !== undefined) {
                const { data: district } = await this.supabase
                    .from('districts')
                    .select('name_uz, name_ru')
                    .eq('id', resume.district_id)
                    .maybeSingle();
                districtName = String(district?.name_uz || district?.name_ru || '').trim() || null;
            }

            const regionName = String(resume?.region_name || region?.name_uz || region?.name_ru || '').trim() || null;
            const payload = {
                ...resume,
                region_name: regionName,
                district_name: districtName,
                districts: { regions: { slug: regionSlug } }
            };
            const message = buildResumeChannelMessage(payload, regionSlug);
            const sent = await sendMessage(channelUsername, message, {
                parseMode: 'HTML',
                disableWebPagePreview: true
            });
            const messageId = Number(sent?.message_id);
            if (Number.isFinite(messageId) && messageId > 0) {
                const messageHash = hashMessage(message);
                await this.supabase
                    .from('channel_posts')
                    .upsert({
                        entity_type: 'resume',
                        entity_id: resumeId,
                        channel_username: channelUsername,
                        message_id: messageId,
                        message_hash: messageHash,
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'entity_type,entity_id,channel_username' });
            }

            await this.supabase
                .from('sync_events')
                .update({
                    status: 'done',
                    processed_at: new Date().toISOString(),
                    last_error: null
                })
                .eq('entity_type', 'resume')
                .eq('entity_id', resumeId)
                .in('status', ['pending', 'failed', 'processing']);
        } catch (error) {
            console.error('[BOT] Resume channel publish error:', error);
        }
    }

    private buildResumeChannelConfirmText(lang: BotLang, channelUsername: string): string {
        const safeChannel = this.escapeHtml(this.normalizeChannelUsername(channelUsername) || channelUsername);
        if (lang === 'ru') {
            return `<b>📨 | Опубликовать резюме в канале?</b>\n<i>Канал: ${safeChannel}</i>`;
        }
        return `<b>📨 | Rezyumeni kanalda ham e'lon qilamizmi?</b>\n<i>Kanal: ${safeChannel}</i>`;
    }

    private buildJobChannelNotice(lang: BotLang, channelUsername: string, phase: 'pending' | 'published'): string {
        const safeChannel = this.escapeHtml(this.normalizeChannelUsername(channelUsername) || channelUsername);
        if (lang === 'ru') {
            return phase === 'pending'
                ? `<i>Вакансия также будет опубликована в канале: ${safeChannel}</i>`
                : `<i>Вакансия опубликована и в канале: ${safeChannel}</i>`;
        }
        return phase === 'pending'
            ? `<i>Vakansiya quyidagi kanalga ham joylanadi: ${safeChannel}</i>`
            : `<i>Vakansiya ${safeChannel} kanalida ham e'lon qilindi.</i>`;
    }

    private async enqueueUserUpdate(userId: number, handler: () => Promise<void>): Promise<void> {
        const previous = this.userUpdateQueue.get(userId) || Promise.resolve();
        const current = previous
            .catch(() => undefined)
            .then(async () => {
                await handler();
            });

        this.userUpdateQueue.set(userId, current);

        try {
            await current;
        } finally {
            if (this.userUpdateQueue.get(userId) === current) {
                this.userUpdateQueue.delete(userId);
            }
        }
    }

    private collectActiveCallbackMessageIds(session: TelegramSession): number[] {
        const data = session.data || {};
        const ids = [
            data.last_prompt_message_id,
            data.lastPromptMessageId,
            data.last_job_message_id,
            data.last_job_location_message_id,
            data.last_job_location_text_message_id,
            data.last_worker_match_message_id
        ];

        return ids
            .map((value: any) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0);
    }

    private isFlowSensitiveCallbackAction(action: string): boolean {
        const sensitive = new Set([
            'lang', 'auth', 'role',
            'roleswitch',
            'region', 'district', 'distpage', 'category', 'field', 'fieldpage',
            'jobexperience', 'experience', 'jobeducation', 'education', 'educont', 'jobgender', 'gender',
            'special', 'salary', 'jobsalary', 'jobsalarymax', 'jobage', 'salarymax',
            'employment', 'workmode', 'workingdays', 'workinghours',
            'joblang', 'reslang', 'jobbenefit',
            'aboutai', 'jobdescai', 'skip', 'skills', 'workend', 'eduend', 'workplace',
            'back', 'menu', 'action', 'job', 'jobmode',
            'fav', 'apply', 'profile', 'settings', 'admin', 'subs', 'ai', 'sub', 'searchmode',
            'resume_new', 'resumeedit', 'cancel', 'resume', 'mcat', 'search', 'searchregion', 'searchdist'
        ]);
        return sensitive.has(action);
    }

    private shouldIgnoreStaleCallback(session: TelegramSession, action: string, callbackMessageId?: number): boolean {
        if (!callbackMessageId) return false;
        if (!this.isFlowSensitiveCallbackAction(action)) return false;
        const activeIds = this.collectActiveCallbackMessageIds(session);
        if (!activeIds.length) return true;
        return !activeIds.includes(callbackMessageId);
    }

    private isHighRiskCallbackAction(action: string): boolean {
        return new Set([
            'auth',
            'role',
            'roleswitch',
            'settings',
            'jobmode'
        ]).has(action);
    }

    private shouldIgnoreRapidCallback(session: TelegramSession, action: string, callbackMessageId?: number): boolean {
        if (!callbackMessageId) return false;
        if (!this.isHighRiskCallbackAction(action)) return false;
        const lock = session.data?.callback_action_lock;
        if (!lock || typeof lock !== 'object') return false;
        const lockMessageId = Number(lock.message_id);
        const lockUntil = Number(lock.until);
        if (!Number.isFinite(lockMessageId) || !Number.isFinite(lockUntil)) return false;
        return lockMessageId === callbackMessageId && Date.now() < lockUntil;
    }

    private async lockCallbackAction(session: TelegramSession, action: string, callbackMessageId?: number): Promise<void> {
        if (!callbackMessageId) return;
        if (!this.isHighRiskCallbackAction(action)) return;
        await this.setSession(session, {
            data: {
                ...session.data,
                callback_action_lock: {
                    action,
                    message_id: callbackMessageId,
                    until: Date.now() + 1500
                }
            }
        });
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

    private normalizeTelegramUsername(value: any): string | null {
        if (!value) return null;
        const cleaned = String(value).trim().replace(/^@+/, '');
        if (!cleaned) return null;
        if (!/^[A-Za-z0-9_]{5,32}$/.test(cleaned)) return null;
        return cleaned;
    }

    private async syncTelegramUsernameFromUpdate(session: TelegramSession, usernameRaw: any): Promise<void> {
        const username = this.normalizeTelegramUsername(usernameRaw);
        const current = this.normalizeTelegramUsername(session.data?.telegram_username);
        const changed = current !== username;
        if (changed) {
            const updatedData = { ...(session.data || {}), telegram_username: username || null };
            await this.setSession(session, { data: updatedData });
        }

        if (!session.user_id || !changed) return;
        const now = new Date().toISOString();
        try {
            await this.supabase
                .from('job_seeker_profiles')
                .update({ telegram: username || null, updated_at: now })
                .eq('user_id', session.user_id);
        } catch {
            // optional column may be absent on older schema
        }
        try {
            await this.supabase
                .from('employer_profiles')
                .update({ telegram: username || null, updated_at: now })
                .eq('user_id', session.user_id);
        } catch {
            // optional column may be absent on older schema
        }
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

    private resolvePremiumEmojiStepKey(text: string, lang: BotLang): string | undefined {
        const normalized = String(text || '').trim();
        if (!normalized) return undefined;

        const dynamicMatchers: Array<{ key: string; pattern: RegExp }> = [
            { key: 'postJobConfirm', pattern: /vakansiyani tekshiring va tasdiqlang|проверьте и подтвердите вакансию/i },
            { key: 'offerConfirmPrompt', pattern: /ishga taklif yuborasizmi|отправить приглашение/i },
            { key: 'offerReceivedSeeker', pattern: /sizni ishga taklif qilishdi|вас пригласили на работу/i },
            { key: 'applicationAlertEmployer', pattern: /yangi ariza kelib tushdi|новый отклик по вакансии/i },
            { key: 'matchScore', pattern: /mos kelish:\s*\d+%|совпадение:\s*\d+%/i }
        ];
        for (const matcher of dynamicMatchers) {
            if (matcher.pattern.test(normalized)) return matcher.key;
        }

        const staticEntries: Array<[string, string]> = Object.entries(botTexts)
            .map(([key, value]) => {
                if (!value || typeof value !== 'object') return null;
                const localized = (value as any)[lang];
                if (typeof localized !== 'string') return null;
                const sample = localized.trim();
                if (!sample) return null;
                return [key, sample] as [string, string];
            })
            .filter((entry): entry is [string, string] => Boolean(entry))
            .sort((a, b) => b[1].length - a[1].length);

        for (const [key, sample] of staticEntries) {
            if (normalized === sample || normalized.startsWith(sample)) {
                return key;
            }
        }
        return undefined;
    }

    private async sendPrompt(
        chatId: number,
        session: TelegramSession,
        text: string,
        options: { replyMarkup?: any; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'; premiumKey?: string } = {}
    ): Promise<void> {
        const safeText = text && String(text).trim().length > 0 ? text : botTexts.error[session.lang || 'uz'];
        const promptParseMode = options.parseMode ?? 'HTML';
        const premiumKey = options.premiumKey || this.resolvePremiumEmojiStepKey(safeText, session.lang);
        let latestData = (session.data && typeof session.data === 'object') ? session.data : {};
        try {
            const { data: latest } = await this.supabase
                .from('telegram_sessions')
                .select('data')
                .eq('telegram_user_id', session.telegram_user_id)
                .maybeSingle();
            if (latest?.data && typeof latest.data === 'object') {
                latestData = latest.data;
            }
        } catch {
            // ignore fetch errors and continue with in-memory session data
        }

        const lastPromptId = latestData?.last_prompt_message_id || session.data?.last_prompt_message_id;

        let result: any = null;
        let lastSendError: any = null;
        try {
            result = await sendMessage(chatId, safeText, {
                parseMode: promptParseMode,
                replyMarkup: options.replyMarkup,
                premiumKey
            });
        } catch (err: any) {
            lastSendError = err;
            try {
                // Keep markup, disable premium only.
                result = await sendMessage(chatId, safeText, {
                    parseMode: promptParseMode,
                    replyMarkup: options.replyMarkup,
                    disablePremiumEmoji: true,
                    premiumKey
                });
            } catch (secondErr) {
                lastSendError = secondErr;
                // Last-resort fallback for truly broken markup.
                try {
                    const fallbackText = this.stripHtmlTags(safeText);
                    result = await sendMessage(chatId, fallbackText, {
                        replyMarkup: options.replyMarkup,
                        disablePremiumEmoji: true,
                        premiumKey
                    });
                } catch (finalErr) {
                    lastSendError = finalErr;
                    // Final guard to avoid blank screen.
                    result = await sendMessage(
                        chatId,
                        session.lang === 'uz'
                            ? "⚠️ Xabarni yuklashda xatolik bo'ldi. Iltimos, davom eting."
                            : '⚠️ Ошибка загрузки сообщения. Продолжайте, пожалуйста.',
                        {
                            replyMarkup: options.replyMarkup,
                            disablePremiumEmoji: true,
                            premiumKey
                        }
                    );
                }
            }
        }
        const messageId = result?.message_id;
        if (!messageId) {
            if (lastSendError) {
                console.error('[BOT] sendPrompt failed to send message:', lastSendError);
            }
            return;
        }

        if (lastPromptId && lastPromptId !== messageId) {
            try {
                await deleteMessage(chatId, lastPromptId);
            } catch {
                // ignore delete errors
            }
        }

        if (messageId) {
            const updatedData = {
                ...(session.data || {}),
                ...(latestData || {}),
                last_prompt_message_id: messageId,
                lastPromptMessageId: messageId
            };
            session.data = updatedData;
            await this.updateSession(session.telegram_user_id, { data: updatedData });
        }
    }

    private async showLoadingHint(chatId: number, session: TelegramSession, customText?: string): Promise<number | null> {
        try {
            const text = customText || botTexts.fieldSearchLoading[session.lang || 'uz'];
            const sent = await this.sendSeriousSticker(chatId, 'loading', { caption: text });
            return sent?.message_id || null;
        } catch {
            return null;
        }
    }

    private async clearLoadingHint(chatId: number, messageId: number | null | undefined): Promise<void> {
        if (!messageId) return;
        try {
            await deleteMessage(chatId, messageId);
        } catch {
            // ignore
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

    private async sendSeriousSticker(
        chatId: number,
        tone: StickerTone,
        options: { caption?: string; replyMarkup?: any; parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' } = {}
    ): Promise<any | null> {
        const toneLabel: Record<StickerTone, string> = {
            loading: '⏳',
            announce: '📢',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        const text = options.caption && String(options.caption).trim().length > 0
            ? options.caption
            : toneLabel[tone];
        const textLower = String(text || '').toLowerCase();
        const premiumKeyByTone: Record<StickerTone, string> = {
            loading: '__transient_loading',
            announce: '__transient_announce',
            success: '__transient_success',
            warning: '__transient_warning',
            error: '__transient_error'
        };
        const premiumKey = text.includes('🤖')
            ? '__transient_ai'
            : (text.includes('🔎') || textLower.includes('qidir') || textLower.includes('search'))
                ? '__transient_search'
                : premiumKeyByTone[tone];
        try {
            if (!options.caption && tone !== 'loading') {
                await this.sendTransientMessage(chatId, text, 900, premiumKey);
                return null;
            }
            return await sendMessage(chatId, text, {
                parseMode: options.parseMode,
                replyMarkup: options.replyMarkup,
                premiumKey
            });
        } catch {
            return null;
        }
    }

    private normalizePhoneValue(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).replace(/\D/g, '');
    }

    private buildPhoneVariants(phone: string): string[] {
        const digits = this.normalizePhoneValue(phone);
        if (!digits) return [];

        const last9 = digits.slice(-9);
        const variants = new Set<string>();
        variants.add(digits);
        variants.add(`+${digits}`);
        if (last9.length === 9) {
            variants.add(last9);
            variants.add(`998${last9}`);
            variants.add(`+998${last9}`);
        }
        return Array.from(variants).filter(Boolean);
    }

    private async findUserByPhone(phone: string): Promise<{ id: string; phone?: string | null; telegram_user_id?: number | null; password_hash?: string | null } | null> {
        const digits = this.normalizePhoneValue(phone);
        if (!digits) return null;

        const variants = this.buildPhoneVariants(phone);
        if (variants.length > 0) {
            const { data } = await this.supabase
                .from('users')
                .select('id, phone, telegram_user_id, password_hash')
                .in('phone', variants)
                .limit(20);

            if (Array.isArray(data) && data.length > 0) {
                const exact = data.find((row: any) => this.normalizePhoneValue(row?.phone) === digits);
                if (exact) return exact;
                return data[0];
            }
        }

        const last9 = digits.slice(-9);
        if (last9.length === 9) {
            const { data } = await this.supabase
                .from('users')
                .select('id, phone, telegram_user_id, password_hash')
                .ilike('phone', `%${last9}`)
                .limit(50);
            if (Array.isArray(data) && data.length > 0) {
                const exact = data.find((row: any) => this.normalizePhoneValue(row?.phone) === digits);
                if (exact) return exact;
            }
        }

        return null;
    }

    private async isUserBanned(chatId: number, session: TelegramSession): Promise<boolean> {
        const bannedUntil = session.data?.banned_until;
        if (!bannedUntil) return false;
        const until = new Date(bannedUntil);
        if (Number.isNaN(until.getTime())) return false;
        if (until.getTime() > Date.now()) {
            await this.sendPrompt(chatId, session, '🚫 Sizning akkauntingiz vaqtinchalik bloklangan.');
            return true;
        }
        return false;
    }

    private async handleModerationBlock(chatId: number, session: TelegramSession, reason?: string, sourceText?: string): Promise<void> {
        const data = session.data || {};
        const profanityCount = (data.profanity_count || 0) + (reason === 'profanity' ? 1 : 0);
        const updatedData: Record<string, any> = { ...data, profanity_count: profanityCount };
        if (reason) {
            updatedData.last_abuse_reason = reason;
            updatedData.last_abuse_at = new Date().toISOString();
        }
        const normalizedSource = String(sourceText || '').trim();
        if (normalizedSource) {
            updatedData.last_abuse_text = normalizedSource.slice(0, 220);
        }

        if (reason === 'profanity' && profanityCount >= 3) {
            const banUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString();
            updatedData.banned_until = banUntil;
            session.data = updatedData;
            await this.updateSession(session.telegram_user_id, { data: updatedData });
            if (session.user_id) {
                await this.supabase.from('users').update({ locked_until: banUntil }).eq('id', session.user_id);
            }
            await this.sendPrompt(chatId, session, '🚫 Qoidabuzarlik 3 marta aniqlandi. Akkauntingiz bloklandi.');
            return;
        }

        session.data = updatedData;
        await this.updateSession(session.telegram_user_id, { data: updatedData });

        const warning = {
            profanity: {
                uz: "❗ Hurmatli foydalanuvchi, iltimos, odob doirasida muloqot qiling, aks holda biz sizga qonuniy chora ko'rishimizni ma'lum qilamiz!",
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
            await this.sendTransientMessage(chatId, warning.profanity[lang], 500);
        } else if (reason === 'injection') {
            await this.sendTransientMessage(chatId, warning.injection[lang], 500);
        } else if (reason === 'spam') {
            await this.sendTransientMessage(chatId, warning.spam[lang], 500);
        } else {
            await this.sendTransientMessage(chatId, botTexts.error[lang], 500);
        }
    }

    private async sendTransientMessage(
        chatId: number,
        text: string,
        ttlMs: number = 500,
        premiumKey?: string
    ): Promise<void> {
        try {
            const sent = await sendMessage(chatId, text, { premiumKey });
            const messageId = sent?.message_id;
            if (!messageId) return;
            await new Promise(resolve => setTimeout(resolve, Math.max(0, ttlMs)));
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore delete errors
            }
        } catch {
            // ignore transient message failures
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
        const telegramUsernameRaw = message?.from?.username ?? callback?.from?.username ?? null;
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

        await this.enqueueUserUpdate(userId, async () => {
            const session = await this.getOrCreateSession(userId);
            if (!session) {
                console.log('[BOT] No session, skipping');
                return;
            }

            await this.syncTelegramUsernameFromUpdate(session, telegramUsernameRaw);

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
        });
    }

    async handleMessage(msg: TelegramMessage, sessionOverride?: TelegramSession): Promise<void> {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || '';
        const incomingMessageId = typeof msg.message_id === 'number' ? msg.message_id : null;
        let resolvedSession: TelegramSession | null = sessionOverride || null;
        const hasUserPayload = Boolean(
            msg.text
            || msg.caption
            || msg.contact
            || msg.location
            || (Array.isArray(msg.photo) && msg.photo.length > 0)
            || msg.video
            || msg.animation
            || msg.document
            || msg.audio
            || msg.voice
            || msg.video_note
            || msg.sticker
        );

        try {
            const session = sessionOverride || await this.getOrCreateSession(userId);
            resolvedSession = session || null;
            if (!session) {
                await sendMessage(chatId, botTexts.error.uz);
                return;
            }
            const lang = session.lang || 'uz';
            const trimmedText = text.trim();
            const isAdminUser = this.isAdminTelegramUser(userId);

            if (await this.isUserBanned(chatId, session)) {
                return;
            }

            if (trimmedText && !msg.contact && !msg.location && !this.isPasswordState(session.state) && !this.shouldSkipModeration(session.state, trimmedText) && !isAdminUser) {
                const moderation = checkForAbuse(trimmedText);
                if (!moderation.allowed) {
                    await this.handleModerationBlock(chatId, session, moderation.reason, trimmedText);
                    return;
                }
            }

            if (trimmedText === '/start') {
                await this.handleStart(chatId, session);
                return;
            }
            if (trimmedText === '/help') {
                await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                    replyMarkup: keyboards.helpSupportKeyboard(lang),
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
            if (trimmedText === '/admin') {
                if (!isAdminUser) {
                    await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang], {
                        replyMarkup: session.data?.active_role === 'employer'
                            ? keyboards.employerMainMenuKeyboard(lang)
                            : keyboards.mainMenuKeyboard(lang, 'seeker')
                    });
                    return;
                }
                await this.showAdminMenu(chatId, session);
                return;
            }
            if (session.state === BotState.ADMIN_BROADCAST_INPUT) {
                await this.handleAdminBroadcastInput(chatId, msg, session);
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
            const lang = resolvedSession?.lang || 'uz';
            if (resolvedSession) {
                const isEmployer = resolvedSession.data?.active_role === 'employer';
                await this.sendPrompt(chatId, resolvedSession, botTexts.error[lang], {
                    replyMarkup: isEmployer ? keyboards.employerMainMenuKeyboard(lang) : keyboards.mainMenuKeyboard(lang, 'seeker')
                });
            } else {
                await sendMessage(chatId, botTexts.error[lang]);
            }
        } finally {
            if (incomingMessageId && hasUserPayload && !msg.location) {
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
        let resolvedSession: TelegramSession | null = sessionOverride || null;

        try {
            try {
                await answerCallbackQuery(id);
            } catch {
                // Old/expired callback query should not break the whole flow.
            }
            const session = sessionOverride || await this.getOrCreateSession(from.id);
            resolvedSession = session || null;
            if (!session) return;
            if (!session.data) session.data = {};

            const chatId = message.chat.id;
            const parts = data.split(':');
            const action = parts[0];
            const value = parts[1];
            const extra = parts.slice(2).join(':');
            const callbackMessageId = typeof message?.message_id === 'number' ? message.message_id : undefined;

            if (this.shouldIgnoreStaleCallback(session, action, callbackMessageId)) {
                try {
                    await answerCallbackQuery(id, {
                        text: session.lang === 'uz'
                            ? "Bu tugma eskirgan. Iltimos, oxirgi oynadagi tugmalardan foydalaning."
                            : 'Эта кнопка устарела. Используйте кнопки в последнем сообщении.'
                    });
                } catch {
                    // ignore
                }
                return;
            }
            if (this.shouldIgnoreRapidCallback(session, action, callbackMessageId)) {
                try {
                    await answerCallbackQuery(id, {
                        text: session.lang === 'uz'
                            ? 'Iltimos, biroz kutib qayta bosing.'
                            : 'Пожалуйста, подождите и нажмите снова.'
                    });
                } catch {
                    // ignore
                }
                return;
            }
            await this.lockCallbackAction(session, action, callbackMessageId);

            switch (action) {
                case 'lang': await this.handleLangSelect(chatId, value as BotLang, session); break;
                case 'auth': await this.handleAuthCallback(chatId, value, session); break;
                case 'role': await this.handleRoleSelect(chatId, value, session); break;
                case 'roleswitch': await this.handleRoleSwitchDecision(chatId, value, session); break;
                case 'region': await this.handleRegionSelect(chatId, value, session, message.message_id); break;
                case 'district': await this.handleDistrictSelect(chatId, value, session, message.message_id); break;
                case 'distpage': await this.showDistrictPage(chatId, parseInt(value), session, message.message_id); break;
                case 'category': await this.handleCategorySelect(chatId, value, session, message.message_id); break;
                case 'field': await this.handleFieldSelect(chatId, value, session, message.message_id); break;
                case 'fieldpage': await this.showFieldPage(chatId, Number.parseInt(value, 10), session, message.message_id); break;
                case 'jobexperience': await this.handleExperienceSelect(chatId, value, session, message.message_id); break;
                case 'experience':
                    if (session.data?.active_role === 'employer' && session.state !== BotState.POSTING_JOB_EXPERIENCE) {
                        await this.setSession(session, { state: BotState.POSTING_JOB_EXPERIENCE });
                    }
                    await this.handleExperienceSelect(chatId, value, session, message.message_id);
                    break;
                case 'jobeducation': await this.handleEducationSelect(chatId, value, session, message.message_id); break;
                case 'education':
                    if (session.data?.active_role === 'employer') {
                        if (session.state !== BotState.POSTING_JOB_EDUCATION) {
                            await this.setSession(session, { state: BotState.POSTING_JOB_EDUCATION });
                        }
                        await this.handleEducationSelect(chatId, value, session, message.message_id);
                        break;
                    }
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
                case 'jobgender': await this.handleGenderSelect(chatId, value, session, message.message_id); break;
                case 'gender':
                    if (session.data?.active_role === 'employer' && session.state !== BotState.POSTING_JOB_GENDER) {
                        await this.setSession(session, { state: BotState.POSTING_JOB_GENDER });
                    }
                    await this.handleGenderSelect(chatId, value, session, message.message_id);
                    break;
                case 'special': await this.handleSpecialCriteria(chatId, value, session, message.message_id); break;
                case 'salary': await this.handleSalarySelect(chatId, value, session, message.message_id); break;
                case 'jobsalary': await this.handleJobSalaryQuick(chatId, value, session, message.message_id); break;
                case 'jobsalarymax': await this.handleJobSalaryMaxQuick(chatId, value, session, message.message_id); break;
                case 'matchjob': await this.handleMatchJob(chatId, value, session, message.message_id); break;
                case 'jobage':
                    if (value === 'any') {
                        const currentSpecial = Array.isArray(session.data?.temp_job?.special)
                            ? session.data.temp_job.special
                            : [];
                        const updatedJob = {
                            ...session.data?.temp_job,
                            age_min: null,
                            age_max: null,
                            special: currentSpecial
                        };
                        await this.updateSession(session.telegram_user_id, {
                            state: BotState.POSTING_JOB_SPECIAL,
                            data: { ...session.data, temp_job: updatedJob }
                        });
                        await this.sendPrompt(chatId, session, botTexts.jobSpecialCriteriaPrompt[session.lang], {
                            replyMarkup: keyboards.specialCriteriaKeyboard(session.lang, currentSpecial, 'job_age')
                        });
                    }
                    break;
                case 'worker': await this.handleWorkerNavigation(chatId, value, session); break;
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
                case 'jobview': await this.handleEmployerJobView(chatId, value, session, message.message_id); break;
                case 'jobactivate': await this.handleEmployerJobActivate(chatId, value, session, message.message_id); break;
                case 'jobdelete':
                    if (value === 'confirm') {
                        const jobId = String(extra || '').trim();
                        await this.sendPrompt(
                            chatId,
                            session,
                            session.lang === 'uz'
                                ? "📌 Ushbu vakansiyani o'chirishni tasdiqlaysizmi?"
                                : '📌 Подтверждаете удаление этой вакансии?',
                            { replyMarkup: keyboards.jobDeleteConfirmKeyboard(session.lang, jobId) }
                        );
                    } else if (value === 'yes') {
                        await this.handleEmployerJobDelete(chatId, String(extra || '').trim(), session);
                    } else if (value === 'back' || value === 'no') {
                        const jobId = String(extra || '').trim();
                        if (jobId) {
                            await this.handleEmployerJobView(chatId, jobId, session, message.message_id);
                        } else {
                            await this.showMainMenu(chatId, session);
                        }
                    }
                    break;
                case 'jobclose':
                    if (value === 'confirm') {
                        const jobId = String(extra || '').trim();
                        await this.sendPrompt(
                            chatId,
                            session,
                            session.lang === 'uz'
                                ? "📌 Ushbu vakansiyani yopishdan oldin sababni tanlang:"
                                : '📌 Перед закрытием вакансии выберите причину:',
                            { replyMarkup: keyboards.jobCloseReasonKeyboard(session.lang, jobId) }
                        );
                    } else if (value === 'reason_hired' || value === 'reason_paused') {
                        const reason = value === 'reason_paused' ? 'paused' : 'hired';
                        const jobId = String(extra || '').trim();
                        const reasonLabel = reason === 'paused'
                            ? (session.lang === 'uz' ? "Vaqtincha to‘xtatish" : 'Временно приостановить')
                            : (session.lang === 'uz' ? 'Nomzod ishga olindi' : 'Кандидат принят');
                        await this.sendPrompt(
                            chatId,
                            session,
                            session.lang === 'uz'
                                ? `Ushbu vakansiyani yopishni tasdiqlaysizmi?\n\nSabab: ${reasonLabel}`
                                : `Подтверждаете закрытие этой вакансии?\n\nПричина: ${reasonLabel}`,
                            { replyMarkup: keyboards.confirmJobCloseKeyboard(session.lang, jobId, reason) }
                        );
                    } else if (value === 'yes') {
                        const raw = String(extra || '');
                        const [jobId, reasonRaw] = raw.split(':');
                        const reason = reasonRaw === 'paused' ? 'paused' : 'hired';
                        await this.handleEmployerJobClose(chatId, jobId || raw, session, reason);
                    } else if (value === 'back') {
                        const jobId = String(extra || '').trim();
                        if (jobId) {
                            await this.handleEmployerJobView(chatId, jobId, session, message.message_id);
                        } else {
                            await this.showMainMenu(chatId, session);
                        }
                    } else if (value === 'no') {
                        await this.sendPrompt(chatId, session, session.lang === 'uz' ? 'Bekor qilindi.' : 'Отменено.', {
                            replyMarkup: keyboards.employerMainMenuKeyboard(session.lang)
                        });
                    } else {
                        // Backward compatibility with older inline keyboards.
                        const legacyJobId = String(value || extra || '').trim();
                        await this.sendPrompt(
                            chatId,
                            session,
                            session.lang === 'uz'
                                ? "📌 Ushbu vakansiyani yopishdan oldin sababni tanlang:"
                                : '📌 Перед закрытием вакансии выберите причину:',
                            { replyMarkup: keyboards.jobCloseReasonKeyboard(session.lang, legacyJobId) }
                        );
                    }
                    break;
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
                case 'offer':
                    await this.handleOfferAction(chatId, value, extra, session);
                    break;
                case 'offerjob':
                    await this.handleOfferJobView(chatId, value, session);
                    break;
                case 'salarymax': await this.handleSalaryMaxSelect(chatId, value, session, message.message_id); break;
                case 'employment': await this.handleEmploymentSelect(chatId, value, session, message.message_id); break;
                case 'workmode': await this.handleWorkModeSelect(chatId, value, session, message.message_id); break;
                case 'workingdays': await this.handleWorkingDaysSelect(chatId, value, session, message.message_id); break;
                case 'workinghours': await this.handleJobWorkingHoursSelect(chatId, value, session, message.message_id); break;
                case 'joblang': await this.handleJobLanguageAction(chatId, value, session, message.message_id); break;
                case 'reslang': await this.handleResumeLanguageAction(chatId, value, session, message.message_id); break;
                case 'jobbenefit': await this.handleJobBenefitAction(chatId, value, session, message.message_id); break;
                case 'aboutai': await this.handleResumeAboutAiAction(chatId, value, session, message.message_id); break;
                case 'jobdescai': await this.handleJobDescriptionAiAction(chatId, value, session, message.message_id); break;
                case 'skip': await this.handleSkip(chatId, session); break;
                case 'skills':
                    if (value === 'done') {
                        await this.finishSkills(chatId, session);
                    } else if (value === 'ai_apply') {
                        await this.applyAiSuggestedSkills(chatId, session);
                    }
                    break;
                case 'resumepost':
                    await this.handleResumePostChannelAction(chatId, value, session);
                    break;
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
                case 'back': await this.safeHandleBack(chatId, value, session); break;
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
                case 'admin':
                    await this.handleAdminCallback(chatId, value, extra, session);
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
                    } else if (value === 'delete' || value === 'delete_confirm') {
                        await this.sendPrompt(
                            chatId,
                            session,
                            session.lang === 'uz'
                                ? "Rezyumeni o'chirishni tasdiqlaysizmi?"
                                : 'Подтверждаете удаление резюме?',
                            { replyMarkup: keyboards.confirmResumeDeleteKeyboard(session.lang) }
                        );
                    } else if (value === 'confirm_delete') {
                        await this.handleResumeDelete(chatId, session);
                    } else if (value === 'cancel_delete') {
                        await this.sendPrompt(chatId, session, session.lang === 'uz' ? "O'chirish bekor qilindi." : 'Удаление отменено.', {
                            replyMarkup: keyboards.resumeOptionsKeyboard(session.lang)
                        });
                    }
                    break;
                case 'mcat': await this.handleMultiCategory(chatId, value, session, message.message_id); break;
                case 'search':
                    if (value === 'region') {
                        await this.showRegionDistrictSearch(chatId, session, message?.message_id);
                    }
                    break;
                case 'searchregion':
                    await this.handleSearchRegionSelect(chatId, value, session, message.message_id);
                    break;
                case 'searchdist':
                    await this.handleDistrictSearch(chatId, value, session);
                    break;
                case 'noop': break;
                default: console.log('Unknown callback:', data);

            }
        } catch (err) {
            console.error('Callback error:', err);
            if (message) {
                const lang = resolvedSession?.lang || sessionOverride?.lang || 'uz';
                if (resolvedSession) {
                    const isEmployer = resolvedSession.data?.active_role === 'employer';
                    await this.sendPrompt(message.chat.id, resolvedSession, botTexts.error[lang], {
                        replyMarkup: isEmployer ? keyboards.employerMainMenuKeyboard(lang) : keyboards.mainMenuKeyboard(lang, 'seeker')
                    });
                } else {
                    await sendMessage(message.chat.id, botTexts.error[lang]);
                }
            }
        }
    }

    private async handleAuthCallback(chatId: number, value: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const phone = session.data?.temp_phone || session.phone;

        if (value === 'start') {
            await this.setSession(session, { state: BotState.AWAITING_PHONE });
            await this.sendPrompt(chatId, session, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
        } else if (value === 'password') {
            if (!phone) {
                await this.sendPrompt(chatId, session, botTexts.askPhone[lang], { replyMarkup: keyboards.phoneRequestKeyboard(lang) });
                return;
            }
            const user = await this.findUserByPhone(phone);
            const hasPassword = Boolean(user?.password_hash && String(user.password_hash).trim().length > 0);
            if (!hasPassword) {
                await this.startSMSAuth(chatId, phone, session);
                return;
            }
            await this.setSession(session, {
                state: BotState.AWAITING_PASSWORD,
                data: {
                    ...session.data,
                    password_flow: 'login',
                    password_create_first: null
                }
            });
            await this.sendPrompt(chatId, session, botTexts.enterPassword[lang], {
                replyMarkup: keyboards.cancelReplyKeyboard(lang)
            });
        } else if (value === 'sms') {
            if (!phone) {
                await this.sendPrompt(chatId, session, botTexts.error[lang]);
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

            const companyOk = String(profile?.company_name || '').trim().length >= 3;
            const directorCandidate = [
                profile?.director_name,
                (profile as any)?.hr_name,
                (profile as any)?.responsible_person,
                (profile as any)?.manager_name
            ].find((item) => String(item || '').trim().length >= 3);
            const directorOk = String(directorCandidate || '').trim().length >= 3;
            if (!profile || !companyOk || !directorOk) {
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
                .limit(1)
                .maybeSingle();

            if (resume) {
                await this.showResumeList(chatId, session);
            } else {
                await this.startResumeFlow(chatId, session, 'role_pick');
            }
        }
    }

    private async startEmployerProfileFlow(chatId: number, session: TelegramSession, profile: any | null): Promise<void> {
        const lang = session.lang;
        const draft = {
            company_name: profile?.company_name || '',
            director_name: profile?.director_name || null,
            phone: profile?.phone || session.phone || null,
            telegram: profile?.telegram || this.normalizeTelegramUsername(session.data?.telegram_username) || null,
            region_id: profile?.region_id || null,
            district_id: profile?.district_id || null,
            address: profile?.address || profile?.default_address || null,
            description: profile?.description || null,
            industry: profile?.industry || null,
            company_size: profile?.company_size || null
        };
        const hasCompany = String(draft.company_name || '').trim().length >= 3;
        const hasDirector = String(draft.director_name || '').trim().length >= 3;

        if (!hasCompany) {
            await this.setSession(session, {
                state: BotState.EMPLOYER_PROFILE_COMPANY,
                data: { ...session.data, active_role: 'employer', employer_profile: draft }
            });

            await this.sendPrompt(chatId, session, `${botTexts.employerProfileIntro[lang]}\n\n${botTexts.companyNamePrompt[lang]}`, {
                replyMarkup: keyboards.backKeyboard(lang, 'role_pick')
            });
            return;
        }

        if (!hasDirector) {
            await this.setSession(session, {
                state: BotState.EMPLOYER_PROFILE_DIRECTOR,
                data: { ...session.data, active_role: 'employer', employer_profile: draft }
            });
            await this.sendPrompt(chatId, session, `${botTexts.employerProfileIntro[lang]}\n\n${botTexts.employerDirectorPrompt[lang]}`, {
                replyMarkup: keyboards.backKeyboard(lang, 'employer_company')
            });
            return;
        }

        await this.finalizeEmployerProfile(chatId, session, draft);
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
            telegram: this.normalizeTelegramUsername(draft.telegram) || this.normalizeTelegramUsername(session.data?.telegram_username) || null,
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
            special: jobData?.special,
            is_for_students: Array.isArray(jobData?.special) ? jobData.special.includes('students') : false,
            is_for_graduates: Array.isArray(jobData?.special) ? jobData.special.includes('graduates') : false,
            is_for_disabled: Array.isArray(jobData?.special) ? jobData.special.includes('disabled') : false,
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

        if (session.user_id && locationIntent !== 'job_post_location') {
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
            await this.promptResumeChannelPostConfirm(chatId, session);
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

        if (locationIntent === 'job_post_location') {
            const resolved = await this.resolveLocationToRegionDistrict(location.latitude, location.longitude);
            const currentJob = { ...(session.data?.temp_job || {}) };
            const updatedJob = {
                ...currentJob,
                latitude: location.latitude,
                longitude: location.longitude,
                region_id: currentJob?.region_id || resolved?.region_id || null,
                district_id: currentJob?.district_id || resolved?.district_id || null
            };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_WORK_MODE,
                data: { ...session.data, location_intent: null, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobWorkModePrompt[lang], {
                replyMarkup: keyboards.jobWorkModeKeyboard(lang)
            });
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
        const deletedMsg = await sendMessage(chatId, lang === 'uz' ? "✅ Rezyume o'chirildi." : "✅ Резюме удалено.", { replyMarkup: keyboards.removeKeyboard() });
        if (deletedMsg?.message_id) {
            await deleteMessage(chatId, deletedMsg.message_id);
        }
        await this.showResumeList(chatId, session);
    }

    private async handleStart(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang || 'uz';
        await this.clearRoleSwitchArtifacts(chatId, session);
        await this.setSession(session, { state: BotState.AWAITING_LANG });
        await this.sendPrompt(chatId, session, botTexts.selectLanguage[lang], { replyMarkup: keyboards.languageKeyboard() });
    }

    private async handleLangSelect(chatId: number, lang: BotLang, session: TelegramSession): Promise<void> {
        await this.setSession(session, { lang });
        if (session.user_id) {
            await this.showMainMenu(chatId, { ...session, lang });
            return;
        }
        await this.setSession(session, { state: BotState.START });
        await this.sendPrompt(chatId, session, this.buildStartWelcomeText(session, lang), {
            replyMarkup: keyboards.startKeyboard(lang),
            parseMode: 'HTML'
        });
    }

    private async handlePhone(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const normalized = phone.replace(/\D/g, '').slice(-9);
        if (normalized.length !== 9) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }
        const fullPhone = `+998${normalized}`;
        await this.setSession(session, {
            phone: fullPhone,
            data: { ...session.data, temp_phone: fullPhone }
        });

        const user = await this.findUserByPhone(fullPhone);
        if (user?.id) {
            const hasPassword = Boolean(user.password_hash && String(user.password_hash).trim().length > 0);
            await this.sendPrompt(chatId, session, botTexts.accountFound[lang], {
                replyMarkup: keyboards.loginChoiceKeyboard(lang, hasPassword)
            });
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
                await this.sendPrompt(chatId, session, errorMessage);
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
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
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
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }
        const flow = session.data?.password_flow || 'login';

        if (flow === 'create') {
            if (password.length < 6) {
                await this.sendPrompt(chatId, session, botTexts.passwordTooShort[lang]);
                return;
            }
            const firstEntry = String(session.data?.password_create_first || '').trim();
            if (!firstEntry) {
                await this.setSession(session, {
                    data: { ...session.data, password_create_first: password }
                });
                await this.sendPrompt(chatId, session, botTexts.createPasswordConfirmPrompt[lang], {
                    replyMarkup: keyboards.cancelReplyKeyboard(lang)
                });
                return;
            }

            if (firstEntry !== password) {
                await this.setSession(session, {
                    data: { ...session.data, password_create_first: null }
                });
                await this.sendPrompt(chatId, session, `${botTexts.passwordMismatch[lang]}\n\n${botTexts.createPasswordPrompt[lang]}`, {
                    replyMarkup: keyboards.cancelReplyKeyboard(lang)
                });
                return;
            }

            const passwordHash = await bcrypt.hash(firstEntry, 10);
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
                await this.sendPrompt(chatId, session, botTexts.error[lang]);
                return;
            }
            await this.setSession(session, { data: { ...session.data, password_flow: null, password_create_first: null } });
            await this.sendPrompt(chatId, session, botTexts.passwordCreated[lang]);
            await this.finalizeLogin(chatId, phone, session);
            return;
        }

        const { data: user, error } = await this.supabase
            .from('users')
            .select('id, password_hash, login_attempts, locked_until')
            .eq('phone', phone)
            .single();

        if (error || !user) {
            await this.sendPrompt(chatId, session, botTexts.passwordInvalid[lang]);
            return;
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const remainingMs = new Date(user.locked_until).getTime() - Date.now();
            const remainingMin = Math.ceil(remainingMs / 60000);
            await this.sendPrompt(chatId, session, `${botTexts.accountLocked[lang]} (${remainingMin} min)`);
            return;
        }

        if (!user.password_hash) {
            await this.sendPrompt(chatId, session, botTexts.passwordInvalid[lang]);
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
                await this.sendPrompt(chatId, session, botTexts.accountLocked[lang]);
                return;
            }

            await this.supabase
                .from('users')
                .update({ login_attempts: newAttempts })
                .eq('id', user.id);

            await this.sendPrompt(chatId, session, botTexts.passwordInvalid[lang]);
            return;
        }

        await this.supabase
            .from('users')
            .update({ login_attempts: 0, locked_until: null })
            .eq('id', user.id);

        await this.sendPrompt(chatId, session, botTexts.loginSuccess[lang]);
        await this.setSession(session, { data: { ...session.data, password_flow: null } });
        await this.finalizeLogin(chatId, phone, session);
    }

    private async finalizeLogin(chatId: number, phone: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const userId = await this.findOrCreateUser(phone, session.telegram_user_id);
        if (!userId) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
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
            const targetRole = String(session.data?.role_switch_target || '').trim();
            const clearedData = {
                ...session.data,
                role_switch_pending: false,
                role_switch_request: null,
                role_switch_target: null
            };
            await this.setSession(session, { data: clearedData });

            if (targetRole === 'employer' || targetRole === 'seeker') {
                await this.handleRoleSelect(chatId, targetRole, {
                    ...session,
                    user_id: userId,
                    data: clearedData
                });
                return;
            }

            await this.setSession(session, {
                state: BotState.SELECTING_ROLE,
                data: clearedData
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
        const normalizedDigits = this.normalizePhoneValue(phone);
        const canonicalPhone = normalizedDigits ? `+${normalizedDigits}` : phone;

        const existing = await this.findUserByPhone(canonicalPhone);
        if (existing?.id) {
            if (!existing.telegram_user_id || existing.telegram_user_id !== telegramId) {
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
                phone: canonicalPhone,
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

        const retryByPhone = await this.findUserByPhone(canonicalPhone);
        if (retryByPhone?.id) return retryByPhone.id;

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
                    phone: canonicalPhone,
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
                            phone: canonicalPhone,
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
                await this.sendPrompt(chatId, session, promptText, options);
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
        await this.sendPrompt(chatId, session, promptText, options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
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
            await this.sendPrompt(chatId, session, promptText, options);
        }
    }

    private async handleDistrictSelect(chatId: number, districtId: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        const districts = session.data?.districts || [];
        const districtIdNum = Number.parseInt(districtId, 10);
        const district = districts.find((d: any) => String(d.id) === String(districtId))
            || districts.find((d: any) => Number.isFinite(districtIdNum) && String(d.id) === String(districtIdNum));
        const normalizedDistrictId = district?.id
            ?? (Number.isFinite(districtIdNum) ? districtIdNum : districtId);

        if (session.state === BotState.EMPLOYER_PROFILE_DISTRICT) {
            const updatedDraft = {
                ...(session.data?.employer_profile || {}),
                district_id: normalizedDistrictId
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
                district_id: normalizedDistrictId,
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
                district_id: normalizedDistrictId,
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
                await this.sendPrompt(chatId, session, botTexts.askCategory[lang], options);
            }
            return;
        }

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                district_id: normalizedDistrictId,
                district_name: lang === 'uz' ? district?.name_uz : district?.name_ru
            }
        };
        await this.setSession(session, {
            state: BotState.SELECTING_EXPERIENCE,
            data: updatedData
        });

        const options = { replyMarkup: keyboards.experienceKeyboard(lang) };
        await this.sendPrompt(chatId, session, botTexts.askExperience[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
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
                await this.sendPrompt(chatId, session, botTexts.askEmploymentType[lang], options);
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
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], options);
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
                try {
                    await editMessage(chatId, messageId, text, options);
                } catch {
                    await this.sendPrompt(chatId, session, text, options);
                }
            } else {
                await this.sendPrompt(chatId, session, text, options);
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
            try {
                await editMessage(chatId, messageId, promptText, options);
            } catch {
                await this.sendPrompt(chatId, session, promptText, options);
            }
        } else {
            await this.sendPrompt(chatId, session, promptText, options);
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
                title: fieldTitle || session.data?.temp_job?.title || null,
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
                title: fieldTitle || session.data?.resume?.title || null,
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

        if (session.data?.edit_mode && session.data?.active_resume_id) {
            const updatedResume = {
                ...session.data?.resume,
                title: fieldTitle || session.data?.resume?.title || null,
                category_id: resolved.id,
                category_ids: [resolved.id],
                category_name: lang === 'uz' ? resolved.name_uz : resolved.name_ru,
                field_id: fieldId,
                field_title: fieldTitle
            };
            await this.saveResume(session, updatedResume, session.data.active_resume_id);
            await this.setSession(session, {
                data: { ...session.data, edit_mode: false, edit_field: null, resume: updatedResume, field_context: null, field_query: '', field_options: [], field_page: 0 }
            });
            await this.showResumeById(chatId, session.data.active_resume_id, session);
            return;
        }

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
                    await this.sendPrompt(chatId, session, botTexts.askCategory[lang], options);
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
                    await this.sendPrompt(chatId, session, botTexts.askEmploymentType[lang], options);
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
            await this.sendPrompt(chatId, session, botTexts.askExperience[lang], options);
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
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

        const updatedData = { ...session.data, selected_categories: selectedCategories };
        await this.setSession(session, { data: updatedData });

        const options = { replyMarkup: keyboards.multiCategoryKeyboard(lang, selectedCategories, categories as any, categoryCounts, 'district') };
        if (messageId) {
            await editMessage(chatId, messageId, botTexts.categorySelected[lang], options);
        } else {
            await this.sendPrompt(chatId, session, botTexts.categorySelected[lang], options);
        }
    }

    private async handleExperienceSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.state === BotState.POSTING_JOB_EXPERIENCE) {
            const nextExperience = value === 'any' ? null : value;
            const updatedJob = {
                ...session.data?.temp_job,
                experience: nextExperience,
                raw_source_json: {
                    ...(session.data?.temp_job?.raw_source_json || {}),
                    work_experiance: this.mapExperienceKeyToRaw(nextExperience || 'any')
                }
            };
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
                await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
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
            await this.sendPrompt(chatId, session, botTexts.askWorkplace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'experience')
            });
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
            return;
        }

        await this.setSession(session, {
            state: BotState.SELECTING_EDUCATION,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.educationKeyboard(lang) };
        await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
    }

    private async handleEducationSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (value === 'done') {
            await this.finishEducationStep(chatId, session);
            return;
        }

        if (session.state === BotState.POSTING_JOB_EDUCATION) {
            const updatedJob = {
                ...session.data?.temp_job,
                education_level: value,
                raw_source_json: {
                    ...(session.data?.temp_job?.raw_source_json || {}),
                    min_education: this.mapEducationKeyToRaw(value)
                }
            };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_GENDER,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobGenderPrompt[lang], {
                replyMarkup: keyboards.jobGenderKeyboard(lang)
            });
            return;
        }

        if (value === 'any') {
            const options = { replyMarkup: keyboards.educationKeyboard(lang) };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.askEducation[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.askEducation[lang], options);
            }
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
                await this.sendPrompt(chatId, session, botTexts.askGender[lang], options);
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
            await this.sendPrompt(chatId, session, botTexts.askEducationPlace[lang], {
                replyMarkup: keyboards.backKeyboard(lang, 'education')
            });
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
            return;
        }

        await this.setSession(session, {
            state: BotState.SELECTING_SPECIAL,
            data: updatedData
        });
        const options = { replyMarkup: keyboards.specialCriteriaKeyboard(lang, updatedData.resume?.special || [], 'education') };
        await this.sendPrompt(chatId, session, botTexts.askSpecialCriteria[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
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
                replyMarkup: keyboards.jobAgeKeyboard(lang)
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
                await this.sendPrompt(chatId, session, botTexts.askSalary[lang], options);
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
        await this.sendPrompt(chatId, session, botTexts.askTitle[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
    }

    private async handleSpecialCriteria(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;

        if (session.state === BotState.POSTING_JOB_SPECIAL) {
            const currentSpecial = Array.isArray(session.data?.temp_job?.special) ? [...session.data.temp_job.special] : [];
            if (value === 'done') {
                const previousKeys = Array.isArray(session.data?.temp_job?.language_keys)
                    ? session.data.temp_job.language_keys
                    : [];
                const languageKeys = previousKeys.length > 0 ? previousKeys : this.getDefaultJobLanguageKeys(lang);
                const updatedJob = {
                    ...session.data?.temp_job,
                    special: currentSpecial,
                    language_keys: languageKeys,
                    languages: this.mapJobLanguageKeysToLabels(languageKeys, lang)
                };
                await this.setSession(session, {
                    state: BotState.POSTING_JOB_LANGUAGES,
                    data: { ...session.data, temp_job: updatedJob }
                });
                await this.sendPrompt(chatId, session, botTexts.jobLanguagesPrompt[lang], {
                    replyMarkup: keyboards.jobLanguagesKeyboard(lang, languageKeys)
                });
                return;
            }

            const idx = currentSpecial.indexOf(value);
            if (idx === -1) currentSpecial.push(value);
            else currentSpecial.splice(idx, 1);

            await this.setSession(session, {
                data: { ...session.data, temp_job: { ...session.data?.temp_job, special: currentSpecial } }
            });
            const options = {
                replyMarkup: keyboards.specialCriteriaKeyboard(lang, currentSpecial, 'job_age'),
                premiumKey: 'jobSpecialCriteriaPrompt'
            };
            if (messageId) {
                await editMessage(chatId, messageId, botTexts.jobSpecialCriteriaPrompt[lang], options);
            } else {
                await this.sendPrompt(chatId, session, botTexts.jobSpecialCriteriaPrompt[lang], options);
            }
            return;
        }

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

        const options = {
            replyMarkup: keyboards.specialCriteriaKeyboard(lang, currentSpecial, 'education'),
            premiumKey: 'askSpecialCriteria'
        };
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
            await this.sendPrompt(chatId, session, botTexts.askSalaryMax[lang], options);
            if (messageId) {
                try {
                    await deleteMessage(chatId, messageId);
                } catch {
                    // ignore
                }
            }
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
        await this.presentResumeAboutStep(chatId, session);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
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
        await this.sendPrompt(chatId, session, botTexts.askSubscriptionFrequency[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
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
        await this.sendPrompt(chatId, session, botTexts.askWorkMode[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
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
        await this.sendPrompt(chatId, session, botTexts.askWorkingDays[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
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
                replyMarkup: keyboards.jobWorkingHoursKeyboard(lang)
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
        await this.sendPrompt(chatId, session, botTexts.askExperience[lang], options);
        if (messageId) {
            try {
                await deleteMessage(chatId, messageId);
            } catch {
                // ignore
            }
        }
    }

    private async handleJobWorkingHoursSelect(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.POSTING_JOB_WORK_HOURS) return;

        if (value === 'manual') {
            await this.sendPrompt(chatId, session, `${botTexts.jobWorkingHoursPrompt[lang]}\n<i>${lang === 'uz' ? "Format: 09:00-18:00" : 'Формат: 09:00-18:00'}</i>`, {
                replyMarkup: keyboards.backKeyboard(lang, 'job_work_days')
            });
            return;
        }

        const map: Record<string, string> = {
            '09-18': '09:00-18:00',
            '08-17': '08:00-17:00',
            '10-19': '10:00-19:00',
            '09-17': '09:00-17:00',
            full_day: lang === 'uz' ? "To'liq kun" : 'Полный день',
            evening_shift: lang === 'uz' ? 'Kechki smena' : 'Вечерняя смена'
        };
        const workingHours = map[value];
        if (!workingHours) return;

        const updatedJob = { ...session.data?.temp_job, working_hours: workingHours };
        await this.setSession(session, {
            state: BotState.POSTING_JOB_EXPERIENCE,
            data: { ...session.data, temp_job: updatedJob }
        });
        await this.sendPrompt(chatId, session, botTexts.jobExperiencePrompt[lang], { replyMarkup: keyboards.jobExperienceKeyboard(lang) });
    }

    private async handleJobLanguageAction(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.POSTING_JOB_LANGUAGES) return;

        const currentKeys = Array.isArray(session.data?.temp_job?.language_keys)
            ? [...session.data.temp_job.language_keys]
            : this.getDefaultJobLanguageKeys(lang);

        if (value === 'manual') {
            await this.sendPrompt(chatId, session, `${botTexts.jobLanguagesPrompt[lang]}\n<i>${lang === 'uz' ? "Har bir tilni alohida qatorda yozing." : 'Напишите каждый язык с новой строки.'}</i>`, {
                replyMarkup: keyboards.backKeyboard(lang, 'job_special')
            });
            return;
        }

        if (value === 'done' || value === 'skip') {
            const finalKeys = value === 'skip' ? [] : currentKeys;
            const updatedJob = {
                ...session.data?.temp_job,
                language_keys: finalKeys,
                languages: this.mapJobLanguageKeysToLabels(finalKeys, lang)
            };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_BENEFITS,
                data: { ...session.data, temp_job: updatedJob }
            });
            const selectedBenefitKeys = Array.isArray(updatedJob?.benefit_keys) ? updatedJob.benefit_keys : [];
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.jobBenefitsKeyboard(lang, selectedBenefitKeys)
            });
            return;
        }

        if (!['uz', 'ru', 'en'].includes(value)) return;
        const toggled = currentKeys.includes(value)
            ? currentKeys.filter(item => item !== value)
            : [...currentKeys, value];
        const updatedJob = {
            ...session.data?.temp_job,
            language_keys: toggled,
            languages: this.mapJobLanguageKeysToLabels(toggled, lang)
        };
        await this.setSession(session, {
            data: { ...session.data, temp_job: updatedJob }
        });

        const options = {
            replyMarkup: keyboards.jobLanguagesKeyboard(lang, toggled),
            premiumKey: 'jobLanguagesPrompt'
        };
        if (messageId) {
            try {
                await editMessage(chatId, messageId, botTexts.jobLanguagesPrompt[lang], options);
                return;
            } catch {
                // ignore and send fresh prompt
            }
        }
        await this.sendPrompt(chatId, session, botTexts.jobLanguagesPrompt[lang], options);
    }

    private async handleResumeLanguageAction(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.SELECTING_RESUME_LANGUAGES) return;

        const currentKeys = Array.isArray(session.data?.resume?.language_keys)
            ? [...session.data.resume.language_keys]
            : this.getDefaultJobLanguageKeys(lang);

        if (value === 'manual') {
            await this.sendPrompt(chatId, session, `${botTexts.resumeLanguagesPrompt[lang]}\n<i>${lang === 'uz' ? "Har bir tilni alohida qatorda yozing." : 'Напишите каждый язык с новой строки.'}</i>`, {
                replyMarkup: keyboards.backKeyboard(lang, 'resume_languages')
            });
            return;
        }

        if (value === 'done' || value === 'skip') {
            const finalKeys = value === 'skip' ? [] : currentKeys;
            const updatedResume = {
                ...session.data?.resume,
                language_keys: finalKeys,
                languages: this.mapJobLanguageKeysToLabels(finalKeys, lang)
            };
            await this.setSession(session, {
                state: BotState.ADDING_SKILLS,
                data: { ...session.data, resume: updatedResume, ai_resume_skill_suggestions: [] }
            });
            await this.presentSkillsStep(chatId, session, 'resume_languages');
            return;
        }

        if (!['uz', 'ru', 'en'].includes(value)) return;
        const toggled = currentKeys.includes(value)
            ? currentKeys.filter(item => item !== value)
            : [...currentKeys, value];
        const updatedResume = {
            ...session.data?.resume,
            language_keys: toggled,
            languages: this.mapJobLanguageKeysToLabels(toggled, lang)
        };
        await this.setSession(session, {
            data: { ...session.data, resume: updatedResume }
        });

        const options = {
            replyMarkup: keyboards.resumeLanguagesKeyboard(lang, toggled),
            premiumKey: 'resumeLanguagesPrompt'
        };
        if (messageId) {
            try {
                await editMessage(chatId, messageId, botTexts.resumeLanguagesPrompt[lang], options);
                return;
            } catch {
                // ignore and send a fresh prompt
            }
        }
        await this.sendPrompt(chatId, session, botTexts.resumeLanguagesPrompt[lang], options);
    }

    private async continueAfterJobBenefits(chatId: number, session: TelegramSession, updatedJob: any): Promise<void> {
        const lang = session.lang;
        const existingHr = String(updatedJob?.hr_name || '').trim();
        const hasExistingHr = existingHr.length >= 3;
        const isHrFromProfile = Boolean(updatedJob?.hr_from_profile) && hasExistingHr;
        const finalJob = { ...updatedJob, hr_from_profile: isHrFromProfile };

        await this.setSession(session, {
            state: hasExistingHr ? BotState.POSTING_JOB_CONTACT_PHONE : BotState.POSTING_JOB_HR_NAME,
            data: { ...session.data, temp_job: finalJob }
        });

        if (hasExistingHr) {
            const backTarget = isHrFromProfile ? 'job_benefits' : 'job_hr';
            await this.sendPrompt(chatId, session, botTexts.jobContactPrompt[lang], {
                replyMarkup: keyboards.backKeyboard(lang, backTarget)
            });
            return;
        }

        await this.sendPrompt(chatId, session, botTexts.jobHrPrompt[lang], {
            replyMarkup: keyboards.backKeyboard(lang, 'job_benefits')
        });
    }

    private async handleJobBenefitAction(chatId: number, value: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.POSTING_JOB_BENEFITS) return;

        const currentKeys = Array.isArray(session.data?.temp_job?.benefit_keys)
            ? [...session.data.temp_job.benefit_keys]
            : [];

        if (value === 'manual') {
            await this.sendPrompt(chatId, session, `${botTexts.jobBenefitsPrompt[lang]}\n<i>${lang === 'uz' ? "Har birini alohida qatorda yozing." : 'Пишите по одному пункту с новой строки.'}</i>`, {
                replyMarkup: keyboards.backKeyboard(lang, 'job_languages')
            });
            return;
        }

        if (value === 'done' || value === 'skip') {
            const finalKeys = value === 'skip' ? [] : currentKeys;
            const updatedJob = {
                ...session.data?.temp_job,
                benefit_keys: finalKeys,
                benefits: finalKeys.length > 0 ? this.mapJobBenefitKeysToLabels(finalKeys, lang) : null
            };
            await this.continueAfterJobBenefits(chatId, session, updatedJob);
            return;
        }

        if (!['official', 'lunch', 'transport'].includes(value)) return;
        const toggled = currentKeys.includes(value)
            ? currentKeys.filter(item => item !== value)
            : [...currentKeys, value];
        const updatedJob = {
            ...session.data?.temp_job,
            benefit_keys: toggled,
            benefits: toggled.length > 0 ? this.mapJobBenefitKeysToLabels(toggled, lang) : null
        };
        await this.setSession(session, {
            data: { ...session.data, temp_job: updatedJob }
        });

        const options = {
            replyMarkup: keyboards.jobBenefitsKeyboard(lang, toggled),
            premiumKey: 'jobBenefitsPrompt'
        };
        if (messageId) {
            try {
                await editMessage(chatId, messageId, botTexts.jobBenefitsPrompt[lang], options);
                return;
            } catch {
                // ignore and send fresh prompt
            }
        }
        await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], options);
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
                .select('title, desired_position, full_name, about, phone, region_id, district_id, category_id, category_ids, field_id, field_title, skills, experience_details, education, expected_salary_min, expected_salary_max, experience_years, gender, education_level, experience, birth_date, special')
                .eq('id', resumeId)
                .maybeSingle();
            data = primary.data || null;
            selectError = primary.error || null;
            if (selectError && String(selectError.message || '').includes('special')) {
                const fallback = await this.supabase
                    .from('resumes')
                    .select('title, desired_position, full_name, about, phone, region_id, district_id, category_id, category_ids, field_id, field_title, skills, experience_details, education, expected_salary_min, expected_salary_max, experience_years, gender, education_level, experience, birth_date')
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
            expected_salary_min, expected_salary_max, salary_max, birth_date, experience_details, special, field_id, field_title, languages, post_to_channel
        } = resumeData;

        const parseNumber = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            const cleaned = String(value).replace(/[^\d]/g, '');
            if (!cleaned) return null;
            const num = Number(cleaned);
            return Number.isFinite(num) ? num : null;
        };

        const hasProp = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
        const hasIncomingPostToChannel = hasProp(resumeData, 'post_to_channel');

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
        const normalizedLanguages = hasProp(resumeData, 'languages')
            ? Array.from(new Set(
                (Array.isArray(languages) ? languages : this.parseListInput(String(languages || '')))
                    .map((item: any) => String(item).trim())
                    .filter(Boolean)
            ))
            : null;

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
        const finalDesiredPosition = hasProp(resumeData, 'desired_position')
            ? (String(desired_position || safeTitle).trim() || safeTitle)
            : (String(existing?.desired_position || safeTitle).trim() || safeTitle);
        const finalExpectedSalaryMin = parseNumber(expected_salary_min ?? salary ?? existing?.expected_salary_min ?? null);
        const finalExpectedSalaryMax = parseNumber(expected_salary_max ?? salary_max ?? existing?.expected_salary_max ?? null);
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
        const hasIncomingExperienceYears = hasProp(resumeData, 'experience_years');
        const incomingExperienceYears = hasIncomingExperienceYears ? parseNumber((resumeData as any).experience_years) : null;
        const existingExperienceYears = parseNumber(existing?.experience_years);
        const currentYear = new Date().getFullYear();
        const experienceYearsFromDetails = finalExperienceDetails.reduce((maxValue, item) => {
            const start = Number(item?.start_year);
            const end = item?.is_current ? currentYear : Number(item?.end_year || start);
            if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || end < start) return maxValue;
            const years = Math.max(0, end - start + 1);
            return Math.max(maxValue, years);
        }, 0);
        const experienceBand = this.normalizeExperienceLevel(experience_level || experience || existing?.experience);
        const fallbackExperienceYears = experienceBand === null
            ? 0
            : ({ 0: 0, 1: 1, 2: 2, 3: 4, 4: 6 } as Record<number, number>)[experienceBand] ?? 0;
        const finalExperienceYears =
            incomingExperienceYears
            ?? ((existingExperienceYears !== null && existingExperienceYears > 0) ? existingExperienceYears : null)
            ?? (experienceYearsFromDetails > 0 ? experienceYearsFromDetails : fallbackExperienceYears);

        const payload = {
            user_id: session.user_id,
            region_id: finalRegionId,
            district_id: finalDistrictId,
            category_id: finalCategoryId,
            category_ids: finalCategoryIds,
            field_id: finalFieldId,
            field_title: finalFieldTitle,
            title: safeTitle,
            desired_position: finalDesiredPosition,
            full_name: finalFullName,
            about: finalAbout,
            skills: normalizedSkills,
            experience: experience_level || experience || existing?.experience || 'no_experience',
            experience_level: experience_level || experience || existing?.experience || 'no_experience',
            experience_years: finalExperienceYears,
            education_level: normalizedEducationLevel,
            experience_details: finalExperienceDetails,
            education: finalEducation,
            gender: normalizedGender,
            expected_salary_min: finalExpectedSalaryMin,
            expected_salary_max: finalExpectedSalaryMax,
            birth_date: finalBirthDate,
            special: normalizedSpecial,
            is_public: true,
            status: 'active',
            updated_at: new Date().toISOString(),
            phone: session.phone || existing?.phone || null
        } as Record<string, any>;
        if (hasIncomingPostToChannel) {
            payload.post_to_channel = post_to_channel === null ? null : Boolean(post_to_channel);
        }
        if (normalizedLanguages !== null) {
            payload.languages = normalizedLanguages;
        }

        if (!payload.title || String(payload.title).trim().length === 0) {
            payload.title = 'Mutaxassis';
        }
        const profileTelegram = this.normalizeTelegramUsername(session.data?.telegram_username);

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
                telegram: profileTelegram,
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
            telegram: profileTelegram,
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
        const isAdminUser = this.isAdminTelegramUser(session.telegram_user_id);

        // Migrate legacy state where job category was asked before profession.
        if (state === BotState.POSTING_JOB_CATEGORY) {
            const existingTitle = String(session.data?.temp_job?.title || '').trim();
            if (existingTitle.length >= 3) {
                const loadingHintId = await this.showLoadingHint(chatId, session);
                let matches: OsonishField[] = [];
                try {
                    const fields = await this.getOsonishFields(existingTitle);
                    matches = fields.length ? this.pickFieldMatches(fields, existingTitle, 300) : [];
                } finally {
                    await this.clearLoadingHint(chatId, loadingHintId);
                }
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
                await this.safeHandleBack(chatId, target, session);
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

        const allowDirectMenuTapStates = [
            BotState.MAIN_MENU,
            BotState.EMPLOYER_MAIN_MENU,
            BotState.SETTINGS,
            BotState.ADMIN_MENU,
            BotState.BROWSING_JOBS,
            BotState.VIEWING_RESUME
        ];
        if (this.isMenuButtonText(text, lang) && !allowDirectMenuTapStates.includes(state)) {
            const retryPrompt = this.buildAlphabetRetryPrompt(session);
            if (retryPrompt) {
                await this.sendPrompt(chatId, session, retryPrompt.text, { replyMarkup: retryPrompt.replyMarkup });
                return;
            }
            const backTarget = this.getBackTargetForState(session);
            await this.sendPrompt(
                chatId,
                session,
                lang === 'uz'
                    ? "<b>⚠️ | Jarayon davom etmoqda.</b>\n<i>Avval joriy bosqichni yakunlang yoki “Orqaga” tugmasini bosing.</i>"
                    : '<b>⚠️ | Процесс ещё не завершён.</b>\n<i>Сначала завершите текущий шаг или нажмите «Назад».</i>',
                {
                    parseMode: 'HTML',
                    replyMarkup: backTarget ? keyboards.backKeyboard(lang, backTarget) : undefined
                }
            );
            return;
        }

        if (state === BotState.ADMIN_BROADCAST_INPUT) {
            await this.handleAdminBroadcastDraft(chatId, text, session);
            return;
        }
        if (state === BotState.ADMIN_BROADCAST_CONFIRM) {
            await this.sendPrompt(chatId, session, botTexts.adminBroadcastConfirm[lang], {
                replyMarkup: keyboards.adminBroadcastConfirmKeyboard(lang)
            });
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
            const retryPrompt = this.buildAlphabetRetryPrompt(session);
            if (retryPrompt) {
                await this.sendPrompt(
                    chatId,
                    session,
                    `${botTexts.invalidAlphabet[lang]}\n\n${retryPrompt.text}`,
                    { replyMarkup: retryPrompt.replyMarkup }
                );
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
            const locationPrompt = session.data?.location_intent === 'job_post_location'
                ? botTexts.jobLocationPrompt[lang]
                : botTexts.locationRequest[lang];
            await this.sendPrompt(chatId, session, locationPrompt, {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
            return;
        }

        if (state === BotState.RESUME_CHANNEL_CONFIRM) {
            const channelUsername = this.normalizeChannelUsername(session.data?.resume_channel_username)
                || await this.getRegionChannelUsernameById(session.data?.resume?.region_id);
            if (!channelUsername) {
                await this.finalizeResume(chatId, session, { postToChannel: false });
                return;
            }
            await this.sendPrompt(chatId, session, this.buildResumeChannelConfirmText(lang, channelUsername), {
                replyMarkup: keyboards.resumeChannelPostConfirmKeyboard(lang)
            });
            return;
        }

        // EMPLOYER PROFILE FLOW
        if (state === BotState.EMPLOYER_PROFILE_COMPANY) {
            const companyName = text.trim();
            if (companyName.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.minThreeChars[lang]}\n\n${botTexts.companyNamePrompt[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'role_pick')
                });
                return;
            }
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.company_name = companyName;
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DIRECTOR, data: { ...session.data, employer_profile: draft } });
            await this.sendPrompt(chatId, session, botTexts.employerDirectorPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_company') });
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_DIRECTOR) {
            const directorName = text.trim();
            if (directorName.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.minThreeChars[lang]}\n\n${botTexts.employerDirectorPrompt[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'employer_company')
                });
                return;
            }
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.director_name = directorName;
            await this.finalizeEmployerProfile(chatId, session, draft);
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_INDUSTRY) {
            const draft = { ...(session.data?.employer_profile || {}) };
            if (!draft.director_name && text.trim().length >= 3) {
                draft.director_name = text.trim();
            }
            await this.finalizeEmployerProfile(chatId, session, draft);
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_SIZE) {
            const draft = { ...(session.data?.employer_profile || {}) };
            if (!draft.director_name && text.trim().length >= 3) {
                draft.director_name = text.trim();
            }
            await this.finalizeEmployerProfile(chatId, session, draft);
            return;
        }

        if (state === BotState.EMPLOYER_PROFILE_ADDRESS) {
            const address = text.trim();
            if (address.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.minThreeChars[lang]}\n\n${botTexts.employerAddressPrompt[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'employer_region')
                });
                return;
            }
            const draft = { ...(session.data?.employer_profile || {}) };
            draft.address = address;
            await this.finalizeEmployerProfile(chatId, session, draft);
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
            if (title.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.fieldMinChars[lang]}\n\n${botTexts.postJobTitle[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'employer_menu')
                });
                return;
            }
            const loadingHintId = await this.showLoadingHint(chatId, session);
            let matches: OsonishField[] = [];
            try {
                const fields = await this.getOsonishFields(title);
                matches = fields.length ? this.pickFieldMatches(fields, title, 300) : [];
            } finally {
                await this.clearLoadingHint(chatId, loadingHintId);
            }
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
            const address = text.trim();
            if (address.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.minThreeChars[lang]}\n\n${botTexts.jobAddressPrompt[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'job_district')
                });
                return;
            }
            const updatedJob = { ...session.data?.temp_job, address };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.REQUESTING_LOCATION,
                data: { ...session.data, temp_job: updatedJob, location_intent: 'job_post_location' }
            });
            await this.sendPrompt(chatId, session, botTexts.jobLocationPrompt[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang, { showBack: true, showCancel: false })
            });
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
            const normalizedAgeText = String(text || '').trim().toLowerCase();
            const isAnyAge = normalizedAgeText === 'ahamiyatsiz'
                || normalizedAgeText === 'не важно'
                || normalizedAgeText === 'неважно'
                || normalizedAgeText === 'any';
            const parsed = isAnyAge ? { min: null, max: null } : this.parseAgeRange(text);
            if (!parsed) {
                await this.sendPrompt(chatId, session, botTexts.jobAgeInvalid[lang], {
                    replyMarkup: keyboards.jobAgeKeyboard(lang)
                });
                return;
            }
            const currentSpecial = Array.isArray(session.data?.temp_job?.special) ? session.data.temp_job.special : [];
            const updatedJob = {
                ...session.data?.temp_job,
                age_min: parsed.min,
                age_max: parsed.max,
                special: currentSpecial
            };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_SPECIAL,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobSpecialCriteriaPrompt[lang], {
                replyMarkup: keyboards.specialCriteriaKeyboard(lang, currentSpecial, 'job_age')
            });
            return;
        }

        if (state === BotState.POSTING_JOB_SPECIAL) {
            await this.sendPrompt(chatId, session, botTexts.jobSpecialCriteriaPrompt[lang], {
                replyMarkup: keyboards.specialCriteriaKeyboard(
                    lang,
                    Array.isArray(session.data?.temp_job?.special) ? session.data.temp_job.special : [],
                    'job_age'
                )
            });
            return;
        }

        if (state === BotState.POSTING_JOB_LANGUAGES) {
            const list = this.parseListInput(text);
            const keys = this.mapJobLanguageLabelsToKeys(list);
            const updatedJob = { ...session.data?.temp_job, languages: list, language_keys: keys };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_BENEFITS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.jobBenefitsKeyboard(lang, Array.isArray(session.data?.temp_job?.benefit_keys) ? session.data.temp_job.benefit_keys : [])
            });
            return;
        }

        if (state === BotState.POSTING_JOB_BENEFITS) {
            const list = this.parseListInput(text);
            const benefitKeys = this.mapJobBenefitLabelsToKeys(list);
            const updatedJob = {
                ...session.data?.temp_job,
                benefits: list.length > 0 ? list : (text.trim() ? [text.trim()] : null),
                benefit_keys: benefitKeys
            };
            await this.continueAfterJobBenefits(chatId, session, updatedJob);
            return;
        }

        if (state === BotState.POSTING_JOB_HR_NAME) {
            const hrName = text.trim();
            if (hrName.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.minThreeChars[lang]}\n\n${botTexts.jobHrPrompt[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'job_benefits')
                });
                return;
            }
            const updatedJob = { ...session.data?.temp_job, hr_name: hrName, hr_from_profile: false };
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
            await this.setSession(session, {
                state: BotState.POSTING_JOB_DESCRIPTION,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.presentJobDescriptionStep(chatId, session);
            return;
        }

        if (state === BotState.POSTING_JOB_DESCRIPTION) {
            const description = text.trim();
            if (description.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.minThreeChars[lang]}\n\n${botTexts.postJobDescription[lang]}`, {
                    replyMarkup: keyboards.jobDescriptionKeyboard(lang)
                });
                return;
            }
            const updatedJob = { ...session.data?.temp_job, description };
            await this.updateSession(session.telegram_user_id, {
                state: BotState.POSTING_JOB_CONFIRM,
                data: { ...session.data, temp_job: updatedJob }
            });
            const jobSummary = this.buildJobConfirmText(lang, updatedJob);
            const channelUsername = await this.getRegionChannelUsernameById(updatedJob?.region_id);
            const channelHint = channelUsername ? `\n\n${this.buildJobChannelNotice(lang, channelUsername, 'pending')}` : '';
            await this.sendPrompt(chatId, session, `${jobSummary}${channelHint}`, { replyMarkup: keyboards.jobConfirmKeyboard(lang) });
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
            const loadingHintId = await this.showLoadingHint(chatId, session);
            let matches: OsonishField[] = [];
            try {
                const fields = await this.getOsonishFields(query);
                matches = this.pickFieldMatches(fields, query, 300);
            } finally {
                await this.clearLoadingHint(chatId, loadingHintId);
            }
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
            const title = text.trim();
            if (title.length < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.titleTooShort[lang]}\n\n${botTexts.askTitle[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, session.data?.edit_mode ? 'resume_view' : 'salary')
                });
                return;
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, title } };
            const loadingHintId = await this.showLoadingHint(chatId, session);
            let matches: OsonishField[] = [];
            try {
                const fields = await this.getOsonishFields(title);
                matches = fields.length ? this.pickFieldMatches(fields, title) : [];
            } finally {
                await this.clearLoadingHint(chatId, loadingHintId);
            }
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
                        replyMarkup: keyboards.backKeyboard(lang, session.data?.edit_mode ? 'resume_view' : 'salary')
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
            const fullName = text.trim();
            const letterCount = (fullName.match(/[A-Za-z\u0400-\u04FF]/g) || []).length;
            if (letterCount < 3) {
                await this.sendPrompt(chatId, session, `${botTexts.nameTooShort[lang]}\n\n${botTexts.askName[lang]}`, {
                    replyMarkup: keyboards.backKeyboard(lang, 'title')
                });
                return;
            }
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, full_name: fullName }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, full_name: fullName } };
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
            const existingLanguageKeys = Array.isArray(session.data?.resume?.language_keys)
                ? session.data.resume.language_keys
                : [];
            const languageKeys = existingLanguageKeys.length > 0
                ? existingLanguageKeys
                : this.getDefaultJobLanguageKeys(lang);
            const updatedData = {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    about: aboutText,
                    language_keys: languageKeys,
                    languages: this.mapJobLanguageKeysToLabels(languageKeys, lang)
                }
            };
            await this.setSession(session, {
                state: BotState.SELECTING_RESUME_LANGUAGES,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.resumeLanguagesPrompt[lang], {
                replyMarkup: keyboards.resumeLanguagesKeyboard(lang, languageKeys)
            });
            return;
        }

        if (state === BotState.SELECTING_RESUME_LANGUAGES) {
            const lowerText = text.toLowerCase();
            if (lowerText === "o'tkazib yuborish" || lowerText === 'пропустить') {
                await this.handleSkip(chatId, session);
                return;
            }
            const list = this.parseListInput(text);
            const keys = this.mapJobLanguageLabelsToKeys(list);
            const updatedResume = {
                ...session.data?.resume,
                language_keys: keys,
                languages: list
            };
            await this.setSession(session, {
                state: BotState.ADDING_SKILLS,
                data: { ...session.data, resume: updatedResume, ai_resume_skill_suggestions: [] }
            });
            await this.presentSkillsStep(chatId, session, 'resume_languages');
            return;
        }

        if (state === BotState.ADDING_SKILLS) {
            const lower = text.toLowerCase().trim();
            if (lower === "o'tkazib yuborish" || lower === 'пропустить') {
                await this.handleSkip(chatId, session);
                return;
            }
            if (lower === 'tayyor' || lower === 'готово') {
                await this.finishSkills(chatId, session);
                return;
            }
            const parsedItems = this.parseListInput(text);
            if (!parsedItems.length) {
                await this.sendPrompt(chatId, session, this.buildResumeSkillsPrompt(
                    lang,
                    Array.isArray(session.data?.ai_resume_skill_suggestions) ? session.data.ai_resume_skill_suggestions : []
                ), {
                    parseMode: 'HTML',
                    replyMarkup: keyboards.skillsInlineKeyboard(
                        lang,
                        false,
                        session.data?.edit_mode ? 'resume_view' : 'resume_languages',
                        Array.isArray(session.data?.ai_resume_skill_suggestions)
                            && session.data.ai_resume_skill_suggestions.length > 0
                    )
                });
                return;
            }
            const currentSkills = Array.isArray(session.data?.resume?.skills) ? session.data.resume.skills : [];
            const merged: string[] = [];
            const seen = new Set<string>();
            for (const item of [...currentSkills, ...parsedItems]) {
                const value = String(item || '').trim();
                if (!value) continue;
                const key = value.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(value);
            }
            const updatedData = { ...session.data, resume: { ...session.data?.resume, skills: merged } };
            await this.setSession(session, { data: updatedData });
            await this.finishSkills(chatId, { ...session, data: updatedData });
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
                await this.sendTransientMessage(
                    chatId,
                    lang === 'uz' ? "🤖 AI ma'lumotlarni tayyorlamoqda..." : '🤖 AI обрабатывает вакансию...',
                    800,
                    '__transient_ai'
                );
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
            offers: { uz: '📨 Takliflar', ru: '📨 Приглашения' },
            resume: { uz: '🧾 Rezyume', ru: '🧾 Резюме' },
            settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки' },
            help: { uz: '🆘 Yordam', ru: '🆘 Помощь' }
        };
        const employerTexts = {
            post_job: { uz: '📢 Vakansiya joylash', ru: '📢 Разместить вакансию' },
            my_vacancies: { uz: '📋 Mening vakansiyalarim', ru: '📋 Мои вакансии' },
            find_worker: { uz: '🔎 Ishchi topish', ru: '🔎 Найти кандидатов' },
            find_worker_legacy: { uz: '👥 Nomzod topish', ru: '👥 Найти кандидатов' },
            applications: { uz: '📨 Arizalar', ru: '📨 Отклики' },
            help: { uz: '🆘 Yordam', ru: '🆘 Помощь' },
            settings: { uz: '⚙️ Sozlamalar', ru: '⚙️ Настройки' }
        };
        const adminTexts = {
            stats: { uz: '📊 Statistika', ru: '📊 Статистика' },
            offenders: { uz: '🚨 Qoidabuzarlar', ru: '🚨 Нарушители' },
            broadcast: { uz: '📣 Hammaga xabar yuborish', ru: '📣 Рассылка всем' },
            main: { uz: '🏠 Asosiy menyu', ru: '🏠 Главное меню' }
        };
        const isEmployer = session.data?.active_role === 'employer';

        if (isAdminUser) {
            if (this.equalsMenuText(text, adminTexts.stats[lang])) {
                await this.showAdminStats(chatId, session);
                return;
            }
            if (this.equalsMenuText(text, adminTexts.offenders[lang])) {
                await this.showAdminOffenders(chatId, session);
                return;
            }
            if (this.equalsMenuText(text, adminTexts.broadcast[lang])) {
                await this.startAdminBroadcast(chatId, session);
                return;
            }
            if (this.equalsMenuText(text, adminTexts.main[lang])) {
                await this.showMainMenu(chatId, session);
                return;
            }
            if (state === BotState.ADMIN_MENU) {
                await this.showAdminMenu(chatId, session);
                return;
            }
        }

        if (isEmployer) {
            if (this.equalsMenuText(text, employerTexts.post_job[lang])) {
                await this.handleEmployerMainMenu(chatId, 'post_job', session);
            } else if (this.equalsMenuText(text, employerTexts.my_vacancies[lang])) {
                await this.handleEmployerMainMenu(chatId, 'my_vacancies', session);
            } else if (
                this.equalsMenuText(text, employerTexts.find_worker[lang])
                || this.equalsMenuText(text, (lang === 'uz' ? '👥 Ishchi topish' : '👥 Найти кандидатов'))
                || this.equalsMenuText(text, employerTexts.find_worker_legacy[lang])
                || this.equalsMenuText(text, (lang === 'uz' ? '🧑‍💼 Ishchi topish' : '🧑‍💼 Найти сотрудника'))
            ) {
                await this.handleEmployerMainMenu(chatId, 'find_worker', session);
            } else if (this.equalsMenuText(text, employerTexts.applications[lang])) {
                await this.handleEmployerMainMenu(chatId, 'applications', session);
            } else if (this.equalsMenuText(text, employerTexts.help[lang])) {
                await this.handleAction(chatId, 'help', session);
            } else if (this.equalsMenuText(text, employerTexts.settings[lang])) {
                await this.handleAction(chatId, 'settings', session);
            } else {
                await this.showMainMenu(chatId, session);
            }
            return;
        }

        if (this.equalsMenuText(text, menuTexts.jobs[lang])) {
            await this.handleAction(chatId, 'jobs', session);
        } else if (this.equalsMenuText(text, menuTexts.offers[lang])) {
            await this.handleAction(chatId, 'offers', session);
        } else if (this.equalsMenuText(text, menuTexts.resume[lang])) {
            await this.handleAction(chatId, 'profile', session);
        } else if (this.equalsMenuText(text, menuTexts.settings[lang])) {
            await this.handleAction(chatId, 'settings', session);
        } else if (this.equalsMenuText(text, menuTexts.saved[lang])) {
            await this.handleAction(chatId, 'saved', session);
        } else if (this.equalsMenuText(text, menuTexts.help[lang])) {
            await this.handleAction(chatId, 'help', session);
        } else {
            // Unknown text - show help + menu to avoid hard errors
            console.log('[BOT] Unknown text in state', state, ':', text);
            await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                replyMarkup: keyboards.helpSupportKeyboard(lang),
                parseMode: 'HTML'
            });
        }

    }

    private async handleSkip(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const state = session.state;

        // Optional resume steps
        if (state === BotState.ENTERING_ABOUT) {
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                await this.saveResume(session, { ...session.data?.resume, about: null }, session.data.active_resume_id);
                const updatedData = { ...session.data, edit_mode: false, edit_field: null };
                await this.setSession(session, { data: updatedData });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            const defaultLanguageKeys = this.getDefaultJobLanguageKeys(lang);
            const updatedData = {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    about: null,
                    language_keys: defaultLanguageKeys,
                    languages: this.mapJobLanguageKeysToLabels(defaultLanguageKeys, lang)
                }
            };
            await this.setSession(session, {
                state: BotState.SELECTING_RESUME_LANGUAGES,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.resumeLanguagesPrompt[lang], {
                replyMarkup: keyboards.resumeLanguagesKeyboard(lang, defaultLanguageKeys)
            });
            return;
        }
        if (state === BotState.SELECTING_RESUME_LANGUAGES) {
            const updatedData = {
                ...session.data,
                resume: {
                    ...session.data?.resume,
                    language_keys: [],
                    languages: []
                }
            };
            await this.setSession(session, {
                state: BotState.ADDING_SKILLS,
                data: { ...updatedData, ai_resume_skill_suggestions: [] }
            });
            await this.presentSkillsStep(chatId, session, 'resume_languages');
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
            const updatedJob = { ...session.data?.temp_job, languages: [], language_keys: [] };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_BENEFITS,
                data: { ...session.data, temp_job: updatedJob }
            });
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.jobBenefitsKeyboard(lang, [])
            });
            return;
        }
        if (state === BotState.POSTING_JOB_BENEFITS) {
            const updatedJob = { ...session.data?.temp_job, benefits: null, benefit_keys: [] };
            const existingHr = String(updatedJob?.hr_name || '').trim();
            const hasHrFromProfile = existingHr.length >= 3;
            await this.setSession(session, {
                state: hasHrFromProfile ? BotState.POSTING_JOB_CONTACT_PHONE : BotState.POSTING_JOB_HR_NAME,
                data: { ...session.data, temp_job: updatedJob }
            });
            if (hasHrFromProfile) {
                await this.sendPrompt(chatId, session, botTexts.jobContactPrompt[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'job_benefits')
                });
            } else {
                await this.sendPrompt(chatId, session, botTexts.jobHrPrompt[lang], {
                    replyMarkup: keyboards.backKeyboard(lang, 'job_benefits')
                });
            }
            return;
        }

        if (state === BotState.SELECTING_SALARY_MAX) {
            await this.handleSalaryMaxSelect(chatId, 'all', session);
            return;
        }

        // For required steps, ignore skip and re-ask
        if (state === BotState.REQUESTING_LOCATION) {
            if (session.data?.location_intent === 'job_post_location') {
                await this.sendPrompt(chatId, session, botTexts.jobLocationPrompt[lang], {
                    replyMarkup: keyboards.locationRequestKeyboard(lang, { showBack: true, showCancel: false })
                });
                return;
            }
            await this.sendPrompt(chatId, session, botTexts.locationRequest[lang], {
                replyMarkup: keyboards.locationRequestKeyboard(lang)
            });
        }
    }

    private async handleCancel(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.clearFlowCancelKeyboard(chatId, session);
        if (
            session.state === BotState.ADMIN_MENU
            || session.state === BotState.ADMIN_BROADCAST_INPUT
            || session.state === BotState.ADMIN_BROADCAST_CONFIRM
        ) {
            await this.showAdminMenu(chatId, session);
            return;
        }
        const isEmployer = session.data?.active_role === 'employer';
        const updatedData = {
            ...session.data,
            flow: null,
            edit_mode: false,
            edit_field: null,
            location_intent: null,
            role_switch_pending: false,
            role_switch_request: null,
            role_switch_target: null,
            password_create_first: null,
            resume_channel_username: null,
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
        await this.showMainMenu(chatId, {
            ...session,
            state: isEmployer ? BotState.EMPLOYER_MAIN_MENU : BotState.MAIN_MENU,
            data: updatedData,
            active_role: isEmployer ? 'employer' : 'job_seeker'
        });
    }

    private async safeHandleBack(chatId: number, target: string, session: TelegramSession): Promise<void> {
        try {
            const safeTarget = String(target || '').trim();
            if (!safeTarget) {
                await this.showMainMenu(chatId, session);
                return;
            }
            await this.handleBack(chatId, safeTarget, session);
        } catch (error) {
            console.error('[BOT] handleBack error:', error);
            await this.showMainMenu(chatId, session);
        }
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

        if (target === 'admin_menu') {
            await this.showAdminMenu(chatId, session);
            return;
        }

        if (target === 'role_pick') {
            await this.setSession(session, { state: BotState.SELECTING_ROLE });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], {
                replyMarkup: keyboards.roleSelectionKeyboard(lang)
            });
            return;
        }

        if (target === 'employer_menu') {
            const nextData = { ...session.data, active_role: 'employer' };
            await this.setSession(session, { state: BotState.EMPLOYER_MAIN_MENU, data: nextData });
            await this.showMainMenu(chatId, {
                ...session,
                state: BotState.EMPLOYER_MAIN_MENU,
                data: nextData,
                active_role: 'employer'
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
            await this.presentResumeAboutStep(chatId, session);
            return;
        }

        if (target === 'resume_languages') {
            const selected = Array.isArray(session.data?.resume?.language_keys)
                ? session.data.resume.language_keys
                : this.getDefaultJobLanguageKeys(lang);
            await this.setSession(session, { state: BotState.SELECTING_RESUME_LANGUAGES });
            await this.sendPrompt(chatId, session, botTexts.resumeLanguagesPrompt[lang], {
                replyMarkup: keyboards.resumeLanguagesKeyboard(lang, selected)
            });
            return;
        }

        if (target === 'skills') {
            await this.setSession(session, { state: BotState.ADDING_SKILLS });
            await this.presentSkillsStep(chatId, session, session.data?.edit_mode ? 'resume_view' : 'resume_languages');
            return;
        }

        if (target === 'employer_size') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DIRECTOR });
            await this.sendPrompt(chatId, session, botTexts.employerDirectorPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_company') });
            return;
        }

        if (target === 'employer_industry') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DIRECTOR });
            await this.sendPrompt(chatId, session, botTexts.employerDirectorPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_company') });
            return;
        }

        if (target === 'employer_director') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_DIRECTOR });
            await this.sendPrompt(chatId, session, botTexts.employerDirectorPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'employer_company') });
            return;
        }

        if (target === 'employer_company') {
            await this.setSession(session, { state: BotState.EMPLOYER_PROFILE_COMPANY });
            await this.sendPrompt(chatId, session, botTexts.companyNamePrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, 'role_pick') });
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
                replyMarkup: keyboards.regionKeyboard(lang, regions, 'employer_director')
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
            const cachedOptions: OsonishField[] = Array.isArray(session.data?.field_options) ? session.data.field_options : [];
            const existingQuery = String(session.data?.field_query || '').trim();
            if (cachedOptions.length > 0) {
                const page = Number.isFinite(Number(session.data?.field_page)) ? Number(session.data?.field_page) : 0;
                const safePage = Math.max(0, page);
                await this.setSession(session, {
                    state: BotState.SELECTING_FIELD,
                    data: { ...session.data, field_context: 'job', field_page: safePage }
                });
                await this.sendPrompt(chatId, session, this.buildFieldPromptText(lang, existingQuery || String(session.data?.temp_job?.title || ''), cachedOptions.length, safePage, 10), {
                    replyMarkup: keyboards.fieldsKeyboard(lang, cachedOptions, 'job_title', safePage, 10)
                });
                return;
            }

            const existingTitle = String(session.data?.temp_job?.title || '').trim();
            if (existingTitle.length >= 3) {
                const loadingHintId = await this.showLoadingHint(chatId, session);
                let matches: OsonishField[] = [];
                try {
                    const fields = await this.getOsonishFields(existingTitle);
                    matches = fields.length ? this.pickFieldMatches(fields, existingTitle, 300) : [];
                } finally {
                    await this.clearLoadingHint(chatId, loadingHintId);
                }
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
            await this.sendPrompt(chatId, session, botTexts.jobWorkingHoursPrompt[lang], { replyMarkup: keyboards.jobWorkingHoursKeyboard(lang) });
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
            await this.sendPrompt(chatId, session, botTexts.jobAgePrompt[lang], { replyMarkup: keyboards.jobAgeKeyboard(lang) });
            return;
        }

        if (target === 'job_special') {
            const selected = Array.isArray(session.data?.temp_job?.special) ? session.data.temp_job.special : [];
            await this.setSession(session, { state: BotState.POSTING_JOB_SPECIAL });
            await this.sendPrompt(chatId, session, botTexts.jobSpecialCriteriaPrompt[lang], {
                replyMarkup: keyboards.specialCriteriaKeyboard(lang, selected, 'job_age')
            });
            return;
        }

        if (target === 'job_languages') {
            const selectedKeys = Array.isArray(session.data?.temp_job?.language_keys) ? session.data.temp_job.language_keys : [];
            await this.setSession(session, { state: BotState.POSTING_JOB_LANGUAGES });
            await this.sendPrompt(chatId, session, botTexts.jobLanguagesPrompt[lang], {
                replyMarkup: keyboards.jobLanguagesKeyboard(lang, selectedKeys)
            });
            return;
        }

        if (target === 'job_benefits') {
            const selectedKeys = Array.isArray(session.data?.temp_job?.benefit_keys) ? session.data.temp_job.benefit_keys : [];
            await this.setSession(session, { state: BotState.POSTING_JOB_BENEFITS });
            await this.sendPrompt(chatId, session, botTexts.jobBenefitsPrompt[lang], {
                replyMarkup: keyboards.jobBenefitsKeyboard(lang, selectedKeys)
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
            const hasHrFromProfile = Boolean(session.data?.temp_job?.hr_from_profile);
            const backTarget = hasHrFromProfile ? 'job_benefits' : 'job_hr';
            await this.sendPrompt(chatId, session, botTexts.jobContactPrompt[lang], { replyMarkup: keyboards.backKeyboard(lang, backTarget) });
            return;
        }

        if (target === 'job_description') {
            await this.setSession(session, { state: BotState.POSTING_JOB_DESCRIPTION });
            await this.presentJobDescriptionStep(chatId, session);
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

    private async promptResumeChannelPostConfirm(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const regionId = session.data?.resume?.region_id ?? null;
        const channelUsername = await this.getRegionChannelUsernameById(regionId);

        if (!channelUsername) {
            await this.finalizeResume(chatId, session, { postToChannel: false });
            return;
        }

        const updatedData = {
            ...session.data,
            location_intent: null,
            resume_channel_username: channelUsername
        };
        await this.setSession(session, {
            state: BotState.RESUME_CHANNEL_CONFIRM,
            data: updatedData
        });

        await this.sendPrompt(chatId, session, this.buildResumeChannelConfirmText(lang, channelUsername), {
            replyMarkup: keyboards.resumeChannelPostConfirmKeyboard(lang)
        });
    }

    private async handleResumePostChannelAction(chatId: number, value: string, session: TelegramSession): Promise<void> {
        if (value === 'yes') {
            await this.finalizeResume(chatId, session, { postToChannel: true });
            return;
        }
        if (value === 'no') {
            await this.finalizeResume(chatId, session, { postToChannel: false });
            return;
        }

        const lang = session.lang;
        const fallbackChannel = this.normalizeChannelUsername(session.data?.resume_channel_username);
        if (!fallbackChannel) {
            await this.promptResumeChannelPostConfirm(chatId, session);
            return;
        }
        await this.sendPrompt(chatId, session, this.buildResumeChannelConfirmText(lang, fallbackChannel), {
            replyMarkup: keyboards.resumeChannelPostConfirmKeyboard(lang)
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

    private async startResumeFlow(chatId: number, session: TelegramSession, backTarget: string = 'main_menu'): Promise<void> {
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
            resume_channel_username: null,
            clean_inputs: true
        };
        await this.setSession(session, {
            state: BotState.ENTERING_NAME,
            data: updatedData
        });
        await this.setFlowCancelKeyboard(chatId, session, 'back');
        await this.sendPrompt(chatId, session, botTexts.askName[lang], {
            replyMarkup: keyboards.backKeyboard(lang, backTarget)
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

        await this.sendPrompt(chatId, session, this.buildResumeHubText(lang, resumes.length), {
            replyMarkup: keyboards.resumeListKeyboard(lang, resumes)
        });
    }

    private async showResumeById(chatId: number, resumeId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
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
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
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
            await this.presentResumeAboutStep(chatId, session);
            return;
        }

        if (field === 'skills') {
            await this.setSession(session, { state: BotState.ADDING_SKILLS });
            await this.presentSkillsStep(chatId, session, 'resume_view');
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

    private async buildResumeText(
        resume: any,
        lang: BotLang,
        options: { hideLocation?: boolean } = {}
    ): Promise<string> {
        const normalizedEducation = this.normalizeEducationLevelKey(resume?.education_level);
        if (!normalizedEducation) {
            resume = { ...resume, education_level: null };
        } else {
            resume = { ...resume, education_level: normalizedEducation };
        }
        const lines: string[] = [];
        const title = resume.title || (lang === 'uz' ? 'Rezyume' : 'Резюме');
        lines.push(`<b>🧾 | ${this.escapeHtml(title)}</b>`);
        lines.push('— — — — — — — — — — — — — — — —');

        if (resume.full_name) lines.push(`🪪 | ${lang === 'uz' ? 'Ism' : 'Имя'}: ${resume.full_name}`);
        if (resume.birth_date) {
            let formatted = String(resume.birth_date);
            const parsed = new Date(resume.birth_date);
            if (!Number.isNaN(parsed.getTime())) {
                const dd = String(parsed.getDate()).padStart(2, '0');
                const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                const yyyy = parsed.getFullYear();
                formatted = `${dd}.${mm}.${yyyy}`;
            }
            lines.push(`📅 | ${lang === 'uz' ? "Tug'ilgan sana" : 'Дата рождения'}: ${formatted}`);
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
        if (!options.hideLocation && location) {
            lines.push(`📍 | ${lang === 'uz' ? 'Joylashuv' : 'Локация'}: ${location}`);
        }
        let profileTelegram: string | null = null;
        if (resume?.user_id) {
            try {
                const { data: seekerMeta } = await this.supabase
                    .from('job_seeker_profiles')
                    .select('telegram')
                    .eq('user_id', resume.user_id)
                    .maybeSingle();
                profileTelegram = this.normalizeTelegramUsername(seekerMeta?.telegram);
            } catch {
                profileTelegram = null;
            }
        }

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
        if (resume.expected_salary_max) {
            lines.push(`💸 | ${lang === 'uz' ? 'Maksimal maosh' : 'Максимальная зарплата'}: ${resume.expected_salary_max} so'm`);
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
            const rawEduItems = eduDetails
                .map((edu: any) => {
                    const institution = edu?.institution || edu?.school || '';
                    const field = edu?.field || edu?.specialty || '';
                    const years = this.formatWorkYears(edu);
                    const base = institution && field ? `${institution} — ${field}` : (institution || field);
                    if (!base) return '';
                    return years ? `${base} (${years})` : base;
                })
                .filter(Boolean);
            const dedupedEduItems: string[] = [];
            const seenEdu = new Set<string>();
            for (const item of rawEduItems) {
                const key = String(item).trim().toLowerCase();
                if (!key || seenEdu.has(key)) continue;
                seenEdu.add(key);
                dedupedEduItems.push(item);
            }
            const eduText = dedupedEduItems.join('; ');
            if (eduText) lines.push(`🎓 | ${lang === 'uz' ? "O‘qigan joyi" : 'Место учебы'}: ${eduText}`);
        }

        if (Array.isArray(resume.skills) && resume.skills.length > 0) {
            lines.push(`🧠 | ${lang === 'uz' ? "Ko'nikmalar" : 'Навыки'}: ${resume.skills.join(', ')}`);
        }

        if (Array.isArray(resume.languages) && resume.languages.length > 0) {
            const languageItems = resume.languages
                .map((item: any) => {
                    if (typeof item === 'string') return item.trim();
                    if (typeof item === 'number') {
                        const map: Record<number, string> = {
                            1: lang === 'uz' ? "O'zbek tili" : 'Узбекский язык',
                            2: lang === 'uz' ? 'Rus tili' : 'Русский язык',
                            3: lang === 'uz' ? 'Ingliz tili' : 'Английский язык'
                        };
                        return map[item] || '';
                    }
                    if (item && typeof item === 'object') {
                        return String(item.language || item.name || item.title || '').trim();
                    }
                    return '';
                })
                .filter(Boolean);
            if (languageItems.length > 0) {
                lines.push(`🗣️ | ${lang === 'uz' ? 'Tillar' : 'Языки'}: ${languageItems.join(', ')}`);
            }
        }

        if (resume.about) {
            lines.push(`📝 | ${lang === 'uz' ? "O'zi haqida" : 'О себе'}: ${resume.about}`);
        }

        if (resume.phone || profileTelegram) {
            lines.push('');
            if (resume.phone) lines.push(`📞 | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${resume.phone}`);
            if (profileTelegram) lines.push(`💬 | Telegram: @${profileTelegram}`);
        }

        return lines.join('\n');
    }

    private async finalizeResume(
        chatId: number,
        session: TelegramSession,
        options: { postToChannel?: boolean | null } = {}
    ): Promise<void> {
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
        if (Object.prototype.hasOwnProperty.call(options, 'postToChannel')) {
            resumeData.post_to_channel = options.postToChannel === null ? null : Boolean(options.postToChannel);
        }
        if (resumeData.region_id) resumeData.region_id = Number(resumeData.region_id) || resumeData.region_id;
        if (resumeData.district_id) resumeData.district_id = Number(resumeData.district_id) || resumeData.district_id;
        const resumeId = await this.saveResume(session, resumeData, session.data?.active_resume_id || null);

        if (!resumeId) {
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        await this.clearFlowCancelKeyboard(chatId, session);

        await this.supabase.from('job_seeker_profiles').upsert({
            user_id: session.user_id,
            full_name: resumeData?.full_name || null,
            phone: session.phone || null,
            telegram: this.normalizeTelegramUsername(session.data?.telegram_username),
            region_id: resumeData?.region_id || null,
            district_id: resumeData?.district_id || null,
            birth_date: resumeData?.birth_date || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        const updatedData = {
            ...session.data,
            resume: {},
            active_resume_id: resumeId,
            clean_inputs: false,
            location_intent: null,
            resume_channel_username: null
        };
        await this.setSession(session, {
            state: BotState.VIEWING_RESUME,
            data: updatedData
        });

        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await this.sendPrompt(chatId, session, botTexts.resumeSaved[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        await this.publishResumeToRegionChannel(
            resumeId,
            resume,
            Object.prototype.hasOwnProperty.call(options, 'postToChannel')
                ? options.postToChannel
                : undefined
        );

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
            const combined = Math.max(strict, Math.round((strict * 0.75) + (ai.aiScore * 0.25)));
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
            const score = Math.max(strictScore, Math.round((strictScore * 0.75) + (ai.aiScore * 0.25)));
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
            field_id: resume.field_id ?? null,
            field_title: resume.field_title ?? desiredTitle ?? null,
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

        await this.sendPrompt(chatId, session,
            lang === 'uz'
                ? `🔔 Mos vakansiyalar topildi (90%+).`
                : `🔔 Найдены подходящие вакансии (90%+).`,
            { replyMarkup: keyboards.autoMatchJobsKeyboard(lang) }
        );
    }

    private async handleResumeSearchSelect(chatId: number, resumeId: string, session: TelegramSession): Promise<void> {
        const { data: resume } = await this.supabase.from('resumes').select('*').eq('id', resumeId).maybeSingle();
        if (!resume) {
            await this.sendPrompt(chatId, session, botTexts.error[session.lang]);
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

        await this.sendPrompt(chatId, session, this.buildResumeSearchSelectionText(lang, resumes.length), {
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
        const hasLocalContext = hasDistrict || hasRegion;
        const localPool = hasDistrict
            ? districtNormalized
            : (hasRegion ? regionNormalized : broadNormalized);
        const strictLocalPool = hasDistrict
            ? this.mergeJobsById([districtNormalized, regionNormalized])
            : (hasRegion ? regionNormalized : broadNormalized);
        const seekerGeo = await this.getSeekerGeo(session.user_id);

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
            const districtName = String(
                resume?.district_name
                || await this.getDistrictNameById(districtId, lang)
                || (lang === 'uz' ? 'tanlangan tuman/shahar' : 'выбранный район/город')
            ).trim();
            const districtButtons = this.buildDistrictButtonsList(regionNormalized, lang, seekerGeo, {
                id: districtId,
                name: districtName
            });
            const regionCount = regionNormalized.length;
            const districtHint = this.buildDistrictFallbackHint(lang, regionNormalized, seekerGeo);
            const notice = lang === 'uz'
                ? `<b>ℹ️ | ${this.escapeHtml(districtName)} hududida mos vakansiya topilmadi.</b>\n\n<b>${regionCount} ta vakansiya</b> viloyat bo'yicha topildi.${districtHint ? `\n${districtHint}` : ''}`
                : `<b>ℹ️ | В районе/городе «${this.escapeHtml(districtName)}» подходящих вакансий не найдено.</b>\n\n<b>По области найдено: ${regionCount}</b>.${districtHint ? `\n${districtHint}` : ''}`;
            await this.sendPrompt(chatId, session, notice, {
                parseMode: 'HTML',
                replyMarkup: keyboards.districtJobsFallbackKeyboard(lang, districtButtons, { includeRelated: true })
            });
            return;

        }
        const desiredTitle = resume?.field_title || resume?.title || resume?.desired_position || null;
        const titleTokens = this.tokenizeTitle(desiredTitle);
        const hasTitleTokens = titleTokens.length > 0;

        let scopedByTitle = localPool;
        if (hasTitleTokens) {
            const strictTitle = !this.isGenericTitle(desiredTitle);
            const preferred = this.filterJobsByDesiredTitle(localPool, desiredTitle, strictTitle, resume.field_id);
            if (preferred.length >= 5) {
                scopedByTitle = preferred;
            } else if (strictTitle && preferred.length) {
                scopedByTitle = preferred;
            } else if (!strictTitle && preferred.length) {
                scopedByTitle = preferred;
            }
        }

        const profile = {
            region_id: regionId ?? resume.region_id ?? null,
            district_id: districtId ?? resume.district_id ?? null,
            category_id: resume.category_id,
            category_ids: resume.category_ids,
            field_id: resume.field_id ?? null,
            field_title: resume.field_title ?? desiredTitle ?? null,
            expected_salary_min: resume.expected_salary_min,
            experience_level: resume.experience || resume.experience_level,
            gender: resume.gender,
            birth_date: resume.birth_date,
            education_level: resume.education_level,
            title: desiredTitle
        };

        let matched = matchAndSortJobs(profile, scopedByTitle);

        if (!matched.length) {
            let fallbackPool = strictLocalPool;
            if (hasDistrict && regionNormalized.length) {
                fallbackPool = this.mergeJobsById([districtNormalized, regionNormalized]);
            } else if (!hasDistrict && hasRegion) {
                fallbackPool = regionNormalized;
            } else if (!hasDistrict && !hasRegion) {
                fallbackPool = broadNormalized;
            }

            if (hasTitleTokens) {
                const preferredFallback = this.filterJobsByDesiredTitle(fallbackPool, desiredTitle, false, resume.field_id);
                if (preferredFallback.length) fallbackPool = preferredFallback;
            }

            if (!fallbackPool.length) fallbackPool = hasLocalContext ? localPool : broadNormalized;
            if (seekerGeo) {
                fallbackPool = this.sortJobsByDistance(fallbackPool, seekerGeo.latitude, seekerGeo.longitude);
            } else {
                fallbackPool = this.sortJobsByRegionProximity(fallbackPool, regionId);
            }
            matched = matchAndSortJobs(profile, fallbackPool);

            if (!matched.length && !hasLocalContext && fallbackPool !== broadNormalized) {
                let broadPool = broadNormalized;
                if (hasTitleTokens) {
                    const preferredBroad = this.filterJobsByDesiredTitle(broadNormalized, desiredTitle, false, resume.field_id);
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
                const preferredRegion = this.filterJobsByDesiredTitle(regionFallback, desiredTitle, false, resume.field_id);
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
                const districtName = String(
                    resume?.district_name
                    || await this.getDistrictNameById(districtId, lang)
                    || (lang === 'uz' ? 'tanlangan tuman/shahar' : 'выбранный район/город')
                ).trim();
                const districtButtons = this.buildDistrictButtonsList(regionNormalized, lang, seekerGeo, {
                    id: districtId,
                    name: districtName
                });
                const regionCount = regionNormalized.length;
                const districtHint = this.buildDistrictFallbackHint(lang, regionNormalized, seekerGeo);
                const notice = lang === 'uz'
                    ? `<b>ℹ️ | ${this.escapeHtml(districtName)} hududida mos vakansiya topilmadi.</b>\n\n<b>${regionCount} ta vakansiya</b> viloyat bo'yicha topildi.${districtHint ? `\n${districtHint}` : ''}`
                    : `<b>ℹ️ | В районе/городе «${this.escapeHtml(districtName)}» подходящих вакансий не найдено.</b>\n\n<b>По области найдено: ${regionCount}</b>.${districtHint ? `\n${districtHint}` : ''}`;
                await this.sendPrompt(chatId, session, notice, {
                    parseMode: 'HTML',
                    replyMarkup: keyboards.districtJobsFallbackKeyboard(lang, districtButtons, { includeRelated: true })
                });
                return;

            }
        }

        if (matched.length > 0) {
            matched = await this.applyAiRerankToMatchedJobs(resume, matched, lang);
        }

        if (!matched.length) {
            let relatedPool = strictLocalPool;
            if (hasTitleTokens) {
                const preferredRelated = this.filterJobsByDesiredTitle(relatedPool, desiredTitle, false);
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
                    const hasMeaningfulOverlap = this.hasTitleOverlap(desiredTitle, this.extractJobTitle(job));
                    const mismatchPenalty = hasMeaningfulOverlap ? 1 : 0.55;
                    const blended = Math.max(
                        1,
                        Math.min(
                            100,
                            Math.round((base.matchScore * 0.65 * mismatchPenalty) + (titleRelevance * 35))
                        )
                    );
                    return {
                        ...job,
                        matchScore: blended,
                        matchCriteria: base.matchCriteria,
                        explanation: base.explanation,
                        titleRelevance,
                        hasMeaningfulOverlap
                    };
                })
                .filter(item => item.matchScore >= 45 || item.titleRelevance >= 0.2)
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
            } else {
                // If no related jobs, show only OTHER REGIONS with matching vacancies (not all vacancies).
                let broadPoolForFallback = broadNormalized;
                if (hasTitleTokens) {
                    const preferredBroad = this.filterJobsByDesiredTitle(broadNormalized, desiredTitle, false, resume.field_id);
                    if (preferredBroad.length > 0) broadPoolForFallback = preferredBroad;
                }
                const otherRegionMatched = matchAndSortJobs(profile, broadPoolForFallback);
                const regionButtons = this.buildRegionButtonsList(otherRegionMatched, lang, regionId);
                if (regionButtons.length > 0) {
                    await this.setSession(session, {
                        data: {
                            ...session.data,
                            search_region_options: regionButtons,
                            search_region_origin: 'other_regions',
                            search_region_id: null,
                            search_district_id: null
                        }
                    });
                    await this.sendPrompt(chatId, session, botTexts.noRegionJobs[lang], {
                        replyMarkup: keyboards.regionJobsFallbackKeyboard(lang, regionButtons, { includeRelated: false })
                    });
                    return;
                }

                await this.clearLastJobArtifacts(chatId, session);
                await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
                return;
            }
        }

        const updatedData = {
            ...session.data,
            job_list: matched,
            currentJobIndex: 0,
            job_source: 'resume',
            active_resume_id: resume.id,
            clean_inputs: false,
            related_job_list: [],
            search_region_options: [],
            search_region_origin: null
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
        const hasLocalContext = hasDistrict || hasRegion;
        const localPool = hasDistrict
            ? districtNormalized
            : (hasRegion ? regionNormalized : broadNormalized);
        const strictLocalPool = hasDistrict
            ? this.mergeJobsById([districtNormalized, regionNormalized])
            : (hasRegion ? regionNormalized : broadNormalized);

        if (!localPool.length) {
            await this.clearLastJobArtifacts(chatId, session);
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        if (districtId !== null && !hasDistrict && hasRegion) {
            const seekerGeoLocal = (typeof geo.latitude === 'number' && typeof geo.longitude === 'number')
                ? { latitude: geo.latitude, longitude: geo.longitude }
                : null;
            const districtName = String(
                await this.getDistrictNameById(districtId, lang)
                || (lang === 'uz' ? 'tanlangan tuman/shahar' : 'выбранный район/город')
            ).trim();
            const districtButtons = this.buildDistrictButtonsList(regionNormalized, lang, seekerGeoLocal, {
                id: districtId,
                name: districtName
            });
            const regionCount = regionNormalized.length;
            const districtHint = this.buildDistrictFallbackHint(lang, regionNormalized, seekerGeoLocal);
            const notice = lang === 'uz'
                ? `<b>ℹ️ | ${this.escapeHtml(districtName)} hududida mos vakansiya topilmadi.</b>\n\n<b>${regionCount} ta vakansiya</b> viloyat bo'yicha topildi.${districtHint ? `\n${districtHint}` : ''}`
                : `<b>ℹ️ | В районе/городе «${this.escapeHtml(districtName)}» подходящих вакансий не найдено.</b>\n\n<b>По области найдено: ${regionCount}</b>.${districtHint ? `\n${districtHint}` : ''}`;
            await this.sendPrompt(chatId, session, notice, {
                parseMode: 'HTML',
                replyMarkup: keyboards.districtJobsFallbackKeyboard(lang, districtButtons, { includeRelated: true })
            });
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
        const profileFieldId = resume?.field_id ?? null;
        const profileFieldTitle = resume?.field_title ?? null;
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
            field_id: profileFieldId,
            field_title: profileFieldTitle ?? profileTitle ?? null,
            title: profileTitle
        };

        let matched = matchAndSortJobs(geoProfile, candidateJobs);

        if (!matched.length) {
            const hasCoords = typeof geo.latitude === 'number' && typeof geo.longitude === 'number';
            let fallbackPool = strictLocalPool;
            if (hasDistrict && regionNormalized.length) {
                fallbackPool = this.mergeJobsById([districtNormalized, regionNormalized]);
            } else if (!hasDistrict && hasRegion) {
                fallbackPool = regionNormalized;
            } else if (!hasDistrict && !hasRegion) {
                fallbackPool = broadNormalized;
            }

            if (hasTitleTokens) {
                const preferredFallback = this.filterJobsByDesiredTitle(fallbackPool, profileTitle, false);
                if (preferredFallback.length) fallbackPool = preferredFallback;
            }

            if (!fallbackPool.length) fallbackPool = hasLocalContext ? localPool : broadNormalized;
            if (hasCoords) {
                fallbackPool = this.sortJobsByDistance(fallbackPool, geo.latitude!, geo.longitude!);
            } else {
                fallbackPool = this.sortJobsByRegionProximity(fallbackPool, regionId);
            }
            matched = matchAndSortJobs(geoProfile, fallbackPool);

            if (!matched.length && !hasLocalContext && fallbackPool !== broadNormalized) {
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

        const updatedData = {
            ...session.data,
            job_list: matched,
            currentJobIndex: 0,
            job_source: 'geo',
            clean_inputs: false,
            related_job_list: [],
            search_region_options: [],
            search_region_origin: null
        };
        await this.setSession(session, {
            state: BotState.BROWSING_JOBS,
            data: updatedData
        });
        await this.showJob(chatId, session, 0);
    }

    private normalizeJob(job: any, lang: BotLang): any {
        const raw = job.raw_source_json || {};
        const rawLocation = raw?.location && typeof raw.location === 'object' ? raw.location : null;
        const regionName = job.regions
            ? (lang === 'uz' ? job.regions.name_uz : job.regions.name_ru)
            : (
                job.region_name
                || (lang === 'uz' ? raw?.region_name_uz : raw?.region_name_ru)
                || raw?.region_name
                || raw?.region
                || raw?.viloyat
                || raw?.location_region
                || rawLocation?.region_name
                || rawLocation?.region
                || null
            );
        const districtName = job.districts
            ? (lang === 'uz' ? job.districts.name_uz : job.districts.name_ru)
            : (
                job.district_name
                || (lang === 'uz' ? raw?.district_name_uz : raw?.district_name_ru)
                || raw?.district_name
                || raw?.district
                || raw?.tuman
                || raw?.location_district
                || rawLocation?.district_name
                || rawLocation?.district
                || null
            );
        const companyName = job.company_name || job.employer_profiles?.company_name || null;
        const normalized: any = {
            ...job,
            region_name: regionName,
            district_name: districtName,
            company_name: companyName
        };
        const coordinatePair = Array.isArray(raw?.coordinates) && raw.coordinates.length >= 2
            ? { lat: raw.coordinates[0], lon: raw.coordinates[1] }
            : null;
        const latitude =
            this.toCoordinate(job?.latitude)
            ?? this.toCoordinate(raw?.latitude)
            ?? this.toCoordinate(raw?.lat)
            ?? this.toCoordinate(raw?.geo_lat)
            ?? this.toCoordinate(raw?.location_lat)
            ?? this.toCoordinate(rawLocation?.latitude)
            ?? this.toCoordinate(rawLocation?.lat)
            ?? this.toCoordinate(coordinatePair?.lat);
        const longitude =
            this.toCoordinate(job?.longitude)
            ?? this.toCoordinate(raw?.longitude)
            ?? this.toCoordinate(raw?.lon)
            ?? this.toCoordinate(raw?.lng)
            ?? this.toCoordinate(raw?.geo_lng)
            ?? this.toCoordinate(raw?.location_lng)
            ?? this.toCoordinate(rawLocation?.longitude)
            ?? this.toCoordinate(rawLocation?.lon)
            ?? this.toCoordinate(rawLocation?.lng)
            ?? this.toCoordinate(coordinatePair?.lon);
        if (latitude !== null) normalized.latitude = latitude;
        if (longitude !== null) normalized.longitude = longitude;
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
        if (!normalized.field_id && (raw?.mmk_position?.id || raw?.mmk_position_id)) {
            normalized.field_id = raw?.mmk_position?.id || raw?.mmk_position_id;
        }
        if (!normalized.field_title && (raw?.mmk_position?.position_name || raw?.field_title || raw?.position_name || raw?.position)) {
            normalized.field_title = raw?.mmk_position?.position_name || raw?.field_title || raw?.position_name || raw?.position;
        }
        return normalized;
    }

    private tokenizeTitle(value: any): string[] {
        if (!value) return [];
        const alias: Record<string, string> = {
            oqituvchi: 'teacher',
            oqituvchisi: 'teacher',
            oqituvchilar: 'teacher',
            qituvchi: 'teacher',
            qituvchisi: 'teacher',
            qituvchilar: 'teacher',
            pedagog: 'teacher',
            tarbiyachi: 'teacher',
            uchitel: 'teacher',
            учитель: 'teacher',
            преподаватель: 'teacher',
            ingliz: 'english',
            english: 'english'
        };
        const stopWords = new Set([
            'va', 'bilan', 'uchun', 'ish', 'lavozim', 'mutaxassis', 'xodim', 'bo`yicha', 'boyicha',
            'по', 'для', 'на', 'в', 'и', 'работа', 'должность', 'специалист', 'сотрудник',
            'for', 'and', 'the', 'job', 'position', 'specialist', 'employee',
            'fanidan', 'fan', 'fani'
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
            .filter(token => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token))
            .map(token => {
                let item = token;
                if (item.endsWith('si') && item.includes('qituvch')) item = item.slice(0, -2);
                if (item.endsWith('lar') && item.includes('qituvch')) item = item.slice(0, -3);
                return alias[item] || item;
            });
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

    private filterJobsByDesiredTitle(jobs: any[], desiredTitle: string | null | undefined, strict: boolean = false, fieldId?: string | number | null): any[] {
        const titleTokens = this.tokenizeTitle(desiredTitle);
        // If no tokens and no fieldId, return all jobs
        if (!titleTokens.length && !fieldId) return jobs;

        const desiredText = titleTokens.join(' ');
        const normalizedFieldId = fieldId ? String(fieldId) : null;

        const filtered = jobs.filter(job => {
            // Check exact field_id match first (highest priority for profession matching)
            if (normalizedFieldId) {
                const jobFieldId = job?.field_id || job?.raw_source_json?.mmk_position?.id || job?.raw_source_json?.mmk_position_id;
                if (jobFieldId && String(jobFieldId) === normalizedFieldId) return true;
            }

            // If no title tokens, skip title matching
            if (!titleTokens.length) return false;

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
        if (!raw) return null;

        const normalized = raw
            .toLowerCase()
            .replace(/[^\d+\-–—]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return null;

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

        return null;
    }

    private parseListInput(text: string): string[] {
        const raw = String(text || '').trim();
        if (!raw) return [];
        const parts = raw
            .split(/[,\n;]/)
            .map(item => item.replace(/^[-*•]\s*/, '').trim())
            .filter(Boolean);
        return Array.from(new Set(parts));
    }

    private getDefaultJobLanguageKeys(lang: BotLang): string[] {
        return lang === 'ru' ? ['ru'] : ['uz'];
    }

    private mapJobLanguageKeysToLabels(keys: string[], lang: BotLang): string[] {
        const labels: Record<string, { uz: string; ru: string }> = {
            uz: { uz: "O'zbek tili", ru: 'Узбекский язык' },
            ru: { uz: 'Rus tili', ru: 'Русский язык' },
            en: { uz: 'Ingliz tili', ru: 'Английский язык' }
        };
        return keys
            .map(key => labels[key]?.[lang])
            .filter((value): value is string => Boolean(value));
    }

    private mapJobLanguageLabelsToKeys(labels: string[]): string[] {
        const keys = new Set<string>();
        for (const raw of labels) {
            const normalized = String(raw || '').toLowerCase().trim();
            if (!normalized) continue;
            if (normalized.includes("o'zbek") || normalized.includes('uzbek') || normalized.includes('узбек')) keys.add('uz');
            if (normalized.includes('rus') || normalized.includes('russian') || normalized.includes('рус')) keys.add('ru');
            if (normalized.includes('ingliz') || normalized.includes('english') || normalized.includes('англ')) keys.add('en');
        }
        return Array.from(keys);
    }

    private mapJobBenefitKeysToLabels(keys: string[], lang: BotLang): string[] {
        const labels: Record<string, { uz: string; ru: string }> = {
            official: { uz: "Rasmiy ishga joylashish", ru: 'Официальное оформление' },
            lunch: { uz: 'Bepul tushlik', ru: 'Бесплатный обед' },
            transport: { uz: "Moddiy rag'batlantirishlar mavjud", ru: 'Есть материальные поощрения' }
        };
        return keys
            .map(key => labels[key]?.[lang])
            .filter((value): value is string => Boolean(value));
    }

    private mapJobBenefitLabelsToKeys(labels: string[]): string[] {
        const keys = new Set<string>();
        for (const raw of labels) {
            const normalized = String(raw || '').toLowerCase().trim();
            if (!normalized) continue;
            if (normalized.includes('rasmiy') || normalized.includes('офиц')) keys.add('official');
            if (normalized.includes('tushlik') || normalized.includes('обед') || normalized.includes('lunch')) keys.add('lunch');
            if (
                normalized.includes('transport')
                || normalized.includes("rag'bat")
                || normalized.includes('ragbat')
                || normalized.includes('поощр')
                || normalized.includes('moddiy')
            ) keys.add('transport');
        }
        return Array.from(keys);
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
        let num: number;
        if (typeof value === 'number') {
            num = value;
        } else if (typeof value === 'string') {
            const cleaned = value.trim().replace(',', '.');
            if (!cleaned) return null;
            num = Number(cleaned);
        } else {
            num = Number(value);
        }
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

    private formatDistance(km: number, lang: BotLang): string {
        if (!Number.isFinite(km) || km < 0) {
            return lang === 'uz' ? "Noma'lum" : 'Неизвестно';
        }
        if (km < 1) {
            const meters = Math.max(1, Math.round(km * 1000));
            return `${meters} ${lang === 'uz' ? 'm' : 'м'}`;
        }
        if (km < 10) {
            return `${km.toFixed(1)} ${lang === 'uz' ? 'km' : 'км'}`;
        }
        return `${Math.round(km)} ${lang === 'uz' ? 'km' : 'км'}`;
    }

    private getDistanceToJob(
        job: any,
        fromLat: number,
        fromLon: number,
        options: { allowRegionFallback?: boolean } = {}
    ): number | null {
        const allowRegionFallback = options.allowRegionFallback ?? true;
        let lat = this.toCoordinate(job.latitude);
        let lon = this.toCoordinate(job.longitude);

        if ((lat === null || lon === null) && allowRegionFallback) {
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

    private buildDistrictFallbackHint(
        lang: BotLang,
        jobs: any[],
        seekerGeo?: { latitude: number; longitude: number } | null
    ): string {
        if (!Array.isArray(jobs) || jobs.length === 0) return '';

        const grouped = new Map<string, { name: string; count: number; nearestKm: number | null }>();
        for (const job of jobs) {
            const districtName = this.getDistrictDisplayName(job, lang);
            if (!districtName) continue;
            const districtKey = String(job?.district_id ?? districtName);
            const current = grouped.get(districtKey) || { name: districtName, count: 0, nearestKm: null };
            current.count += 1;
            if (seekerGeo) {
                const km = this.getDistanceToJob(job, seekerGeo.latitude, seekerGeo.longitude, { allowRegionFallback: false });
                if (km !== null) {
                    current.nearestKm = current.nearestKm === null ? km : Math.min(current.nearestKm, km);
                }
            }
            grouped.set(districtKey, current);
        }

        const ranked = Array.from(grouped.values())
            .filter(item => item.count > 0)
            .sort((a, b) => {
                if (a.nearestKm !== null && b.nearestKm !== null && a.nearestKm !== b.nearestKm) {
                    return a.nearestKm - b.nearestKm;
                }
                if (a.nearestKm !== null && b.nearestKm === null) return -1;
                if (a.nearestKm === null && b.nearestKm !== null) return 1;
                if (b.count !== a.count) return b.count - a.count;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 12);

        if (!ranked.length) return '';

        const header = lang === 'uz'
            ? "\n\nMos vakansiyalar topilgan tuman/shaharlar:"
            : '\n\nРайоны/города с подходящими вакансиями:';
        const lines = ranked.map(item => {
            const distanceSuffix = item.nearestKm !== null ? ` ~${Math.round(item.nearestKm)} km` : '';
            return `• ${item.name} (${item.count})${distanceSuffix}`;
        }).join('\n');

        return `${header}\n${lines}`;
    }

    private getDistrictDisplayName(job: any, lang: BotLang): string | null {
        const fromRelation = lang === 'uz' ? job?.districts?.name_uz : job?.districts?.name_ru;
        const fromNormalized = job?.district_name;
        const fromRaw = lang === 'uz'
            ? job?.raw_source_json?.district_name_uz
            : job?.raw_source_json?.district_name_ru;
        const value = fromRelation || fromNormalized || fromRaw || null;
        if (!value) return null;
        return String(value).trim() || null;
    }

    private buildDistrictButtonsList(
        jobs: any[],
        lang: BotLang,
        seekerGeo?: { latitude: number; longitude: number } | null,
        selectedDistrict?: { id?: string | number | null; name?: string | null } | null
    ): Array<{ id: string | number; name: string; count: number }> {
        if (!Array.isArray(jobs) || jobs.length === 0) return [];

        const grouped = new Map<string, { key: string; id: string | number; name: string; count: number; nearestKm: number | null }>();
        for (const job of jobs) {
            const districtName = this.getDistrictDisplayName(job, lang);
            if (!districtName) continue;
            const districtId = job?.district_id ?? districtName;
            const districtKey = String(districtId);
            const current = grouped.get(districtKey) || { key: districtKey, id: districtId, name: districtName, count: 0, nearestKm: null };
            current.count += 1;
            if (seekerGeo) {
                const km = this.getDistanceToJob(job, seekerGeo.latitude, seekerGeo.longitude, { allowRegionFallback: false });
                if (km !== null) {
                    current.nearestKm = current.nearestKm === null ? km : Math.min(current.nearestKm, km);
                }
            }
            grouped.set(districtKey, current);
        }

        const selectedName = String(selectedDistrict?.name || '').trim();
        const selectedIdRaw = selectedDistrict?.id ?? null;
        const selectedKey = selectedIdRaw !== null && selectedIdRaw !== undefined
            ? String(selectedIdRaw)
            : (selectedName ? selectedName.toLowerCase() : null);
        if (selectedKey && selectedName && !grouped.has(selectedKey)) {
            grouped.set(selectedKey, {
                key: selectedKey,
                id: selectedIdRaw ?? selectedName,
                name: selectedName,
                count: 0,
                nearestKm: null
            });
        }

        const ranked = Array.from(grouped.values())
            .filter(item => item.count > 0 || (selectedKey !== null && item.key === selectedKey))
            .sort((a, b) => {
                if (selectedKey !== null) {
                    const aSelected = a.key === selectedKey;
                    const bSelected = b.key === selectedKey;
                    if (aSelected && !bSelected) return -1;
                    if (!aSelected && bSelected) return 1;
                }
                if (a.nearestKm !== null && b.nearestKm !== null && a.nearestKm !== b.nearestKm) {
                    return a.nearestKm - b.nearestKm;
                }
                if (a.nearestKm !== null && b.nearestKm === null) return -1;
                if (a.nearestKm === null && b.nearestKm !== null) return 1;
                if (b.count !== a.count) return b.count - a.count;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 12);

        return ranked.map(item => ({ id: item.id, name: item.name, count: item.count }));
    }

    private buildRegionButtonsList(
        jobs: any[],
        lang: BotLang,
        excludeRegionId?: number | null
    ): Array<{ id: string | number; name: string; count: number }> {
        if (!Array.isArray(jobs) || jobs.length === 0) return [];

        const grouped = new Map<string, { id: string | number; name: string; count: number }>();
        for (const job of jobs) {
            const regionId = job?.region_id;
            if (!regionId || (excludeRegionId && regionId === excludeRegionId)) continue;
            const regionName = lang === 'uz'
                ? (job?.regions?.name_uz || job?.region_name || job?.raw_source_json?.region_name_uz)
                : (job?.regions?.name_ru || job?.region_name || job?.raw_source_json?.region_name_ru);
            if (!regionName) continue;
            const regionKey = String(regionId);
            const current = grouped.get(regionKey) || { id: regionId, name: regionName, count: 0 };
            current.count += 1;
            grouped.set(regionKey, current);
        }

        const ranked = Array.from(grouped.values())
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return ranked.map(item => ({ id: item.id, name: item.name, count: item.count }));
    }

    private async getMergedResumeForSearch(session: TelegramSession): Promise<any> {
        const sessionResume = session.data?.resume && typeof session.data.resume === 'object'
            ? session.data.resume
            : {};
        const persistedResume = await this.getActiveOrLatestResume(session);
        if (persistedResume && sessionResume && Object.keys(sessionResume).length > 0) {
            return { ...persistedResume, ...sessionResume };
        }
        return persistedResume || sessionResume || {};
    }

    private async getRegionMatchedJobsForResume(
        session: TelegramSession,
        lang: BotLang,
        regionIdInput: number | string
    ): Promise<MatchedJob[]> {
        const regionId = this.toCoordinate(regionIdInput);
        if (regionId === null) return [];

        const resume = await this.getMergedResumeForSearch(session);
        const desiredTitle = resume?.field_title || resume?.title || resume?.desired_position || null;
        const hasProfileSignals = Boolean(
            desiredTitle
            || resume?.field_id
            || resume?.category_id
            || (Array.isArray(resume?.category_ids) && resume.category_ids.length > 0)
            || resume?.education_level
            || resume?.experience
            || resume?.experience_level
            || resume?.gender
            || resume?.expected_salary_min
            || resume?.salary_min
        );

        if (!hasProfileSignals) {
            const fallbackList: any[] = Array.isArray(session.data?.job_list) ? session.data.job_list : [];
            const sameRegion = fallbackList.filter(job => this.toCoordinate(job?.region_id) === regionId);
            if (sameRegion.length > 0) {
                return sameRegion as MatchedJob[];
            }
        }

        const regionJobsRaw = await this.fetchActiveJobs(1400, { regionId });
        const regionJobs = regionJobsRaw.map(job => this.normalizeJob(job, lang));
        if (!regionJobs.length) return [];

        let candidateJobs = regionJobs;
        const titleTokens = this.tokenizeTitle(desiredTitle);
        if (titleTokens.length > 0) {
            const strictTitle = !this.isGenericTitle(desiredTitle);
            const preferred = this.filterJobsByDesiredTitle(regionJobs, desiredTitle, strictTitle, resume?.field_id);
            if (preferred.length > 0) {
                candidateJobs = preferred;
            }
        }

        const profile = {
            region_id: regionId,
            district_id: this.toCoordinate(resume?.district_id),
            category_id: resume?.category_id ?? null,
            category_ids: Array.isArray(resume?.category_ids) ? resume.category_ids : [],
            field_id: resume?.field_id ?? null,
            field_title: resume?.field_title ?? desiredTitle ?? null,
            expected_salary_min: this.toCoordinate(resume?.expected_salary_min ?? resume?.salary_min),
            experience_level: resume?.experience || resume?.experience_level || null,
            gender: resume?.gender ?? null,
            birth_date: resume?.birth_date ?? null,
            education_level: resume?.education_level ?? null,
            title: desiredTitle
        };

        let matched = matchAndSortJobs(profile, candidateJobs);
        if (!matched.length && candidateJobs !== regionJobs) {
            matched = matchAndSortJobs(profile, regionJobs);
        }

        return matched;
    }

    private async handleSearchRegionSelect(
        chatId: number,
        regionValue: string,
        session: TelegramSession,
        messageId?: number
    ): Promise<void> {
        const lang = session.lang;
        if (regionValue === 'allregions') {
            const storedOptions = Array.isArray(session.data?.search_region_options)
                ? session.data.search_region_options
                : [];
            if (storedOptions.length > 0) {
                await this.sendPrompt(chatId, session, botTexts.noRegionJobs[lang], {
                    replyMarkup: keyboards.regionJobsFallbackKeyboard(lang, storedOptions, { includeRelated: false })
                });
                return;
            }
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        const regionId = this.toCoordinate(regionValue);

        if (regionId === null) {
            await this.sendPrompt(chatId, session, lang === 'uz' ? "Noto'g'ri viloyat." : 'Неверная область.', {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        const updatedData = {
            ...session.data,
            search_region_id: regionId,
            search_district_id: null
        };
        await this.setSession(session, { data: updatedData });

        await this.showRegionDistrictSearch(chatId, { ...session, data: updatedData }, messageId, regionId);
    }

    /**
     * Show region search: displays matching vacancies in region and district buttons with counts
     */
    private async showRegionDistrictSearch(
        chatId: number,
        session: TelegramSession,
        messageId?: number,
        forcedRegionId?: number
    ): Promise<void> {
        const lang = session.lang;
        const jobList: any[] = Array.isArray(session.data?.job_list) ? session.data.job_list : [];
        const currentIndex = Number.isFinite(session.data?.currentJobIndex) ? session.data.currentJobIndex : 0;
        const currentJob = jobList[currentIndex];

        const rawRegionId = forcedRegionId
            ?? currentJob?.region_id
            ?? session.data?.search_region_id
            ?? (Array.isArray(session.data?.region_job_list) && session.data.region_job_list.length > 0
                ? session.data.region_job_list[0]?.region_id
                : null);
        const regionId = this.toCoordinate(rawRegionId);
        if (regionId === null) {
            await this.sendPrompt(chatId, session, lang === 'uz'
                ? "Viloyat aniqlanmadi."
                : "Регион не определён.", {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        const updatedSearchData = { ...session.data, search_region_id: regionId, search_district_id: null };
        await this.setSession(session, { data: updatedSearchData });

        const matchingJobs = await this.getRegionMatchedJobsForResume(session, lang, regionId);
        const totalJobs = matchingJobs.length;
        if (totalJobs === 0) {
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        // Get region name
        const regionName = await this.getRegionNameById(regionId, lang) || (lang === 'uz' ? 'Viloyat' : 'Область');

        // Build district buttons with matching counts and keep selected district visible.
        const selectedDistrictId = session.data?.search_district_id ?? null;
        const selectedDistrictName = selectedDistrictId !== null && selectedDistrictId !== undefined
            ? await this.getDistrictNameById(selectedDistrictId, lang)
            : null;
        const districtButtons = this.buildDistrictButtonsList(matchingJobs, lang, null, {
            id: selectedDistrictId,
            name: selectedDistrictName
        });

        // Create message text
        const headerText = lang === 'uz'
            ? `📍 <b>${regionName}</b> bo'yicha ${totalJobs} ta mos vakansiya topildi:\n\nQuyidagi tuman/shaharlarni tanlang:`
            : `📍 В <b>${regionName}</b> найдено ${totalJobs} подходящих вакансий:\n\nВыберите район/город:`;

        const prevMessageIds = [
            messageId,
            session.data?.lastPromptMessageId,
            session.data?.last_job_location_message_id,
            session.data?.last_job_location_text_message_id,
            session.data?.last_job_message_id
        ]
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0);

        const showBackToRegionList = String(session.data?.search_region_origin || '') === 'other_regions';
        await this.sendPrompt(chatId, session, headerText, {
            parseMode: 'HTML',
            replyMarkup: keyboards.districtJobsFallbackKeyboard(lang, districtButtons, { backToRegions: showBackToRegionList })
        });

        const uniqueStaleIds = Array.from(new Set(prevMessageIds));
        for (let i = 0; i < uniqueStaleIds.length; i += 1) {
            const staleId = uniqueStaleIds[i];
            try {
                await deleteMessage(chatId, staleId);
            } catch {
                // ignore
            }
        }
    }

    /**
     * Handle district search: search for matching jobs in selected district
     */
    private async handleDistrictSearch(chatId: number, districtValue: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const jobList: any[] = Array.isArray(session.data?.job_list) ? session.data.job_list : [];
        const currentIndex = Number.isFinite(session.data?.currentJobIndex) ? session.data.currentJobIndex : 0;
        const currentJob = jobList[currentIndex];
        const regionId = this.toCoordinate(
            session.data?.search_region_id
            ?? currentJob?.region_id
            ?? (Array.isArray(session.data?.region_job_list) && session.data.region_job_list.length > 0
                ? session.data.region_job_list[0]?.region_id
                : null)
        );
        if (regionId === null) {
            await this.sendPrompt(chatId, session, lang === 'uz'
                ? "Viloyat aniqlanmadi."
                : "Регион не определён.", {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        const regionMatchedJobs = await this.getRegionMatchedJobsForResume(session, lang, regionId);
        if (!regionMatchedJobs.length) {
            await this.sendPrompt(chatId, session, botTexts.noJobsFound[lang], {
                replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }

        let matchedJobs: MatchedJob[] = regionMatchedJobs;
        let selectedDistrictId: number | null = null;

        if (districtValue !== 'all') {
            const districtNum = this.toCoordinate(districtValue);
            const districtKey = String(districtValue || '').trim().toLowerCase();
            selectedDistrictId = districtNum;

            matchedJobs = regionMatchedJobs.filter(job => {
                if (districtNum !== null) {
                    return this.toCoordinate((job as any)?.district_id) === districtNum;
                }
                const byId = String((job as any)?.district_id || '').trim().toLowerCase() === districtKey;
                if (byId) return true;
                const name = this.getDistrictDisplayName(job, lang);
                return Boolean(name && name.trim().toLowerCase() === districtKey);
            });

            if (!matchedJobs.length) {
                const districtName = String(
                    await this.getDistrictNameById(districtNum ?? districtValue, lang)
                    || (lang === 'uz' ? 'tanlangan tuman/shahar' : 'выбранный район/город')
                ).trim();
                const regionCount = regionMatchedJobs.length;
                const districtHint = this.buildDistrictFallbackHint(lang, regionMatchedJobs, null);
                const districtButtons = this.buildDistrictButtonsList(regionMatchedJobs, lang, null, {
                    id: districtNum ?? districtValue,
                    name: districtName
                });
                const notice = lang === 'uz'
                    ? `<b>ℹ️ | ${this.escapeHtml(districtName)} hududida mos vakansiya topilmadi.</b>\n\n<b>${regionCount} ta vakansiya</b> viloyat bo'yicha topildi.${districtHint ? `\n${districtHint}` : ''}`
                    : `<b>ℹ️ | В районе/городе «${this.escapeHtml(districtName)}» подходящих вакансий не найдено.</b>\n\n<b>По области найдено: ${regionCount}</b>.${districtHint ? `\n${districtHint}` : ''}`;
                await this.sendPrompt(chatId, session, notice, {
                    parseMode: 'HTML',
                    replyMarkup: keyboards.districtJobsFallbackKeyboard(lang, districtButtons, {
                        backToRegions: String(session.data?.search_region_origin || '') === 'other_regions'
                    })
                });
                return;
            }
        }

        await this.setSession(session, {
            state: BotState.BROWSING_JOBS,
            data: {
                ...session.data,
                job_list: matchedJobs,
                currentJobIndex: 0,
                search_region_id: regionId,
                search_district_id: districtValue === 'all' ? null : selectedDistrictId
            }
        });
        await this.showJob(chatId, session, 0);
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
            await this.sendPrompt(chatId, session, botTexts.skillDeleted[lang], {
                replyMarkup: keyboards.skillsInlineKeyboard(
                    lang,
                    currentSkills.length > 0,
                    session.data?.edit_mode ? 'resume_view' : 'resume_languages',
                    Array.isArray(session.data?.ai_resume_skill_suggestions)
                        && session.data.ai_resume_skill_suggestions.length > 0
                )
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
                return session.data?.edit_mode ? 'resume_view' : 'salary';
            case BotState.SELECTING_RESUME_LANGUAGES:
                return 'about';
            case BotState.ADDING_SKILLS:
                return session.data?.edit_mode ? 'resume_view' : 'resume_languages';
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
                if (intent === 'job_post_location') return 'job_address';
                if (intent === 'job_search_geo') return 'main_menu';
                if (intent === 'subscription_geo' || intent === 'update_only') return 'main_menu';
                return 'main_menu';
            }
            case BotState.RESUME_CHANNEL_CONFIRM:
                return 'skills';
            case BotState.EMPLOYER_PROFILE_COMPANY:
                return 'role_pick';
            case BotState.EMPLOYER_PROFILE_DIRECTOR:
                return 'employer_company';
            case BotState.EMPLOYER_PROFILE_INDUSTRY:
                return 'employer_director';
            case BotState.EMPLOYER_PROFILE_SIZE:
                return 'employer_director';
            case BotState.EMPLOYER_PROFILE_REGION:
                return 'employer_director';
            case BotState.EMPLOYER_PROFILE_DISTRICT:
                return 'employer_region';
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
            case BotState.POSTING_JOB_SPECIAL:
                return 'job_age';
            case BotState.POSTING_JOB_LANGUAGES:
                return 'job_special';
            case BotState.POSTING_JOB_BENEFITS:
                return 'job_languages';
            case BotState.POSTING_JOB_HR_NAME:
                return 'job_benefits';
            case BotState.POSTING_JOB_CONTACT_PHONE:
                return session.data?.temp_job?.hr_from_profile ? 'job_benefits' : 'job_hr';
            case BotState.POSTING_JOB_DESCRIPTION:
                return 'job_contact';
            case BotState.POSTING_JOB_CONFIRM:
                return 'job_description';
            case BotState.ADMIN_BROADCAST_INPUT:
            case BotState.ADMIN_BROADCAST_CONFIRM:
                return 'admin_menu';
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

    private async clearRoleSwitchArtifacts(chatId: number, session: TelegramSession): Promise<void> {
        await this.clearLastJobArtifacts(chatId, session);
        const lastWorkerMessageId = session.data?.last_worker_match_message_id;
        if (lastWorkerMessageId) {
            try {
                await deleteMessage(chatId, lastWorkerMessageId);
            } catch {
                // ignore
            }
        }
        const lastPromptMessageId = session.data?.last_prompt_message_id;
        if (lastPromptMessageId) {
            try {
                await deleteMessage(chatId, lastPromptMessageId);
            } catch {
                // ignore
            }
        }
        if (lastWorkerMessageId || lastPromptMessageId) {
            await this.setSession(session, {
                data: {
                    ...session.data,
                    last_worker_match_message_id: null,
                    last_prompt_message_id: null,
                    lastPromptMessageId: null
                }
            });
        }
    }

    private formatCountValue(value: number | null): string {
        return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
    }

    private async safeTableCount(
        table: string,
        scope?: (query: any) => any
    ): Promise<number | null> {
        try {
            let query = this.supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            if (scope) {
                query = scope(query);
            }
            const { count, error } = await query;
            if (error) return null;
            return typeof count === 'number' ? count : 0;
        } catch {
            return null;
        }
    }

    private async firstAvailableCount(loaders: Array<() => Promise<number | null>>): Promise<number | null> {
        for (const loader of loaders) {
            const value = await loader();
            if (value !== null) return value;
        }
        return null;
    }

    private async safeActiveJobsCount(): Promise<number | null> {
        const variants = [
            'is_active.eq.true,status.eq.active,status.eq.published,status.eq.open,source_status.eq.active',
            'is_active.eq.true,status.eq.active,status.eq.published,status.eq.open',
            'is_active.eq.true,status.eq.active,status.eq.published',
            'status.eq.active,status.eq.published,status.eq.open',
            'is_active.eq.true'
        ];
        for (const clause of variants) {
            const count = await this.safeTableCount('jobs', (query) => query.or(clause));
            if (count !== null) return count;
        }
        return null;
    }

    private async safeDisabledJobsCount(): Promise<number | null> {
        const variants = [
            'is_active.eq.false,status.eq.inactive,status.eq.paused,status.eq.on_hold,source_status.eq.inactive,source_status.eq.paused,source_status.eq.on_hold',
            'is_active.eq.false,status.eq.inactive,status.eq.paused,status.eq.on_hold',
            'is_active.eq.false,status.eq.inactive,status.eq.paused',
            'is_active.eq.false'
        ];
        for (const clause of variants) {
            const count = await this.safeTableCount('jobs', (query) => query.or(clause));
            if (count !== null) return count;
        }
        return null;
    }

    private async safePublicActiveResumesCount(): Promise<number | null> {
        const variants: Array<(query: any) => any> = [
            (query) => query.eq('is_public', true).eq('status', 'active'),
            (query) => query.eq('is_public', true),
            (query) => query.eq('status', 'active')
        ];
        for (const scope of variants) {
            const count = await this.safeTableCount('resumes', scope);
            if (count !== null) return count;
        }
        return null;
    }

    private async getMainMenuStats(forceRefresh: boolean = false): Promise<{ jobs: number | null; jobsDisabled: number | null; resumes: number | null; users: number | null }> {
        const ttlMs = 45 * 1000;
        const cacheFresh = !forceRefresh
            && this.mainMenuStatsCache.value
            && (Date.now() - this.mainMenuStatsCache.loadedAt) < ttlMs;
        if (cacheFresh && this.mainMenuStatsCache.value) {
            return this.mainMenuStatsCache.value;
        }

        const [jobsActive, jobsDisabled, resumesPublic, usersTotal] = await Promise.all([
            this.safeActiveJobsCount(),
            this.safeDisabledJobsCount(),
            this.safePublicActiveResumesCount(),
            this.safeTableCount('users')
        ]);

        const stats = {
            jobs: jobsActive,
            jobsDisabled,
            resumes: resumesPublic,
            users: usersTotal
        };
        this.mainMenuStatsCache = { value: stats, loadedAt: Date.now() };
        return stats;
    }

    private buildMainMenuStatsText(
        lang: BotLang,
        stats: { jobs: number | null; jobsDisabled: number | null; resumes: number | null; users: number | null }
    ): string {
        const jobsTotal = (typeof stats.jobs === 'number' && typeof stats.jobsDisabled === 'number')
            ? stats.jobs + stats.jobsDisabled
            : (typeof stats.jobs === 'number' ? stats.jobs : stats.jobsDisabled);
        if (lang === 'ru') {
            return [
                '<b>📊 | Сейчас на платформе</b>',
                `<blockquote>📢 Вакансии: ${this.formatCountValue(jobsTotal)}\n🧾 Резюме: ${this.formatCountValue(stats.resumes)}\n👥 Пользователи: ${this.formatCountValue(stats.users)}</blockquote>`
            ].join('\n');
        }

        return [
            '<b>📊 | Platformada hozir</b>',
            `<blockquote>📢 Vakansiyalar: ${this.formatCountValue(jobsTotal)}\n🧾 Rezyumelar: ${this.formatCountValue(stats.resumes)}\n👥 Foydalanuvchilar: ${this.formatCountValue(stats.users)}</blockquote>`
        ].join('\n');
    }

    private buildMainMenuIntroText(lang: BotLang, isEmployer: boolean): string {
        if (lang === 'ru') {
            if (isEmployer) {
                return [
                    '<b>👋 | Здравствуйте, уважаемый работодатель!</b>',
                    '<i>Здесь вы можете быстро размещать вакансии, управлять откликами и находить подходящих сотрудников.</i>',
                    '<i>Для старта нажмите <b><i>📢 Разместить вакансию</i></b>, для поиска кандидатов — <b><i>🔎 Найти кандидатов</i></b>.</i>'
                ].join('\n');
            }
            return [
                '<b>👋 | Здравствуйте, уважаемый пользователь!</b>',
                '<i>Здесь вы можете быстро и удобно находить подходящие вакансии.</i>',
                '<i>Чтобы начать поиск, нажмите <b><i>🔎 Найти работу</i></b>.</i>'
            ].join('\n');
        }

        if (isEmployer) {
            return [
                '<b>👋 | Assalomu alaykum, hurmatli ish beruvchi!</b>',
                "<i>Bu yerda siz tez va qulay tarzda vakansiya joylashingiz, arizalarni boshqarishingiz va mos ishchilarni topishingiz mumkin.</i>",
                "<i>Boshlash uchun <b><i>📢 Vakansiya joylash</i></b>, nomzod qidirish uchun <b><i>🔎 Ishchi topish</i></b> tugmasini bosing.</i>"
            ].join('\n');
        }
        return [
            '<b>👋 | Assalomu alaykum, hurmatli foydalanuvchi!</b>',
            "<i>Bu yerda siz tez va qulay tarzda o'zingizga mos bo'sh ish o'rinlarini topishingiz mumkin.</i>",
            "<i>Ish o'rinlarini qidirish uchun <b><i>🔎 Ish topish</i></b> tugmasini bosing.</i>"
        ].join('\n');
    }

    private buildStartWelcomeText(session: TelegramSession, lang: BotLang): string {
        if (lang !== 'uz') return botTexts.startWelcome[lang];
        const tgUser = this.normalizeTelegramUsername(session?.data?.telegram_username);
        const safeUser = tgUser ? this.escapeHtml(tgUser) : (lang === 'uz' ? 'hurmatli foydalanuvchi' : 'пользователь');
        return [
            `<b>• Assalomu Alaykum, ${safeUser}!</b>`,
            '',
            "<i>Bot orqali tez va qulay tarzda <b>ISH</b> yoki <b>XODIM</b> topishingiz mumkin!\nHoziroq foydalanishni boshlang!</i>"
        ].join('\n');
    }

    private buildResumeHubText(lang: BotLang, totalResumes: number): string {
        if (lang === 'ru') {
            return [
                '<b>🧾 | Резюме</b>',
                '',
                `<i>У вас резюме: ${totalResumes} шт.</i>`,
                '<i>Здесь можно открыть, редактировать и удалять резюме.</i>',
                '<i>Также можно добавить новое резюме.</i>'
            ].join('\n');
        }

        return [
            '<b>🧾 | Rezyume</b>',
            '',
            `<i>Sizda rezyume soni: ${totalResumes} ta.</i>`,
            '<i>Bu yerda rezyumeni ko‘rish, tahrirlash va o‘chirish mumkin.</i>',
            "<i>Yangi rezyume ham qo'shishingiz mumkin.</i>"
        ].join('\n');
    }

    private buildResumeSearchSelectionText(lang: BotLang, totalResumes: number): string {
        if (lang === 'ru') {
            return [
                '<b>🔎 | Поиск работы по резюме</b>',
                '',
                `<i>Выберите резюме для поиска подходящих вакансий.</i>`,
                `<i>Доступно резюме: ${totalResumes} шт.</i>`,
                '<i>Можно выбрать существующее или добавить новое.</i>'
            ].join('\n');
        }

        return [
            "<b>🔎 | Rezyume bo'yicha ish qidirish</b>",
            '',
            '<i>Mos ishlarni topish uchun rezyumeni tanlang.</i>',
            `<i>Sizda mavjud rezyume: ${totalResumes} ta.</i>`,
            "<i>Mavjudini tanlang yoki yangi rezyume qo'shing.</i>"
        ].join('\n');
    }

    private async fetchTelegramSessionsForAdmin(maxRows: number = 50000): Promise<Array<{
        telegram_user_id: number;
        user_id?: string | null;
        data?: Record<string, any> | null;
        updated_at?: string | null;
    }>> {
        const out: Array<{
            telegram_user_id: number;
            user_id?: string | null;
            data?: Record<string, any> | null;
            updated_at?: string | null;
        }> = [];
        const pageSize = 1000;
        let offset = 0;

        while (offset < maxRows) {
            const { data, error } = await this.supabase
                .from('telegram_sessions')
                .select('telegram_user_id, user_id, data, updated_at')
                .order('updated_at', { ascending: false })
                .range(offset, offset + pageSize - 1);
            if (error) {
                console.error('[BOT] admin session scan error:', error);
                break;
            }
            if (!data || data.length === 0) break;
            out.push(...(data as any[]));
            if (data.length < pageSize) break;
            offset += pageSize;
        }

        return out;
    }

    private async collectBroadcastRecipientIds(maxRows: number = 100000): Promise<number[]> {
        const ids = new Set<number>();
        const pageSize = 1000;

        const appendId = (value: any) => {
            const normalized = Number(value);
            if (Number.isInteger(normalized) && normalized > 0) {
                ids.add(normalized);
            }
        };

        const collect = async (table: 'telegram_sessions' | 'users', select: string, scoped?: (query: any) => any) => {
            let offset = 0;
            while (offset < maxRows) {
                let query = this.supabase
                    .from(table)
                    .select(select)
                    .order('telegram_user_id', { ascending: true })
                    .range(offset, offset + pageSize - 1);
                if (scoped) {
                    query = scoped(query);
                }
                const { data, error } = await query;
                if (error) {
                    console.error(`[BOT] broadcast recipient scan error (${table}):`, error);
                    break;
                }
                if (!data || data.length === 0) break;
                for (const row of data as any[]) {
                    appendId(row?.telegram_user_id);
                }
                if (data.length < pageSize) break;
                offset += pageSize;
            }
        };

        await collect('telegram_sessions', 'telegram_user_id');
        await collect('users', 'telegram_user_id', (query) => query.not('telegram_user_id', 'is', null));

        return Array.from(ids);
    }

    private isBroadcastBlockedError(error: unknown): boolean {
        const msg = String((error as any)?.message || error || '').toLowerCase();
        return msg.includes('blocked by the user')
            || msg.includes('user is deactivated')
            || msg.includes('chat not found')
            || msg.includes('bot was kicked')
            || msg.includes('forbidden');
    }

    private isEntityParseError(error: unknown): boolean {
        const msg = String((error as any)?.message || error || '').toLowerCase();
        return msg.includes("can't parse entities")
            || msg.includes('entity_text_invalid')
            || msg.includes('parse entities');
    }

    private async showAdminMenu(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang], {
                replyMarkup: session.data?.active_role === 'employer'
                    ? keyboards.employerMainMenuKeyboard(lang)
                    : keyboards.mainMenuKeyboard(lang, 'seeker')
            });
            return;
        }
        await this.setSession(session, {
            state: BotState.ADMIN_MENU,
            data: {
                ...session.data,
                admin_mode: true,
                admin_broadcast_text: null,
                admin_broadcast_source_chat_id: null,
                admin_broadcast_source_message_id: null,
                admin_broadcast_payload_kind: null
            }
        });
        await this.sendPrompt(chatId, session, botTexts.adminMenuTitle[lang], {
            replyMarkup: keyboards.adminMenuKeyboard(lang)
        });
    }

    private async showAdminStats(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }

        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const activeWindowIso = new Date(now - (10 * 60 * 1000)).toISOString();
        const last24hIso = new Date(now - (24 * 60 * 60 * 1000)).toISOString();
        const last7dIso = new Date(now - (7 * 24 * 60 * 60 * 1000)).toISOString();

        const [
            usersTotal,
            usersSeekers,
            usersEmployers,
            usersSiteRegistered,
            usersBotRegistered,
            usersSiteActiveNow,
            usersBotActiveNow,
            sessionsTotal,
            sessions24h,
            sessions7d,
            jobsTotal,
            jobsActive,
            resumesTotal,
            resumesPublic,
            applicationsTotal,
            offersTotal,
            jobsStudentsGraduates,
            jobsDisabledFriendly,
            jobsWomenFriendly,
            employerProfiles,
            seekerProfiles,
            lockedUsers
        ] = await Promise.all([
            this.safeTableCount('users'),
            this.safeTableCount('users', (query) => query.eq('role', 'job_seeker')),
            this.safeTableCount('users', (query) => query.eq('role', 'employer')),
            this.safeTableCount('users', (query) => query.is('telegram_user_id', null)),
            this.safeTableCount('users', (query) => query.not('telegram_user_id', 'is', null)),
            this.safeTableCount('users', (query) => query.is('telegram_user_id', null).gte('updated_at', activeWindowIso)),
            this.safeTableCount('telegram_sessions', (query) => query.gte('updated_at', activeWindowIso)),
            this.safeTableCount('telegram_sessions'),
            this.safeTableCount('telegram_sessions', (query) => query.gte('updated_at', last24hIso)),
            this.safeTableCount('telegram_sessions', (query) => query.gte('updated_at', last7dIso)),
            this.safeTableCount('jobs'),
            this.safeActiveJobsCount(),
            this.safeTableCount('resumes'),
            this.safeTableCount('resumes', (query) => query.eq('is_public', true)),
            this.firstAvailableCount([
            () => this.safeTableCount('job_applications'),
            () => this.safeTableCount('applications')
            ]),
            this.safeTableCount('job_offers'),
            this.safeTableCount('jobs', (query) => query.or('is_for_students.eq.true,is_for_graduates.eq.true')),
            this.safeTableCount('jobs', (query) => query.eq('is_for_disabled', true)),
            this.safeTableCount('jobs', (query) => query.eq('is_for_women', true)),
            this.safeTableCount('employer_profiles'),
            this.safeTableCount('job_seeker_profiles'),
            this.safeTableCount('users', (query) => query.gt('locked_until', nowIso))
        ]);

        const usersOther = (usersTotal !== null && usersSeekers !== null && usersEmployers !== null)
            ? Math.max(0, usersTotal - usersSeekers - usersEmployers)
            : null;

        const lines = [
            botTexts.adminStatsTitle[lang],
            '',
            `<b>${lang === 'uz' ? "Platforma bo'yicha ro'yxatdan o'tganlar" : 'Регистрация по платформам'}</b>`,
            `• ${lang === 'uz' ? 'Sayt orqali' : 'Через сайт'}: <b>${this.formatCountValue(usersSiteRegistered)}</b>`,
            `• ${lang === 'uz' ? 'Bot orqali' : 'Через бот'}: <b>${this.formatCountValue(usersBotRegistered)}</b>`,
            '',
            `<b>${lang === 'uz' ? "Hozir faol (so'nggi 10 daqiqa)" : 'Сейчас активны (последние 10 минут)'}</b>`,
            `• ${lang === 'uz' ? 'Saytda' : 'На сайте'}: <b>${this.formatCountValue(usersSiteActiveNow)}</b>`,
            `• ${lang === 'uz' ? 'Botda' : 'В боте'}: <b>${this.formatCountValue(usersBotActiveNow)}</b>`,
            '',
            `<b>${lang === 'uz' ? 'Foydalanuvchilar' : 'Пользователи'}</b>`,
            `• ${lang === 'uz' ? 'Jami' : 'Всего'}: <b>${this.formatCountValue(usersTotal)}</b>`,
            `• ${lang === 'uz' ? 'Ish qidiruvchi' : 'Соискатели'}: <b>${this.formatCountValue(usersSeekers)}</b>`,
            `• ${lang === 'uz' ? 'Ish beruvchi' : 'Работодатели'}: <b>${this.formatCountValue(usersEmployers)}</b>`,
            `• ${lang === 'uz' ? 'Boshqa/aniqlanmagan' : 'Прочие/не задано'}: <b>${this.formatCountValue(usersOther)}</b>`,
            '',
            `<b>${lang === 'uz' ? 'Sessiyalar faolligi' : 'Активность сессий'}</b>`,
            `• ${lang === 'uz' ? 'Jami sessiya' : 'Всего сессий'}: <b>${this.formatCountValue(sessionsTotal)}</b>`,
            `• ${lang === 'uz' ? "So'nggi 24 soat" : 'За 24 часа'}: <b>${this.formatCountValue(sessions24h)}</b>`,
            `• ${lang === 'uz' ? "So'nggi 7 kun" : 'За 7 дней'}: <b>${this.formatCountValue(sessions7d)}</b>`,
            '',
            `<b>${lang === 'uz' ? 'Kontent' : 'Контент'}</b>`,
            `• ${lang === 'uz' ? 'Vakansiyalar (jami)' : 'Вакансии (всего)'}: <b>${this.formatCountValue(jobsTotal)}</b>`,
            `• ${lang === 'uz' ? 'Vakansiyalar (faol)' : 'Вакансии (активные)'}: <b>${this.formatCountValue(jobsActive)}</b>`,
            `• ${lang === 'uz' ? 'Rezyumelar (jami)' : 'Резюме (всего)'}: <b>${this.formatCountValue(resumesTotal)}</b>`,
            `• ${lang === 'uz' ? 'Rezyumelar (ochiq)' : 'Резюме (публичные)'}: <b>${this.formatCountValue(resumesPublic)}</b>`,
            `• ${lang === 'uz' ? 'Arizalar' : 'Отклики'}: <b>${this.formatCountValue(applicationsTotal)}</b>`,
            `• ${lang === 'uz' ? 'Ish takliflari' : 'Приглашения'}: <b>${this.formatCountValue(offersTotal)}</b>`,
            '',
            `<b>${lang === 'uz' ? "Maxsus toifalar bo'yicha vakansiyalar" : 'Вакансии по спец-категориям'}</b>`,
            `• ${lang === 'uz' ? 'Talaba va bitiruvchilar uchun' : 'Для студентов и выпускников'}: <b>${this.formatCountValue(jobsStudentsGraduates)}</b>`,
            `• ${lang === 'uz' ? "Nogironligi bo'lgan shaxslar uchun" : 'Для лиц с инвалидностью'}: <b>${this.formatCountValue(jobsDisabledFriendly)}</b>`,
            `• ${lang === 'uz' ? 'Ayollar uchun' : 'Для женщин'}: <b>${this.formatCountValue(jobsWomenFriendly)}</b>`,
            '',
            `<b>${lang === 'uz' ? 'Profil va xavfsizlik' : 'Профили и безопасность'}</b>`,
            `• ${lang === 'uz' ? 'Ish beruvchi profillari' : 'Профили работодателей'}: <b>${this.formatCountValue(employerProfiles)}</b>`,
            `• ${lang === 'uz' ? 'Ish qidiruvchi profillari' : 'Профили соискателей'}: <b>${this.formatCountValue(seekerProfiles)}</b>`,
            `• ${lang === 'uz' ? 'Vaqtincha bloklanganlar' : 'Временно заблокированы'}: <b>${this.formatCountValue(lockedUsers)}</b>`
        ];

        await this.setSession(session, { state: BotState.ADMIN_MENU, data: { ...session.data, admin_mode: true } });
        await this.sendPrompt(chatId, session, lines.join('\n'), {
            parseMode: 'HTML',
            replyMarkup: keyboards.adminMenuKeyboard(lang)
        });
    }

    private async showAdminOffenders(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }

        const rows = await this.fetchTelegramSessionsForAdmin();
        const nowMs = Date.now();
        const offenders = rows
            .map((row) => {
                const count = Number((row?.data as any)?.profanity_count || 0);
                if (!Number.isFinite(count) || count <= 0) return null;
                const bannedUntil = String((row?.data as any)?.banned_until || '').trim() || null;
                const lastText = String((row?.data as any)?.last_abuse_text || '').trim() || null;
                const updatedAt = String(row?.updated_at || '').trim() || null;
                return {
                    telegramUserId: Number(row?.telegram_user_id || 0),
                    userId: row?.user_id ? String(row.user_id) : null,
                    count,
                    bannedUntil,
                    lastText,
                    updatedAt
                };
            })
            .filter((item): item is {
                telegramUserId: number;
                userId: string | null;
                count: number;
                bannedUntil: string | null;
                lastText: string | null;
                updatedAt: string | null;
            } => Boolean(item))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTs - aTs;
            });

        if (!offenders.length) {
            await this.setSession(session, { state: BotState.ADMIN_MENU, data: { ...session.data, admin_mode: true } });
            await this.sendPrompt(chatId, session, botTexts.adminNoOffenders[lang], {
                replyMarkup: keyboards.adminMenuKeyboard(lang)
            });
            return;
        }

        const top = offenders.slice(0, 12);
        const userIds = Array.from(new Set(top.map((item) => item.userId).filter((value): value is string => Boolean(value))));
        const usersMap = new Map<string, { phone?: string | null; role?: string | null; locked_until?: string | null }>();
        if (userIds.length > 0) {
            const { data: users } = await this.supabase
                .from('users')
                .select('id, phone, role, locked_until')
                .in('id', userIds);
            for (const user of users || []) {
                if (!user?.id) continue;
                usersMap.set(String(user.id), {
                    phone: (user as any).phone || null,
                    role: (user as any).role || null,
                    locked_until: (user as any).locked_until || null
                });
            }
        }

        const bannedNowCount = offenders.filter((item) => {
            if (!item.bannedUntil) return false;
            const ts = new Date(item.bannedUntil).getTime();
            return Number.isFinite(ts) && ts > nowMs;
        }).length;

        const lines: string[] = [
            `<b>🚨 | ${lang === 'uz' ? "Qoidabuzarlar ro'yxati" : 'Список нарушителей'}</b>`,
            `<i>${lang === 'uz' ? 'Mat/filtirdan o‘tmagan xabarlar bo‘yicha TOP' : 'TOP по сообщениям, не прошедшим модерацию'}</i>`,
            '',
            `${lang === 'uz' ? 'Jami qoidabuzarlar' : 'Всего нарушителей'}: <b>${offenders.length}</b>`,
            `${lang === 'uz' ? 'Hozir blokda' : 'Сейчас в блоке'}: <b>${bannedNowCount}</b>`,
            ''
        ];

        for (let i = 0; i < top.length; i += 1) {
            const item = top[i];
            const user = item.userId ? usersMap.get(item.userId) : undefined;
            const roleRaw = String(user?.role || '').toLowerCase();
            const roleLabel = roleRaw === 'employer'
                ? (lang === 'uz' ? 'Ish beruvchi' : 'Работодатель')
                : roleRaw === 'job_seeker'
                    ? (lang === 'uz' ? 'Ish qidiruvchi' : 'Соискатель')
                    : (lang === 'uz' ? "Aniqlanmagan rol" : 'Роль не задана');
            const phone = user?.phone ? this.escapeHtml(String(user.phone)) : '—';
            const isLocked = Boolean(user?.locked_until) && new Date(String(user?.locked_until)).getTime() > nowMs;
            const lockLabel = isLocked
                ? (lang === 'uz' ? 'Bloklangan' : 'Заблокирован')
                : (lang === 'uz' ? 'Faol' : 'Активен');
            const preview = item.lastText ? this.escapeHtml(item.lastText.slice(0, 120)) : null;
            lines.push(
                `${i + 1}. <b>${roleLabel}</b> | TG: <code>${item.telegramUserId}</code> | ${lang === 'uz' ? 'Holat' : 'Статус'}: <b>${lockLabel}</b>`
            );
            lines.push(`   ${lang === 'uz' ? 'Qoidabuzarliklar soni' : 'Число нарушений'}: <b>${item.count}</b> | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: <code>${phone}</code>`);
            if (preview) {
                lines.push(`   ${lang === 'uz' ? 'So‘nggi matn' : 'Последний текст'}: <i>${preview}</i>`);
            }
        }

        await this.setSession(session, { state: BotState.ADMIN_MENU, data: { ...session.data, admin_mode: true } });
        await this.sendPrompt(chatId, session, lines.join('\n'), {
            parseMode: 'HTML',
            replyMarkup: keyboards.adminMenuKeyboard(lang)
        });
    }

    private async startAdminBroadcast(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }
        await this.setSession(session, {
            state: BotState.ADMIN_BROADCAST_INPUT,
            data: {
                ...session.data,
                admin_mode: true,
                admin_broadcast_text: null,
                admin_broadcast_source_chat_id: null,
                admin_broadcast_source_message_id: null,
                admin_broadcast_payload_kind: null
            }
        });
        await this.sendPrompt(chatId, session, botTexts.adminBroadcastPrompt[lang], {
            replyMarkup: keyboards.backCancelReplyKeyboard(lang)
        });
    }

    private detectAdminBroadcastPayloadKind(message: TelegramMessage): string | null {
        if ((message.text || '').trim()) return 'text';
        if ((message.caption || '').trim() && Array.isArray(message.photo) && message.photo.length > 0) return 'photo';
        if ((message.caption || '').trim() && message.video) return 'video';
        if ((message.caption || '').trim() && message.animation) return 'animation';
        if ((message.caption || '').trim() && message.document) return 'document';
        if (Array.isArray(message.photo) && message.photo.length > 0) return 'photo';
        if (message.video) return 'video';
        if (message.animation) return 'animation';
        if (message.document) return 'document';
        if (message.audio) return 'audio';
        if (message.voice) return 'voice';
        if (message.video_note) return 'video_note';
        if (message.sticker) return 'sticker';
        if (message.contact) return 'contact';
        if (message.location) return 'location';
        return null;
    }

    private formatAdminBroadcastPreview(message: TelegramMessage, lang: BotLang): string {
        const kind = this.detectAdminBroadcastPayloadKind(message) || 'text';
        const kindLabelByLang: Record<string, { uz: string; ru: string }> = {
            text: { uz: 'Matn', ru: 'Текст' },
            photo: { uz: 'Rasm', ru: 'Фото' },
            video: { uz: 'Video', ru: 'Видео' },
            animation: { uz: 'Animatsiya', ru: 'Анимация' },
            document: { uz: 'Fayl', ru: 'Файл' },
            audio: { uz: 'Audio', ru: 'Аудио' },
            voice: { uz: 'Ovozli xabar', ru: 'Голосовое сообщение' },
            video_note: { uz: 'Video doira', ru: 'Видеосообщение' },
            sticker: { uz: 'Stiker', ru: 'Стикер' },
            contact: { uz: 'Kontakt', ru: 'Контакт' },
            location: { uz: 'Lokatsiya', ru: 'Локация' }
        };
        const kindLabel = kindLabelByLang[kind]?.[lang] || (lang === 'uz' ? 'Xabar' : 'Сообщение');
        const rawText = String(message.caption || message.text || '').trim();
        const shortText = rawText.length > 700 ? `${rawText.slice(0, 700)}...` : rawText;
        const previewLines = [
            botTexts.adminBroadcastConfirm[lang],
            '',
            `<i>${lang === 'uz' ? 'Turi' : 'Тип'}: ${kindLabel}</i>`
        ];
        if (shortText) {
            previewLines.push('', `<blockquote>${this.escapeHtml(shortText)}</blockquote>`);
        }
        return previewLines.join('\n');
    }

    private async handleAdminBroadcastInput(chatId: number, message: TelegramMessage, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }

        const kind = this.detectAdminBroadcastPayloadKind(message);
        if (!kind) {
            await this.sendPrompt(chatId, session, botTexts.adminBroadcastPrompt[lang], {
                replyMarkup: keyboards.backCancelReplyKeyboard(lang)
            });
            return;
        }

        const draftText = String(message.caption || message.text || '').trim();
        if (draftText.length > 3900) {
            await this.sendPrompt(
                chatId,
                session,
                lang === 'uz'
                    ? '❗ Xabar juda uzun. Iltimos, 3900 belgidan oshirmang.'
                    : '❗ Слишком длинное сообщение. Максимум 3900 символов.',
                { replyMarkup: keyboards.backCancelReplyKeyboard(lang) }
            );
            return;
        }

        await this.setSession(session, {
            state: BotState.ADMIN_BROADCAST_CONFIRM,
            data: {
                ...session.data,
                admin_mode: true,
                admin_broadcast_text: draftText || null,
                admin_broadcast_source_chat_id: message.chat.id,
                admin_broadcast_source_message_id: message.message_id,
                admin_broadcast_payload_kind: kind
            }
        });

        await this.sendPrompt(chatId, session, this.formatAdminBroadcastPreview(message, lang), {
            parseMode: 'HTML',
            replyMarkup: keyboards.adminBroadcastConfirmKeyboard(lang)
        });
    }

    private async handleAdminBroadcastDraft(chatId: number, text: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }

        const draft = String(text || '').trim();
        if (!draft) {
            await this.sendPrompt(chatId, session, botTexts.adminBroadcastPrompt[lang], {
                replyMarkup: keyboards.backCancelReplyKeyboard(lang)
            });
            return;
        }
        if (draft.length > 3900) {
            await this.sendPrompt(
                chatId,
                session,
                lang === 'uz'
                    ? '❗ Xabar juda uzun. Iltimos, 3900 belgidan oshirmang.'
                    : '❗ Слишком длинное сообщение. Максимум 3900 символов.',
                { replyMarkup: keyboards.backCancelReplyKeyboard(lang) }
            );
            return;
        }

        await this.setSession(session, {
            state: BotState.ADMIN_BROADCAST_CONFIRM,
            data: {
                ...session.data,
                admin_mode: true,
                admin_broadcast_text: draft,
                admin_broadcast_source_chat_id: null,
                admin_broadcast_source_message_id: null,
                admin_broadcast_payload_kind: 'text'
            }
        });

        const preview = `${botTexts.adminBroadcastConfirm[lang]}\n\n<blockquote>${this.escapeHtml(draft)}</blockquote>`;
        await this.sendPrompt(chatId, session, preview, {
            parseMode: 'HTML',
            replyMarkup: keyboards.adminBroadcastConfirmKeyboard(lang)
        });
    }

    private async handleAdminCallback(chatId: number, value: string, extra: string, session: TelegramSession): Promise<void> {
        void extra;
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }

        if (value === 'menu' || value === 'cancel') {
            await this.showAdminMenu(chatId, session);
            return;
        }
        if (value === 'bc_send') {
            await this.executeAdminBroadcast(chatId, session);
            return;
        }
        if (value === 'stats') {
            await this.showAdminStats(chatId, session);
            return;
        }
        if (value === 'offenders') {
            await this.showAdminOffenders(chatId, session);
            return;
        }
        if (value === 'broadcast') {
            await this.startAdminBroadcast(chatId, session);
            return;
        }
        await this.showAdminMenu(chatId, session);
    }

    private async executeAdminBroadcast(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!this.isAdminTelegramUser(session.telegram_user_id)) {
            await this.sendPrompt(chatId, session, botTexts.adminAccessDenied[lang]);
            return;
        }

        const text = String(session.data?.admin_broadcast_text || '').trim();
        const sourceChatId = Number(session.data?.admin_broadcast_source_chat_id || 0);
        const sourceMessageId = Number(session.data?.admin_broadcast_source_message_id || 0);
        const canCopySourceMessage = Number.isFinite(sourceChatId) && sourceChatId !== 0
            && Number.isFinite(sourceMessageId) && sourceMessageId > 0;
        if (!text && !canCopySourceMessage) {
            await this.startAdminBroadcast(chatId, session);
            return;
        }

        const recipients = await this.collectBroadcastRecipientIds();
        if (!recipients.length) {
            await this.setSession(session, {
                state: BotState.ADMIN_MENU,
                data: {
                    ...session.data,
                    admin_mode: true,
                    admin_broadcast_text: null,
                    admin_broadcast_source_chat_id: null,
                    admin_broadcast_source_message_id: null,
                    admin_broadcast_payload_kind: null
                }
            });
            await this.sendPrompt(
                chatId,
                session,
                lang === 'uz' ? "ℹ️ Yuborish uchun foydalanuvchilar topilmadi." : 'ℹ️ Пользователи для рассылки не найдены.',
                { replyMarkup: keyboards.adminMenuKeyboard(lang) }
            );
            return;
        }

        await this.sendPrompt(chatId, session, botTexts.adminBroadcastStarted[lang], {
            replyMarkup: keyboards.adminMenuKeyboard(lang)
        });

        let success = 0;
        let failed = 0;
        let blocked = 0;
        let useHtml = true;

        for (let i = 0; i < recipients.length; i += 1) {
            const recipient = recipients[i];
            try {
                if (canCopySourceMessage) {
                    await callTelegramAPI('copyMessage', {
                        chat_id: recipient,
                        from_chat_id: sourceChatId,
                        message_id: sourceMessageId
                    });
                } else {
                    await sendMessage(recipient, text, {
                        ...(useHtml ? { parseMode: 'HTML' as const } : {}),
                        disablePremiumEmoji: true
                    });
                }
                success += 1;
            } catch (error) {
                if (canCopySourceMessage && text) {
                    try {
                        await sendMessage(recipient, text, {
                            ...(useHtml ? { parseMode: 'HTML' as const } : {}),
                            disablePremiumEmoji: true
                        });
                        success += 1;
                        continue;
                    } catch (copyFallbackError) {
                        if (this.isBroadcastBlockedError(copyFallbackError)) blocked += 1;
                        else failed += 1;
                        continue;
                    }
                }
                if (useHtml && this.isEntityParseError(error)) {
                    useHtml = false;
                    try {
                        await sendMessage(recipient, text, { disablePremiumEmoji: true });
                        success += 1;
                        continue;
                    } catch (fallbackError) {
                        if (this.isBroadcastBlockedError(fallbackError)) blocked += 1;
                        else failed += 1;
                    }
                } else {
                    if (this.isBroadcastBlockedError(error)) blocked += 1;
                    else failed += 1;
                }
            }

            if ((i + 1) % 25 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                await new Promise(resolve => setTimeout(resolve, 35));
            }
        }

        await this.setSession(session, {
            state: BotState.ADMIN_MENU,
            data: {
                ...session.data,
                admin_mode: true,
                admin_broadcast_text: null,
                admin_broadcast_source_chat_id: null,
                admin_broadcast_source_message_id: null,
                admin_broadcast_payload_kind: null
            }
        });
        await this.sendPrompt(chatId, session, botTexts.adminBroadcastDone[lang](success, failed, blocked), {
            parseMode: 'HTML',
            replyMarkup: keyboards.adminMenuKeyboard(lang)
        });
    }

    private async showMainMenu(chatId: number, session: TelegramSession): Promise<void> {
        await this.clearFlowCancelKeyboard(chatId, session);
        const lastWorkerMessageId = session.data?.last_worker_match_message_id;
        if (lastWorkerMessageId) {
            try {
                await deleteMessage(chatId, lastWorkerMessageId);
            } catch {
                // ignore
            }
        }
        const updatedData = {
            ...session.data,
            admin_mode: false,
            admin_broadcast_text: null,
            admin_broadcast_source_chat_id: null,
            admin_broadcast_source_message_id: null,
            admin_broadcast_payload_kind: null,
            clean_inputs: false,
            search_region_options: [],
            search_region_origin: null,
            last_worker_match_message_id: null
        };
        const lang = session.lang;
        const isEmployer = session.data?.active_role === 'employer';
        await this.setSession(session, {
            state: isEmployer ? BotState.EMPLOYER_MAIN_MENU : BotState.MAIN_MENU,
            data: updatedData
        });
        const stats = await this.getMainMenuStats();
        const statsText = this.buildMainMenuStatsText(lang, stats);
        const introText = this.buildMainMenuIntroText(lang, isEmployer);
        await this.clearLastJobArtifacts(chatId, session);
        if (isEmployer) {
            await this.sendPrompt(chatId, session, `${introText}\n\n${statsText}`, {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
            return;
        }
        await this.sendPrompt(chatId, session, `${introText}\n\n${statsText}`, {
            replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker')
        });
    }

    private async handleAction(chatId: number, action: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (action === 'jobs') {
            await this.showResumeSearchSelection(chatId, session);
            return;
        }

        if (action === 'search') {
            if (session.data?.active_resume_id) {
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
            await this.showResumeSearchSelection(chatId, session);
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
        } else if (action === 'offers') {
            await this.showSeekerOffers(chatId, session);
        } else if (action === 'help') {
            await this.sendPrompt(chatId, session, botTexts.helpText[lang], {
                replyMarkup: keyboards.helpSupportKeyboard(lang),
                parseMode: 'HTML'
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
            await this.sendSeriousSticker(chatId, 'announce');
            await this.setFlowCancelKeyboard(chatId, session);
            const { data: employer } = await this.supabase
                .from('employer_profiles')
                .select('company_name, phone, director_name')
                .eq('user_id', session.user_id)
                .maybeSingle();
            const hasHrFromProfile = String(employer?.director_name || '').trim().length >= 3;
            const baseJob = {
                company_name: employer?.company_name || null,
                contact_phone: employer?.phone || session.phone || null,
                hr_name: employer?.director_name || null,
                hr_from_profile: hasHrFromProfile,
                language_keys: [],
                benefit_keys: []
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
                await this.sendPrompt(chatId, session, botTexts.employerNoVacanciesHint[lang], {
                    replyMarkup: keyboards.employerMainMenuKeyboard(lang)
                });
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
                await this.sendSeriousSticker(chatId, 'warning');
                await this.sendPrompt(
                    chatId,
                    session,
                    lang === 'uz'
                        ? "ℹ️ Hali vakansiya yo'q. Avval yangi vakansiya joylaymiz."
                        : 'ℹ️ Вакансий пока нет. Сначала разместим новую вакансию.',
                    { replyMarkup: keyboards.employerMainMenuKeyboard(lang) }
                );
                await this.handleEmployerMainMenu(chatId, 'post_job', session);
                return;
            }
            const searchableJobs = jobs.filter(job => {
                const state = this.getJobLifecycleState(job);
                return !state.isPaused && !state.isFilled;
            });
            if (!searchableJobs.length) {
                await this.sendSeriousSticker(chatId, 'warning');
                await this.sendPrompt(
                    chatId,
                    session,
                    lang === 'uz'
                        ? "ℹ️ Hozircha ishchi qidirish uchun faol vakansiya yo‘q.\n\n📋 Mening vakansiyalarim bo‘limida vakansiyani faollashtiring."
                        : 'ℹ️ Сейчас нет активных вакансий для поиска сотрудников.\n\nАктивируйте вакансию в разделе «Мои вакансии».',
                    { replyMarkup: keyboards.employerMainMenuKeyboard(lang) }
                );
                return;
            }
            await this.sendPrompt(chatId, session, lang === 'uz' ? "🔎 | Qaysi vakansiya uchun ishchi topamiz?" : '🔎 | Для какой вакансии ищем кандидатов?', {
                replyMarkup: keyboards.employerJobsKeyboard(lang, searchableJobs)
            });
            return;
        }
    }

    private getJobLifecycleState(job: any): { isPaused: boolean; isFilled: boolean; isUnknown: boolean } {
        const statusRaw = String(job?.status || job?.source_status || '').toLowerCase().trim();
        const hasStatus = statusRaw.length > 0;
        const hasActiveFlag = typeof job?.is_active === 'boolean';
        const isFilled = ['filled', 'closed', 'archived'].includes(statusRaw);
        const isPausedByStatus = ['inactive', 'paused', 'on_hold'].includes(statusRaw);
        const isPaused = !isFilled && (isPausedByStatus || job?.is_active === false);
        const isUnknown = !hasStatus && !hasActiveFlag;
        return { isPaused, isFilled, isUnknown };
    }

    private async getEmployerJobs(session: TelegramSession, limit: number = 30): Promise<Array<{ id: string; title_uz?: string; title_ru?: string; title?: string | null; employer_id?: string | null; user_id?: string | null; created_by?: string | null; contact_phone?: string | null; company_name?: string | null; created_at?: string | null; status?: string | null; is_active?: boolean | null }>> {
        const { data: employer } = await this.supabase
            .from('employer_profiles')
            .select('id')
            .eq('user_id', session.user_id)
            .maybeSingle();
        const employerId = employer?.id || null;
        const userId = session.user_id || null;

        const selectVariants = [
            // Prefer variants without legacy "title" first (many schemas don't have this column).
            'id, title_uz, title_ru, employer_id, user_id, created_by, contact_phone, company_name, created_at, raw_source_json',
            'id, title_uz, title_ru, employer_id, user_id, created_by, contact_phone, created_at, raw_source_json',
            'id, title_uz, title_ru, employer_id, user_id, created_by, created_at, raw_source_json',
            'id, title_uz, title_ru, employer_id, user_id, created_at, raw_source_json',
            'id, title_uz, title_ru, employer_id, created_by, created_at, raw_source_json',
            'id, title_uz, title_ru, employer_id, created_at, raw_source_json',
            'id, title_uz, title_ru, user_id, created_by, created_at, raw_source_json',
            'id, title_uz, title_ru, created_by, created_at, raw_source_json',
            'id, title_uz, title_ru, created_at, raw_source_json',
            'id, title_uz, created_at, raw_source_json',
            'id, title_ru, created_at, raw_source_json',
            // Legacy schemas with "title".
            'id, title_uz, title_ru, title, employer_id, user_id, created_by, contact_phone, company_name, created_at, raw_source_json',
            'id, title_uz, title_ru, title, employer_id, user_id, created_by, contact_phone, created_at, raw_source_json',
            'id, title_uz, title_ru, title, employer_id, created_by, created_at, raw_source_json',
            'id, title_uz, title_ru, title, created_by, created_at, raw_source_json',
            'id, title_uz, title_ru, title, created_at, raw_source_json',
            'id, title, created_at, raw_source_json',
            'id, created_at'
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
        let preferredSelectClause: string | null = null;
        const runQuery = async (
            label: string,
            queryBuilder: (selectClause: string) => PromiseLike<{ data: any[] | null; error: any }>,
            filterColumn?: string
        ) => {
            let lastError: any = null;
            const variants = preferredSelectClause
                ? [preferredSelectClause, ...selectVariants.filter(v => v !== preferredSelectClause)]
                : selectVariants;
            for (const selectClause of variants) {
                const result: any = await queryBuilder(selectClause);
                if (!result?.error) {
                    mergeRows(result?.data || []);
                    preferredSelectClause = selectClause;
                    return;
                }
                lastError = result.error;
                const missingColumn = this.extractMissingColumn(lastError);
                if (filterColumn && missingColumn === filterColumn) {
                    // Query filter column does not exist in this schema; skip this strategy.
                    return;
                }
                const msg = String(lastError?.message || '').toLowerCase();
                if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column')) {
                    continue;
                }
                break;
            }
            if (lastError) {
                const missingColumn = this.extractMissingColumn(lastError);
                if (filterColumn && missingColumn === filterColumn) {
                    return;
                }
                console.error(`[BOT] getEmployerJobs ${label} error:`, lastError);
            }
        };

        if (employerId) {
            await runQuery(
                'employer_id',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .eq('employer_id', employerId)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 3, 50)),
                'employer_id'
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
                    .limit(Math.max(limit * 3, 50)),
                'created_by'
            );
        }

        if (userId) {
            await runQuery(
                'user_id',
                (selectClause) => this.supabase
                    .from('jobs')
                    .select(selectClause)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(Math.max(limit * 3, 50)),
                'user_id'
            );
        }

        let jobs = Array.from(jobsMap.values());

        // Legacy catch-all: broaden selection and filter in memory only by strict ownership keys.
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
                const byUser = userId && String(job?.user_id || '') === String(userId);
                return Boolean(byEmployer || byCreator || byUser);
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

        const statusById = new Map<string, { status?: string | null; is_active?: boolean | null }>();
        const jobIds = jobs.map((job: any) => String(job?.id || '')).filter(Boolean);
        if (jobIds.length > 0) {
            let statusSelect = 'id, status, is_active';
            for (let attempt = 0; attempt < 8; attempt += 1) {
                const statusRes = await this.supabase
                    .from('jobs')
                    .select(statusSelect)
                    .in('id', jobIds);
                if (!statusRes.error) {
                    for (const row of (statusRes.data || []) as any[]) {
                        if (!row?.id) continue;
                        statusById.set(String(row.id), {
                            status: row?.status ?? null,
                            is_active: row?.is_active ?? null
                        });
                    }
                    break;
                }
                const missingColumn = this.extractMissingColumn(statusRes.error);
                if (missingColumn) {
                    const next = this.stripColumnFromSelect(statusSelect, missingColumn);
                    if (next && next !== statusSelect) {
                        statusSelect = next;
                        continue;
                    }
                }
                break;
            }
        }

        return jobs.map((job: any) => {
            const inferredTitle = job?.title
                || job?.title_uz
                || job?.title_ru
                || job?.position
                || job?.job_title
                || job?.profession_name
                || job?.raw_source_json?.title
                || job?.raw_source_json?.position
                || job?.raw_source_json?.job_title
                || null;
            const statusPatch = statusById.get(String(job?.id || '')) || {};
            return {
                ...job,
                title: inferredTitle,
                status: statusPatch.status ?? job?.status ?? null,
                is_active: statusPatch.is_active ?? job?.is_active ?? null
            };
        });
    }

    private async showEmployerApplications(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const employerJobs = await this.getEmployerJobs(session, 200);
        const employerJobIds = new Set((employerJobs || []).map(job => String(job.id)));
        const employerJobsMap = new Map((employerJobs || []).map(job => [String(job.id), job]));

        let appSelect = 'id, created_at, status, full_name, resume_id, user_id, applicant_id, job_id, viewed_at';
        let apps: any[] | null = null;
        let error: any = null;
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const result = await this.supabase
                .from('job_applications')
                .select(appSelect)
                .order('created_at', { ascending: false })
                .limit(200);
            apps = result.data || null;
            error = result.error || null;
            if (!error) break;
            const missingColumn = this.extractMissingColumn(error);
            if (missingColumn) {
                const next = this.stripColumnFromSelect(appSelect, missingColumn);
                if (next && next !== appSelect) {
                    appSelect = next;
                    continue;
                }
            }
            break;
        }

        if (error) {
            console.error('Applications fetch error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const filtered = (apps || []).filter((app: any) => {
            const jobId = String(app?.job_id || '');
            if (!jobId) return false;
            return employerJobIds.has(jobId);
        });

        if (!filtered.length) {
            const emptyText = lang === 'uz'
                ? "📨 | Arizalar bo'limi\n\nHozircha arizalar yo‘q."
                : '📨 | Раздел откликов\n\nПока откликов нет.';
            await this.sendPrompt(chatId, session, emptyText, { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const list = filtered.map((app: any) => {
            const jobRow = employerJobsMap.get(String(app?.job_id || ''));
            const inferredTitle = jobRow?.title || jobRow?.title_uz || jobRow?.title_ru || null;
            return {
                id: app.id,
                applicant: app.full_name || null,
                jobTitle: lang === 'uz'
                    ? (inferredTitle || 'Vakansiya')
                    : (inferredTitle || 'Вакансия'),
                isUnread: !app?.viewed_at
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
        let appSelect = 'id, job_id, resume_id, user_id, applicant_id, full_name, phone';
        let app: any = null;
        let error: any = null;
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const result = await this.supabase
                .from('job_applications')
                .select(appSelect)
                .eq('id', applicationId)
                .maybeSingle();
            app = result.data || null;
            error = result.error || null;
            if (!error) break;
            const missingColumn = this.extractMissingColumn(error);
            if (missingColumn) {
                const next = this.stripColumnFromSelect(appSelect, missingColumn);
                if (next && next !== appSelect) {
                    appSelect = next;
                    continue;
                }
            }
            break;
        }

        if (error || !app) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const employerJobs = await this.getEmployerJobs(session, 400);
        const allowedJobIds = new Set((employerJobs || []).map((job: any) => String(job?.id || '')));
        if (!allowedJobIds.has(String(app?.job_id || ''))) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
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

        let jobTitle = lang === 'uz' ? 'Vakansiya' : 'Вакансия';
        const jobId = String(app?.job_id || '');
        if (jobId) {
            let jobSelect = 'id, title_uz, title_ru, title, position, job_title, profession_name, raw_source_json';
            for (let attempt = 0; attempt < 12; attempt += 1) {
                const result = await this.supabase
                    .from('jobs')
                    .select(jobSelect)
                    .eq('id', jobId)
                    .maybeSingle();
                if (!result.error) {
                    const jobRow: any = result.data || {};
                    const inferred = jobRow?.title
                        || jobRow?.title_uz
                        || jobRow?.title_ru
                        || jobRow?.position
                        || jobRow?.job_title
                        || jobRow?.profession_name
                        || jobRow?.raw_source_json?.title
                        || jobRow?.raw_source_json?.position
                        || jobRow?.raw_source_json?.job_title;
                    if (inferred) jobTitle = String(inferred);
                    break;
                }
                const missingColumn = this.extractMissingColumn(result.error);
                if (missingColumn) {
                    const next = this.stripColumnFromSelect(jobSelect, missingColumn);
                    if (next && next !== jobSelect) {
                        jobSelect = next;
                        continue;
                    }
                }
                break;
            }
        }

        if (!resume) {
            const fallback = [
                `${lang === 'uz' ? 'Nomzod' : 'Кандидат'}: ${app.full_name || '—'}`,
                `${lang === 'uz' ? 'Vakansiya' : 'Вакансия'}: ${jobTitle}`,
                '',
                `📞 | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${app.phone || '—'}`
            ].join('\n');
            await this.sendPrompt(chatId, session, fallback, { replyMarkup: keyboards.applicationViewKeyboard(lang) });
            return;
        }

        const resumeText = await this.buildResumeText(resume, lang, { hideLocation: true });
        const header = `${lang === 'uz' ? '📨 Ariza' : '📨 Отклик'}\n${lang === 'uz' ? 'Vakansiya' : 'Вакансия'}: ${jobTitle}`;
        await this.sendPrompt(chatId, session, `${header}\n\n${resumeText}`, {
            parseMode: 'HTML',
            replyMarkup: keyboards.applicationViewKeyboard(lang)
        });
    }

    private async handleEmployerJobClose(
        chatId: number,
        jobId: string,
        session: TelegramSession,
        reason: 'hired' | 'paused' = 'hired'
    ): Promise<void> {
        const lang = session.lang;
        const updatePayload = reason === 'paused'
            ? {
                status: 'inactive',
                source_status: 'inactive',
                is_active: false,
                updated_at: new Date().toISOString()
            }
            : {
                status: 'filled',
                source_status: 'filled',
                is_active: false,
                updated_at: new Date().toISOString()
            };
        const { error } = await this.supabase
            .from('jobs')
            .update(updatePayload)
            .eq('id', jobId);

        if (error) {
            console.error('Job close error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        await this.sendPrompt(chatId, session, reason === 'paused'
            ? (lang === 'uz' ? '⏸️ Vakansiya vaqtincha yopildi.' : '⏸️ Вакансия временно приостановлена.')
            : (lang === 'uz' ? '✅ Vakansiya yopildi (xodim topildi).' : '✅ Вакансия закрыта (сотрудник найден).'), {
            replyMarkup: keyboards.employerMainMenuKeyboard(lang)
        });
    }

    private async handleEmployerJobActivate(chatId: number, jobId: string, session: TelegramSession, sourceMessageId?: number): Promise<void> {
        const lang = session.lang;
        void sourceMessageId;
        const { error } = await this.supabase
            .from('jobs')
            .update({
                status: 'active',
                source_status: 'active',
                is_active: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);

        if (error) {
            console.error('Job activate error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }
        await this.handleEmployerJobView(chatId, jobId, session);
    }

    private async handleEmployerJobDelete(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!jobId) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const employerJobs = await this.getEmployerJobs(session, 400);
        const allowedJobIds = new Set((employerJobs || []).map((job: any) => String(job?.id || '')));
        if (!allowedJobIds.has(String(jobId))) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        let hardDeleted = false;
        const hardDelete = await this.supabase
            .from('jobs')
            .delete()
            .eq('id', jobId);
        if (!hardDelete.error) {
            hardDeleted = true;
        } else {
            const archive = await this.supabase
                .from('jobs')
                .update({
                    status: 'archived',
                    source_status: 'archived',
                    is_active: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', jobId);
            if (archive.error) {
                console.error('Job delete/archive error:', archive.error);
                await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
                return;
            }
        }

        const infoText = hardDeleted
            ? (lang === 'uz' ? "✅ Vakansiya o'chirildi." : '✅ Вакансия удалена.')
            : (lang === 'uz' ? '✅ Vakansiya arxivga o‘tkazildi.' : '✅ Вакансия переведена в архив.');
        await this.sendPrompt(chatId, session, infoText, { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
    }

    private async handleMatchJob(chatId: number, jobId: string, session: TelegramSession, sourceMessageId?: number): Promise<void> {
        const lang = session.lang;
        void sourceMessageId;
        await this.clearLastJobArtifacts(chatId, session);
        const lastWorkerMessageId = session.data?.last_worker_match_message_id;
        if (lastWorkerMessageId) {
            try {
                await deleteMessage(chatId, lastWorkerMessageId);
            } catch {
                // ignore
            }
        }
        await this.setSession(session, {
            data: {
                ...session.data,
                last_worker_match_message_id: null
            }
        });
        const loadingMessageId = await this.showLoadingHint(chatId, session, botTexts.workerSearchLoading[lang]);
        try {
            const { data: job } = await this.supabase
                .from('jobs')
                .select('*')
                .eq('id', jobId)
                .maybeSingle();
            if (!job) {
                await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
                return;
            }
            const state = this.getJobLifecycleState(job);
            const isPaused = state.isPaused;
            const isFilled = state.isFilled;
            if (isPaused || isFilled) {
                await this.showEmployerJobDetails(chatId, session, job);
                return;
            }
            await this.showMatchingResumesForJob(chatId, session, job);
        } finally {
            await this.clearLoadingHint(chatId, loadingMessageId);
        }
    }

    private async handleEmployerJobView(chatId: number, jobId: string, session: TelegramSession, sourceMessageId?: number): Promise<void> {
        void sourceMessageId;
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
        const state = this.getJobLifecycleState(job);
        const isPaused = state.isPaused;
        const isFilled = state.isFilled;
        await this.sendPrompt(chatId, session, text, {
            replyMarkup: keyboards.employerJobViewKeyboard(lang, job.id, { isPaused, isFilled })
        });
    }

    private getSessionCurrentRole(session: TelegramSession): 'job_seeker' | 'employer' | null {
        const activeRole = session.data?.active_role;
        if (activeRole === 'employer' || activeRole === 'job_seeker') return activeRole;
        if (session.state === BotState.EMPLOYER_MAIN_MENU) return 'employer';
        if (session.state === BotState.MAIN_MENU || session.state === BotState.BROWSING_JOBS || session.state === BotState.VIEWING_RESUME) {
            return 'job_seeker';
        }
        return null;
    }

    private getRoleDisplayName(lang: BotLang, role: 'job_seeker' | 'employer' | null): string {
        if (role === 'employer') {
            return lang === 'uz' ? 'Ish beruvchi' : 'Работодатель';
        }
        if (role === 'job_seeker') {
            return lang === 'uz' ? 'Ish qidiruvchi' : 'Соискатель';
        }
        return lang === 'uz' ? "Aniqlanmagan" : 'Не определена';
    }

    private buildRoleSwitchPrompt(
        lang: BotLang,
        currentRole: 'job_seeker' | 'employer' | null,
        targetRole: 'seeker' | 'employer' | null
    ): string {
        const currentLabel = this.getRoleDisplayName(lang, currentRole);
        const targetLabel = this.getRoleDisplayName(lang, targetRole === 'employer' ? 'employer' : (targetRole === 'seeker' ? 'job_seeker' : null));
        if (lang === 'uz') {
            return [
                '<b>🔄 | Rolni almashtirishni tasdiqlang</b>',
                `<i>Joriy rol: ${this.escapeHtml(currentLabel)}</i>`,
                `<i>Yangi rol: ${this.escapeHtml(targetLabel)}</i>`,
                '',
                '<i>Parol oldin o‘rnatilgan bo‘lsa, uni kiritasiz.</i>',
                '<i>Agar parol o‘rnatilmagan bo‘lsa, yangi parol o‘rnatasiz.</i>',
                '<i>Savollar bo‘lsa: @ishdasiz_admin</i>'
            ].join('\n');
        }
        return [
            '<b>🔄 | Подтвердите смену роли</b>',
            `<i>Текущая роль: ${this.escapeHtml(currentLabel)}</i>`,
            `<i>Новая роль: ${this.escapeHtml(targetLabel)}</i>`,
            '',
            '<i>Если пароль уже задан, нужно ввести его.</i>',
            '<i>Если пароля нет, нужно создать новый.</i>',
            '<i>По вопросам: @ishdasiz_admin</i>'
        ].join('\n');
    }

    private async handleRoleSwitchDecision(chatId: number, decision: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const request = session.data?.role_switch_request || {};
        if (decision !== 'yes') {
            await this.setSession(session, {
                data: {
                    ...session.data,
                    role_switch_request: null,
                    role_switch_pending: false,
                    role_switch_target: null
                }
            });
            await this.showMainMenu(chatId, session);
            return;
        }

        const targetRole = request?.target_role === 'employer' || request?.target_role === 'seeker'
            ? request.target_role
            : null;
        if (!targetRole) {
            await this.setSession(session, {
                state: BotState.SELECTING_ROLE,
                data: {
                    ...session.data,
                    role_switch_request: null
                }
            });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], { replyMarkup: keyboards.roleSelectionKeyboard(lang) });
            return;
        }

        if (!session.phone) {
            await this.sendPrompt(chatId, session, this.buildStartWelcomeText(session, lang), {
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
            role_switch_request: null,
            role_switch_pending: true,
            role_switch_target: targetRole,
            password_flow: hasPassword ? 'login' : 'create',
            password_create_first: null
        };
        await this.setSession(session, { state: BotState.AWAITING_PASSWORD, data: updatedData });
        const prompt = hasPassword ? botTexts.enterPassword[lang] : botTexts.createPasswordPrompt[lang];
        await this.sendPrompt(chatId, session, prompt, { replyMarkup: keyboards.cancelReplyKeyboard(lang) });
    }

    private async handleRoleSwitch(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        await this.clearRoleSwitchArtifacts(chatId, session);
        if (!session.phone) {
            await this.sendPrompt(chatId, session, this.buildStartWelcomeText(session, lang), {
                replyMarkup: keyboards.startKeyboard(lang),
                parseMode: 'HTML'
            });
            return;
        }
        const currentRole = this.getSessionCurrentRole(session);
        const targetRole: 'seeker' | 'employer' | null = currentRole === 'employer'
            ? 'seeker'
            : (currentRole === 'job_seeker' ? 'employer' : null);

        if (!targetRole) {
            await this.setSession(session, { state: BotState.SELECTING_ROLE });
            await this.sendPrompt(chatId, session, botTexts.selectRole[lang], {
                replyMarkup: keyboards.roleSelectionKeyboard(lang)
            });
            return;
        }

        const updatedData = {
            ...session.data,
            role_switch_request: {
                current_role: currentRole,
                target_role: targetRole
            },
            role_switch_pending: false,
            role_switch_target: null
        };
        await this.setSession(session, { data: updatedData });
        const prompt = this.buildRoleSwitchPrompt(lang, currentRole, targetRole);
        await this.sendPrompt(chatId, session, prompt, { replyMarkup: keyboards.roleSwitchConfirmKeyboard(lang), parseMode: 'HTML' });
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
            const fallbackCompany = jobData?.company_name || 'Tashkilot';
            const { data: createdEmployer, error: createError } = await this.supabase
                .from('employer_profiles')
                .upsert({
                    user_id: session.user_id,
                    company_name: fallbackCompany,
                    phone: session.phone || null,
                    telegram: this.normalizeTelegramUsername(session.data?.telegram_username),
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
        const employerLocationPatch: Record<string, any> = {};
        const sessionTelegram = this.normalizeTelegramUsername(session.data?.telegram_username);
        const employerTelegram = this.normalizeTelegramUsername((employerProfile as any)?.telegram);
        const jobTelegram = this.normalizeTelegramUsername(jobData?.contact_telegram);
        const contactTelegram = jobTelegram || employerTelegram || sessionTelegram;
        if (jobData?.region_id) employerLocationPatch.region_id = jobData.region_id;
        if (jobData?.district_id) employerLocationPatch.district_id = jobData.district_id;
        if (contactTelegram) employerLocationPatch.telegram = contactTelegram;
        if (this.toCoordinate(jobData?.latitude) !== null) employerLocationPatch.default_latitude = this.toCoordinate(jobData?.latitude);
        if (this.toCoordinate(jobData?.longitude) !== null) employerLocationPatch.default_longitude = this.toCoordinate(jobData?.longitude);
        if (jobData?.address) {
            employerLocationPatch.address = jobData.address;
            employerLocationPatch.default_address = jobData.address;
        }
        if (Object.keys(employerLocationPatch).length > 0) {
            try {
                const patchPayload = { ...employerLocationPatch, updated_at: new Date().toISOString() };
                const { error: profilePatchError } = await this.supabase
                    .from('employer_profiles')
                    .update(patchPayload)
                    .eq('id', employerId);
                if (!profilePatchError) {
                    employerProfile = { ...employerProfile, ...employerLocationPatch };
                } else {
                    console.error('Employer location sync error:', profilePatchError);
                }
            } catch (syncErr) {
                console.error('Employer location sync exception:', syncErr);
            }
        }

        const title = jobData?.title || jobData?.field_title || (lang === 'uz' ? 'Vakansiya' : 'Вакансия');
        const aiSections = jobData?.ai_sections || null;
        const description = jobData?.description || this.buildJobDescriptionFromSections(aiSections) || title;
        const companyName = jobData?.company_name || employerProfile.company_name || 'Tashkilot';
        const address = jobData?.address || employerProfile.address || employerProfile.default_address || null;
        const resolvedRegionId = jobData?.region_id || employerProfile.region_id || null;
        const resolvedDistrictId = jobData?.district_id || employerProfile.district_id || null;
        const resolvedRegionName = jobData?.region_name
            || (resolvedRegionId ? await this.getRegionNameById(resolvedRegionId, lang) : null)
            || null;
        const resolvedDistrictName = jobData?.district_name
            || (resolvedDistrictId ? await this.getDistrictNameById(resolvedDistrictId, lang) : null)
            || null;

        const rawMeta = jobData?.ai_meta || {};
        const languages = Array.isArray(jobData?.languages)
            ? jobData.languages
            : (Array.isArray(aiSections?.tillar) ? aiSections.tillar : []);
        const benefitsList = Array.isArray(jobData?.benefits)
            ? jobData.benefits.map((item: any) => String(item).trim()).filter(Boolean)
            : (typeof jobData?.benefits === 'string'
                ? this.parseListInput(jobData.benefits)
                : (Array.isArray(aiSections?.qulayliklar) ? aiSections.qulayliklar.map((item: any) => String(item).trim()).filter(Boolean) : []));
        const benefitsText = benefitsList.length > 0 ? benefitsList.join(', ') : null;
        const special = Array.isArray(jobData?.special) ? jobData.special : [];
        const normalizedEmployment = jobData?.employment_type || 'full_time';
        const normalizedExperience = jobData?.experience || 'no_experience';
        const normalizedEducation = jobData?.education_level || 'any';
        const normalizedGender = jobData?.gender || 'any';
        const rawExperience = this.mapExperienceKeyToRaw(normalizedExperience);
        const rawEducation = this.mapEducationKeyToRaw(normalizedEducation);
        const raw_source_json = {
            ...(jobData?.raw_source_json || {}),
            description_text: description,
            min_education: rawEducation,
            work_experiance: rawExperience,
            education_level: normalizedEducation,
            experience: normalizedExperience,
            working_days: jobData?.working_days || rawMeta?.working_days || null,
            working_hours: jobData?.working_hours || rawMeta?.working_hours || null,
            talablar: aiSections?.talablar || [],
            ish_vazifalari: aiSections?.ish_vazifalari || [],
            qulayliklar: benefitsList.length > 0 ? benefitsList : (aiSections?.qulayliklar || []),
            tillar: languages
        };

        const payload: Record<string, any> = {
            employer_id: employerId,
            user_id: session.user_id,
            created_by: session.user_id,
            title,
            title_uz: title,
            title_ru: title,
            description,
            description_uz: description,
            description_ru: description,
            requirements_uz: description,
            requirements_ru: description,
            company_name: companyName,
            category_id: jobData?.category_id || null,
            field_id: jobData?.field_id || null,
            field_title: jobData?.field_title || null,
            region_id: resolvedRegionId,
            district_id: resolvedDistrictId,
            region_name: resolvedRegionName,
            district_name: resolvedDistrictName,
            address,
            latitude: this.toCoordinate(jobData?.latitude),
            longitude: this.toCoordinate(jobData?.longitude),
            salary_min: Number.isFinite(jobData?.salary_min) ? jobData?.salary_min : (jobData?.salary_min ? Number(jobData.salary_min) : null),
            salary_max: Number.isFinite(jobData?.salary_max) ? jobData?.salary_max : (jobData?.salary_max ? Number(jobData.salary_max) : null),
            contact_phone: jobData?.contact_phone || employerProfile.phone || session.phone || null,
            phone: jobData?.contact_phone || employerProfile.phone || session.phone || null,
            contact_telegram: contactTelegram || null,
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
            source_status: 'active',
            source: 'local',
            is_imported: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        let insertPayload: Record<string, any> = { ...payload };
        let createdJob: any = null;
        let insertError: any = null;
        for (let attempt = 0; attempt < 50; attempt += 1) {
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

            const msg = String(insertError?.message || '').toLowerCase();

            // Handle legacy schemas where column types/relations differ.
            if (msg.includes('jobs_region_id_fkey') || msg.includes('violates foreign key constraint') && msg.includes('region')) {
                if (Object.prototype.hasOwnProperty.call(insertPayload, 'region_id')) {
                    delete insertPayload.region_id;
                    continue;
                }
            }
            if (msg.includes('jobs_district_id_fkey') || msg.includes('violates foreign key constraint') && msg.includes('district')) {
                if (Object.prototype.hasOwnProperty.call(insertPayload, 'district_id')) {
                    delete insertPayload.district_id;
                    continue;
                }
            }
            if (msg.includes('jobs_category_id_fkey') || msg.includes('violates foreign key constraint') && msg.includes('category')) {
                if (Object.prototype.hasOwnProperty.call(insertPayload, 'category_id')) {
                    delete insertPayload.category_id;
                    continue;
                }
            }
            if (msg.includes('invalid input syntax for type uuid')) {
                if (Object.prototype.hasOwnProperty.call(insertPayload, 'district_id')) {
                    delete insertPayload.district_id;
                    continue;
                }
                if (Object.prototype.hasOwnProperty.call(insertPayload, 'region_id')) {
                    delete insertPayload.region_id;
                    continue;
                }
            }
            if (msg.includes('null value in column')) {
                if (msg.includes('title_uz')) {
                    insertPayload.title_uz = title;
                    continue;
                }
                if (msg.includes('title_ru')) {
                    insertPayload.title_ru = title;
                    continue;
                }
                if (msg.includes('description_uz')) {
                    insertPayload.description_uz = description;
                    continue;
                }
                if (msg.includes('description_ru')) {
                    insertPayload.description_ru = description;
                    continue;
                }
                if (msg.includes('company_name')) {
                    insertPayload.company_name = companyName;
                    continue;
                }
                if (msg.includes('employment_type')) {
                    insertPayload.employment_type = 'full_time';
                    continue;
                }
            }
            break;
        }

        if (insertError) {
            console.error('Job publish error:', insertError);
            await this.sendSeriousSticker(chatId, 'error');
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        if (createdJob?.id) {
            try {
                await this.supabase
                    .from('sync_events')
                    .insert({
                        entity_type: 'job',
                        entity_id: createdJob.id,
                        action: 'upsert',
                        region_id: this.toCoordinate(createdJob?.region_id ?? payload?.region_id),
                        payload: { source: 'bot', status: 'active', is_active: true },
                        status: 'pending',
                        next_retry_at: new Date().toISOString()
                    });
            } catch {
                // ignore sync outbox issues in runtime flow
            }
        }

        let channelPublished = false;
        if (createdJob?.id) {
            channelPublished = await this.publishJobToRegionChannel(createdJob.id, {
                ...payload,
                ...createdJob
            });
        }

        await this.sendSeriousSticker(chatId, 'success');
        const channelUsername =
            await this.getRegionChannelUsernameById(createdJob?.region_id || payload?.region_id || jobData?.region_id);
        const publishedText = channelUsername
            ? `${botTexts.jobPublished[lang]}\n\n${this.buildJobChannelNotice(lang, channelUsername, channelPublished ? 'published' : 'pending')}`
            : botTexts.jobPublished[lang];
        await this.sendPrompt(chatId, session, publishedText, { replyMarkup: keyboards.jobPublishedKeyboard(lang, createdJob?.id) });
        await this.clearFlowCancelKeyboard(chatId, session);
        await this.setSession(session, { state: BotState.EMPLOYER_MAIN_MENU, data: { ...session.data, temp_job: null, clean_inputs: false } });
    }

    private buildAiJobDescriptionSuggestion(jobData: any, lang: BotLang): string {
        const title = String(jobData?.title || jobData?.field_title || (lang === 'uz' ? 'lavozim' : 'должность')).trim();
        const experience = String(jobData?.experience || '').toLowerCase();
        const education = String(jobData?.education_level || '').toLowerCase();

        const expTextUz = experience
            ? (experience.includes('no_experience') ? "Tajriba talab etilmaydi." : `Kamida ${experience.replace(/_/g, ' ')} tajriba talab qilinadi.`)
            : 'Ish tajribasi ustunlik beradi.';
        const expTextRu = experience
            ? (experience.includes('no_experience') ? 'Опыт не обязателен.' : `Требуется опыт: ${experience.replace(/_/g, ' ')}.`)
            : 'Опыт работы будет преимуществом.';

        const eduTextUz = education && education !== 'any'
            ? `${education.replace(/_/g, ' ')} darajadagi ma'lumot afzal.`
            : "Ma'lumot darajasi bo'yicha moslik ko'rib chiqiladi.";
        const eduTextRu = education && education !== 'any'
            ? `Предпочтительно образование: ${education.replace(/_/g, ' ')}.`
            : 'Уровень образования обсуждается индивидуально.';

        if (lang === 'uz') {
            return [
                `- ${title} bo'yicha asosiy vazifalarni mas'uliyat bilan bajarish.`,
                `- ${expTextUz} ${eduTextUz}`,
                `- Jamoa bilan hamkorlikda ishlash va ichki tartibga amal qilish.`
            ].join('\n');
        }

        return [
            `- Выполнять ключевые задачи по позиции «${title}» качественно и в срок.`,
            `- ${expTextRu} ${eduTextRu}`,
            `- Работать в команде и соблюдать внутренние правила компании.`
        ].join('\n');
    }

    private normalizeAiListSuggestion(rawText: string): string {
        const raw = String(rawText || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/\r/g, '\n')
            .trim();
        if (!raw) return '';

        const lines = raw
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .filter(line => !/^(talablar|vazifalar|требования|обязанности)\s*:?\s*$/i.test(line))
            .map(line => line.replace(/^[-•*]\s*/, '').replace(/^\d+[\.)]\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 3);

        if (!lines.length) return '';
        const compact = lines.map((line) => {
            const words = line.split(/\s+/).filter(Boolean);
            const shortLine = words.slice(0, 14).join(' ');
            return shortLine.replace(/[.,;:!?]+$/g, '').trim();
        }).filter(Boolean);
        return compact.map(line => `- ${line}`).join('\n');
    }

    private async generateAiJobDescriptionSuggestion(jobData: any, lang: BotLang): Promise<string> {
        const fallback = this.buildAiJobDescriptionSuggestion(jobData, lang);
        if (!process.env.DEEPSEEK_API_KEY) {
            return fallback;
        }

        const title = String(jobData?.title || jobData?.field_title || (lang === 'uz' ? 'lavozim' : 'должность')).trim();
        const category = String(jobData?.category_name || '').trim();
        const company = String(jobData?.company_name || '').trim();
        const workMode = String(jobData?.work_mode || '').trim();
        const employment = String(jobData?.employment_type || '').trim();

        const prompt = lang === 'uz'
            ? [
                "Siz tajribali HR mutaxassissiz.",
                "Faqat o'zbek lotin alifbosida yozing, inglizcha va ruscha so'zlarni aralashtirmang.",
                "Quyidagi vakansiya uchun 'Talablar va vazifalar' bo'limi uchun 3 ta aniq band yozing.",
                "Qoidalar:",
                "- Faqat 3 ta band bo'lsin.",
                "- Har band '-' bilan boshlangan bo'lsin.",
                "- Maosh, ish vaqti, ish kunlari, yosh va aniq tajriba muddatini takrorlamang.",
                "- Har band juda qisqa bo'lsin (10-14 so'zdan oshmasin).",
                "- Har band amaliy va aniq bo'lsin.",
                "",
                `Lavozim: ${title || 'Lavozim'}`,
                `Soha: ${category || "Ko'rsatilmagan"}`,
                `Tashkilot: ${company || "Ko'rsatilmagan"}`,
                `Ish formati: ${workMode || "Ko'rsatilmagan"}`,
                `Bandlik: ${employment || "Ko'rsatilmagan"}`,
                "",
                "Faqat ro'yxatni qaytaring."
            ].join('\n')
            : [
                'Вы опытный HR-специалист.',
                'Пишите только на русском языке, без английских слов.',
                'Сформируйте 3 пункта для блока «Требования и обязанности» для вакансии.',
                'Правила:',
                '- Ровно 3 пункта.',
                '- Каждый пункт должен начинаться с "-".',
                '- Не повторяйте зарплату, график, возраст и конкретные сроки опыта.',
                '- Каждый пункт должен быть очень коротким (до 14 слов).',
                '- Пункты должны быть практичными и конкретными.',
                '',
                `Должность: ${title || 'Должность'}`,
                `Сфера: ${category || 'Не указано'}`,
                `Компания: ${company || 'Не указано'}`,
                `Формат работы: ${workMode || 'Не указано'}`,
                `Занятость: ${employment || 'Не указано'}`,
                '',
                'Верните только список.'
            ].join('\n');

        try {
            const response = await callDeepSeekText(prompt, 280, undefined, 0.35);
            const normalized = this.normalizeAiListSuggestion(response);
            return normalized || fallback;
        } catch (error) {
            console.error('DeepSeek description suggestion error:', error);
            return fallback;
        }
    }

    private async presentJobDescriptionStep(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const loadingHintId = await this.showLoadingHint(
            chatId,
            session,
            lang === 'uz' ? "🤖 | AI tavsiya tayyorlanmoqda..." : '🤖 | Подготавливаю AI-рекомендацию...'
        );

        let suggestion = '';
        try {
            suggestion = await this.generateAiJobDescriptionSuggestion(session.data?.temp_job || {}, lang);
        } finally {
            await this.clearLoadingHint(chatId, loadingHintId);
        }

        if (!suggestion) {
            await this.sendPrompt(chatId, session, botTexts.postJobDescription[lang], {
                replyMarkup: keyboards.jobDescriptionKeyboard(lang)
            });
            return;
        }

        const nextData = { ...session.data, ai_job_description_suggestion: suggestion };
        await this.setSession(session, { state: BotState.POSTING_JOB_DESCRIPTION, data: nextData });

        const preview = lang === 'uz'
            ? `${botTexts.postJobDescription[lang]}\n\n<b>🤖 | AI tavsiyasi</b>\n<i>Ushbu matn AI yordamida shakllantirildi.</i>\n\n${this.escapeHtml(suggestion)}\n\n<i>Shu variantni qo‘llashingiz yoki o‘zingiz yozishingiz mumkin.</i>`
            : `${botTexts.postJobDescription[lang]}\n\n<b>🤖 | Рекомендация AI</b>\n<i>Этот текст сгенерирован AI.</i>\n\n${this.escapeHtml(suggestion)}\n\n<i>Можно продолжить с этим вариантом или ввести вручную.</i>`;

        await this.sendPrompt(chatId, session, preview, {
            parseMode: 'HTML',
            replyMarkup: keyboards.aiJobDescriptionPreviewKeyboard(lang)
        });
    }

    private buildAiResumeAboutSuggestion(resumeData: any, lang: BotLang): string {
        const title = String(resumeData?.title || resumeData?.field_title || (lang === 'uz' ? 'mutaxassis' : 'специалист')).trim();
        const experienceKey = String(resumeData?.experience || resumeData?.experience_level || '').trim();
        const experienceLabel = experienceKey && EXPERIENCE_LABELS[experienceKey as keyof typeof EXPERIENCE_LABELS]
            ? EXPERIENCE_LABELS[experienceKey as keyof typeof EXPERIENCE_LABELS][lang]
            : (lang === 'uz' ? "tajriba darajasi ko'rsatilmagan" : 'уровень опыта не указан');
        const skills = Array.isArray(resumeData?.skills) ? resumeData.skills.filter(Boolean).slice(0, 4) : [];

        if (lang === 'uz') {
            const skillsText = skills.length > 0 ? skills.join(', ') : "tez o'rganish va jamoada ishlash";
            return `${title} lavozimida ishlashga tayyorman. ${experienceLabel} tajriba va ${skillsText} ko‘nikmalarim bilan vazifalarni mas'uliyat bilan bajaraman.`;
        }

        const skillsText = skills.length > 0 ? skills.join(', ') : 'быстрая обучаемость и работа в команде';
        return `Рассматриваю позицию «${title}». При уровне опыта «${experienceLabel}» и навыках (${skillsText}) работаю ответственно и на результат.`;
    }

    private normalizeSkillSuggestions(rawItems: string[]): string[] {
        const unique = new Set<string>();
        const result: string[] = [];
        let pending = '';
        for (const raw of rawItems) {
            let cleaned = String(raw || '')
                .replace(/^[-*•\d.)\s]+/, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!cleaned) continue;
            if (pending) {
                cleaned = `${pending} ${cleaned}`.replace(/\s+/g, ' ').trim();
                pending = '';
            }
            const opens = (cleaned.match(/\(/g) || []).length;
            const closes = (cleaned.match(/\)/g) || []).length;
            if (opens > closes) {
                pending = cleaned;
                continue;
            }
            if (closes > opens && result.length > 0) {
                const merged = `${result[result.length - 1]} ${cleaned}`.replace(/\s+/g, ' ').trim();
                result[result.length - 1] = merged;
                continue;
            }
            cleaned = cleaned
                .replace(/^\(\s*/, '')
                .replace(/\s*\)$/, ')')
                .trim();
            if (cleaned.length < 2) continue;
            const key = cleaned.toLowerCase();
            if (unique.has(key)) continue;
            unique.add(key);
            result.push(cleaned);
            if (result.length >= 8) break;
        }
        if (pending) {
            const cleanedPending = pending.replace(/\(\s*$/, '').trim();
            if (cleanedPending.length >= 2 && !unique.has(cleanedPending.toLowerCase()) && result.length < 8) {
                result.push(cleanedPending);
            }
        }
        return result;
    }

    private buildFallbackResumeSkillSuggestions(resumeData: any, lang: BotLang): string[] {
        const titleRaw = String(resumeData?.title || resumeData?.field_title || '').trim();
        const fieldRaw = String(resumeData?.field_title || '').trim();
        const combined = this.normalizeLoose(`${titleRaw} ${fieldRaw}`);
        const languageKeys = Array.isArray(resumeData?.language_keys) ? resumeData.language_keys : [];
        const existingLanguages = this.mapJobLanguageKeysToLabels(languageKeys, lang);
        const existingSkills = Array.isArray(resumeData?.skills)
            ? resumeData.skills.map((item: any) => String(item).trim()).filter(Boolean)
            : [];

        let baseSkills: string[] = [];
        if (combined.includes("oqituvchi") || combined.includes("o qituvchi") || combined.includes('teacher') || combined.includes('murabbiy')) {
            baseSkills = lang === 'uz'
                ? [
                    "Dars rejasini tuzish",
                    "Interfaol o'qitish usullari",
                    "O'quvchilar bilan samarali muloqot",
                    "Natijani monitoring qilish"
                ]
                : [
                    'Планирование занятий',
                    'Интерактивные методы обучения',
                    'Эффективная коммуникация с учениками',
                    'Мониторинг учебных результатов'
                ];
        } else if (combined.includes('operator') || combined.includes('call') || combined.includes('support') || combined.includes('mijoz')) {
            baseSkills = lang === 'uz'
                ? [
                    'Mijozlar bilan muloqot',
                    "Qo'ng'iroqlarni boshqarish",
                    'CRM bilan ishlash',
                    'Muammolarni tez hal qilish'
                ]
                : [
                    'Коммуникация с клиентами',
                    'Обработка звонков',
                    'Работа с CRM',
                    'Быстрое решение проблем'
                ];
        } else if (combined.includes('savdo') || combined.includes('sales') || combined.includes('sotuv') || combined.includes('marketing')) {
            baseSkills = lang === 'uz'
                ? [
                    'Savdo muzokaralari',
                    'Mijozlar bazasi bilan ishlash',
                    'Prezentatsiya ko‘nikmasi',
                    'Reja asosida ishlash'
                ]
                : [
                    'Переговоры по продажам',
                    'Работа с клиентской базой',
                    'Навыки презентации',
                    'Работа по плану'
                ];
        } else if (combined.includes('dastur') || combined.includes('developer') || combined.includes('it') || combined.includes('backend') || combined.includes('frontend')) {
            baseSkills = lang === 'uz'
                ? [
                    'Muammoni tahlil qilish',
                    'API bilan ishlash',
                    'Git va jamoada ishlash',
                    'Texnik hujjatlar bilan ishlash'
                ]
                : [
                    'Анализ задач',
                    'Работа с API',
                    'Git и командная работа',
                    'Работа с технической документацией'
                ];
        } else {
            baseSkills = lang === 'uz'
                ? [
                    'Jamoada ishlash',
                    'Mas’uliyatlilik',
                    'Vaqtni boshqarish',
                    'Muloqot ko‘nikmasi'
                ]
                : [
                    'Командная работа',
                    'Ответственность',
                    'Тайм-менеджмент',
                    'Коммуникационные навыки'
                ];
        }

        const languageSkills = existingLanguages.map((item) => {
            if (lang === 'uz') return `${item}da erkin muloqot`;
            return `Свободное общение на: ${item}`;
        });

        return this.normalizeSkillSuggestions([
            ...existingSkills,
            ...baseSkills,
            ...languageSkills
        ]).slice(0, 6);
    }

    private async generateAiResumeSkillSuggestions(resumeData: any, lang: BotLang): Promise<string[]> {
        const fallback = this.buildFallbackResumeSkillSuggestions(resumeData, lang);
        if (!process.env.DEEPSEEK_API_KEY) {
            return fallback;
        }

        const title = String(resumeData?.title || resumeData?.field_title || '').trim();
        const experience = String(resumeData?.experience || resumeData?.experience_level || '').trim();
        const education = String(resumeData?.education_level || '').trim();
        const languages = Array.isArray(resumeData?.languages)
            ? resumeData.languages.map((x: any) => String(x).trim()).filter(Boolean)
            : this.mapJobLanguageKeysToLabels(Array.isArray(resumeData?.language_keys) ? resumeData.language_keys : [], lang);
        const special = Array.isArray(resumeData?.special) ? resumeData.special.map((x: any) => String(x).trim()).filter(Boolean) : [];

        const prompt = lang === 'uz'
            ? [
                "Siz professional HR mutaxassisisiz.",
                "Faqat o'zbek lotin alifbosida javob bering.",
                "Nomzod ma'lumotiga mos 5-6 ta aniq va amaliy ko'nikma yozing.",
                "Faqat ro'yxat qaytaring: har bir band yangi qatorda, '-' bilan boshlangan bo'lsin.",
                "",
                `Lavozim: ${title || "Ko'rsatilmagan"}`,
                `Tajriba: ${experience || "Ko'rsatilmagan"}`,
                `Ma'lumot: ${education || "Ko'rsatilmagan"}`,
                `Tillar: ${languages.length > 0 ? languages.join(', ') : "Ko'rsatilmagan"}`,
                `Alohida toifalar: ${special.length > 0 ? special.join(', ') : "Ko'rsatilmagan"}`
            ].join('\n')
            : [
                'Вы профессиональный HR-специалист.',
                'Отвечайте только на русском языке.',
                'Дайте 5-6 практичных навыков, подходящих кандидату.',
                'Верните только список: каждый пункт с новой строки и с символом "-".',
                '',
                `Должность: ${title || 'Не указано'}`,
                `Опыт: ${experience || 'Не указано'}`,
                `Образование: ${education || 'Не указано'}`,
                `Языки: ${languages.length > 0 ? languages.join(', ') : 'Не указано'}`,
                `Особые категории: ${special.length > 0 ? special.join(', ') : 'Не указано'}`
            ].join('\n');

        try {
            const response = await callDeepSeekText(prompt, 220, undefined, 0.35);
            const rawText = String(response || '')
                .replace(/\r/g, '\n')
                .replace(/[•]/g, '-');
            const lineParsed = rawText
                .split('\n')
                .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/g, '').trim())
                .filter(Boolean);
            const parsed = lineParsed.length > 1
                ? lineParsed
                : this.parseListInput(rawText.replace(/^\d+\.\s*/gm, ''));
            const normalized = this.normalizeSkillSuggestions(parsed);
            return normalized.length > 0 ? normalized.slice(0, 6) : fallback;
        } catch (error) {
            console.error('DeepSeek resume skills suggestion error:', error);
            return fallback;
        }
    }

    private buildResumeSkillsPrompt(lang: BotLang, suggestions: string[]): string {
        const base = botTexts.askSkills[lang];
        const safeSuggestions = this.normalizeSkillSuggestions(suggestions).slice(0, 3);
        if (!safeSuggestions.length) return base;
        const lines = safeSuggestions.map((item) => `- ${this.escapeHtml(item)}`).join('\n');
        if (lang === 'uz') {
            return `${base}\n\n<b>🤖 | Tavsiya etilgan ko'nikmalar</b>\n<blockquote>${lines}</blockquote>`;
        }
        return `${base}\n\n<b>🤖 | Рекомендованные навыки</b>\n<blockquote>${lines}</blockquote>`;
    }

    private async applyAiSuggestedSkills(chatId: number, session: TelegramSession): Promise<void> {
        const aiSuggestions = this.normalizeSkillSuggestions(
            Array.isArray(session.data?.ai_resume_skill_suggestions)
                ? session.data.ai_resume_skill_suggestions
                : []
        ).slice(0, 3);
        if (!aiSuggestions.length) {
            await this.presentSkillsStep(chatId, session, session.data?.edit_mode ? 'resume_view' : 'resume_languages');
            return;
        }

        const currentSkills = Array.isArray(session.data?.resume?.skills)
            ? [...session.data.resume.skills]
            : [];
        const merged: string[] = [];
        const seen = new Set<string>();
        for (const item of [...currentSkills, ...aiSuggestions]) {
            const value = String(item || '').trim();
            if (!value) continue;
            const key = value.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(value);
        }

        const updatedData = {
            ...session.data,
            resume: {
                ...session.data?.resume,
                skills: merged
            }
        };
        await this.setSession(session, { data: updatedData });
        await this.finishSkills(chatId, { ...session, data: updatedData });
    }

    private async presentSkillsStep(
        chatId: number,
        session: TelegramSession,
        backAction: string = 'resume_languages'
    ): Promise<void> {
        const lang = session.lang;
        const hasSkills = Array.isArray(session.data?.resume?.skills) && session.data.resume.skills.length > 0;

        let suggestions = Array.isArray(session.data?.ai_resume_skill_suggestions)
            ? session.data.ai_resume_skill_suggestions
            : [];
        if (!suggestions.length) {
            const loadingHintId = await this.showLoadingHint(
                chatId,
                session,
                lang === 'uz' ? "🧠 | Ko'nikmalar bo'yicha tavsiyalar tayyorlanmoqda..." : '🧠 | Подготавливаю рекомендации по навыкам...'
            );
            try {
                suggestions = await this.generateAiResumeSkillSuggestions(session.data?.resume || {}, lang);
            } finally {
                await this.clearLoadingHint(chatId, loadingHintId);
            }
        }

        const nextData = {
            ...session.data,
            ai_resume_skill_suggestions: this.normalizeSkillSuggestions(suggestions)
        };
        await this.setSession(session, {
            state: BotState.ADDING_SKILLS,
            data: nextData
        });
        await this.sendPrompt(chatId, session, this.buildResumeSkillsPrompt(lang, nextData.ai_resume_skill_suggestions), {
            parseMode: 'HTML',
            replyMarkup: keyboards.skillsInlineKeyboard(
                lang,
                hasSkills,
                backAction,
                Array.isArray(nextData.ai_resume_skill_suggestions) && nextData.ai_resume_skill_suggestions.length > 0
            )
        });
    }

    private normalizeAiParagraph(rawText: string): string {
        const cleaned = String(rawText || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/\r/g, '\n')
            .replace(/\n{2,}/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned;
    }

    private shortenAiParagraph(rawText: string, maxWords: number = 60): string {
        const cleaned = this.normalizeAiParagraph(rawText);
        if (!cleaned) return '';
        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length <= maxWords) return cleaned;
        const sliced = words.slice(0, maxWords).join(' ').trim();
        const punctIdx = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf('!'), sliced.lastIndexOf('?'));
        if (punctIdx >= Math.floor(sliced.length * 0.45)) {
            return sliced.slice(0, punctIdx + 1).trim();
        }
        const trimmed = sliced.replace(/[,:;\-]+$/g, '').trim();
        return trimmed ? `${trimmed}.` : '';
    }

    private async generateAiResumeAboutSuggestion(resumeData: any, lang: BotLang): Promise<string> {
        const fallback = this.buildAiResumeAboutSuggestion(resumeData, lang);
        if (!process.env.DEEPSEEK_API_KEY) {
            return fallback;
        }

        const title = String(resumeData?.title || resumeData?.field_title || (lang === 'uz' ? 'mutaxassis' : 'специалист')).trim();
        const experience = String(resumeData?.experience || resumeData?.experience_level || '').trim();
        const education = String(resumeData?.education_level || '').trim();
        const skills = Array.isArray(resumeData?.skills) ? resumeData.skills.map((item: any) => String(item).trim()).filter(Boolean).slice(0, 6) : [];
        const special = Array.isArray(resumeData?.special) ? resumeData.special.map((item: any) => String(item).trim()).filter(Boolean) : [];

        const prompt = lang === 'uz'
            ? [
                "Siz professional karyera maslahatchisisiz.",
                "Faqat o'zbek lotin alifbosida yozing, inglizcha va ruscha so'zlarni aralashtirmang.",
                "Matnni birinchi shaxsda (men shaklida) yozing.",
                "\"O'zim haqimda\" bo'limi uchun 2 ta qisqa, tushunarli va professional gap yozing.",
                "Qoidalar:",
                "- Matn sodda va xatosiz bo'lsin.",
                "- Ma'lumotni takrorlamang va keraksiz so'z ishlatmang.",
                "- Faqat bitta qisqa paragraf qaytaring.",
                "",
                `Lavozim: ${title || 'Ko‘rsatilmagan'}`,
                `Tajriba: ${experience || "Ko'rsatilmagan"}`,
                `Ma'lumot: ${education || "Ko'rsatilmagan"}`,
                `Ko'nikmalar: ${skills.length > 0 ? skills.join(', ') : "Ko'rsatilmagan"}`,
                `Alohida toifalar: ${special.length > 0 ? special.join(', ') : "Ko'rsatilmagan"}`
            ].join('\n')
            : [
                'Вы профессиональный карьерный консультант.',
                'Пишите только на русском языке.',
                'Пишите от первого лица.',
                'Сформируйте блок «О себе» в 2 коротких и понятных предложениях.',
                'Правила:',
                '- Текст должен быть простым и без ошибок.',
                '- Без лишней воды и дословного повторения исходных полей.',
                '- Верните один краткий абзац.',
                '',
                `Должность: ${title || 'Не указано'}`,
                `Опыт: ${experience || 'Не указано'}`,
                `Образование: ${education || 'Не указано'}`,
                `Навыки: ${skills.length > 0 ? skills.join(', ') : 'Не указано'}`,
                `Особые категории: ${special.length > 0 ? special.join(', ') : 'Не указано'}`
            ].join('\n');

        try {
            const response = await callDeepSeekText(prompt, 180, undefined, 0.4);
            const normalized = this.shortenAiParagraph(response, 72);
            return normalized || fallback;
        } catch (error) {
            console.error('DeepSeek resume about suggestion error:', error);
            return fallback;
        }
    }

    private async presentResumeAboutStep(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const loadingHintId = await this.showLoadingHint(
            chatId,
            session,
            lang === 'uz' ? "🤖 | AI tavsiya tayyorlanmoqda..." : '🤖 | Подготавливаю AI-рекомендацию...'
        );

        let suggestion = '';
        try {
            suggestion = await this.generateAiResumeAboutSuggestion(session.data?.resume || {}, lang);
        } finally {
            await this.clearLoadingHint(chatId, loadingHintId);
        }

        const nextData = { ...session.data, ai_resume_about_suggestion: suggestion || null };
        await this.setSession(session, { state: BotState.ENTERING_ABOUT, data: nextData });

        const preview = suggestion
            ? (lang === 'uz'
                ? `${botTexts.askAbout[lang]}\n\n<b>🤖 | AI tavsiyasi</b>\n<i>Ushbu matn AI yordamida shakllantirildi.</i>\n\n<blockquote>${this.escapeHtml(suggestion)}</blockquote>`
                : `${botTexts.askAbout[lang]}\n\n<b>🤖 | Рекомендация AI</b>\n<i>Этот текст сформирован с помощью AI.</i>\n\n<blockquote>${this.escapeHtml(suggestion)}</blockquote>`)
            : botTexts.askAbout[lang];

        await this.sendPrompt(chatId, session, preview, {
            parseMode: 'HTML',
            replyMarkup: keyboards.aiResumeAboutPreviewKeyboard(lang, session.data?.edit_mode ? 'resume_view' : 'salary')
        });
    }

    private async handleJobDescriptionAiAction(chatId: number, action: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.POSTING_JOB_DESCRIPTION) return;

        if (action === 'manual') {
            await this.sendPrompt(chatId, session, botTexts.postJobDescription[lang], { replyMarkup: keyboards.jobDescriptionKeyboard(lang) });
            return;
        }

        if (action === 'apply') {
            const suggestion = String(session.data?.ai_job_description_suggestion || this.buildAiJobDescriptionSuggestion(session.data?.temp_job || {}, lang)).trim();
            if (!suggestion) return;
            const updatedJob = { ...session.data?.temp_job, description: suggestion };
            await this.setSession(session, {
                state: BotState.POSTING_JOB_CONFIRM,
                data: { ...session.data, temp_job: updatedJob, ai_job_description_suggestion: null }
            });
            const jobSummary = this.buildJobConfirmText(lang, updatedJob);
            const channelUsername = await this.getRegionChannelUsernameById(updatedJob?.region_id);
            const channelHint = channelUsername ? `\n\n${this.buildJobChannelNotice(lang, channelUsername, 'pending')}` : '';
            await this.sendPrompt(chatId, session, `${jobSummary}${channelHint}`, { replyMarkup: keyboards.jobConfirmKeyboard(lang) });
            return;
        }

        if (action === 'generate' || action === 'retry') {
            await this.presentJobDescriptionStep(chatId, session);
        }
    }

    private async handleResumeAboutAiAction(chatId: number, action: string, session: TelegramSession, messageId?: number): Promise<void> {
        const lang = session.lang;
        if (session.state !== BotState.ENTERING_ABOUT) return;

        if (action === 'manual') {
            await this.sendPrompt(chatId, session, botTexts.askAbout[lang], {
                replyMarkup: keyboards.aiResumeAboutPreviewKeyboard(lang, session.data?.edit_mode ? 'resume_view' : 'salary')
            });
            return;
        }

        if (action === 'apply') {
            const suggestion = String(session.data?.ai_resume_about_suggestion || this.buildAiResumeAboutSuggestion(session.data?.resume || {}, lang)).trim();
            if (!suggestion) return;
            if (session.data?.edit_mode && session.data?.active_resume_id) {
                const updatedResume = { ...session.data?.resume, about: suggestion };
                await this.saveResume(session, updatedResume, session.data.active_resume_id);
                await this.setSession(session, {
                    data: { ...session.data, edit_mode: false, edit_field: null, ai_resume_about_suggestion: null, resume: updatedResume }
                });
                await this.showResumeById(chatId, session.data.active_resume_id, session);
                return;
            }
            const updatedResume = { ...session.data?.resume, about: suggestion };
            const existingLanguageKeys = Array.isArray(updatedResume?.language_keys)
                ? updatedResume.language_keys
                : [];
            const languageKeys = existingLanguageKeys.length > 0
                ? existingLanguageKeys
                : this.getDefaultJobLanguageKeys(lang);
            const updatedData = {
                ...session.data,
                ai_resume_about_suggestion: null,
                resume: {
                    ...updatedResume,
                    language_keys: languageKeys,
                    languages: this.mapJobLanguageKeysToLabels(languageKeys, lang)
                }
            };
            await this.setSession(session, {
                state: BotState.SELECTING_RESUME_LANGUAGES,
                data: updatedData
            });
            await this.sendPrompt(chatId, session, botTexts.resumeLanguagesPrompt[lang], {
                replyMarkup: keyboards.resumeLanguagesKeyboard(lang, languageKeys)
            });
            return;
        }

        if (action === 'generate' || action === 'retry') {
            await this.presentResumeAboutStep(chatId, session);
        }
    }

    private async showMatchingResumesForJob(chatId: number, session: TelegramSession, job: any): Promise<void> {
        const lang = session.lang;
        const jobTitle = job?.field_title || job?.title_uz || job?.title_ru || job?.title || '';
        let targetRegionId: number | null = null;
        let targetDistrictIdRaw: any = null;
        if (job?.employer_id) {
            try {
                const { data: employerLocation } = await this.supabase
                    .from('employer_profiles')
                    .select('region_id, district_id')
                    .eq('id', job.employer_id)
                    .maybeSingle();
                targetRegionId = this.toCoordinate(employerLocation?.region_id ?? null);
                targetDistrictIdRaw = employerLocation?.district_id ?? null;
            } catch {
                // ignore fallback errors
            }
        }
        if (targetRegionId === null) {
            targetRegionId = this.toCoordinate(job?.region_id ?? null);
        }
        if (targetDistrictIdRaw === null || targetDistrictIdRaw === undefined) {
            targetDistrictIdRaw = job?.district_id ?? null;
        }
        const targetDistrictId = targetDistrictIdRaw !== null && targetDistrictIdRaw !== undefined
            ? String(targetDistrictIdRaw)
            : null;

        let selectClause = 'id, user_id, full_name, title, field_id, field_title, region_id, district_id, category_id, category_ids, expected_salary_min, experience, education_level, gender, birth_date';
        let resumes: any[] | null = null;
        let error: any = null;
        let useStatusFilter = true;
        let orderColumn: 'updated_at' | 'created_at' | null = 'updated_at';
        let useRegionFilter = targetRegionId !== null;

        for (let attempt = 0; attempt < 12; attempt += 1) {
            let query = this.supabase
                .from('resumes')
                .select(selectClause);
            if (orderColumn) {
                query = query.order(orderColumn, { ascending: false });
            }
            if (useStatusFilter) {
                query = query.eq('status', 'active');
            }
            if (useRegionFilter && targetRegionId !== null) {
                query = query.eq('region_id', targetRegionId);
            }
            query = query.limit(useRegionFilter ? 500 : 600);
            const primary = await query;
            resumes = primary.data || null;
            error = primary.error || null;
            if (!error) break;
            const missingColumn = this.extractMissingColumn(error);
            if (missingColumn) {
                if (orderColumn && missingColumn === orderColumn) {
                    orderColumn = orderColumn === 'updated_at' ? 'created_at' : null;
                    continue;
                }
                if (missingColumn === 'region_id') {
                    useRegionFilter = false;
                    continue;
                }
                const nextSelect = this.stripColumnFromSelect(selectClause, missingColumn);
                if (nextSelect === selectClause) {
                    break;
                }
                selectClause = nextSelect;
                continue;
            }
            const lowerMsg = String(error.message || '').toLowerCase();
            if (lowerMsg.includes('updated_at')) {
                orderColumn = 'created_at';
                continue;
            }
            if (lowerMsg.includes('created_at')) {
                orderColumn = null;
                continue;
            }
            if (lowerMsg.includes('experience_level')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'experience_level');
                continue;
            }
            if (lowerMsg.includes('education_level')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'education_level');
                continue;
            }
            if (lowerMsg.includes('field_id')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'field_id');
                continue;
            }
            if (lowerMsg.includes('field_title')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'field_title');
                continue;
            }
            if (lowerMsg.includes('experience')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'experience');
                continue;
            }
            if (lowerMsg.includes('category_ids')) {
                selectClause = this.stripColumnFromSelect(selectClause, 'category_ids');
                continue;
            }
            if (lowerMsg.includes('status')) {
                useStatusFilter = false;
                continue;
            }
            if (lowerMsg.includes('region_id')) {
                useRegionFilter = false;
                continue;
            }
            break;
        }

        if (error) {
            console.error('Resume fetch error:', error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        if ((!resumes || resumes.length === 0) && targetRegionId !== null && useRegionFilter) {
            let fallbackQuery = this.supabase
                .from('resumes')
                .select(selectClause)
                .limit(600);
            if (orderColumn) {
                fallbackQuery = fallbackQuery.order(orderColumn, { ascending: false });
            }
            if (useStatusFilter) {
                fallbackQuery = fallbackQuery.eq('status', 'active');
            }
            const fallback = await fallbackQuery;
            if (!fallback.error && Array.isArray(fallback.data)) {
                resumes = fallback.data;
            }
        }

        const baseScored = (resumes || []).map((resume: any) => {
            const base = calculateMatchScore({
                region_id: resume.region_id,
                district_id: resume.district_id,
                category_id: resume.category_id,
                category_ids: resume.category_ids,
                field_id: resume.field_id,
                field_title: resume.field_title,
                expected_salary_min: resume.expected_salary_min,
                experience: resume.experience ?? resume.experience_level ?? null,
                gender: resume.gender,
                birth_date: resume.birth_date,
                education_level: resume.education_level,
                title: resume?.field_title || resume?.title || null
            }, job);
            const titleRel = this.getTitleOverlapScore(jobTitle, resume?.field_title || resume?.title || '');
            const blended = Math.max(1, Math.min(100, Math.round((base.matchScore * 0.8) + (titleRel * 20))));
            return {
                resume,
                score: blended,
                strictScore: base.matchScore,
                aiScore: null as number | null,
                titleRelevance: titleRel,
                matchCriteria: base.matchCriteria,
                conditionallySuitable: Boolean(base.conditionallySuitable),
                conditionalReason: base.conditionalReason || null,
                ageKnown: base.ageKnown !== false
            };
        });

        if (!baseScored.length) {
            await this.sendSeriousSticker(chatId, 'warning');
            await this.sendPrompt(chatId, session, botTexts.noCandidatesForJob[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
            return;
        }

        const processingPool = [...baseScored]
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
            .slice(0, 400);
        const aiInputPool = processingPool.slice(0, 220);

        const aiRanked = await this.applyAiRerankToResumeMatches(job, aiInputPool.map(item => ({
            resume: item.resume,
            score: item.score
        })), lang);
        const aiById = new Map<string, { score: number; strictScore: number; aiScore?: number }>();
        for (const item of aiRanked) {
            const resumeId = String(item?.resume?.id || '');
            if (!resumeId) continue;
            aiById.set(resumeId, {
                score: Number(item.score || 0),
                strictScore: Number(item.strictScore || item.score || 0),
                aiScore: typeof item.aiScore === 'number' ? Number(item.aiScore) : undefined
            });
        }

        const scoredStrict = processingPool
            .map(item => {
                const resumeId = String(item.resume?.id || '');
                const ai = aiById.get(resumeId);
                return {
                    ...item,
                    id: resumeId,
                    score: ai ? ai.score : item.score,
                    strictScore: ai ? ai.strictScore : item.strictScore,
                    aiScore: ai && typeof ai.aiScore === 'number' ? ai.aiScore : item.aiScore
                };
            })
            .filter(item => item.id)
            .filter(item => Number(item.score || 0) >= 35)
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

        const scoredRelaxed = processingPool
            .map(item => {
                const resumeId = String(item.resume?.id || '');
                const ai = aiById.get(resumeId);
                const score = ai ? ai.score : item.score;
                const strictScore = ai ? ai.strictScore : item.strictScore;
                return {
                    ...item,
                    id: resumeId,
                    score,
                    strictScore,
                    aiScore: ai && typeof ai.aiScore === 'number' ? ai.aiScore : item.aiScore
                };
            })
            .filter(item => item.id)
            .filter(item =>
                Number(item.score || 0) >= 22
                || Number(item.strictScore || 0) >= 18
                || Number(item.titleRelevance || 0) >= 0.18
            )
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

        const scored = scoredStrict.length > 0 ? scoredStrict : scoredRelaxed;

        if (!scored.length) {
            await this.sendSeriousSticker(chatId, 'warning');
            await this.sendPrompt(chatId, session, botTexts.noCandidatesForJob[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
            return;
        }

        const districtListRaw = targetDistrictId
            ? scored.filter(item => String(item.resume?.district_id || '') === targetDistrictId)
            : [];
        const regionListRaw = targetRegionId !== null
            ? scored.filter(item => this.toCoordinate(item.resume?.region_id) === targetRegionId)
            : scored;

        const toWorkerItem = (item: any) => ({
            id: String(item.resume?.id || ''),
            full_name: item.resume?.full_name || null,
            title: item.resume?.title || item.resume?.field_title || null,
            user_id: item.resume?.user_id || null,
            district_id: item.resume?.district_id ?? null,
            district_name: item.resume?.district_name || null,
            region_id: item.resume?.region_id ?? null,
            score: Number(item.score || 0),
            strictScore: Number(item.strictScore || item.score || 0),
            aiScore: typeof item.aiScore === 'number' ? Number(item.aiScore) : null,
            matchCriteria: item.matchCriteria || null,
            conditionallySuitable: Boolean(item.conditionallySuitable),
            conditionalReason: item.conditionalReason || null,
            ageKnown: item.ageKnown !== false,
            offer_sent: false
        });

        const districtList = districtListRaw.map(toWorkerItem).filter(item => item.id);
        const regionList = regionListRaw.map(toWorkerItem).filter(item => item.id);
        const districtLabel = targetDistrictId ? await this.getDistrictNameById(targetDistrictId, lang) : null;
        const regionLabel = targetRegionId !== null ? await this.getRegionNameById(targetRegionId, lang) : null;

        if (!districtList.length && !regionList.length) {
            await this.sendSeriousSticker(chatId, 'warning');
            await this.sendPrompt(chatId, session, botTexts.noCandidatesForJob[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
            return;
        }

        if (!districtList.length && regionList.length > 0) {
            const districtHint = await this.buildRegionDistrictHint(regionList, lang);
            await this.setSession(session, {
                state: BotState.EMPLOYER_MAIN_MENU,
                data: {
                    ...session.data,
                    worker_resume_list: [],
                    worker_district_resume_list: [],
                    worker_region_resume_list: regionList.slice(0, 1000),
                    worker_scope: 'district',
                    currentWorkerIndex: 0,
                    worker_job_id: String(job?.id || ''),
                    worker_job_title: jobTitle || (lang === 'uz' ? 'Vakansiya' : 'Вакансия'),
                    worker_target_district_name: districtLabel,
                    worker_target_region_name: regionLabel,
                    related_resume_list: []
                }
            });

            const regionCount = regionList.length;
            const areaLabelUz = districtLabel || (regionLabel || "tanlangan hudud");
            const areaLabelRu = districtLabel || (regionLabel || 'выбранном регионе');
            const notice = lang === 'uz'
                ? `ℹ️ | ${areaLabelUz} hududida mos nomzod topilmadi.\n\n<b>Viloyat bo'yicha ${regionCount} ta mos nomzod topildi.</b>\n<i>Ko'rish uchun “Viloyat bo'yicha qidirish (${regionCount})” tugmasini bosing.</i>${districtHint ? `\n\n${districtHint}` : ''}`
                : `ℹ️ | В зоне «${areaLabelRu}» подходящие кандидаты не найдены.\n\n<b>По области найдено подходящих кандидатов: ${regionCount}</b>.\n<i>Для продолжения нажмите «Поиск по области (${regionCount})».</i>${districtHint ? `\n\n${districtHint}` : ''}`;
            await this.sendSeriousSticker(chatId, 'warning');
            await this.sendPrompt(chatId, session, notice, {
                replyMarkup: keyboards.workerRegionFallbackKeyboard(lang, {
                    showRegionSearch: regionCount > 0,
                    regionCount
                })
            });
            return;
        }

        const primaryList = districtList;
        await this.saveMatchRecommendations(
            'employer_to_resume',
            String(job?.id || ''),
            primaryList.map(item => ({
                targetId: String(item.id || ''),
                score: Number(item.score || 0),
                strictScore: Number(item.strictScore || item.score || 0),
                aiScore: Number(item.aiScore || 0),
                reason: lang === 'uz' ? 'Lavozim va mezonlar mosligi' : 'Совпадение по должности и критериям'
            }))
        );

        await this.setSession(session, {
            state: BotState.EMPLOYER_MAIN_MENU,
            data: {
                ...session.data,
                worker_resume_list: primaryList.slice(0, 1000),
                worker_district_resume_list: districtList.slice(0, 1000),
                worker_region_resume_list: regionList.slice(0, 1000),
                worker_scope: 'district',
                currentWorkerIndex: 0,
                worker_job_id: String(job?.id || ''),
                worker_job_title: jobTitle || (lang === 'uz' ? 'Vakansiya' : 'Вакансия'),
                worker_target_district_name: districtLabel,
                worker_target_region_name: regionLabel,
                related_resume_list: []
            }
        });
        await this.showEmployerResumeMatch(chatId, session, 0);
    }

    private async showEmployerResumeMatch(chatId: number, session: TelegramSession, index: number): Promise<void> {
        const lang = session.lang;
        const list: Array<{
            id: string;
            full_name?: string | null;
            title?: string | null;
            user_id?: string | null;
            district_id?: any;
            district_name?: string | null;
            region_id?: any;
            score?: number | null;
            strictScore?: number | null;
            aiScore?: number | null;
            matchCriteria?: Record<string, any> | null;
            conditionallySuitable?: boolean;
            conditionalReason?: 'education' | 'experience' | 'both' | null;
            ageKnown?: boolean;
            offer_sent?: boolean;
        }> = Array.isArray(session.data?.worker_resume_list) ? session.data.worker_resume_list : [];

        if (!list.length) {
            const scope = String(session.data?.worker_scope || 'district');
            const regionList = Array.isArray(session.data?.worker_region_resume_list) ? session.data.worker_region_resume_list : [];
            if (scope !== 'region' && regionList.length > 0) {
                const districtLabel = String(session.data?.worker_target_district_name || '').trim();
                const regionLabel = String(session.data?.worker_target_region_name || '').trim();
                const areaLabelUz = districtLabel || regionLabel || "tanlangan hudud";
                const areaLabelRu = districtLabel || regionLabel || 'выбранном регионе';
                const districtHint = await this.buildRegionDistrictHint(regionList, lang);
                await this.sendPrompt(
                    chatId,
                    session,
                    lang === 'uz'
                        ? `ℹ️ | ${areaLabelUz} hududida mos nomzod topilmadi.\n\n<b>Viloyat bo'yicha ${regionList.length} ta mos nomzod topildi.</b>\n<i>Ko'rish uchun “Viloyat bo'yicha qidirish (${regionList.length})” tugmasini bosing.</i>${districtHint ? `\n\n${districtHint}` : ''}`
                        : `ℹ️ | В зоне «${areaLabelRu}» подходящие кандидаты не найдены.\n\n<b>По области найдено подходящих кандидатов: ${regionList.length}</b>.\n<i>Для продолжения нажмите «Поиск по области (${regionList.length})».</i>${districtHint ? `\n\n${districtHint}` : ''}`,
                    {
                        replyMarkup: keyboards.workerRegionFallbackKeyboard(lang, {
                            showRegionSearch: true,
                            regionCount: regionList.length
                        })
                    }
                );
                return;
            }
            await this.sendPrompt(chatId, session, botTexts.noCandidatesForJob[lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(lang)
            });
            return;
        }

        let safeIndex = index;
        if (safeIndex < 0) safeIndex = 0;
        if (safeIndex >= list.length) safeIndex = list.length - 1;

        const current = list[safeIndex];
        const resumeId = String(current?.id || '');
        let resume: any = null;
        if (resumeId) {
            const { data } = await this.supabase
                .from('resumes')
                .select('*')
                .eq('id', resumeId)
                .maybeSingle();
            resume = data || null;
        }

        const jobId = String(session.data?.worker_job_id || '');
        let distanceKm: number | null = null;
        if (jobId && current?.user_id) {
            try {
                const [{ data: jobGeo }, { data: seekerGeo }] = await Promise.all([
                    this.supabase
                        .from('jobs')
                        .select('latitude, longitude')
                        .eq('id', jobId)
                        .maybeSingle(),
                    this.supabase
                        .from('job_seeker_profiles')
                        .select('latitude, longitude')
                        .eq('user_id', String(current.user_id))
                        .maybeSingle()
                ]);
                const jobLat = this.toCoordinate(jobGeo?.latitude);
                const jobLon = this.toCoordinate(jobGeo?.longitude);
                const seekerLat = this.toCoordinate(seekerGeo?.latitude);
                const seekerLon = this.toCoordinate(seekerGeo?.longitude);
                if (jobLat !== null && jobLon !== null && seekerLat !== null && seekerLon !== null) {
                    distanceKm = this.haversineKm(jobLat, jobLon, seekerLat, seekerLon);
                }
            } catch {
                distanceKm = null;
            }
        }

        const jobTitle = String(session.data?.worker_job_title || (lang === 'uz' ? 'Vakansiya' : 'Вакансия'));
        const score = Number(current?.score || 0);
        const strictScore = Number(current?.strictScore || score || 0);
        const criteria = current?.matchCriteria || {};
        const labels = {
            location: lang === 'uz' ? 'Joylashuv' : 'Локация',
            profession: lang === 'uz' ? 'Lavozim' : 'Должность',
            category: lang === 'uz' ? 'Soha' : 'Сфера',
            salary: lang === 'uz' ? 'Maosh' : 'Зарплата',
            experience: lang === 'uz' ? 'Tajriba' : 'Опыт',
            education: lang === 'uz' ? "Ma'lumot" : 'Образование',
            age: lang === 'uz' ? 'Yosh' : 'Возраст'
        };
        const matchLines: string[] = [];
        if (criteria.location) matchLines.push(`<i>☑️ ${labels.location}</i>`);
        if (criteria.profession) matchLines.push(`<i>☑️ ${labels.profession}</i>`);
        if (criteria.category) matchLines.push(`<i>☑️ ${labels.category}</i>`);
        if (criteria.salary) matchLines.push(`<i>☑️ ${labels.salary}</i>`);
        if (criteria.experience) matchLines.push(`<i>☑️ ${labels.experience}</i>`);
        if (criteria.education) matchLines.push(`<i>☑️ ${labels.education}</i>`);
        if (criteria.age && current?.ageKnown !== false) matchLines.push(`<i>☑️ ${labels.age}</i>`);
        const distanceLine = distanceKm !== null
            ? `<i>📍 | ${lang === 'uz' ? 'Masofa' : 'Расстояние'}: ${this.formatDistance(distanceKm, lang)}</i>`
            : '';

        const resumeTextRaw = resume
            ? await this.buildResumeText(resume, lang, { hideLocation: true })
            : `${lang === 'uz' ? 'Nomzod' : 'Кандидат'}: ${current?.full_name || '—'}\n${lang === 'uz' ? 'Lavozim' : 'Должность'}: ${current?.title || '—'}`;

        const shownScore = Math.max(score, strictScore);
        const matchBlockParts: string[] = [`<b>🎯 | ${lang === 'uz' ? 'Moslik' : 'Совпадение'}:</b> ${shownScore}%`];
        if (matchLines.length > 0) {
            matchBlockParts.push(matchLines.join('\n'));
        }
        if (
            current?.conditionallySuitable
            && (current?.conditionalReason === 'education' || current?.conditionalReason === 'experience' || current?.conditionalReason === 'both')
        ) {
            matchBlockParts.push(botTexts.conditionalMatchWarning[lang](current.conditionalReason));
        }

        const resultFrom = safeIndex + 1;
        const resultTo = safeIndex + 1;
        const header = [
            `<b>💼 | ${lang === 'uz' ? 'Vakansiya' : 'Вакансия'}:</b> ${this.escapeHtml(jobTitle)}`,
            `<i>${lang === 'uz' ? `Natijalar ${resultFrom}-${resultTo}/${list.length}` : `Результаты ${resultFrom}-${resultTo}/${list.length}`}</i>`
        ].join('\n');

        const resumeBody = distanceLine
            ? `${this.escapeHtml(resumeTextRaw)}\n\n${distanceLine}`
            : this.escapeHtml(resumeTextRaw);
        const text = [
            header,
            '',
            resumeBody,
            '',
            '— — — — — — — — — — — — — — — —',
            `<blockquote>${matchBlockParts.join('\n\n')}</blockquote>`
        ].join('\n');

        const prevWorkerMessageId = session.data?.last_worker_match_message_id;
        const prevPromptMessageId = session.data?.last_prompt_message_id;

        const scope = String(session.data?.worker_scope || 'district');
        const regionList = Array.isArray(session.data?.worker_region_resume_list) ? session.data.worker_region_resume_list : [];
        const showRegionSearch = scope !== 'region' && regionList.length > 0;
        let isOfferSent = Boolean(current?.offer_sent);
        if (!isOfferSent && jobId && resumeId) {
            try {
                const { data: existingOffer } = await this.supabase
                    .from('job_offers')
                    .select('id')
                    .eq('job_id', jobId)
                    .eq('resume_id', resumeId)
                    .in('status', ['sent', 'pending'])
                    .limit(1)
                    .maybeSingle();
                isOfferSent = Boolean(existingOffer?.id);
            } catch {
                isOfferSent = Boolean(current?.offer_sent);
            }
        }

        const sent = await sendMessage(chatId, text, {
            parseMode: 'HTML',
            replyMarkup: keyboards.workerNavigationKeyboard(lang, safeIndex, list.length, {
                showRegionSearch,
                regionCount: regionList.length,
                showInviteAction: Boolean(current?.id),
                inviteStatus: isOfferSent ? 'sent' : 'available'
            })
        });

        if (prevWorkerMessageId && prevWorkerMessageId !== sent?.message_id) {
            try {
                await deleteMessage(chatId, prevWorkerMessageId);
            } catch {
                // ignore
            }
        }
        if (prevPromptMessageId && prevPromptMessageId !== sent?.message_id) {
            try {
                await deleteMessage(chatId, prevPromptMessageId);
            } catch {
                // ignore
            }
        }

        await this.setSession(session, {
            state: BotState.EMPLOYER_MAIN_MENU,
            data: {
                ...session.data,
                currentWorkerIndex: safeIndex,
                last_worker_match_message_id: sent?.message_id || null,
                last_prompt_message_id: null,
                lastPromptMessageId: null
            }
        });
    }

    private async handleWorkerNavigation(chatId: number, direction: string, session: TelegramSession): Promise<void> {
        if (direction === 'region') {
            const regionList: any[] = Array.isArray(session.data?.worker_region_resume_list) ? session.data.worker_region_resume_list : [];
            if (!regionList.length) {
                await this.sendPrompt(chatId, session, session.lang === 'uz' ? "Viloyat bo'yicha ishchi topilmadi." : 'По области кандидаты не найдены.', {
                    replyMarkup: keyboards.employerMainMenuKeyboard(session.lang)
                });
                return;
            }
            await this.setSession(session, {
                data: {
                    ...session.data,
                    worker_resume_list: regionList,
                    worker_scope: 'region',
                    currentWorkerIndex: 0
                }
            });
            await this.showEmployerResumeMatch(chatId, session, 0);
            return;
        }

        const list: any[] = Array.isArray(session.data?.worker_resume_list) ? session.data.worker_resume_list : [];
        if (!list.length) {
            await this.sendPrompt(chatId, session, botTexts.noResumesByProfession[session.lang], {
                replyMarkup: keyboards.employerMainMenuKeyboard(session.lang)
            });
            return;
        }

        const index = Number(session.data?.currentWorkerIndex || 0);
        let newIndex = index;
        if (direction === 'first') newIndex = 0;
        if (direction === 'next') newIndex += 1;
        if (direction === 'prev') newIndex -= 1;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= list.length) newIndex = list.length - 1;

        await this.showEmployerResumeMatch(chatId, session, newIndex);
    }

    private async getUserTelegramMeta(userId: string | null | undefined): Promise<{ telegramId: number | null; lang: BotLang }> {
        if (!userId) return { telegramId: null, lang: 'uz' };

        let telegramId: number | null = null;
        try {
            const { data } = await this.supabase
                .from('users')
                .select('telegram_user_id')
                .eq('id', userId)
                .maybeSingle();
            const raw = data?.telegram_user_id;
            const num = raw === null || raw === undefined ? NaN : Number(raw);
            telegramId = Number.isFinite(num) ? num : null;
        } catch {
            telegramId = null;
        }

        let lang: BotLang = 'uz';
        try {
            const latest = await this.supabase
                .from('telegram_sessions')
                .select('lang, updated_at')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            const rawLang = String(latest.data?.lang || '').trim().toLowerCase();
            if (rawLang === 'ru' || rawLang === 'uz') {
                lang = rawLang as BotLang;
            }
        } catch {
            try {
                const fallback = await this.supabase
                    .from('telegram_sessions')
                    .select('lang')
                    .eq('user_id', userId)
                    .limit(1)
                    .maybeSingle();
                const rawLang = String(fallback.data?.lang || '').trim().toLowerCase();
                if (rawLang === 'ru' || rawLang === 'uz') {
                    lang = rawLang as BotLang;
                }
            } catch {
                // ignore
            }
        }

        return { telegramId, lang };
    }

    private async showSeekerOffers(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        let offers: any[] | null = null;
        let offersError: any = null;
        const joined = await this.supabase
            .from('job_offers')
            .select('id, job_id, status, seen_at, created_at, jobs(id, title_uz, title_ru, title, company_name)')
            .eq('seeker_user_id', session.user_id)
            .order('created_at', { ascending: false })
            .limit(40);
        offers = joined.data || null;
        offersError = joined.error || null;

        if (offersError) {
            const fallback = await this.supabase
                .from('job_offers')
                .select('id, job_id, status, seen_at, created_at')
                .eq('seeker_user_id', session.user_id)
                .order('created_at', { ascending: false })
                .limit(40);
            offers = fallback.data || null;
            offersError = fallback.error || null;
        }

        if (offersError) {
            console.error('Offers fetch error:', offersError);
            await this.sendPrompt(chatId, session, botTexts.noOffers[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        if (!offers || offers.length === 0) {
            await this.sendPrompt(chatId, session, botTexts.noOffers[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const needJobs = offers.some((item: any) => !item?.jobs && item?.job_id);
        let jobsById = new Map<string, any>();
        if (needJobs) {
            const jobIds = Array.from(new Set(offers.map((item: any) => String(item?.job_id || '')).filter(Boolean)));
            if (jobIds.length > 0) {
                const { data: jobs } = await this.supabase
                    .from('jobs')
                    .select('id, title_uz, title_ru, title, company_name')
                    .in('id', jobIds);
                jobsById = new Map((jobs || []).map((job: any) => [String(job.id), job]));
            }
        }

        const list = offers.map((offer: any) => {
            const job = offer?.jobs || jobsById.get(String(offer?.job_id || '')) || null;
            const title = lang === 'uz'
                ? (job?.title_uz || job?.title_ru || job?.title || 'Vakansiya')
                : (job?.title_ru || job?.title_uz || job?.title || 'Вакансия');
            return {
                id: String(offer?.id || ''),
                title,
                company: job?.company_name || (lang === 'uz' ? 'Tashkilot' : 'Компания'),
                isUnread: !offer?.seen_at
            };
        }).filter((offer: any) => offer.id);

        await this.setSession(session, {
            data: { ...session.data, seeker_offers_list: list }
        });

        await this.sendPrompt(chatId, session, `${botTexts.offersTitle[lang]}\n\n${lang === 'uz' ? `Jami: ${list.length}` : `Всего: ${list.length}`}`, {
            replyMarkup: keyboards.seekerOffersKeyboard(lang, list)
        });
    }

    private async showSeekerOfferDetail(chatId: number, offerId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        if (!session.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        let offer: any = null;
        let error: any = null;
        const joined = await this.supabase
            .from('job_offers')
            .select('id, job_id, status, message, created_at, seen_at, jobs(*)')
            .eq('id', offerId)
            .eq('seeker_user_id', session.user_id)
            .maybeSingle();
        offer = joined.data || null;
        error = joined.error || null;

        if (error || !offer) {
            const fallback = await this.supabase
                .from('job_offers')
                .select('id, job_id, status, message, created_at, seen_at')
                .eq('id', offerId)
                .eq('seeker_user_id', session.user_id)
                .maybeSingle();
            offer = fallback.data || null;
            error = fallback.error || null;
        }

        if (error || !offer) {
            await this.sendPrompt(chatId, session, botTexts.noOffers[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        if (!offer.seen_at) {
            try {
                await this.supabase
                    .from('job_offers')
                    .update({ seen_at: new Date().toISOString() })
                    .eq('id', offerId);
            } catch {
                // ignore
            }
        }

        let job: any = offer?.jobs || null;
        const jobId = String(offer?.job_id || '').trim();
        if (jobId) {
            const { data: fullJob } = await this.supabase
                .from('jobs')
                .select('*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)')
                .eq('id', jobId)
                .maybeSingle();
            if (fullJob) {
                job = fullJob;
            } else if (!job) {
                const { data: jobRow } = await this.supabase
                    .from('jobs')
                    .select('id, title_uz, title_ru, title, company_name, contact_phone, phone, hr_name')
                    .eq('id', jobId)
                    .maybeSingle();
                job = jobRow || null;
            }
        }

        const company = this.escapeHtml(String(job?.company_name || (lang === 'uz' ? 'Tashkilot' : 'Компания')));
        const title = this.escapeHtml(String(
            lang === 'uz'
                ? (job?.title_uz || job?.title_ru || job?.title || 'Vakansiya')
                : (job?.title_ru || job?.title_uz || job?.title || 'Вакансия')
        ));
        const createdAt = offer?.created_at ? new Date(offer.created_at).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU') : null;

        const lines: string[] = [botTexts.offerReceivedSeeker[lang](company, title)];
        if (createdAt) {
            lines.push(`\n🕒 | ${lang === 'uz' ? 'Yuborilgan sana' : 'Дата отправки'}: ${this.escapeHtml(createdAt)}`);
        }
        if (job) {
            const normalized = this.normalizeJob(job, lang);
            lines.push('');
            lines.push(formatFullJobCard(normalized, lang));
            lines.push('');
            lines.push(`<i>${lang === 'uz' ? "Siz ishga taklif qilingansiz, bog'lanish uchun vakansiyadagi telefon raqamidan foydalaning." : 'Вы приглашены на эту вакансию. Для связи используйте номер телефона из вакансии.'}</i>`);
        }

        await this.sendPrompt(chatId, session, lines.join('\n'), {
            parseMode: 'HTML',
            replyMarkup: keyboards.seekerOfferViewKeyboard(lang, offerId, null)
        });
    }

    private async handleOfferAction(chatId: number, action: string, extra: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;

        if (action === 'list') {
            await this.showSeekerOffers(chatId, session);
            return;
        }

        if (action === 'view') {
            const offerId = String(extra || '').trim();
            if (!offerId) {
                await this.showSeekerOffers(chatId, session);
                return;
            }
            await this.showSeekerOfferDetail(chatId, offerId, session);
            return;
        }

        if (action === 'back_candidates') {
            const list: any[] = Array.isArray(session.data?.worker_resume_list) ? session.data.worker_resume_list : [];
            if (!list.length) {
                await this.showMainMenu(chatId, session);
                return;
            }
            const idx = Number(session.data?.currentWorkerIndex || 0);
            await this.showEmployerResumeMatch(chatId, session, idx);
            return;
        }

        if (action === 'confirm') {
            const list: any[] = Array.isArray(session.data?.worker_resume_list) ? session.data.worker_resume_list : [];
            const idx = Number(session.data?.currentWorkerIndex || 0);
            const current = list[idx] || null;
            const candidateName = String(current?.full_name || '').trim() || (lang === 'uz' ? "Ismi ko‘rsatilmagan" : 'Имя не указано');
            const jobTitle = session.data?.worker_job_title || (lang === 'uz' ? 'Vakansiya' : 'Вакансия');
            await this.sendPrompt(chatId, session, botTexts.offerConfirmPrompt[lang](
                this.escapeHtml(String(candidateName)),
                this.escapeHtml(String(jobTitle))
            ), {
                parseMode: 'HTML',
                replyMarkup: keyboards.offerConfirmKeyboard(lang)
            });
            return;
        }

        if (action === 'send') {
            await this.sendJobOfferToCurrentCandidate(chatId, session);
            return;
        }

        if (action === 'cancel') {
            const index = Number(session.data?.currentWorkerIndex || 0);
            await this.showEmployerResumeMatch(chatId, session, index);
            return;
        }

        await this.showMainMenu(chatId, session);
    }

    private async handleOfferJobView(chatId: number, jobId: string, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const { data: jobRaw, error } = await this.supabase
            .from('jobs')
            .select('*, regions(name_uz, name_ru), districts(name_uz, name_ru), categories(name_uz, name_ru), employer_profiles(company_name)')
            .eq('id', jobId)
            .maybeSingle();

        if (error || !jobRaw) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.mainMenuKeyboard(lang, 'seeker') });
            return;
        }

        const job = this.normalizeJob(jobRaw, lang);
        const card = `${formatFullJobCard(job, lang)}\n\n<i>${lang === 'uz' ? "Siz ushbu vakansiyaga taklif qilingansiz. Bog'lanish uchun telefon raqamidan foydalanishingiz mumkin." : 'Вы приглашены на эту вакансию. Для связи используйте контактный номер.'}</i>`;
        await this.sendPrompt(chatId, session, card, {
            parseMode: 'HTML',
            replyMarkup: keyboards.offerJobFromNotificationKeyboard(lang)
        });
    }

    private async sendJobOfferToCurrentCandidate(chatId: number, session: TelegramSession): Promise<void> {
        const lang = session.lang;
        const list: any[] = Array.isArray(session.data?.worker_resume_list) ? session.data.worker_resume_list : [];
        const idx = Number(session.data?.currentWorkerIndex || 0);
        const current = list[idx] || null;
        const resumeId = String(current?.id || '');
        const jobId = String(session.data?.worker_job_id || '');

        if (!resumeId || !jobId || !session.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const { data: resume } = await this.supabase
            .from('resumes')
            .select('id, user_id, full_name')
            .eq('id', resumeId)
            .maybeSingle();
        if (!resume?.id || !resume?.user_id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        const { data: job } = await this.supabase
            .from('jobs')
            .select('id, title_uz, title_ru, title, company_name, contact_phone, phone, hr_name')
            .eq('id', jobId)
            .maybeSingle();
        if (!job?.id) {
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        try {
            const existing = await this.supabase
                .from('job_offers')
                .select('id')
                .eq('job_id', jobId)
                .eq('resume_id', resumeId)
                .in('status', ['sent', 'pending'])
                .limit(1)
                .maybeSingle();
            if (existing.data?.id) {
                const markSent = (rows: any[]) => (rows || []).map((item: any) => {
                    if (String(item?.id || '') !== resumeId) return item;
                    return { ...item, offer_sent: true };
                });
                const updatedList = markSent(list);
                const updatedDistrictList = markSent(Array.isArray(session.data?.worker_district_resume_list) ? session.data.worker_district_resume_list : []);
                const updatedRegionList = markSent(Array.isArray(session.data?.worker_region_resume_list) ? session.data.worker_region_resume_list : []);
                await this.setSession(session, {
                    data: {
                        ...session.data,
                        worker_resume_list: updatedList,
                        worker_district_resume_list: updatedDistrictList,
                        worker_region_resume_list: updatedRegionList,
                        currentWorkerIndex: idx
                    }
                });
                await this.sendPrompt(chatId, session, botTexts.offerAlreadySent[lang], {
                    replyMarkup: keyboards.offerSentResultKeyboard(lang, updatedList.length > 0)
                });
                return;
            }
        } catch {
            // ignore duplicate check errors
        }

        const insertResult = await this.supabase
            .from('job_offers')
            .insert({
                job_id: jobId,
                resume_id: resumeId,
                employer_user_id: session.user_id,
                seeker_user_id: resume.user_id,
                status: 'sent',
                created_at: new Date().toISOString()
            })
            .select('id')
            .maybeSingle();

        if (insertResult.error || !insertResult.data?.id) {
            console.error('Offer insert error:', insertResult.error);
            await this.sendPrompt(chatId, session, botTexts.error[lang], { replyMarkup: keyboards.employerMainMenuKeyboard(lang) });
            return;
        }

        await this.notifySeekerAboutOffer(resume.user_id, insertResult.data.id, job);

        const markSent = (rows: any[]) => (rows || []).map((item: any) => {
            if (String(item?.id || '') !== resumeId) return item;
            return { ...item, offer_sent: true };
        });
        const updatedList = markSent(list);
        const updatedDistrictList = markSent(Array.isArray(session.data?.worker_district_resume_list) ? session.data.worker_district_resume_list : []);
        const updatedRegionList = markSent(Array.isArray(session.data?.worker_region_resume_list) ? session.data.worker_region_resume_list : []);

        const lastWorkerMessageId = session.data?.last_worker_match_message_id;
        if (lastWorkerMessageId) {
            try {
                await deleteMessage(chatId, lastWorkerMessageId);
            } catch {
                // ignore
            }
        }

        await this.setSession(session, {
            data: {
                ...session.data,
                worker_resume_list: updatedList,
                worker_district_resume_list: updatedDistrictList,
                worker_region_resume_list: updatedRegionList,
                currentWorkerIndex: idx,
                last_worker_match_message_id: null
            }
        });

        await this.sendPrompt(chatId, session, botTexts.offerSentEmployer[lang], {
            replyMarkup: keyboards.offerSentResultKeyboard(lang, updatedList.length > 0)
        });
    }

    private async notifySeekerAboutOffer(seekerUserId: string, offerId: string, job: any): Promise<void> {
        const meta = await this.getUserTelegramMeta(seekerUserId);
        if (!meta.telegramId) return;

        const lang = meta.lang;
        const company = this.escapeHtml(String(job?.company_name || (lang === 'uz' ? 'Tashkilot' : 'Компания')));
        const title = this.escapeHtml(String(
            lang === 'uz'
                ? (job?.title_uz || job?.title_ru || job?.title || 'Vakansiya')
                : (job?.title_ru || job?.title_uz || job?.title || 'Вакансия')
        ));

        try {
            await sendMessage(meta.telegramId, botTexts.offerReceivedSeeker[lang](company, title), {
                parseMode: 'HTML',
                replyMarkup: keyboards.seekerOfferNotificationKeyboard(lang, offerId, String(job?.id || ''))
            });
        } catch (err) {
            console.error('Offer notify seeker error:', err);
        }
    }

    private async notifyEmployerAboutApplication(applicationId: string, jobId: string, applicantName: string): Promise<void> {
        try {
            const { data: job } = await this.supabase
                .from('jobs')
                .select('id, title_uz, title_ru, title, employer_id, created_by, user_id, employer_profiles(user_id)')
                .eq('id', jobId)
                .maybeSingle();
            if (!job?.id) return;

            const employerProfilesRaw = job?.employer_profiles;
            const employerProfile = Array.isArray(employerProfilesRaw) ? employerProfilesRaw[0] : employerProfilesRaw;
            const employerUserId = employerProfile?.user_id || job?.created_by || job?.user_id || null;
            if (!employerUserId) return;

            const meta = await this.getUserTelegramMeta(String(employerUserId));
            if (!meta.telegramId) return;
            const lang = meta.lang;
            const jobTitle = this.escapeHtml(String(
                lang === 'uz'
                    ? (job?.title_uz || job?.title_ru || job?.title || 'Vakansiya')
                    : (job?.title_ru || job?.title_uz || job?.title || 'Вакансия')
            ));
            const fullName = this.escapeHtml(String(applicantName || (lang === 'uz' ? 'Nomzod' : 'Кандидат')));
            await sendMessage(meta.telegramId, botTexts.applicationAlertEmployer[lang](fullName, jobTitle), {
                parseMode: 'HTML',
                replyMarkup: keyboards.applicationAlertKeyboard(lang, applicationId)
            });
        } catch (err) {
            console.error('Application notify employer error:', err);
        }
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

        const job = { ...(jobList[safeIndex] as any) };
        const jobId = job.id || 'unknown';

        if (!String(job?.region_name || '').trim() && job?.region_id !== null && job?.region_id !== undefined) {
            const resolvedRegion = await this.getRegionNameById(job.region_id, lang);
            if (resolvedRegion) job.region_name = resolvedRegion;
        }
        if (!String(job?.district_name || '').trim() && job?.district_id !== null && job?.district_id !== undefined) {
            const resolvedDistrict = await this.getDistrictNameById(job.district_id, lang);
            if (resolvedDistrict) job.district_name = resolvedDistrict;
        }

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

            if (criteria.location && hasLocationReq) lines.push(`<i>☑️ ${labels.location}</i>`);
            if (criteria.category && hasCategoryReq) lines.push(`<i>☑️ ${labels.category}</i>`);
            if (criteria.salary && hasSalary) lines.push(`<i>☑️ ${labels.salary}</i>`);
            if (criteria.experience && hasExpReq) lines.push(`<i>☑️ ${labels.experience}</i>`);
            if (criteria.education && hasEduReq) lines.push(`<i>☑️ ${labels.education}</i>`);
            if (criteria.age && hasAgeReq && job.ageKnown !== false) lines.push(`<i>☑️ ${labels.age}</i>`);
            const parts: string[] = [botTexts.matchScore[lang](job.matchScore)];
            if (lines.length > 0) {
                parts.push(lines.join('\n'));
            }
            if (job.conditionallySuitable && (job.conditionalReason === 'education' || job.conditionalReason === 'experience' || job.conditionalReason === 'both')) {
                parts.push(botTexts.conditionalMatchWarning[lang](job.conditionalReason));
            }
            matchBlock = `<blockquote>${parts.join('\n\n')}</blockquote>`;
        }

        const jobLatitude = this.toCoordinate(job.latitude);
        const jobLongitude = this.toCoordinate(job.longitude);
        let text = matchBlock ? `${formatFullJobCard(job, lang)}\n\n${matchBlock}` : formatFullJobCard(job, lang);
        if (jobLatitude !== null && jobLongitude !== null) {
            text = text.replace(/\n📌 \| (Ish joy manzili|Адрес): .*/g, '');
        }
        if (session.user_id) {
            const seekerGeo = await this.getSeekerGeo(session.user_id);
            if (seekerGeo) {
                const distanceKm = this.getDistanceToJob(job, seekerGeo.latitude, seekerGeo.longitude, { allowRegionFallback: false });
                if (distanceKm !== null) {
                    text += `\n\n<i>📏 | ${lang === 'uz' ? 'Masofa' : 'Расстояние'}: ${this.formatDistance(distanceKm, lang)}</i>`;
                }
            }
        }
        const workModeRaw = String(
            job?.work_mode
            || job?.work_format
            || job?.raw_source_json?.work_mode
            || job?.raw_source_json?.work_format
            || ''
        ).toLowerCase();
        const isRemoteMode =
            workModeRaw.includes('remote')
            || workModeRaw.includes('masofaviy')
            || workModeRaw.includes('удален')
            || workModeRaw.includes('удалён');
        if (isRemoteMode) {
            text += lang === 'uz'
                ? `\n\n<i>🧭 | Ish usuli: Masofaviy — bu vakansiya sizga ham mos bo‘lishi mumkin.</i>`
                : '\n\n<i>🧭 | Формат: удалённый — эта вакансия может вам подойти.</i>';
        }

        const isFavorite = session.user_id
            ? !!(await this.supabase
                .from('favorites')
                .select('id')
                .eq('user_id', session.user_id)
                .eq('job_id', jobId)
                .maybeSingle()).data
            : false;

        const prevPromptId = session.data?.last_prompt_message_id;
        const prevJobMessageId = session.data?.last_job_message_id;

        // Count region vacancies for "search by region" button (only matching vacancies)
        let regionVacancyCount = 0;
        const regionId = this.toCoordinate(job.region_id ?? session.data?.search_region_id);
        if (regionId !== null) {
            try {
                const matchedJobs = await this.getRegionMatchedJobsForResume(session, lang, regionId);
                regionVacancyCount = matchedJobs.length;
            } catch {
                // ignore errors
            }
        }

        const sent = await sendMessage(chatId, text, {
            parseMode: 'HTML',
            replyMarkup: keyboards.jobNavigationKeyboard(lang, safeIndex, jobList.length, jobId, session.data?.job_source, isFavorite, regionVacancyCount)
        });

        if (prevPromptId && prevPromptId !== sent?.message_id) {
            try {
                await deleteMessage(chatId, prevPromptId);
            } catch {
                // ignore
            }
        }
        if (prevJobMessageId && prevJobMessageId !== sent?.message_id) {
            try {
                await deleteMessage(chatId, prevJobMessageId);
            } catch {
                // ignore
            }
        }

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
            lastPromptMessageId: null,
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
        const rawId = districtId === null || districtId === undefined ? '' : String(districtId).trim();
        if (!rawId) return null;

        let row: any = null;
        try {
            const direct = await this.supabase
                .from('districts')
                .select('name_uz, name_ru')
                .eq('id', rawId)
                .maybeSingle();
            if (!direct.error && direct.data) {
                row = direct.data;
            }
        } catch {
            // ignore
        }

        if (!row) {
            const idNum = this.toCoordinate(rawId);
            if (idNum !== null) {
                const fallback = await this.supabase
                    .from('districts')
                    .select('name_uz, name_ru')
                    .eq('id', idNum)
                    .maybeSingle();
                if (!fallback.error && fallback.data) {
                    row = fallback.data;
                }
            }
        }

        if (!row) return null;
        return lang === 'uz' ? row.name_uz : row.name_ru;
    }

    private async buildRegionDistrictHint(
        candidates: Array<{ district_id?: any; district_name?: string | null }>,
        lang: BotLang,
        limit: number = 5
    ): Promise<string | null> {
        const grouped = new Map<string, { districtId: any; districtName: string | null; count: number }>();
        for (const candidate of candidates || []) {
            const districtId = candidate?.district_id ?? null;
            const districtNameRaw = String(candidate?.district_name || '').trim();
            const key = districtId !== null && districtId !== undefined
                ? `id:${String(districtId)}`
                : (districtNameRaw ? `name:${districtNameRaw.toLowerCase()}` : '');
            if (!key) continue;
            const current = grouped.get(key);
            if (current) {
                current.count += 1;
                if (!current.districtName && districtNameRaw) current.districtName = districtNameRaw;
                continue;
            }
            grouped.set(key, {
                districtId,
                districtName: districtNameRaw || null,
                count: 1
            });
        }

        if (!grouped.size) return null;

        const groupedValues = Array.from(grouped.values());
        for (const entry of groupedValues) {
            if (!entry.districtName && entry.districtId !== null && entry.districtId !== undefined) {
                entry.districtName = await this.getDistrictNameById(entry.districtId, lang);
            }
        }

        const ranked = groupedValues
            .filter(entry => Boolean(entry.districtName))
            .sort((a, b) => b.count - a.count)
            .slice(0, Math.max(1, limit));

        if (!ranked.length) return null;

        const labels = ranked
            .map(entry => `• ${this.escapeHtml(entry.districtName || '')} (${entry.count})`)
            .join('\n');

        return lang === 'uz'
            ? `<i>Viloyat bo'yicha mos nomzodlar topilgan hududlar:</i>\n${labels}`
            : `<i>Подходящие районы/города по области:</i>\n${labels}`;
    }

    private async handleJobNavigation(chatId: number, direction: string, session: TelegramSession, messageId?: number): Promise<void> {
        const list: any[] = Array.isArray(session.data?.job_list) ? session.data.job_list : [];
        if (!list.length) {
            await this.showMainMenu(chatId, session);
            return;
        }
        const index = session.data?.currentJobIndex || 0;
        let newIndex = index;
        if (direction === 'first') newIndex = 0;
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
            await this.sendPrompt(chatId, session, botTexts.applicationExists[lang]);
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
            await this.sendPrompt(chatId, session, botTexts.error[lang]);
            return;
        }

        let insertedApplicationId: string | null = null;
        let insertError: any = null;
        try {
            const insertWithId = await this.supabase
                .from('job_applications')
                .insert(payload)
                .select('id')
                .maybeSingle();
            insertError = insertWithId.error || null;
            insertedApplicationId = insertWithId.data?.id ? String(insertWithId.data.id) : null;
        } catch (err) {
            insertError = err;
        }

        if (insertError) {
            const fallbackInsert = await this.supabase.from('job_applications').insert(payload);
            if (fallbackInsert.error) {
                console.error('Apply error:', fallbackInsert.error);
                await this.sendPrompt(chatId, session, botTexts.error[lang]);
                return;
            }
            try {
                const latest = await this.supabase
                    .from('job_applications')
                    .select('id')
                    .eq('job_id', jobId)
                    .eq('resume_id', resumeRecord.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                insertedApplicationId = latest.data?.id ? String(latest.data.id) : null;
            } catch {
                insertedApplicationId = null;
            }
        }

        if (insertedApplicationId) {
            await this.notifyEmployerAboutApplication(insertedApplicationId, jobId, resumeRecord.full_name || 'Nomzod');
        }

        await this.sendPrompt(chatId, session, botTexts.applicationSent[lang], { replyMarkup: keyboards.removeKeyboard() });
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
