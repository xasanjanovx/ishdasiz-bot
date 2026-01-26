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
    matchedBy: 'title_keyword' | 'default';
    matchedKeyword?: string;
}

export function mapOsonishCategory(
    sourceCategory: string,
    sourceSubcategory: string | null,
    jobTitle: string
): CategoryMappingResult {
    const safeTitle = jobTitle || '';

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
