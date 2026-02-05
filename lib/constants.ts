import { Language } from './translations';

// Legacy Andijan center - use UZBEKISTAN_CENTER for general maps
export const ANDIJAN_CENTER = {
  lat: 40.7821,
  lng: 72.3442,
};

// Center of Uzbekistan for country-wide maps
export const UZBEKISTAN_CENTER = {
  lat: 41.3775,
  lng: 64.5853,
};

// Region coordinates for dynamic map centering
export const REGION_COORDINATES: Record<number, { lat: number; lng: number; name: string }> = {
  1: { lat: 41.2995, lng: 69.2401, name: 'Toshkent shahri' },
  2: { lat: 41.3110, lng: 69.2797, name: 'Toshkent viloyati' },
  3: { lat: 40.7821, lng: 72.3442, name: 'Andijon viloyati' },
  4: { lat: 39.7681, lng: 64.4556, name: 'Buxoro viloyati' },
  5: { lat: 40.3834, lng: 71.7870, name: "Farg'ona viloyati" },
  6: { lat: 40.1158, lng: 67.8422, name: 'Jizzax viloyati' },
  7: { lat: 41.5530, lng: 60.6318, name: 'Xorazm viloyati' },
  8: { lat: 40.9983, lng: 71.6726, name: 'Namangan viloyati' },
  9: { lat: 40.0844, lng: 65.3792, name: 'Navoiy viloyati' },
  10: { lat: 38.8612, lng: 65.8008, name: 'Qashqadaryo viloyati' },
  11: { lat: 39.6542, lng: 66.9597, name: 'Samarqand viloyati' },
  12: { lat: 40.8376, lng: 68.6594, name: 'Sirdaryo viloyati' },
  13: { lat: 37.2242, lng: 67.2783, name: 'Surxondaryo viloyati' },
  14: { lat: 42.4607, lng: 59.6063, name: "Qoraqalpog'iston" },
};

export const MAP_DEFAULT_ZOOM = 10;
export const MAP_COUNTRY_ZOOM = 6;

export const SALARY_RANGES = [
  { min: 0, max: 0, label_uz: 'Kelishiladi', label_ru: 'Договорная' },
  { min: 1000000, max: 3000000, label_uz: '1-3 mln', label_ru: '1-3 млн' },
  { min: 3000000, max: 5000000, label_uz: '3-5 mln', label_ru: '3-5 млн' },
  { min: 5000000, max: 10000000, label_uz: '5-10 mln', label_ru: '5-10 млн' },
  { min: 10000000, max: 50000000, label_uz: '10+ mln', label_ru: '10+ млн' },
];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'remote'] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const formatSalary = (min: number | null | undefined, max: number | null | undefined, lang: Language): string => {
  let minVal = min ?? 0;
  let maxVal = max ?? 0;

  // Defensive: swap if min > max (data quality issue)
  if (minVal > 0 && maxVal > 0 && minVal > maxVal) {
    [minVal, maxVal] = [maxVal, minVal];
  }

  // Both 0/null → show "Kelishiladi"
  if (minVal <= 0 && maxVal <= 0) {
    return lang === 'uz' ? 'Kelishiladi' : 'Договорная';
  }

  const formatNum = (n: number) => {
    // User requested full numbers with spaces, e.g. 1 500 000
    return n.toLocaleString('ru-RU').replace(/,/g, ' ');
  };

  const currency = lang === 'uz' ? "so'm" : 'сум';

  // Only min present (max = 0)
  if (minVal > 0 && maxVal <= 0) {
    return `${formatNum(minVal)} ${currency}`;
  }

  // Only max present (min = 0) → "...gacha"
  if (minVal <= 0 && maxVal > 0) {
    const suffix = lang === 'uz' ? 'gacha' : 'до';
    return `${formatNum(maxVal)} ${currency} ${suffix}`;
  }

  // Both present and equal
  if (minVal === maxVal) {
    return `${formatNum(minVal)} ${currency}`;
  }

  // Both present, different
  return `${formatNum(minVal)} – ${formatNum(maxVal)} ${currency}`;
};

export const formatDate = (date: string, lang: Language): string => {
  const jobDate = new Date(date);
  const today = new Date();

  today.setHours(0, 0, 0, 0);
  jobDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - jobDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return lang === 'uz' ? 'bugun' : 'сегодня';
  }

  if (diffDays > 0 && diffDays <= 7) {
    if (lang === 'uz') {
      return `${diffDays} kun oldin`;
    } else {
      const dayWord = diffDays === 1 ? 'день' : diffDays <= 4 ? 'дня' : 'дней';
      return `${diffDays} ${dayWord} назад`;
    }
  }

  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}.${month}.${year}`;
};

// Experience options - matches OsonIsh API work_experiance field IDs exactly
export const EXPERIENCE_OPTIONS = [
  { value: '1', label_uz: 'Tajribasiz', label_ru: 'Без опыта' },
  { value: '2', label_uz: '1 yil', label_ru: '1 год' },
  { value: '3', label_uz: '1-3 yil', label_ru: '1-3 года' },
  { value: '4', label_uz: '3-5 yil', label_ru: '3-5 лет' },
  { value: '5', label_uz: '5+ yil', label_ru: '5+ лет' },
] as const;

// Education options - same as vacancy creation form
export const EDUCATION_OPTIONS = [
  { value: 'any', label_uz: "Ahamiyatsiz", label_ru: 'Не имеет значения' },
  { value: 'secondary', label_uz: "O'rta", label_ru: 'Среднее' },
  { value: 'vocational', label_uz: "O'rta maxsus", label_ru: 'Среднее специальное' },
  { value: 'higher', label_uz: 'Oliy', label_ru: 'Высшее' },
  { value: 'master', label_uz: 'Magistratura', label_ru: 'Магистратура' },
] as const;

// Gender options - same as vacancy creation form
export const GENDER_OPTIONS = [
  { value: 'any', label_uz: 'Ahamiyatsiz', label_ru: 'Не важно' },
  { value: 'male', label_uz: 'Erkak', label_ru: 'Мужской' },
  { value: 'female', label_uz: 'Ayol', label_ru: 'Женский' },
] as const;

// Legacy aliases for backward compatibility
export const EXPERIENCE_LEVELS = EXPERIENCE_OPTIONS;
export const EDUCATION_LEVELS = EDUCATION_OPTIONS;

// Languages list
export const LANGUAGES_LIST = [
  { value: 'uzbek', label_uz: "O'zbek tili", label_ru: 'Узбекский язык' },
  { value: 'russian', label_uz: "Rus tili", label_ru: 'Русский язык' },
  { value: 'english', label_uz: "Ingliz tili", label_ru: 'Английский язык' },
  { value: 'korean', label_uz: "Koreys tili", label_ru: 'Корейский язык' },
  { value: 'chinese', label_uz: "Xitoy tili", label_ru: 'Китайский язык' },
  { value: 'german', label_uz: "Nemis tili", label_ru: 'Немецкий язык' },
] as const;

// Payment type options - matches OsonIsh API
export const PAYMENT_TYPE_OPTIONS = [
  { value: '1', label_uz: "Kelishilgan holda", label_ru: 'По договоренности' },
  { value: '2', label_uz: "Ishbay", label_ru: 'Сдельная' },
  { value: '3', label_uz: "Stavka (oklad)", label_ru: 'Фиксированный оклад' },
] as const;

// Work mode options - matches OsonIsh API
export const WORK_MODE_OPTIONS = [
  { value: 'onsite', label_uz: "Ish joyida", label_ru: 'В офисе' },
  { value: 'remote', label_uz: "Masofaviy", label_ru: 'Удаленная' },
  { value: 'hybrid', label_uz: "Gibrid", label_ru: 'Гибрид' },
] as const;

// Working days options - matches OsonIsh API
export const WORKING_DAYS_OPTIONS = [
  { value: '1', label_uz: "6 kunlik ish haftasi", label_ru: '6-дневная неделя' },
  { value: '2', label_uz: "5 kunlik ish haftasi", label_ru: '5-дневная неделя' },
] as const;
