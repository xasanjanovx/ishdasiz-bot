/**
 * OsonIsh Category Mapping (TITLE-ONLY)
 * OsonIsh API does not provide reliable categories, so we map strictly by title.
 */

// Target category IDs (ISHDASIZ)
export const ISHDASIZ_CATEGORIES = {
    IT: 'a0000001-0001-4000-8000-000000000001',           // Axborot texnologiyalari
    PRODUCTION: 'a0000002-0002-4000-8000-000000000002',   // Sanoat va ishlab chiqarish
    SERVICES: 'a0000003-0003-4000-8000-000000000003',     // Xizmatlar
    EDUCATION: 'a0000004-0004-4000-8000-000000000004',    // Ta'lim, madaniyat, sport
    HEALTHCARE: 'a0000005-0005-4000-8000-000000000005',   // Sog'liqni saqlash
    FINANCE: 'a0000006-0006-4000-8000-000000000006',      // Moliya, iqtisod, boshqaruv
    CONSTRUCTION: 'a0000007-0007-4000-8000-000000000007', // Qurilish
    AGRICULTURE: 'a0000008-0008-4000-8000-000000000008',  // Qishloq xo'jaligi
    TRANSPORT: 'a0000009-0009-4000-8000-000000000009',    // Transport
    SALES: 'a0000010-0010-4000-8000-000000000010',        // Savdo va marketing
    OTHER: 'a0000011-0011-4000-8000-000000000011',        // Boshqa
};

type CategoryKey = keyof typeof ISHDASIZ_CATEGORIES;

const CATEGORY_RULES: Array<{ category: CategoryKey; keywords: string[] }> = [
    {
        category: 'HEALTHCARE',
        keywords: [
            'shifokor', 'doktor', 'doctor', 'vrach', 'врач', 'hamshira', 'медсестра', 'medsestra',
            'nurse', 'farmatsevt', 'фармацевт', 'laborant', 'фельдшер', 'stomatolog', 'dentist'
        ],
    },
    {
        category: 'EDUCATION',
        keywords: [
            'oqituvchi', 'teacher', 'преподаватель', 'учитель', 'mentor', 'ustoz',
            'tarbiyachi', 'воспитатель', 'repititor', 'репетитор', 'tutor', 'pedagog'
        ],
    },
    {
        category: 'FINANCE',
        keywords: [
            'buxgalter', 'бухгалтер', 'accountant', 'hisobchi', 'auditor', 'аудитор',
            'экономист', 'ekonomist', 'finance', 'finans', 'bankir'
        ],
    },
    {
        category: 'TRANSPORT',
        keywords: [
            'haydovchi', 'haydovchilik', 'driver', 'voditel', 'водитель', 'kuryer', 'kurier',
            'курьер', 'courier', 'ekspeditor', 'экспедитор', 'logist', 'логист',
            'taksi', 'taxi', 'yuk tashish', 'delivery'
        ],
    },
    {
        category: 'SALES',
        keywords: [
            'sotuvchi', 'продавец', 'sales', 'savdo', 'kassir', 'кассир', 'merchandiser',
            'merch', 'promouter', 'промоутер', 'marketolog', 'маркетолог', 'smm'
        ],
    },
    {
        category: 'CONSTRUCTION',
        keywords: [
            'quruvchi', 'строитель', 'santexnik', 'сантехник', 'elektrik', 'электрик',
            'payvand', 'сварщик', 'montaj', 'монтаж', 'suvoqchi', 'gips', 'beton', 'kran'
        ],
    },
    {
        category: 'PRODUCTION',
        keywords: [
            'ishlab chiqar', 'zavod', 'fabrika', 'цех', 'dastgoh', 'станок',
            'dastgoh operator', 'stanok operator', 'operator stanok', 'оператор станка',
            'ishlab chiqarish operatori',
            'tokar', 'токарь', 'slesar', 'слесарь', 'qadoql', 'upakov', 'tikuvchi',
            'швея', 'nonvoy', 'пекарь', 'qandolatchi'
        ],
    },
    {
        category: 'IT',
        keywords: [
            'dasturchi', 'developer', 'programmist', 'программист', 'frontend', 'backend',
            'fullstack', 'full stack', 'devops', 'sysadmin', 'system administrator', 'qa',
            'tester', 'тестиров', 'analyst', 'аналитик', 'data', 'sql', 'database', '1c',
            '1с', 'айти', 'it', 'ux', 'ui', 'web', 'android', 'ios'
        ],
    },
    {
        category: 'AGRICULTURE',
        keywords: [
            'agronom', 'агроном', 'фермер', 'dehqon', 'chorvador', 'bogbon',
            'ferma', 'agro'
        ],
    },
    {
        category: 'SERVICES',
        keywords: [
            'oshpaz', 'повар', 'cook', 'ofitsiant', 'waiter', 'barista', 'barmen',
            'farrosh', 'tozalovchi', 'uborsh', 'уборщик', 'qorovul', 'охранник',
            'sartarosh', 'парикмахер', 'call center', 'call centre', 'operator call',
            'xizmat', 'service'
        ],
    },
];

// Strict mapping for OsonIsh MMK categories (cat2)
const STRICT_CATEGORY_MAP: Record<string, CategoryKey> = {
    // ----------------------------------------------------
    // USER PROVIDED ID MAPPINGS (Reconciled with Text)
    // ----------------------------------------------------

    // 42 - Ta'lim, madaniyat, sport
    "TAʼLIM SOHASIDAGI PROFESSIONAL-MUTAXASSISLAR": 'EDUCATION',
    "HUQUQSHUNOSLIK, IJTIMOIY ISHLAR, MADANIYAT VA OʻXSHASH FAOLIYAT SOHASIDAGI YORDAMCHI XODIMLAR": 'EDUCATION', // Madaniyat
    "SANʼAT, MADANIYAT VA PAZANDALIK BOʻYICHA MUTAXASSIS-TEXNIKLAR": 'EDUCATION', // Madaniyat
    "MADANIYAT, GUMANITAR VA HUQUQ SOHASIDAGI PROFESSIONAL-MUTAXASSISLAR": 'EDUCATION',

    // 47 - Sog'liqni saqlash
    "SOGʻLIQNI SAQLASH SOHASIDA PROFESSIONAL-MUTAXASSISLAR": 'HEALTHCARE',
    "Sogʻliqni saqlashda oʻrta maʼlumotli tibbiyot xodimlari": 'HEALTHCARE',

    // 12 - Axborot texnologiyalari
    "AXBOROT-KOMMUNIKATSIYA TEXNOLOGIYALARI BOʻYICHA PROFESSIONAL-MUTAXASSISLAR": 'IT',
    "AXBOROT-KOMMUNIKATSIYA TEXNOLOGIYALARI SOHASIDAGI MUTAXASSIS-TEXNIKLAR": 'IT',

    // 21 - Sanoat va ishlab chiqarish
    "SANOAT USKUNALARI VA STATSIONAR QURILMALARI OPERATORLARI": 'PRODUCTION',
    "OZIQ-OVQAT, YOGʻOCHNI QAYTA ISHLASH, TOʻQIMACHILIK VA TIKUVCHILIK SANOATI VA TURDOSH KASBLAR ISHCHILARI": 'PRODUCTION',
    "METALGA ISHLOV BERISH SANOATI, MASHINASOZLIK VA SHUNGA OʻXSHASH SOHALAR ISHCHILARI": 'PRODUCTION',
    "POLIGRAFIYA ISHLAB CHIQARISH VA QOʻL MEHNATINING YUQORI MALAKALI ISHCHILARI": 'PRODUCTION',
    "FAN VA TEXNIKA SOHASIDA PROFESSIONAL-MUTAXASSISLAR": 'PRODUCTION',
    "FAN VA TEXNIKA SOHASIDA MUTAXASSIS-TEXNIKLAR": 'PRODUCTION',
    "ELEKTROTEXNIKA VA ELEKTRONIKA SOHASIDAGI ISHCHILAR": 'PRODUCTION',
    "TOGʻ-KON SANOATI, QURILISH, QAYTA ISHLASH SANOATI VA TRANSPORT SOHASIDAGI MALAKASIZ ISHCHILAR": 'PRODUCTION',
    "YIGʻUVCHILAR": 'PRODUCTION',
    "SANOAT, QURILISH VA SHU KABI SOHA MALAKALI ISHCHILARI": 'PRODUCTION',

    // 48 - Xizmatlar
    "UY XIZMATCHILARI VA FARROSHLAR": 'SERVICES',
    "XUSUSIY MULK VA FUQAROLARNI MUHOFAZA QILISH XIZMATI XODIMLARI": 'SERVICES', // Security -> Services
    "TAOM TAYYORLASHDA YORDAMCHILAR": 'SERVICES',
    "AHOLIGA XIZMAT KOʻRSATISH SOHASI XIZMATCHILARI": 'SERVICES',
    "INDIVIDUAL XIZMATLAR SOHASIDAGI XODIMLAR": 'SERVICES',
    "YAKKA TARTIBDA XIZMAT KOʻRSATUVCHI XODIMLAR": 'SERVICES',
    "MEHMONXONA BIZNESINING RAHBARLARI, DOʻKONLAR VA TEGISHLI FAOLIYAT SOHALARI RAHBARLARI (BOSHQARUVCHILARI)": 'SERVICES',
    "CHIQINDILARNI YIGʻUVCHI VA BOSHQA MALAKASIZ XODIMLAR": 'SERVICES',

    // 64 - Savdo va marketing
    "SOTUVCHILAR": 'SALES',

    // 41 - Qurilish
    "QURILISH VA MONTAJ ISHLARI EXTRUKTORLARI VA TURDOSH KASBLAR ISHCHILARI": 'CONSTRUCTION',
    "BINOLARNI QURUVCHILAR VA TAMIRLOVCHILAR, QURILISH-MONTAJ ISHLARI ISHCHILARI": 'CONSTRUCTION',
    "QURILISH SOHASI VA SHUNGA OʻXSHASH SOHA ISHCHILARI (ELEKTRIKLARDAN TASHQARI)": 'CONSTRUCTION',

    // 36 - Transport
    "HAYDOVCHILAR VA KOʻCHMA USKUNALAR OPERATORLARI": 'TRANSPORT',
    "KOʻCHMA QURILMALAR OPERATORLARI VA HAYDOVCHILARI": 'TRANSPORT',

    // 1 - Moliya, iqtisod, boshqaruv
    "QONUN CHIQARUVCHILAR, YUQORI MANSABDOR SHAXSLAR VA BOSHQARUVCHILAR": 'FINANCE',
    "ISHLAB CHIQARISH VA IXTISOSLASHTIRILGAN XIZMATLAR SOHASIDAGI BOʻLINMALAR RAHBARLARI": 'FINANCE',
    "MATERIAL QIYMATLILIKLAR HISOBI VA RAQAMLI AXBOROTLARGA ISHLOV BERISH SOHASIDAGI XIZMATCHILAR": 'FINANCE',
    "OFIS TEXNIKALARIGA XIZMAT KOʻRSATISH VA UMUMIY PROFIL XIZMATCHILARI": 'FINANCE',
    "MAʼMURIYAT VA BIZNES SOHASIDAGI PROFESSIOANAL-MUTAXASSISLAR": 'FINANCE',
    "MAʼMURIY VA IQTISODIY FAOLIYAT BOʻYICHA MUTAXASSISLAR": 'FINANCE',
    "KORPORATIV BOSHQARUVCHILAR": 'FINANCE',
    "BOSHQA OFIS XIZMATCHILARI": 'FINANCE',

    // 7 - Qishloq xo'jaligi
    "QISHLOQ VA OʻRMON XOʻJALIGI, BALIQCHILIK VA BALIQSHUNOSLIKDAGI MALAKASIZ ISHCHILAR": 'AGRICULTURE',
    "OVCHILAR VA OʻRMON HAMDA BALIQ MAHSULOTLARIDAN TOVAR ISHLAB CHIQARUVCHILAR": 'AGRICULTURE',
    "QISHLOQ XOʻJALIGI MAHSULOTLARINI ISHLAB CHIQARUVCHILAR": 'AGRICULTURE',
    "BOGʻDORCHILIK, TOMORQA VA DALA EKINLARI TOVARLARINI ISHLAB CHIQARUVCHILAR": 'AGRICULTURE',

    // LIVE DATA ADDITIONS (Exact Casing)
    "SAVDO VA XIZMAT KOʻRSATISH SOHASI XODIMLARI": 'SERVICES',
};

// ==================== CRITERIA MAPPING ====================

export const OSONISH_GENDER_MAP = {
    1: 'male',
    2: 'female',
    3: 'any' // Any
};

export const OSONISH_EDUCATION_MAP = {
    1: 'secondary',   // O'rta
    2: 'vocational', // O'rta-maxsus
    3: 'higher',     // Oliy
    4: 'master',     // Magistr
    5: 'higher'      // PhD
};

export const OSONISH_WORK_MODE_MAP = {
    1: 'onsite',
    2: 'remote',
    3: 'hybrid' // Assumed
};

export const OSONISH_EMPLOYMENT_TYPE_MAP = {
    1: 'full_time',
    2: 'part_time', // Or contract? Audit showed 2 often.
    3: 'contract',
    4: 'internship'
};

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\u2018\u2019\u00B4\u02BB\u02BC]/g, "'")
        .replace(/['"]/g, '')
        .replace(/[^0-9a-z\u0400-\u04FF]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findKeywordMatch(title: string, keywords: string[]): string | null {
    const normalizedTitle = ` ${normalizeText(title)} `;
    for (const keyword of keywords) {
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) continue;
        if (normalizedTitle.includes(` ${normalizedKeyword} `)) {
            return keyword;
        }
    }
    return null;
}

export interface CategoryMappingResult {
    categoryId: string;
    categoryKey: CategoryKey;
    categoryName: string;
    sourceCategory: string;
    sourceSubcategory: string | null;
    matchedBy: 'title_keyword' | 'category_keyword' | 'strict_match' | 'default';
    matchedKeyword?: string;
}

export function mapOsonishCategory(
    sourceCategory: string,
    sourceSubcategory: string | null,
    jobTitle: string
): CategoryMappingResult {
    const safeTitle = jobTitle || '';
    const safeCategory = sourceCategory || '';

    // Helper to normalize apostrophes for comparison
    const normalizeApostrophes = (s: string) => s.replace(/[\u2018\u2019\u00B4\u02BB\u02BC\u0027\u2032]/gi, "'");

    // 0. STRICT MATCH by `cat2` or `cat1` string directly (normalized apostrophes & spacing)
    const normalizedInput = normalizeText(safeCategory);

    // Try direct match with normalized input
    for (const [mapKey, catKey] of Object.entries(STRICT_CATEGORY_MAP)) {
        if (normalizeText(mapKey) === normalizedInput) {
            return {
                categoryId: ISHDASIZ_CATEGORIES[catKey],
                categoryKey: catKey,
                categoryName: getCategoryName(catKey),
                sourceCategory,
                sourceSubcategory,
                matchedBy: 'strict_match'
            };
        }
    }

    // Try fuzzy matching (partial string match) with normalized strings
    const strictKeys = Object.keys(STRICT_CATEGORY_MAP);
    const fuzzyStrictMatch = strictKeys.find(key => {
        const normKey = normalizeText(key);
        return normalizedInput.includes(normKey) || normKey.includes(normalizedInput);
    });
    if (fuzzyStrictMatch) {
        const key = STRICT_CATEGORY_MAP[fuzzyStrictMatch];
        return {
            categoryId: ISHDASIZ_CATEGORIES[key],
            categoryKey: key,
            categoryName: getCategoryName(key),
            sourceCategory,
            sourceSubcategory,
            matchedBy: 'strict_match'
        };
    }

    // 1. Try to match by Source Category (mmk_group) KEYWORDS first
    if (safeCategory) {
        for (const rule of CATEGORY_RULES) {
            const matchedKeyword = findKeywordMatch(safeCategory, rule.keywords);
            if (matchedKeyword) {
                return {
                    categoryId: ISHDASIZ_CATEGORIES[rule.category],
                    categoryKey: rule.category,
                    categoryName: getCategoryName(rule.category),
                    sourceCategory,
                    sourceSubcategory,
                    matchedBy: 'category_keyword', // New match type
                    matchedKeyword
                };
            }
        }
    }

    // 2. Fallback to Title match
    for (const rule of CATEGORY_RULES) {
        const matchedKeyword = findKeywordMatch(safeTitle, rule.keywords);
        if (matchedKeyword) {
            return {
                categoryId: ISHDASIZ_CATEGORIES[rule.category],
                categoryKey: rule.category,
                categoryName: getCategoryName(rule.category),
                sourceCategory,
                sourceSubcategory,
                matchedBy: 'title_keyword',
                matchedKeyword
            };
        }
    }

    return {
        categoryId: ISHDASIZ_CATEGORIES.OTHER,
        categoryKey: 'OTHER',
        categoryName: 'Boshqa',
        sourceCategory,
        sourceSubcategory,
        matchedBy: 'default',
    };
}

function getCategoryName(key: CategoryKey): string {
    const names: Record<CategoryKey, string> = {
        IT: 'Axborot texnologiyalari',
        PRODUCTION: 'Sanoat va ishlab chiqarish',
        SERVICES: 'Xizmatlar',
        EDUCATION: 'Ta\'lim, madaniyat, sport',
        HEALTHCARE: 'Sog\'liqni saqlash',
        FINANCE: 'Moliya, iqtisod, boshqaruv',
        CONSTRUCTION: 'Qurilish',
        AGRICULTURE: 'Qishloq xo\'jaligi',
        TRANSPORT: 'Transport',
        SALES: 'Savdo va marketing',
        OTHER: 'Boshqa',
    };
    return names[key];
}
