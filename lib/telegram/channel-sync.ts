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
  'toshkent-shahri': 'Toshkent',
  'toshkent-shahar': 'Toshkent',
  'toshkent-viloyati': 'Toshkent_viloyati',
  'samarqand-viloyati': 'Samarqand',
  'navoiy-viloyati': 'Navoiy',
  'qoraqalpogiston-respublikasi': 'Qoraqalpogiston',
  'qashqadaryo-viloyati': 'Qashqadaryo',
  'surxondaryo-viloyati': 'Surxondaryo',
  'fargona-viloyati': 'Fargona',
  'namangan-viloyati': 'Namangan',
  'sirdaryo-viloyati': 'Sirdaryo',
  'jizzax-viloyati': 'Jizzax',
  'buxoro-viloyati': 'Buxoro',
  'xorazm-viloyati': 'Xorazm',
  'andijon-viloyati': 'Andijon'
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
  any: 'Ahamiyatsiz',
  secondary: "O'rta",
  vocational: "O'rta maxsus",
  incomplete_higher: "Oliy (tugallanmagan)",
  higher: 'Oliy',
  master: 'Magistr',
  phd: 'PhD'
};

const WORK_MODE_LABELS_UZ: Record<string, string> = {
  onsite: 'Onsite',
  remote: 'Masofaviy',
  hybrid: 'Gibrid'
};

const EMPLOYMENT_LABELS_UZ: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Shartnoma',
  internship: 'Amaliyot'
};

const WORKING_DAYS_LABELS_UZ: Record<string, string> = {
  '5_kunlik': '5 kunlik',
  '6_kunlik': '6 kunlik',
  full_week: "To'liq hafta",
  flexible: 'Moslashuvchan',
  shift_based: 'Navbatchilik asosida'
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

function pickCoordinate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(',', '.');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
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
  if (Array.isArray(value)) {
    return value.map((v) => compactText(v)).filter(Boolean);
  }
  const raw = compactText(value);
  if (!raw) return [];
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => compactText(v)).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return raw
    .split(/[,;\n]/g)
    .map((item) => compactText(item))
    .filter(Boolean);
}

function uniqueList(values: Array<string | null | undefined>, limit: number): string[] {
  const set = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = compactText(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (set.has(key)) continue;
    set.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeHumanValue(value: string | null | undefined): string | null {
  const normalized = compactText(value);
  if (!normalized) return null;
  const low = normalized.toLowerCase();
  if (['any', 'ahamiyatsiz', 'ahamiyatga ega emas', 'none', 'n/a'].includes(low)) return null;
  return normalized;
}

function normalizeWorkMode(value: unknown): string | null {
  const raw = compactText(value).toLowerCase();
  if (!raw) return null;
  return WORK_MODE_LABELS_UZ[raw] || raw.replace(/_/g, ' ');
}

function normalizeEmployment(value: unknown): string | null {
  const raw = compactText(value).toLowerCase();
  if (!raw) return null;
  return EMPLOYMENT_LABELS_UZ[raw] || raw.replace(/_/g, '-');
}

function normalizeWorkingDays(value: unknown): string | null {
  const raw = compactText(value).toLowerCase();
  if (!raw) return null;
  return WORKING_DAYS_LABELS_UZ[raw] || raw.replace(/_/g, ' ');
}

function normalizeLanguageLabel(value: string): string {
  const raw = compactText(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'uz') return "O'zbek tili";
  if (raw === 'ru') return 'Rus tili';
  if (raw === 'en') return 'Ingliz tili';
  return value;
}

function toDistrictHashtag(value: string | null | undefined): string | null {
  const raw = compactText(value);
  if (!raw) return null;
  const cleaned = raw
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  const stopWords = new Set([
    'tumani',
    'tuman',
    'shahar',
    'shahri',
    'rayon',
    'gorod'
  ]);

  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !stopWords.has(token.toLowerCase()));

  if (!tokens.length) return null;

  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join('_')
    .slice(0, 64);
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

function parseDescriptionItems(description: string): string[] {
  const text = String(description || '')
    .replace(/\r/g, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
  if (!text) return [];

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:[-•*]+\s*)+/, '').trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines.slice(0, 3);
  }

  return text
    .split(/[.!?]\s+/g)
    .map((part) => compactText(part))
    .filter(Boolean)
    .slice(0, 3);
}

function regionPromoLabel(regionSlug: string | null | undefined): string {
  if (!regionSlug) return 'hudud';
  const normalized = compactText(regionSlug).toLowerCase();
  const tag = REGION_HASHTAG_BY_SLUG[normalized] || '';
  if (!tag) return 'hudud';
  return tag.replace(/_/g, ' ');
}

function channelFooter(regionSlug: string | null | undefined): string {
  const channel = regionSlug ? getChannelByRegionSlug(regionSlug) : null;
  if (!channel) return '';
  const handle = channel.startsWith('@') ? channel.slice(1) : channel;
  const promo = regionPromoLabel(regionSlug);
  return `?? <a href="https://t.me/${handle}">ISHDASIZ</a> — ${escapeHtml(promo)}dagi eng yangi bo'sh ish o'rinlari!`;
}

function getCoordinates(entity: any): { lat: number | null; lon: number | null } {
  const raw = entity?.raw_source_json || {};
  const rawLocation = raw?.location && typeof raw.location === 'object' ? raw.location : null;
  const coordinatePair = Array.isArray(raw?.coordinates) && raw.coordinates.length >= 2
    ? { lat: raw.coordinates[0], lon: raw.coordinates[1] }
    : null;
  const lat =
    pickCoordinate(entity?.latitude)
    ?? pickCoordinate(raw?.latitude)
    ?? pickCoordinate(raw?.lat)
    ?? pickCoordinate(raw?.geo_lat)
    ?? pickCoordinate(raw?.location_lat)
    ?? pickCoordinate(rawLocation?.latitude)
    ?? pickCoordinate(rawLocation?.lat)
    ?? pickCoordinate(coordinatePair?.lat);
  const lon =
    pickCoordinate(entity?.longitude)
    ?? pickCoordinate(raw?.longitude)
    ?? pickCoordinate(raw?.lon)
    ?? pickCoordinate(raw?.lng)
    ?? pickCoordinate(raw?.geo_lng)
    ?? pickCoordinate(raw?.location_lng)
    ?? pickCoordinate(rawLocation?.longitude)
    ?? pickCoordinate(rawLocation?.lon)
    ?? pickCoordinate(rawLocation?.lng)
    ?? pickCoordinate(coordinatePair?.lon);
  return { lat, lon };
}

function parseBirthDateToText(value: unknown): string | null {
  const raw = compactText(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function mapSpecialFlagsToText(special: string[]): string[] {
  const normalized = new Set(special.map((value) => compactText(value).toLowerCase()));
  const labels: string[] = [];
  if (normalized.has('students')) labels.push('Talabalar ham mos kelishi mumkin');
  if (normalized.has('graduates')) labels.push('Bitiruvchilar ham mos kelishi mumkin');
  if (normalized.has('disabled')) labels.push("Nogironligi bo'lgan shaxslar ham mos kelishi mumkin");
  return labels;
}

function sanitizeBullet(value: string): string {
  return compactText(value)
    .replace(/^(?:[-•*]+\s*)+/, '')
    .replace(/[.;:,]+$/g, '')
    .trim();
}

export function getChannelByRegionSlug(regionSlug: string | null | undefined): string | null {
  if (!regionSlug) return null;
  const normalized = compactText(regionSlug).toLowerCase();
  return REGION_CHANNEL_BY_SLUG[normalized] || null;
}

export function buildJobChannelMessage(job: any, regionSlug?: string | null): string {
  const raw = job?.raw_source_json || {};
  const title = compactText(job?.title_uz || job?.title_ru || job?.title || job?.field_title || raw?.title || raw?.position_name || 'Vakansiya');
  const company = compactText(job?.company_name || 'Tashkilot');
  const regionName = compactText(job?.region_name || job?.districts?.regions?.name_uz || raw?.region_name_uz || raw?.region_name || '');
  const districtName = compactText(job?.district_name || job?.districts?.name_uz || raw?.district_name_uz || raw?.district_name || '');
  const location = [regionName, districtName].filter(Boolean).join(', ');
  const address = compactText(job?.address || raw?.address || raw?.work_address || '');

  const salary = formatSalaryUz(job?.salary_min, job?.salary_max);
  const experienceKey = String(job?.experience || raw?.work_experiance || raw?.experience || '').trim();
  const experience = EXPERIENCE_LABELS_UZ[experienceKey] || compactText(experienceKey) || "Ko'rsatilmagan";
  const educationKey = String(job?.education_level || raw?.min_education || raw?.education_level || '').trim();
  const education = EDUCATION_LABELS_UZ[educationKey] || compactText(educationKey) || "Ko'rsatilmagan";

  const workMode = normalizeHumanValue(normalizeWorkMode(job?.work_mode || raw?.work_mode || raw?.work_format || ''));
  const employment = normalizeHumanValue(normalizeEmployment(job?.employment_type || raw?.employment_type || ''));
  const workingDays = normalizeHumanValue(normalizeWorkingDays(job?.working_days || raw?.working_days || ''));
  const workingHours = normalizeHumanValue(compactText(job?.working_hours || raw?.working_hours || ''));

  const contactPhone = compactText(job?.contact_phone || job?.phone || raw?.contact_phone || raw?.phone || '');

  const languages = uniqueList(
    asList(job?.languages ?? raw?.languages ?? raw?.language_ids ?? raw?.language).map(normalizeLanguageLabel),
    6
  );
  const benefits = uniqueList(
    asList(job?.benefits ?? raw?.benefits ?? raw?.ijtimoiy_paketlar ?? raw?.qulayliklar),
    6
  );

  const description = compactText(
    job?.description_uz
    || job?.description
    || job?.requirements_uz
    || job?.responsibilities_uz
    || raw?.description_text
    || raw?.description
    || raw?.info
    || ''
  );

  const requirementItems = uniqueList([
    ...asList(raw?.ish_vazifalari),
    ...asList(raw?.talablar),
    ...parseDescriptionItems(description)
  ].map(sanitizeBullet), 3);

  const finalRegionSlug = regionSlug || job?.districts?.regions?.slug || null;
  const tags = buildTags('job', finalRegionSlug, districtName || null);

  const coords = getCoordinates(job);
  const mapUrl = (coords.lat !== null && coords.lon !== null)
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lon}`
    : null;

  const footer = channelFooter(finalRegionSlug);

  const lines: string[] = [
    `?? ${tags}`,
    '',
    `<b>?? | Lavozim: ${escapeHtml(title)}</b>`,
    '',
    '???????????????',
    '',
    `?? Tashkilot: ${escapeHtml(company)}`,
    location ? `?? Hudud: ${escapeHtml(location)}` : '',
    address ? `?? Manzil: ${escapeHtml(address)}` : '',
    mapUrl ? `?? <a href="${mapUrl}">Joylashuvni ko'rish</a>` : '',
    '',
    `?? Maosh: ${escapeHtml(salary)}`,
    `?? Tajriba: ${escapeHtml(experience)}`,
    `?? Ma'lumot: ${escapeHtml(education)}`,
    '',
    '<b>?? Ish tartibi</b>',
    employment ? `• Bandlik: ${escapeHtml(employment)}` : '',
    workingDays ? `• Ish kunlari: ${escapeHtml(workingDays)}` : '',
    workingHours ? `• Ish vaqti: ${escapeHtml(workingHours)}` : '',
    workMode ? `• Ish shakli: ${escapeHtml(workMode)}` : ''
  ];

  if (languages.length > 0) {
    lines.push('', '<b>?? Talab etiladigan tillar</b>', escapeHtml(languages.join(' • ')));
  }

  lines.push('', '???????????????', '');

  if (requirementItems.length > 0) {
    lines.push('<b>?? Asosiy vazifalar</b>');
    lines.push(...requirementItems.map((item) => `?? ${escapeHtml(item)}`));
  }

  if (benefits.length > 0) {
    lines.push('', '<b>?? Qulayliklar</b>');
    lines.push(...benefits.map((item) => `? ${escapeHtml(sanitizeBullet(item))}`));
  }

  lines.push('', '???????????????');

  if (contactPhone) {
    lines.push('', `?? Aloqa: ${escapeHtml(contactPhone)}`);
  }

  if (footer) {
    lines.push('', footer);
  }

  return lines.filter(Boolean).join('\n');
}

export function buildResumeChannelMessage(resume: any, regionSlug?: string | null): string {
  const raw = resume?.raw_source_json || {};
  const title = compactText(resume?.title || resume?.desired_position || resume?.field_title || raw?.position_name || 'Mutaxassis');
  const fullName = compactText(resume?.full_name || 'Nomzod');

  const regionName = compactText(resume?.region_name || resume?.districts?.regions?.name_uz || raw?.region_name_uz || raw?.region_name || '');
  const districtName = compactText(resume?.district_name || resume?.districts?.name_uz || raw?.district_name_uz || raw?.district_name || '');
  const location = [regionName, districtName].filter(Boolean).join(', ');

  const salary = formatSalaryUz(resume?.expected_salary_min, resume?.expected_salary_max);
  const years = Number(resume?.experience_years || 0);
  const expCode = String(resume?.experience || resume?.experience_level || '').trim();
  const experience = years > 0 ? `${years} yil` : (EXPERIENCE_LABELS_UZ[expCode] || "Ko'rsatilmagan");
  const education = EDUCATION_LABELS_UZ[String(resume?.education_level || '').trim()] || compactText(resume?.education_level) || "Ko'rsatilmagan";

  const genderRaw = normalizeHumanValue(compactText(resume?.gender || raw?.gender || ''));
  const birthDate = parseBirthDateToText(resume?.birth_date || raw?.birth_date || null);
  const specialFlags = mapSpecialFlagsToText(asList(resume?.special ?? raw?.special));

  const skills = uniqueList(asList(resume?.skills).map(sanitizeBullet), 8);
  const languages = uniqueList(asList(resume?.languages).map(normalizeLanguageLabel), 6);
  const about = compactText(resume?.about || raw?.about || '').slice(0, 700);

  const phone = compactText(resume?.phone || raw?.phone || '');
  const telegram = compactText(resume?.telegram || resume?.contact_telegram || resume?.telegram_username || raw?.telegram || '');

  const finalRegionSlug = regionSlug || resume?.districts?.regions?.slug || null;
  const tags = buildTags('resume', finalRegionSlug, districtName || null);
  const footer = channelFooter(finalRegionSlug);

  const lines: string[] = [
    `?? ${tags}`,
    '',
    `<b>?? | Lavozim: ${escapeHtml(title)}</b>`,
    '',
    '???????????????',
    '',
    `?? Nomzod: ${escapeHtml(fullName)}`,
    location ? `?? Hudud: ${escapeHtml(location)}` : '',
    `?? Tajriba: ${escapeHtml(experience)}`,
    `?? Ma'lumot: ${escapeHtml(education)}`,
    `?? Kutilayotgan maosh: ${escapeHtml(salary)}`,
    genderRaw ? `?? Jins: ${escapeHtml(genderRaw)}` : '',
    birthDate ? `?? Tug'ilgan sana: ${escapeHtml(birthDate)}` : ''
  ];

  if (specialFlags.length > 0) {
    lines.push(`? Alohida toifalar: ${escapeHtml(specialFlags.join(', '))}`);
  }

  if (skills.length > 0) {
    lines.push('', '<b>?? Asosiy ko\'nikmalar</b>');
    lines.push(...skills.map((item) => `?? ${escapeHtml(item)}`));
  }

  if (languages.length > 0) {
    lines.push('', '<b>?? Tillar</b>', escapeHtml(languages.join(' • ')));
  }

  if (about) {
    lines.push('', '<b>?? O\'zi haqida</b>', escapeHtml(about));
  }

  lines.push('', '???????????????');

  if (phone) lines.push('', `?? Aloqa: ${escapeHtml(phone)}`);
  if (telegram) lines.push(`?? Telegram: ${escapeHtml(telegram.startsWith('@') ? telegram : `@${telegram}`)}`);

  if (footer) {
    lines.push('', footer);
  }

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
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
