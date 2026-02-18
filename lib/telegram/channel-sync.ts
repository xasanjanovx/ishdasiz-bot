import { createHash } from 'crypto';

export type SyncEntityType = 'job' | 'resume';

export const REGION_CHANNEL_BY_SLUG: Record<string, string> = {
  'toshkent-shahri': '@ishdasiz_toshkent',
  'toshkent-shahar': '@ishdasiz_toshkent',
  'toshkent-viloyati': '@ishdasiz_toshkent_vil',
  'samarqand-viloyati': '@ishdasiz_samarqand',
  'navoiy-viloyati': '@ishdasiz_navoiy',
  'qoraqalpogiston-respublikasi': '@ishdasiz_qoraqalpogiston',
  'qashqadaryo-viloyati': '@ishdasiz_qashqadaryo',
  'surxondaryo-viloyati': '@ishdasiz_surxondaryo',
  'fargona-viloyati': '@ishdasiz_fargona',
  'namangan-viloyati': '@ishdasiz_namangan',
  'sirdaryo-viloyati': '@ishdasiz_sirdaryo',
  'jizzax-viloyati': '@ishdasiz_jizzax',
  'buxoro-viloyati': '@ishdasiz_buxoro',
  'xorazm-viloyati': '@ishdasiz_xorazm',
  'andijon-viloyati': '@ishdasiz_andijon'
};

export const REGION_HASHTAG_BY_SLUG: Record<string, string> = {
  'toshkent-shahri': 'TOSHKENT',
  'toshkent-shahar': 'TOSHKENT',
  'toshkent-viloyati': 'TOSHKENT_VILOYATI',
  'samarqand-viloyati': 'SAMARQAND',
  'navoiy-viloyati': 'NAVOIY',
  'qoraqalpogiston-respublikasi': 'QORAQALPOGISTON',
  'qashqadaryo-viloyati': 'QASHQADARYO',
  'surxondaryo-viloyati': 'SURXONDARYO',
  'fargona-viloyati': 'FARGONA',
  'namangan-viloyati': 'NAMANGAN',
  'sirdaryo-viloyati': 'SIRDARYO',
  'jizzax-viloyati': 'JIZZAX',
  'buxoro-viloyati': 'BUXORO',
  'xorazm-viloyati': 'XORAZM',
  'andijon-viloyati': 'ANDIJON'
};

const EXPERIENCE_LABELS_UZ: Record<string, string> = {
  no_experience: 'Tajribasiz',
  '1_year': '1 yil',
  '3_years': '1-3 yil',
  '5_years': '3-5 yil',
  '10_years': '5+ yil',
  '1_3_years': '1-3 yil',
  '3_5_years': '3-5 yil',
  '5_plus': '5+ yil',
  '1': 'Tajribasiz',
  '2': '1 yil',
  '3': '1-3 yil',
  '4': '3-5 yil',
  '5': '5+ yil'
};

const EDUCATION_LABELS_UZ: Record<string, string> = {
  any: "Ahamiyatsiz",
  secondary: "O'rta",
  vocational: "O'rta maxsus",
  higher: 'Oliy',
  master: 'Magistratura'
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compactText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatSalaryUz(min: number | null | undefined, max: number | null | undefined): string {
  const minVal = Number.isFinite(Number(min)) ? Number(min) : 0;
  const maxVal = Number.isFinite(Number(max)) ? Number(max) : 0;
  const fmt = (v: number) => v.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (minVal <= 0 && maxVal <= 0) return 'Kelishiladi';
  if (minVal > 0 && maxVal <= 0) return `${fmt(minVal)} so'm`;
  if (minVal <= 0 && maxVal > 0) return `${fmt(maxVal)} so'm gacha`;
  if (minVal === maxVal) return `${fmt(minVal)} so'm`;
  return `${fmt(minVal)} - ${fmt(maxVal)} so'm`;
}

function asList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => compactText(v)).filter(Boolean);
  const raw = compactText(value);
  if (!raw) return [];
  return raw.split(',').map((item) => compactText(item)).filter(Boolean);
}

function toDistrictHashtag(value: string | null | undefined): string | null {
  const raw = compactText(value);
  if (!raw) return null;
  const cleaned = raw
    .replace(/[ʻʼ’‘`´']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(' ').filter(Boolean);
  if (!tokens.length) return null;
  const normalized = tokens.map((token, idx) => {
    const lower = token.toLowerCase();
    if (idx === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
    return lower;
  }).join('_');
  return normalized.slice(0, 64);
}

function buildTags(kind: 'job' | 'resume', regionSlug: string | null | undefined, districtName: string | null | undefined): string {
  const base = kind === 'job' ? '#vakansiya' : '#rezyume';
  const regionTag = regionSlug ? REGION_HASHTAG_BY_SLUG[String(regionSlug).toLowerCase()] : null;
  const districtTag = toDistrictHashtag(districtName);
  const tags = [
    base,
    regionTag ? `#${regionTag}` : null,
    districtTag ? `#${districtTag}` : null
  ].filter(Boolean);
  return tags.join(' ');
}

export function getChannelByRegionSlug(regionSlug: string | null | undefined): string | null {
  if (!regionSlug) return null;
  const normalized = compactText(regionSlug).toLowerCase();
  return REGION_CHANNEL_BY_SLUG[normalized] || null;
}

export function buildJobChannelMessage(job: any, regionSlug?: string | null): string {
  const title = compactText(job?.title_uz || job?.title_ru || job?.title || job?.field_title || 'Vakansiya');
  const company = compactText(job?.company_name || 'Tashkilot');
  const regionName = compactText(job?.region_name || job?.districts?.regions?.name_uz || '');
  const districtName = compactText(job?.district_name || job?.districts?.name_uz || '');
  const location = [regionName, districtName].filter(Boolean).join(', ');
  const salary = formatSalaryUz(job?.salary_min, job?.salary_max);
  const experience = EXPERIENCE_LABELS_UZ[String(job?.experience || '').trim()] || compactText(job?.experience) || "Ko'rsatilmagan";
  const education = EDUCATION_LABELS_UZ[String(job?.education_level || '').trim()] || compactText(job?.education_level) || "Ko'rsatilmagan";
  const contact = compactText(job?.contact_phone || job?.phone || '');
  const workingDays = compactText(job?.working_days || '');
  const workingHours = compactText(job?.working_hours || '');
  const benefits = asList(job?.benefits).slice(0, 4).join(', ');
  const tags = buildTags('job', regionSlug || job?.districts?.regions?.slug || null, districtName || null);

  const lines: string[] = [
    `<b>📢 | Yangi vakansiya</b>`,
    tags,
    '',
    `💼 | Lavozim: ${escapeHtml(title)}`,
    `🏢 | Tashkilot: ${escapeHtml(company)}`,
    location ? `📍 | Joylashuv: ${escapeHtml(location)}` : '',
    `💰 | Maosh: ${escapeHtml(salary)}`,
    `🧠 | Tajriba: ${escapeHtml(experience)}`,
    `🎓 | Ma'lumot: ${escapeHtml(education)}`,
    workingDays ? `📆 | Ish kunlari: ${escapeHtml(workingDays)}` : '',
    workingHours ? `⏰ | Ish vaqti: ${escapeHtml(workingHours)}` : '',
    benefits ? `🛎️ | Qulayliklar: ${escapeHtml(benefits)}` : '',
    contact ? `📞 | Bog'lanish: ${escapeHtml(contact)}` : ''
  ];

  return lines.filter(Boolean).join('\n');
}

export function buildResumeChannelMessage(resume: any, regionSlug?: string | null): string {
  const title = compactText(resume?.title || resume?.desired_position || resume?.field_title || 'Mutaxassis');
  const fullName = compactText(resume?.full_name || 'Nomzod');
  const regionName = compactText(resume?.region_name || resume?.districts?.regions?.name_uz || '');
  const districtName = compactText(resume?.district_name || resume?.districts?.name_uz || '');
  const location = [regionName, districtName].filter(Boolean).join(', ');
  const salary = formatSalaryUz(resume?.expected_salary_min, resume?.expected_salary_max);
  const years = Number(resume?.experience_years || 0);
  const expCode = String(resume?.experience || resume?.experience_level || '').trim();
  const experience = years > 0 ? `${years} yil` : (EXPERIENCE_LABELS_UZ[expCode] || "Ko'rsatilmagan");
  const education = EDUCATION_LABELS_UZ[String(resume?.education_level || '').trim()] || compactText(resume?.education_level) || "Ko'rsatilmagan";
  const skills = asList(resume?.skills).slice(0, 6).join(', ');
  const about = compactText(resume?.about || '').slice(0, 240);
  const tags = buildTags('resume', regionSlug || resume?.districts?.regions?.slug || null, districtName || null);

  const lines: string[] = [
    `<b>🧾 | Yangi rezyume</b>`,
    tags,
    '',
    `👤 | Nomzod: ${escapeHtml(fullName)}`,
    `💼 | Yo'nalish: ${escapeHtml(title)}`,
    location ? `📍 | Hudud: ${escapeHtml(location)}` : '',
    `🧠 | Tajriba: ${escapeHtml(experience)}`,
    `🎓 | Ma'lumot: ${escapeHtml(education)}`,
    `💰 | Kutilayotgan maosh: ${escapeHtml(salary)}`,
    skills ? `🧩 | Ko'nikmalar: ${escapeHtml(skills)}` : '',
    about ? `📝 | Qisqacha: ${escapeHtml(about)}` : ''
  ];

  return lines.filter(Boolean).join('\n');
}

export function hashMessage(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function isJobActiveForChannel(job: any): boolean {
  return Boolean(job && job.is_active === true && String(job.status || 'active') === 'active');
}

export function isResumeActiveForChannel(resume: any): boolean {
  const optIn = resume?.post_to_channel;
  const canPost = optIn === undefined || optIn === null ? true : Boolean(optIn);
  return Boolean(resume && resume.is_public === true && String(resume.status || 'active') === 'active' && canPost);
}

export function normalizeRegionName(value: string | null | undefined): string {
  return compactText(value)
    .toLowerCase()
    .replace(/['`’ʻ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
