/**
 * Telegram Bot Texts
 */

import {
    formatBenefits,
    formatLanguages,
    getEducationLabel,
    getExperienceLabel,
    getMappedValue,
    getGenderLabel,
    getWorkingDaysLabel,
    getWorkModeLabel
} from '../mappings';

export type BotLang = 'uz' | 'ru';

export const botTexts = {
    // Language
    selectLanguage: {
        uz: '<b>Assalomu alaykum!</b>\n<i>Botdan foydalanish tilini tanlang.</i>',
        ru: '<b>Здравствуйте!</b>\n<i>Выберите язык для использования бота.</i>'
    },
    languageChanged: {
        uz: '✅ Til o‘zgartirildi.',
        ru: '✅ Язык изменён.'
    },

    // Start / help
    startWelcome: {
        uz: "<b>• Assalomu Alaykum, hurmatli foydalanuvchi!</b>\n\n<i>Bot orqali tez va qulay tarzda <b>ISH</b> yoki <b>XODIM</b> topishingiz mumkin!\nHoziroq foydalanishni boshlang!</i>",
        ru: "<b>Здравствуйте | Добро пожаловать в ISHDASIZ!</b>\n\n<b>Здесь вы можете:</b>\n<blockquote><i>🎯 | Быстро найти работу или сотрудника\n🧾 | Управлять резюме и вакансиями в одном месте\n⚡ | Организовать подбор эффективнее\n🤖 | Использовать помощь ИИ.</i></blockquote>\n\n<i>Для продолжения нажмите <b>«Войти»</b>.</i>"
    },
    helpText: {
        uz: "<b>❓ | Yordam</b>\n\n<i>Agar savol yoki muammo bo‘lsa, adminga yozing: @ishdasiz_admin</i>",
        ru: "<b>❓ | Помощь</b>\n\n<i>Если есть вопрос или проблема, напишите админу: @ishdasiz_admin</i>"
    },
    logoutDone: {
        uz: '🚪 Siz akkauntdan chiqdingiz.',
        ru: '🚪 Вы вышли из аккаунта.'
    },

    // Auth
    askPhone: {
        uz: '<b>📱 Telefon raqamingizni yuboring:</b>',
        ru: '<b>📱 Отправьте номер телефона:</b>'
    },
    otpSent: {
        uz: '<b>✉️ Tasdiqlash kodi SMS orqali yuborildi.</b>\n<i>Kodni kiriting:</i>',
        ru: '<b>✉️ Код подтверждения отправлен по SMS.</b>\n<i>Введите код:</i>'
    },
    otpInvalid: {
        uz: '❌ Kod noto‘g‘ri. Qaytadan kiriting:',
        ru: '❌ Неверный код. Введите снова:'
    },
    otpExpired: {
        uz: '⏳ Kod muddati tugadi. Jarayonni qaytadan boshlang.',
        ru: '⏳ Срок действия кода истёк. Начните заново.'
    },
    authSuccess: {
        uz: '✅ Tizimga muvaffaqiyatli kirdingiz.\n\nEndi profilingizni to‘ldiramiz.',
        ru: '✅ Вход выполнен успешно.\n\nДавайте заполним профиль.'
    },
    accountFound: {
        uz: '<b>🔐 | Sizda hisob mavjud</b>\nKirish usulini tanlang:',
        ru: '<b>🔐 | Аккаунт найден</b>\nВыберите способ входа:'
    },
    enterPassword: {
        uz: '<b>🔐 Parolni kiriting:</b>',
        ru: '<b>🔐 Введите пароль:</b>'
    },
    createPasswordPrompt: {
        uz: '<b>🔐 Yangi parol o‘rnating</b>\n<i>(kamida 6 ta belgi)</i>',
        ru: '<b>🔐 Создайте новый пароль</b>\n<i>(минимум 6 символов)</i>'
    },
    createPasswordConfirmPrompt: {
        uz: '<b>🔐 Parolni qayta kiriting</b>\n<i>Tasdiqlash uchun bir xil parol kiriting.</i>',
        ru: '<b>🔐 Повторите пароль</b>\n<i>Введите тот же пароль для подтверждения.</i>'
    },
    passwordInvalid: {
        uz: '<b>❌ Parol noto‘g‘ri.</b>\n<i>Iltimos, qayta kiriting.</i>',
        ru: '<b>❌ Неверный пароль.</b>\n<i>Пожалуйста, введите снова.</i>'
    },
    passwordTooShort: {
        uz: "<b>❌ Parol juda qisqa.</b>\n<i>Kamida 6 ta belgi kiriting.</i>",
        ru: '<b>❌ Пароль слишком короткий.</b>\n<i>Введите минимум 6 символов.</i>'
    },
    passwordMismatch: {
        uz: "<b>❌ Parollar mos kelmadi.</b>\n<i>Qaytadan urinib ko‘ring.</i>",
        ru: '<b>❌ Пароли не совпали.</b>\n<i>Попробуйте ещё раз.</i>'
    },
    passwordCreated: {
        uz: '<b>✅ Parol saqlandi.</b>',
        ru: '<b>✅ Пароль сохранён.</b>'
    },
    passwordNotSet: {
        uz: "<b>ℹ️ Parol hali o‘rnatilmagan.</b>\n<i>SMS orqali kiring va parol o‘rnating.</i>",
        ru: '<b>ℹ️ Пароль ещё не создан.</b>\n<i>Войдите через SMS и создайте пароль.</i>'
    },
    accountLocked: {
        uz: '<b>❌ Akkaunt vaqtincha bloklandi.</b>',
        ru: '<b>❌ Аккаунт временно заблокирован.</b>'
    },
    loginSuccess: {
        uz: '✅ Xush kelibsiz!',
        ru: '✅ Добро пожаловать!'
    },

    // Resume flow
    askRegion: {
        uz: '<b>📍 | Joylashuv (viloyat) tanlang</b>\n<i>Qaysi hududda ishlamoqchisiz?</i>',
        ru: '<b>📍 | Выберите регион</b>\n<i>В каком регионе хотите работать?</i>'
    },
    askDistrict: {
        uz: '<b>🏙️ | Tuman/Shaharni tanlang</b>',
        ru: '<b>🏙️ | Выберите район/город</b>'
    },
    askDistrictWithCounts: {
        uz: '<b>🏙️ | Tuman/Shaharni tanlang</b>\n<i>Qavs ichidagi raqam — shu hududdagi jami vakansiyalar soni.</i>',
        ru: '<b>🏙️ | Выберите район/город</b>\n<i>Число в скобках — количество вакансий в этом районе.</i>'
    },
    askCategory: {
        uz: '<b>🧭 | Faoliyat sohangizni tanlang</b>\n<i>Bir nechta kategoriya tanlashingiz mumkin.</i>\n<i>Qavs ichidagi son — tanlangan joylashuv bo‘yicha vakansiyalar soni.</i>',
        ru: '<b>🧭 | Выберите сферу деятельности</b>\n<i>Можно выбрать несколько категорий.</i>\n<i>Число в скобках — количество вакансий по выбранной локации.</i>'
    },
    askField: {
        uz: '<b>🧭 | Lavozimga yaqin bo‘lgan kasbni tanlang</b>\n<i>Kasb nomini yozib qidiring (kamida 3 ta harf).</i>',
        ru: '<b>🧭 | Выберите профессию, близкую к должности</b>\n<i>Можно искать по названию профессии (минимум 3 буквы).</i>'
    },
    fieldMinChars: {
        uz: '<b>🧭 | Kamida 3 ta harf kiriting</b>\n<i>Masalan: hisobchi, sotuvchi, dasturchi.</i>\n<i>Shundan keyin mos kasblar ro‘yxati chiqadi.</i>',
        ru: '<b>🧭 | Введите минимум 3 буквы</b>\n<i>Например: бухгалтер, продавец, программист.</i>\n<i>После этого появится список подходящих профессий.</i>'
    },
    fieldNoResults: {
        uz: '<b>🔎 | Kasb topilmadi</b>\n<i>Boshqacha yoki aniqroq yozib ko‘ring (kamida 3 ta harf).</i>',
        ru: '<b>⚠️ | Точная профессия не найдена</b>\n<i>Попробуйте более простое или другое написание (минимум 3 буквы).</i>'
    },
    fieldInvalidAlphabet: {
        uz: '<b>🧭 | Kasbni uzbek lotin alifbosida yozing</b>\n<i>Masalan: hisobchi, marketolog, dasturchi.</i>',
        ru: '<b>🧭 | Введите профессию на русском алфавите</b>\n<i>Например: бухгалтер, маркетолог, программист.</i>'
    },
    titleTooShort: {
        uz: '<b>🧾 | Lavozim nomi juda qisqa</b>\n<i>Kamida 3 ta harf yozing.</i>',
        ru: '<b>🧾 | Слишком короткое название должности</b>\n<i>Введите минимум 3 буквы.</i>'
    },
    titleNotRecognized: {
        uz: '<b>🔎 | Bu lavozim topilmadi</b>\n<i>Lavozimni sodda va aniq yozing. Masalan: hisobchi, sotuvchi, dasturchi.</i>',
        ru: '<b>⚠️ | Такая должность не найдена</b>\n<i>Пожалуйста, укажите должность точнее.</i>'
    },
    titleInvalidAlphabet: {
        uz: '<b>🧾 | Lavozimni uzbek lotin alifbosida yozing</b>\n<i>Masalan: Bosh hisobchi, Sotuvchi, Dasturchi.</i>',
        ru: '<b>🧾 | Введите должность на русском алфавите</b>\n<i>Например: Главный бухгалтер, Продавец, Программист.</i>'
    },
    titleSuggestions: {
        uz: '<b>🧭 | Aniq topilmadi. Siz quyidagilardan birini nazarda tutdingizmi?</b>\n<i>Mos variantni tanlang yoki kasb nomini qayta yozing (kamida 3 ta harf).</i>',
        ru: '<b>🧾 | Точно не найдено. Возможно, вы имели в виду?</b>\n<i>Выберите один из вариантов ниже.</i>'
    },
    askExperience: {
        uz: '<b>🧠 | Ish tajribangizni tanlang</b>',
        ru: '<b>🧠 | Выберите опыт работы</b>'
    },
    askEducation: {
        uz: '<b>🎓 | Ma’lumotingizni tanlang</b>',
        ru: '<b>🎓 | Выберите образование</b>'
    },
    askGender: {
        uz: '<b>🚻 | Jinsingizni tanlang</b>',
        ru: '<b>🚻 | Выберите пол</b>'
    },
    askBirthDate: {
        uz: '<b>📅 | Tug‘ilgan sanangizni kiriting</b>\n<i>kk.oo.yyyy</i>\n<i>Masalan: 25.04.2002</i>',
        ru: '<b>📅 | Введите дату рождения</b>\n<i>дд.мм.гггг</i>'
    },
    birthDateInvalid: {
        uz: '❌ Sana noto‘g‘ri. Iltimos, kk.oo.yyyy formatida kiriting.',
        ru: '❌ Неверная дата. Введите в формате дд.мм.гггг.'
    },
    invalidAlphabet: {
        uz: "❌ Tanlangan tilga mos alifboda yozing (uz: lotin, ru: кириллица).",
        ru: '❌ Пишите в алфавите выбранного языка (uz: латиница, ru: кириллица).'
    },
    askSpecialCriteria: {
        uz: '<b>✨ | Alohida toifalarga kirasizmi? (ixtiyoriy)</b>\n<i>Moslarini belgilang yoki “Davom etish”ni bosing.</i>',
        ru: '<b>✨ | Относитесь к особым категориям? (необязательно)</b>\n<i>Выберите подходящее или нажмите “Продолжить”.</i>'
    },
    askSalary: {
        uz: '<b>💰 | Kutilayotgan maosh (so‘m)</b>',
        ru: '<b>💰 | Ожидаемая зарплата (сум)</b>'
    },
    askSalaryMax: {
        uz: '<b>💰 | Maksimal maosh (so‘m)</b>',
        ru: '<b>💰 | Максимальная зарплата (сум)</b>'
    },
    askEmploymentType: {
        uz: '<b>🕒 | Ish turi (bandlik)</b>',
        ru: '<b>🕒 | Тип занятости</b>'
    },
    askWorkMode: {
        uz: '<b>🧭 | Ish usuli (rejimi)</b>',
        ru: '<b>🧭 | Режим работы</b>'
    },
    askWorkingDays: {
        uz: '<b>📆 | Ish grafigi (kunlar)</b>',
        ru: '<b>📆 | График работы (дни)</b>'
    },
    askSubscriptionFrequency: {
        uz: '<b>🔔 | Xabarnoma chastotasi</b>\n<i>Mos variantni tanlang.</i>',
        ru: '<b>🔔 | Частота уведомлений</b>\n<i>Выберите подходящий вариант.</i>'
    },
    askTitle: {
        uz: '<b>🧾 | Qaysi lavozimda ishlamoqchisiz?</b>\n<i>Masalan: Ingliz tili o\'qituvchisi, Shifokor, Operator, Dasturchi</i>',
        ru: '<b>🧾 | На какой должности хотите работать?</b>\n<i>Например: Учитель, Бухгалтер, Продавец, Оператор, Водитель</i>'
    },
    askName: {
        uz: '<b>🪪 | To‘liq ismingizni kiriting (F.I.O)</b>',
        ru: '<b>🪪 | Введите полное имя (Ф.И.О)</b>'
    },
    nameTooShort: {
        uz: '<b>🪪 | Ism-familiya juda qisqa</b>\n<i>Kamida 3 ta harf kiriting.</i>',
        ru: '<b>🪪 | Слишком короткое Ф.И.О.</b>\n<i>Введите минимум 3 буквы.</i>'
    },
    askAbout: {
        uz: '<b>📝 | O‘zingiz haqingizda qo‘shimcha ma’lumot (qisqacha).</b>\n<i>AI Yordamchining variantini qo‘llashingiz yoki o‘zingiz yozishingiz mumkin.</i>',
        ru: '<b>📝 | Дополнительная информация о себе (кратко) — необязательно.</b>\n<i>Можно использовать вариант AI или написать свой текст.</i>'
    },
    resumeLanguagesPrompt: {
        uz: "<b>🗣️ | Biladigan tillaringizni tanlang (ixtiyoriy)</b>\n<i>Tugmalar orqali belgilang yoki o'zingiz yozing.</i>\n<i>So‘ng “Davom etish”ni bosing.</i>",
        ru: '<b>🗣️ | Выберите языки, которые знаете (необязательно)</b>\n<i>Отметьте через кнопки или впишите вручную.</i>\n<i>Затем нажмите “Продолжить”.</i>'
    },
    askSkills: {
        uz: '<b>🧠 | Asosiy ko‘nikmalaringizni kiriting</b>\n<i>Masalan: Word, Excel, Mijozlar bilan muloqot.</i>\n<i>Ko‘nikmalarni o‘zingiz yozishingiz yoki AI tavsiyasi bilan davom etishingiz mumkin.</i>',
        ru: '<b>🧠 | Укажите основные навыки</b>\n<i>Например: Excel, 1C, CRM.</i>\n<i>Можно написать вручную или продолжить с AI-рекомендацией.</i>'
    },
    askWorkplace: {
        uz: '<b>🏢 | Ishlagan joyingiz va lavozimingiz.</b>\n<i>Masalan: “24-maktab — Ingliz tili o‘qituvchisi”</i>',
        ru: '<b>🏢 | Где вы работали и на какой должности.</b>\n<i>Например: “Школа №24 — учитель английского”</i>'
    },
    askWorkStartYear: {
        uz: '<b>📅 | Ish boshlagan yilni kiriting.</b>\n<i>Masalan: 2019</i>',
        ru: '<b>📅 | Укажите год начала работы.</b>\n<i>Например: 2019</i>'
    },
    askWorkEndYear: {
        uz: '<b>📅 | Ish tugagan yilni kiriting.</b>\n<i>Agar hozir ishlayotgan bo‘lsangiz: “Hozir ham ishlayman” tugmasini bosing</i>',
        ru: '<b>📅 | Укажите год окончания работы.</b>\n<i>Если работаете сейчас — нажмите “Работаю сейчас”</i>'
    },
    workStartYearInvalid: {
        uz: '<b>📅 | Boshlanish yili noto‘g‘ri.</b>\n<i>Masalan: 2019</i>',
        ru: '<b>📅 | Неверный год начала.</b>\n<i>Например: 2019</i>'
    },
    workEndYearInvalid: {
        uz: '<b>📅 | Tugash yili noto‘g‘ri.</b>\n<i>Masalan: 2022 yoki “Hozir”</i>',
        ru: '<b>📅 | Неверный год окончания.</b>\n<i>Например: 2022 или “Сейчас”</i>'
    },
    askEducationPlace: {
        uz: '<b>🎓 | O‘qigan joyingiz va yo\'nalishingizni yozing.</b>\n<i>Masalan: “Andijon davlat universiteti — Axborot texnologiyalari”</i>',
        ru: '<b>🎓 | Укажите место учебы и направление.</b>\n<i>Например: “Андижанский госуниверситет — IT”</i>'
    },
    askEducationStartYear: {
        uz: '<b>📅 | O‘qishni boshlagan yilni kiriting.</b>\n<i>Masalan: 2016</i>',
        ru: '<b>📅 | Укажите год начала обучения.</b>\n<i>Например: 2016</i>'
    },
    askEducationEndYear: {
        uz: '<b>📅 | O‘qishni tugatgan yilni kiriting.</b>\n<i>Agar hozir o‘qiyotgan bo‘lsangiz: “Hozir ham o‘qiyapman” tugmasini bosing</i>',
        ru: '<b>📅 | Укажите год окончания обучения.</b>\n<i>Если учитесь сейчас — нажмите “Учусь сейчас”</i>'
    },
    educationStartYearInvalid: {
        uz: '<b>📅 | Boshlanish yili noto‘g‘ri.</b>\n<i>Masalan: 2016</i>',
        ru: '<b>📅 | Неверный год начала.</b>\n<i>Например: 2016</i>'
    },
    educationEndYearInvalid: {
        uz: '<b>📅 | Tugash yili noto‘g‘ri.</b>\n<i>Masalan: 2020 yoki “Hozir”</i>',
        ru: '<b>📅 | Неверный год окончания.</b>\n<i>Например: 2020 или “Сейчас”</i>'
    },
    skillAdded: {
        uz: '<b>Qo‘shildi:</b>',
        ru: '<b>Добавлено:</b>'
    },
    entryContinueHint: {
        uz: '<i>Yana qo‘shishingiz mumkin yoki “Davom etish”ni bosing.</i>',
        ru: '<i>Можно добавить ещё или нажмите “Продолжить”.</i>'
    },
    skillDeleted: {
        uz: '🗑️ O‘chirildi',
        ru: '🗑️ Удалено'
    },
    resumeSaved: {
        uz: "Ma'lumotlar saqlandi.",
        ru: 'Данные сохранены.'
    },
    locationRequest: {
        uz: '<b>📍 | Iltimos, joylashuvni yuboring.</b>\n<i>Agar kompyuterdan foydalansangiz, skrepka orqali “Joylashuv” yuborishingiz mumkin.</i>',
        ru: '<b>📍 | Пожалуйста, отправьте локацию.</b>\n<i>Если вы за ПК, можно отправить через скрепку «Локация».</i>'
    },
    locationAccepted: {
        uz: '<b>✅ Joylashuv qabul qilindi.</b>',
        ru: '<b>✅ Локация принята.</b>'
    },
    locationSkipped: {
        uz: '<b>✅ Joylashuv o‘tkazib yuborildi.</b>',
        ru: '<b>✅ Локация пропущена.</b>'
    },

    // Main menu
    mainMenu: {
        uz: '🏠 | <b>Asosiy menyu</b>\n<i>Kerakli bo‘limni tanlang.</i>',
        ru: '🏠 | <b>Главное меню</b>\n<i>Выберите нужный раздел.</i>'
    },

    // Jobs
    searchingJobs: {
        uz: '<b>🔎 | Mos vakansiyalar qidirilmoqda...</b>',
        ru: '<b>🔎 | Идёт поиск подходящих вакансий...</b>'
    },
    noJobsFound: {
        uz: '<b>❌ Afsuski, hozircha mos vakansiyalar yo‘q.</b>',
        ru: '<b>❌ Подходящих вакансий пока нет.</b>'
    },
    noJobsByProfession: {
        uz: "<b>ℹ️ Tanlangan kasb bo‘yicha aniq vakansiya topilmadi.</b>\n<i>Sizga mos kelishi mumkin bo‘lgan vakansiyalar ko‘rsatiladi.</i>",
        ru: '<b>ℹ️ Точных вакансий по выбранной профессии не найдено.</b>\n<i>Показаны вакансии, которые могут вам подойти.</i>'
    },
    noDistrictJobs: {
        uz: '<b>ℹ️ Bu tumanda mos vakansiyalar topilmadi.</b>\nViloyatingizdagi boshqa tuman/shaharlarda vakansiyalar mavjud:',
        ru: 'ℹ️ В этом районе подходящих вакансий нет. Вот районы/города вашей области с вакансиями:'
    },
    noRegionJobs: {
        uz: '<b>ℹ️ Bu viloyatda mos vakansiyalar topilmadi.</b>\nBoshqa viloyatlarda mos vakansiyalar mavjud:',
        ru: 'ℹ️ В этой области подходящих вакансий нет. Вот другие области с вакансиями:'
    },
    otherDistrictsHint: {
        uz: '📍 Boshqa tuman/shaharlarda ham vakansiyalar mavjud:',
        ru: '📍 В других районах/городах также есть вакансии:'
    },
    conditionalMatchWarning: {
        uz: (reason: 'education' | 'experience' | 'both') => {
            if (reason === 'both') return '⚠️ <i>shartli ravishda mos kelishi mumkin: ma’lumot va tajriba mos emas.</i>';
            if (reason === 'education') return '⚠️ <i>shartli ravishda mos kelishi mumkin: ma’lumot mos emas.</i>';
            return '⚠️ <i>shartli ravishda mos kelishi mumkin: tajriba mos emas.</i>';
        },
        ru: (reason: 'education' | 'experience' | 'both') => {
            if (reason === 'both') return '⚠️ <i>условно может подойти: образование и опыт не совпадают.</i>';
            if (reason === 'education') return '⚠️ <i>условно может подойти: образование не совпадает.</i>';
            return '⚠️ <i>условно может подойти: опыт не совпадает.</i>';
        }
    },
    noResumesByProfession: {
        uz: 'ℹ️ Bu lavozimga aniq mos rezyume topilmadi. Yaqin rezyumelarni ko‘rishingiz mumkin.',
        ru: 'ℹ️ Точных резюме по этой должности не найдено. Можно посмотреть близкие резюме.'
    },
    noCandidatesForJob: {
        uz: "📭 | Afsuski, bu vakansiya uchun hozircha mos nomzodlar topilmadi.\n\n🤖 | Yangi nomzodlar paydo bo‘lsa, tizim sizga mos rezyumelarni tavsiya qiladi.",
        ru: '📭 | К сожалению, по этой вакансии пока нет подходящих кандидатов.\n\n🤖 | Как только появятся новые кандидаты, система предложит вам релевантные резюме.'
    },
    noResumeWarning: {
        uz: "⚠️ Avval rezyumeni to'ldiring.",
        ru: '⚠️ Сначала создайте резюме.'
    },
    jobsFound: {
        uz: (count: number) => `<b>✅ ${count} ta vakansiya topildi</b>`,
        ru: (count: number) => `<b>✅ Найдено ${count} вакансий</b>`
    },
    searchModePrompt: {
        uz: '<b>🔎 | Rezyume bo‘yicha qidiruv</b>',
        ru: '<b>🔎 | Поиск по резюме</b>'
    },
    savedEmpty: {
        uz: '⭐ Saqlanganlar bo‘limi hozircha bo‘sh.',
        ru: '⭐ Сохранённые пока пусты.'
    },
    favoriteAdded: {
        uz: "✅ Saqlab qo'yildi.",
        ru: '✅ Сохранено.'
    },
    favoriteRemoved: {
        uz: "🗑️ Saqlangandan olib tashlandi.",
        ru: '🗑️ Удалено из сохранённых.'
    },
    applicationSent: {
        uz: '<b>✅ Ariza muvaffaqiyatli yuborildi.</b>',
        ru: '<b>✅ Заявка успешно отправлена.</b>'
    },
    applicationAlertEmployer: {
        uz: (fullName: string, jobTitle: string) => `📩 | Yangi ariza kelib tushdi.\n\n👤 | Nomzod: <b>${fullName}</b>\n💼 | Vakansiya: <b>${jobTitle}</b>\n\nArizani ko‘rish uchun tugmani bosing.`,
        ru: (fullName: string, jobTitle: string) => `📩 | Новый отклик по вакансии.\n\n👤 | Кандидат: <b>${fullName}</b>\n💼 | Вакансия: <b>${jobTitle}</b>\n\nНажмите кнопку, чтобы открыть отклик.`
    },
    applicationExists: {
        uz: '<b>№️⃣ Siz ushbu vakansiyaga avval ariza yuborgansiz.</b>',
        ru: '<b>№️⃣ Вы уже отправляли отклик на эту вакансию.</b>'
    },
    offersTitle: {
        uz: '<b>📨 | Takliflar bo‘limi</b>',
        ru: '<b>📨 | Раздел приглашений</b>'
    },
    noOffers: {
        uz: "📭 | Hozircha takliflar yo'q.\n\nYangi ishga takliflar shu yerda ko‘rinadi.",
        ru: '📭 | Пока приглашений нет.\n\nНовые приглашения будут отображаться здесь.'
    },
    offerConfirmPrompt: {
        uz: (candidateName: string, jobTitle: string) => `📨 | Ishga taklif yuborasizmi?\n\n👤 | Nomzod: <b>${candidateName}</b>\n💼 | Vakansiya: <b>${jobTitle}</b>`,
        ru: (candidateName: string, jobTitle: string) => `📨 | Отправить приглашение на работу?\n\n👤 | Кандидат: <b>${candidateName}</b>\n💼 | Вакансия: <b>${jobTitle}</b>`
    },
    offerSentEmployer: {
        uz: '<b>✅ | Ishga taklif yuborildi.</b>',
        ru: '<b>✅ | Приглашение отправлено.</b>'
    },
    offerAlreadySent: {
        uz: "<b>ℹ️ | Bu nomzodga ushbu vakansiya bo‘yicha taklif allaqachon yuborilgan.</b>",
        ru: '<b>ℹ️ | Этому кандидату уже отправлено приглашение по данной вакансии.</b>'
    },
    offerReceivedSeeker: {
        uz: (companyName: string, jobTitle: string) => `<b>📩 | Tabriklaymiz! Sizni ishga taklif qilishdi.</b>\n\n🏢 | Tashkilot: <b>${companyName}</b>\n💼 | Vakansiya: <b>${jobTitle}</b>\n\nVakansiya tafsilotlari quyida keltirilgan.`,
        ru: (companyName: string, jobTitle: string) => `📩 | Поздравляем! Вас пригласили на работу.\n\n🏢 | Компания: <b>${companyName}</b>\n💼 | Вакансия: <b>${jobTitle}</b>\n\nДетали вакансии показаны ниже.`
    },

    // Profile / settings
    settings: {
        uz: '<b>⚙️ | Sozlamalar</b>\n<i>Kerakli bo‘limni tanlang.</i>',
        ru: '<b>⚙️ | Настройки</b>\n<i>Выберите нужный раздел.</i>'
    },
    error: {
        uz: '❌ Tizimda xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.',
        ru: '❌ Произошла ошибка. Попробуйте позже.'
    },
    unknownCommand: {
        uz: 'Noto‘g‘ri buyruq. Menyu tugmalaridan foydalaning.',
        ru: 'Неверная команда. Используйте меню.'
    },
    matchScore: {
        uz: (score: number) => `<b>Mos kelish: ${score}%</b>`,
        ru: (score: number) => `<b>Совпадение: ${score}%</b>`
    },
    resumeMenu: {
        uz: '<b>🧾 | Rezyume</b>\n\n<i>Rezyumeni ko‘rish yoki tahrirlash:</i>',
        ru: '<b>🧾 | Резюме</b>\n\n<i>Просмотр или редактирование:</i>'
    },

    // Roles / employer
    selectRole: {
        uz: '👥 | <b>Platformaga kim sifatida kirmoqchisiz?</b>\n<i>Kerakli rolni tanlang.</i>',
        ru: '👥 | <b>Кто вы на платформе?</b>\n<i>Выберите нужную роль.</i>'
    },
    roleSeeker: {
        uz: 'Ish qidiruvchi',
        ru: 'Соискатель'
    },
    roleEmployer: {
        uz: 'Ish beruvchi',
        ru: 'Работодатель'
    },
    employerWelcome: {
        uz: "<b>🏢 | Ish beruvchi bo'limiga xush kelibsiz.</b>\n\n<i>Vakansiyalaringizni boshqarish, arizalarni ko‘rish va mos ishchilarni topish uchun menyudan bo‘lim tanlang.</i>",
        ru: "<b>🏢 | Добро пожаловать в кабинет работодателя.</b>\n\n<i>Выберите раздел меню: управляйте вакансиями, откликами и подбором кандидатов.</i>"
    },
    employerMainMenu: {
        uz: "🏢 | <b>Ish beruvchi menyusi</b>\n<i>Vakansiya, ariza va ishchi qidiruvi bo‘yicha bo‘limni tanlang.</i>",
        ru: "🏢 | <b>Панель работодателя</b>\n<i>Выберите нужный раздел по вакансиям и кандидатам.</i>"
    },
    adminMenuTitle: {
        uz: '🛡️ | <b>Admin paneli</b>\n<i>Kerakli bo‘limni tanlang.</i>',
        ru: '🛡️ | <b>Админ-панель</b>\n<i>Выберите нужный раздел.</i>'
    },
    adminAccessDenied: {
        uz: "⛔ Sizda admin huquqi yo'q.",
        ru: '⛔ У вас нет прав администратора.'
    },
    adminStatsTitle: {
        uz: '📊 | <b>Bot statistikasi</b>',
        ru: '📊 | <b>Статистика бота</b>'
    },
    adminNoOffenders: {
        uz: '✅ Hozircha qoidabuzarlik qayd etilmagan.',
        ru: '✅ Нарушений пока не зафиксировано.'
    },
    adminBroadcastPrompt: {
        uz: "<b>📣 | Hammaga yuboriladigan xabarni yuboring</b>\n<i>Matn, rasm, video yoki fayl yuborishingiz mumkin. Xabar aynan o‘zi bilan jo‘natiladi.</i>",
        ru: '<b>📣 | Отправьте сообщение для массовой рассылки</b>\n<i>Можно отправить текст, фото, видео или файл. Сообщение будет отправлено в исходном виде.</i>'
    },
    adminBroadcastConfirm: {
        uz: '<b>📣 | Quyidagi xabarni yuborasizmi?</b>',
        ru: '<b>📣 | Отправить следующее сообщение?</b>'
    },
    adminBroadcastStarted: {
        uz: '⏳ | Xabar yuborish boshlandi...',
        ru: '⏳ | Рассылка запущена...'
    },
    adminBroadcastDone: {
        uz: (success: number, failed: number, blocked: number) =>
            `<b>✅ | Xabar yuborish yakunlandi</b>\n\nYuborildi: <b>${success}</b>\nXatolik: <b>${failed}</b>\nBloklaganlar: <b>${blocked}</b>`,
        ru: (success: number, failed: number, blocked: number) =>
            `<b>✅ | Рассылка завершена</b>\n\nОтправлено: <b>${success}</b>\nОшибок: <b>${failed}</b>\nЗаблокировали бота: <b>${blocked}</b>`
    },
    employerProfileIntro: {
        uz: '<b>🏢 | Ish beruvchi profili</b>',
        ru: '<b>🏢 | Профиль работодателя</b>'
    },
    companyNamePrompt: {
        uz: '<b>🏢 | Tashkilot nomini kiriting</b>\n<i>Masalan: “Andijon Textile MCHJ”</i>',
        ru: '<b>🏢 | Введите название организации</b>\n<i>Например: “Andijon Textile LLC”</i>'
    },
    employerDirectorPrompt: {
        uz: '<b>👤 | Mas’ul shaxs (HR menejeri)</b>\n<i>Masalan: Azizbek Mamadiyev</i>',
        ru: '<b>👤 | Ответственное лицо (HR менеджер)</b>\n<i>Например: Азизбек Мамадиев</i>'
    },
    employerIndustryPrompt: {
        uz: '<b>🏭 | Faoliyat sohasi</b>',
        ru: '<b>🏭 Сфера деятельности</b>'
    },
    employerSizePrompt: {
        uz: '<b>👥 | Tashkilot hajmi</b>',
        ru: '<b>👥 Размер компании</b>'
    },
    employerRegionPrompt: {
        uz: '<b>📍 | Tashkilot joylashuvi (viloyat)</b>',
        ru: '<b>📍 Регион организации</b>'
    },
    employerDistrictPrompt: {
        uz: '<b>🏙️ | Tuman/Shaharni tanlang</b>',
        ru: '<b>🏙️ Выберите район/город</b>'
    },
    employerAddressPrompt: {
        uz: '<b>📌 | Ish joy manzili</b>\n<i>Masalan: Andijon sh., Bobur ko‘chasi 12</i>',
        ru: '<b>📌 Адрес работы</b>\n<i>Например: г. Андижан, ул. Бобур, 12</i>'
    },
    employerDescriptionPrompt: {
        uz: '<b>📝 | Tashkilot haqida qisqacha</b>\n<i>Masalan: “To‘qimachilik korxonasi, 120+ xodim”</i>',
        ru: '<b>📝 Коротко о компании</b>\n<i>Например: “Текстильная компания, 120+ сотрудников”</i>'
    },
    jobCreateMode: {
        uz: '<b>📢 | Vakansiya kiritish usulini tanlang</b>',
        ru: '<b>📢 | Выберите способ создания вакансии</b>'
    },
    aiJobPrompt: {
        uz: '🤖 Vakansiya matnini yuboring. AI avtomatik to‘ldiradi.',
        ru: '🤖 Отправьте текст вакансии. AI заполнит автоматически.'
    },
    jobAddressPrompt: {
        uz: '<b>📌 Ish joy manzilini yozing</b>\n<i>Masalan: Andijon sh., Bobur ko‘chasi 12</i>',
        ru: '<b>📌 Укажите адрес работы</b>\n<i>Например: г. Андижан, ул. Бобур 12</i>'
    },
    jobWorkModePrompt: {
        uz: '<b>🏷️ | Ish usuli</b>',
        ru: '<b>🏷️ Формат работы</b>\n<i>Например: Офис / Удалённо / Гибрид</i>'
    },
    jobEmploymentPrompt: {
        uz: '<b>💼 | Bandlik turi</b>',
        ru: '<b>💼 Тип занятости</b>\n<i>Например: Полная ставка или Неполная</i>'
    },
    jobWorkingDaysPrompt: {
        uz: '<b>📅 | Ish kunlari</b>',
        ru: '<b>📅 График</b>\n<i>Например: 5-дневка или 6-дневка</i>'
    },
    jobWorkingHoursPrompt: {
        uz: "<b>⏰ | Ish vaqti</b>\n<i>Quyidagi variantni tanlang yoki o'zingiz yozing.</i>\n<i>Masalan: 07:30-16:30 yoki 14:00-22:00</i>",
        ru: '<b>⏰ | Время работы</b>\n<i>Выберите вариант или введите вручную.</i>\n<i>Например: 07:30-16:30 или 14:00-22:00</i>'
    },
    jobExperiencePrompt: {
        uz: '<b>🧠 | Tajriba talabi</b>',
        ru: '<b>🧠 Требуемый опыт</b>\n<i>Например: 1-3 года или 3+ лет</i>'
    },
    jobEducationPrompt: {
        uz: "<b>🎓 | Ma'lumot talabi</b>",
        ru: '<b>🎓 Требуемое образование</b>\n<i>Например: Среднее специальное или Высшее</i>'
    },
    jobGenderPrompt: {
        uz: '<b>🚻 Jins talabi</b>\n<i>Ahamiyatsiz bo‘lsa “Ahamiyatsiz”ni tanlang</i>',
        ru: '<b>🚻 Требование по полу</b>\n<i>Если не важно, выберите “Не важно”</i>'
    },
    jobAgePrompt: {
        uz: '<b>📊 | Yosh oralig‘i</b>\n<i>Masalan: 18-35</i>\n<i>Muhim bo‘lmasa, “Ahamiyatsiz”ni tanlang.</i>',
        ru: '<b>📊 | Возраст</b>\n<i>Например: 18-35</i>\n<i>Если не важно, выберите “Не важно”.</i>'
    },
    jobAgeInvalid: {
        uz: '<b>❗ Yosh oralig‘i noto‘g‘ri.</b>\n<i>Faqat shu formatda kiriting: 18-35</i>',
        ru: '<b>❗ Возраст указан неверно.</b>\n<i>Используйте только формат: 18-35</i>'
    },
    jobSpecialCriteriaPrompt: {
        uz: "<b>✨ | Nomzod uchun qo'shimcha mezonlar (ixtiyoriy)</b>\n<i>Agar vakansiya talaba, bitiruvchi yoki nogironligi bo‘lgan nomzodlarga ham mos kelishi mumkin bo‘lsa, belgilang.</i>",
        ru: '<b>✨ | Дополнительные критерии для кандидата (необязательно)</b>\n<i>Отметьте, если вакансия подходит студентам, выпускникам или людям с инвалидностью.</i>'
    },
    jobLanguagesPrompt: {
        uz: "<b>🗣️ | Tillar (ixtiyoriy)</b>\n<i>Tugmalar orqali tanlang yoki o'zingiz yozing.</i>\n<i>So‘ng “Davom etish”ni bosing.</i>",
        ru: '<b>🗣️ | Языки (необязательно)</b>\n<i>Выберите через кнопки или впишите вручную.</i>\n<i>Затем нажмите “Продолжить”.</i>'
    },
    jobBenefitsPrompt: {
        uz: "<b>🛎️ | Sharoitlar (ixtiyoriy)</b>\n<i>Tugmalar orqali tanlang yoki o'zingiz yozing.</i>\n<i>So‘ng “Davom etish”ni bosing.</i>\n<i>Masalan:</i>\n<i>- tibbiy sug‘urta</i>\n<i>- moslashuvchan ish vaqti</i>\n<i>- o‘qitish va rivojlanish imkoniyati</i>",
        ru: '<b>🛎️ | Условия (необязательно)</b>\n<i>Пишите по одному пункту с новой строки.</i>\n<i>Например:</i>\n<i>- официальное оформление</i>\n<i>- ежемесячный бонус</i>\n<i>- бесплатный обед</i>'
    },
    jobHrPrompt: {
        uz: '<b>👤 | HR menejer (F.I.O)</b>\n<i>Masalan: Azizbek Mamadiyev</i>',
        ru: '<b>👤 HR менеджер (Ф.И.О.)</b>\n<i>Например: Азизбек Мамадиев</i>'
    },
    jobContactPrompt: {
        uz: '<b>📞 | Aloqa telefoni</b>\n<i>Masalan: +998901234567</i>',
        ru: '<b>📞 Контактный телефон</b>\n<i>Например: +998901234567</i>'
    },

    // Employer posting
    postJobTitle: {
        uz: "<b>📝 | Qanday ishchi qidiryapsiz? (lavozim)</b>\n<i>Kamida 3 ta harf kiriting.</i>\n<i>Masalan: Boshqaruvchi, Bosh buxgalter, HR menejer, SMM menejer, Dasturchi</i>",
        ru: '<b>📝 Какого сотрудника вы ищете? (должность)</b>\n<i>Введите минимум 3 буквы.</i>\n<i>Например: Руководитель, Главный бухгалтер, HR-менеджер, SMM-менеджер, Разработчик</i>'
    },
    postJobCategory: {
        uz: '<b>🧭 | Vakansiya sohasini tanlang</b>',
        ru: '<b>🧭 | Выберите сферу вакансии</b>'
    },
    postJobSalary: {
        uz: '<b>💰 | Minimal maosh qancha taklif qilasiz?</b>\n<i>Masalan: 3 000 000</i>\n<i>Summani yozing yoki “Kelishiladi” tugmasini bosing.</i>',
        ru: '<b>💰 Какую зарплату предлагаете?</b>\n<i>Например: 3 000 000.</i>\n<i>Введите сумму или нажмите кнопку “Договорная”.</i>'
    },
    postJobSalaryMax: {
        uz: '<b>💰 | Maksimal maosh (ixtiyoriy)</b>\n<i>Masalan: 8 000 000. Maksimum bo‘lmasa, “Davom etish”ni bosing.</i>',
        ru: '<b>💰 Максимальная зарплата (необязательно)</b>\n<i>Например: 8 000 000. Если максимума нет — нажмите “Продолжить”.</i>'
    },
    postJobRegion: {
        uz: '<b>📍 | Ish joyi qayerda?</b>\n<i>Viloyatni tanlang</i>',
        ru: '<b>📍 Где находится работа?</b>\n<i>Выберите область</i>'
    },
    postJobDescription: {
        uz: "<b>📌 | Talablar va vazifalar</b>\n<i>Masalan:</i>\n<i>- Jamoa bilan ishlash va vazifalarni vaqtida bajarish</i>\n<i>- Muloqot ko‘nikmasi va mas’uliyatlilik</i>\n<i>- Lavozim bo‘yicha aniq topshiriqlarni bajarish</i>",
        ru: '<b>📌 | Требования и обязанности</b>\n<i>Например:</i>\n<i>- Выполнять конкретные задачи по должности</i>\n<i>- Опыт работы от 1 года</i>\n<i>- Ответственность и умение работать в команде</i>'
    },
    jobLocationPrompt: {
        uz: "<b>📍 | Ish joyi lokatsiyasini yuboring</b>\n<i>Lokatsiyani tugma orqali yoki kompyuterda 📎 (skrepka) orqali yuborishingiz mumkin.</i>",
        ru: '<b>📍 | Отправьте геолокацию места работы</b>\n<i>Можно отправить через кнопку или через 📎 (скрепку) в Telegram Desktop.</i>'
    },
    fieldSearchLoading: {
        uz: '⏳ | Mos kasblar qidirilmoqda...',
        ru: '⏳ Идёт поиск подходящих профессий...'
    },
    workerSearchLoading: {
        uz: '<b>🔎 | Mos ishchilar qidirilmoqda...</b>',
        ru: '<b>⏳ Идёт поиск подходящих кандидатов...</b>'
    },
    postJobConfirm: {
        uz: (title: string) => `<b>📌 | Vakansiyani tekshiring va tasdiqlang</b>\n\n<i>“${title}”</i>`,
        ru: (title: string) => `<b>📌 | Проверьте и подтвердите вакансию</b>\n\n<i>«${title}»</i>`
    },
    jobPublished: {
        uz: '<b>✅ | Vakansiya joylandi!</b>\n\n<i>Endi “Ishchi topish” orqali mos nomzodlarni ko‘rishingiz mumkin.</i>',
        ru: '<b>✅ | Вакансия успешно опубликована!</b>\n\n<i>Теперь можно перейти в «Найти кандидатов» и посмотреть подходящих кандидатов.</i>'
    },
    myVacancies: {
        uz: 'Sizning vakansiyalaringiz:',
        ru: 'Ваши вакансии:'
    },
    noVacancies: {
        uz: 'Sizda hali vakansiyalar yo‘q.',
        ru: 'У вас пока нет вакансий.'
    },
    employerNoVacanciesHint: {
        uz: "<b>ℹ️ Hali vakansiya yo‘q.</b>\n<i>Yangi vakansiya joylash orqali boshlang.</i>",
        ru: '<b>ℹ️ Пока нет вакансий.</b>\n<i>Начните с публикации новой вакансии.</i>'
    },
    minThreeChars: {
        uz: '❗ Kamida 3 ta harf kiriting.',
        ru: '❗ Введите минимум 3 буквы.'
    },

    // Subscriptions
    subscriptionRequired: {
        uz: '<b>🔔 Davom etish uchun kanalga obuna bo‘ling.</b>\n<i>@ishdasizbot</i>',
        ru: '<b>🔔 Для продолжения подпишитесь на канал.</b>\n<i>@ishdasizbot</i>'
    },
    subscriptionSettings: {
        uz: '<b>🔔 | Obuna sozlamalari</b>',
        ru: '<b>🔔 | Настройки подписки</b>'
    },
    subscriptionSaved: {
        uz: '<b>✅ Obuna saqlandi.</b>',
        ru: '<b>✅ Подписка сохранена.</b>'
    },
    subscriptionDisabled: {
        uz: "<b>✅ Obuna o‘chirildi.</b>",
        ru: '<b>✅ Подписка отключена.</b>'
    },
    checkSubscription: {
        uz: 'Tekshirish',
        ru: 'Проверить'
    },
    notSubscribed: {
        uz: 'Siz hali obuna bo‘lmagansiz.',
        ru: 'Вы ещё не подписаны.'
    },

    // Multi-select categories
    categorySelected: {
        uz: '✅ Tanlandi. Yana qo‘shish yoki davom etish mumkin.',
        ru: '✅ Выбрано. Можно добавить ещё или продолжить.'
    },
    categoriesDone: {
        uz: 'Davom etish',
        ru: 'Продолжить'
    }
};

export function t(key: keyof typeof botTexts, lang: BotLang): string {
    const text = botTexts[key];
    if (typeof text === 'object' && 'uz' in text && 'ru' in text) {
        return text[lang] as string;
    }
    return String(text);
}

export function formatJobCard(job: any, lang: BotLang, matchScore?: number): string {
    const escape = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const na = lang === 'uz' ? "Ko'rsatilmagan" : 'Не указано';
    const rawTitle = job?.raw_source_json?.title || job?.raw_source_json?.position || job?.raw_source_json?.job_title || null;
    const title = lang === 'uz'
        ? (job.title_uz || job.title_ru || job.title || rawTitle)
        : (job.title_ru || job.title_uz || job.title || rawTitle);
    const salaryMin = job.salary_min && job.salary_min > 0 ? job.salary_min : null;
    const salaryMax = job.salary_max && job.salary_max > 0 ? job.salary_max : null;
    const salary = salaryMin && salaryMax
        ? `${(salaryMin / 1e6).toFixed(1)} - ${(salaryMax / 1e6).toFixed(1)} mln`
        : salaryMin
            ? `${(salaryMin / 1e6).toFixed(1)} mln+`
            : (lang === 'uz' ? 'Kelishiladi' : 'Договорная');
    const location = [job.region_name, job.district_name].filter(Boolean).join(', ');
    const titleLabel = lang === 'uz' ? 'Lavozim' : 'Должность';
    let card = `<b>💼 | ${titleLabel}: ${escape(title || na)}</b>\n🏢 | ${escape(job.company_name || (lang === 'uz' ? 'Tashkilot' : 'Компания'))}\n💰 | ${salary}`;
    if (location) card += `\n📍 | ${location}`;
    if (matchScore !== undefined) card += `\n\n${botTexts.matchScore[lang](matchScore)}`;
    return card;
}

export function formatFullJobCard(job: any, lang: BotLang): string {
    const escape = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const raw = job.raw_source_json || {};
    const na = lang === 'uz' ? "Ko'rsatilmagan" : 'Не указано';
    const rawTitle = raw?.title || raw?.position || raw?.job_title || raw?.position_name || null;
    const fieldTitle = job.field_title || raw?.field_title || raw?.position_name || null;
    let title = lang === 'uz'
        ? (job.title_uz || job.title_ru || job.title || rawTitle)
        : (job.title_ru || job.title_uz || job.title || rawTitle);
    if (!title || /^(vakansiya|вакансия)$/i.test(String(title).trim())) {
        title = fieldTitle || title;
    }

    let description = lang === 'uz'
        ? (job.description_uz || job.description_ru)
        : (job.description_ru || job.description_uz);
    if (!description && lang === 'uz') {
        description = job.requirements_uz || job.responsibilities_uz || job.requirements || job.responsibilities || null;
    }
    if (!description && lang === 'ru') {
        description = job.requirements_ru || job.responsibilities_ru || job.requirements || job.responsibilities || null;
    }
    if (!description && job.description) description = job.description;
    if (!description && raw?.description_text) description = raw.description_text;
    if (!description && raw?.description) description = raw.description;
    if (!description && raw?.info) description = raw.info;
    if (description) {
        description = String(description)
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\r/g, '')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    }

    const salaryMin = job.salary_min && job.salary_min > 0 ? job.salary_min : null;
    const salaryMax = job.salary_max && job.salary_max > 0 ? job.salary_max : null;
    const salary = salaryMin && salaryMax
        ? `${(salaryMin / 1e6).toFixed(1)} - ${(salaryMax / 1e6).toFixed(1)} mln`
        : salaryMin
            ? `${(salaryMin / 1e6).toFixed(1)} mln+`
            : (lang === 'uz' ? 'Kelishiladi' : 'Договорная');

    const location = [job.region_name, job.district_name].filter(Boolean).join(', ') || na;
    const address = job.address || raw?.address || raw?.work_address || null;

    const empTypeLabels: Record<string, { uz: string; ru: string }> = {
        full_time: { uz: "To'liq ish kuni", ru: 'Полный день' },
        part_time: { uz: 'Yarim kun', ru: 'Неполный день' },
        contract: { uz: 'Shartnoma', ru: 'Договор' },
        internship: { uz: 'Amaliyot', ru: 'Стажировка' },
        remote: { uz: 'Masofaviy', ru: 'Удалённо' },
        onsite: { uz: 'Ish joyida', ru: 'На месте' },
        hybrid: { uz: 'Gibrid', ru: 'Гибрид' }
    };
    const empType = job.employment_type ? (empTypeLabels[job.employment_type]?.[lang] || job.employment_type) : null;

    const workMode = typeof getWorkModeLabel === 'function' ? (getWorkModeLabel(job, lang) || null) : null;
    const workingDays = typeof getWorkingDaysLabel === 'function' ? (getWorkingDaysLabel(job, lang) || null) : null;
    const experienceLabel = typeof getExperienceLabel === 'function' ? (getExperienceLabel(job, lang) || null) : null;
    const educationLabel = typeof getEducationLabel === 'function'
        ? (getEducationLabel({ education_level: job.education_level, raw_source_json: job.raw_source_json }, lang) || null)
        : null;
    const genderValue = job.gender ?? raw?.gender ?? null;
    const genderLabel = typeof getGenderLabel === 'function'
        ? (getGenderLabel(genderValue, lang) || null)
        : null;

    const ageMin = job.age_min ?? raw?.age_min ?? raw?.age_from ?? null;
    const ageMax = job.age_max ?? raw?.age_max ?? raw?.age_to ?? null;
    let ageLabel: string | null = null;
    if (ageMin || ageMax) {
        if (ageMin && ageMax) ageLabel = `${ageMin}-${ageMax} ${lang === 'uz' ? 'yosh' : 'лет'}`;
        else if (ageMin) ageLabel = `${ageMin}+ ${lang === 'uz' ? 'yosh' : 'лет'}`;
        else if (ageMax) ageLabel = lang === 'uz' ? `${ageMax} yoshgacha` : `до ${ageMax} лет`;
    }
    const rawTestPeriodId = job?.test_period_id ?? raw?.test_period_id ?? raw?.test_periodId ?? null;
    const rawTrialText = (
        job?.trial_period
        ?? job?.probation_period
        ?? raw?.test_period
        ?? raw?.probation_period
        ?? raw?.sinov_muddati
        ?? null
    );
    let trialLabel: string | null = null;
    if (rawTestPeriodId !== null && rawTestPeriodId !== undefined && String(rawTestPeriodId).trim().length > 0) {
        const mapped = getMappedValue('test_period', Number(rawTestPeriodId), lang);
        if (mapped !== null && mapped !== undefined) {
            trialLabel = String(mapped).trim();
        }
    }
    if (!trialLabel && rawTrialText !== null && rawTrialText !== undefined) {
        const rawTrial = String(rawTrialText).trim();
        if (rawTrial.length > 0) {
            trialLabel = rawTrial;
        }
    }

    let languagesSource: any = job.languages ?? raw?.languages ?? raw?.language_ids ?? raw?.language;
    if (typeof languagesSource === 'string') {
        try { languagesSource = JSON.parse(languagesSource); } catch { /* ignore */ }
    }
    let languagesLabel = formatLanguages(languagesSource, lang);
    if (!languagesLabel && Array.isArray(languagesSource)) {
        const textual = languagesSource
            .map(item => {
                if (!item) return '';
                if (typeof item === 'string') return item.trim();
                if (typeof item === 'object') return String(item.name || item.title || item.language_name || '').trim();
                return '';
            })
            .filter(Boolean);
        if (textual.length > 0) languagesLabel = textual.join(', ');
    }
    if (!languagesLabel && typeof job.languages === 'string') languagesLabel = job.languages.trim();
    if (!languagesLabel) {
        const rawLangText = raw?.language || raw?.languages_text || raw?.til_bilishi || raw?.languages_required || raw?.language_text;
        if (typeof rawLangText === 'string') languagesLabel = rawLangText.trim();
    }

    let benefitsSource: any = raw?.benefit_ids || raw?.benefits || job.benefits;
    if (typeof benefitsSource === 'string') {
        try { benefitsSource = JSON.parse(benefitsSource); } catch { /* ignore */ }
    }
    let benefitsLabel = formatBenefits(benefitsSource, lang);
    if (!benefitsLabel && typeof job.benefits === 'string') {
        benefitsLabel = job.benefits.trim();
    }
    if (!benefitsLabel && Array.isArray(benefitsSource)) {
        const cleaned = benefitsSource.map(item => String(item).trim()).filter(Boolean);
        if (cleaned.length > 0) benefitsLabel = cleaned.join(', ');
    }
    if (!benefitsLabel) {
        const rawBenefits = raw?.ijtimoiy_paketlar || raw?.ijtimoiy_paket || raw?.social_packages || raw?.benefits_text || raw?.qulayliklar || raw?.social_package;
        if (Array.isArray(rawBenefits)) benefitsLabel = rawBenefits.join(', ');
        if (!benefitsLabel && typeof rawBenefits === 'string') benefitsLabel = rawBenefits;
    }

    const formatHours = (value?: string | null) => {
        if (!value) return null;
        const clean = String(value).trim();
        if (!clean) return null;
        return clean.replace(/(\d{2}:\d{2})(:\d{2})/g, '$1');
    };
    const workingHours = formatHours(job.working_hours || raw?.working_hours || null);

    const normalize = (value?: string | null) => {
        if (!value) return null;
        const trimmed = String(value).trim();
        if (!trimmed || trimmed === na) return null;
        return trimmed;
    };

    const lines: string[] = [];
    lines.push(`<b>💼 | ${lang === 'uz' ? 'Lavozim' : 'Должность'}: ${escape(title || na)}</b>`);
    lines.push('— — — — — — — — — — — — — — — —');
    lines.push(`🏢 | ${lang === 'uz' ? 'Tashkilot' : 'Компания'}: ${job.company_name || (lang === 'uz' ? 'Tashkilot' : 'Компания')}`);
    const locationLabel = normalize(location || null);
    if (locationLabel) lines.push(`📍 | ${lang === 'uz' ? 'Joylashuv' : 'Локация'}: ${locationLabel}`);
    if (address) lines.push(`📌 | ${lang === 'uz' ? 'Ish joy manzili' : 'Адрес'}: ${address}`);
    lines.push(`💰 | ${lang === 'uz' ? 'Maosh' : 'Зарплата'}: ${salary}`);

    const exp = normalize(experienceLabel || null);
    if (exp) lines.push(`🧠 | ${lang === 'uz' ? 'Tajriba' : 'Опыт'}: ${exp}`);

    const edu = normalize(educationLabel || null);
    if (edu) lines.push(`🎓 | ${lang === 'uz' ? "Ma'lumot" : 'Образование'}: ${edu}`);

    const trial = normalize(trialLabel || null);
    if (trial) lines.push(`⏳ | ${lang === 'uz' ? 'Sinov muddati' : 'Испытательный срок'}: ${trial}`);

    const gender = normalize(genderLabel || null);
    const genderAnyValues = new Set(['any', 'ahamiyatsiz', 'не важно', 'любой', 'любая', "ahamiyatga ega emas"]);
    if (gender && !genderAnyValues.has(String(gender).trim().toLowerCase())) {
        lines.push(`🚻 | ${lang === 'uz' ? 'Jins talabi' : 'Требование по полу'}: ${gender}`);
    }

    const ageRaw = String(job?.age ?? raw?.age ?? raw?.age_requirement ?? '').trim().toLowerCase();
    const ageAnyValues = new Set(['any', 'ahamiyatsiz', 'не важно', 'любой', 'любая', "ahamiyatga ega emas"]);
    if (ageLabel && !ageAnyValues.has(ageRaw)) lines.push(`📊 | ${lang === 'uz' ? 'Yosh' : 'Возраст'}: ${ageLabel}`);

    const mode = normalize(workMode || null);
    if (mode) lines.push(`🧭 | ${lang === 'uz' ? 'Ish usuli' : 'Режим'}: ${mode}`);

    const days = normalize(workingDays || null);
    if (days) lines.push(`📆 | ${lang === 'uz' ? 'Ish kunlari' : 'График'}: ${days}`);

    const emp = normalize(empType || null);
    if (emp) lines.push(`🕒 | ${lang === 'uz' ? 'Bandlik' : 'Занятость'}: ${emp}`);

    if (workingHours) lines.push(`⏰ | ${lang === 'uz' ? 'Ish vaqti' : 'Время работы'}: ${workingHours}`);

    const langs = normalize(languagesLabel || null);
    if (langs) lines.push(`🌐 | ${lang === 'uz' ? 'Tillarni bilishi' : 'Языки'}: ${langs}`);

    const benefits = normalize(benefitsLabel || null);

    const specialFlags: string[] = [];
    const specialSource = Array.isArray(job.special)
        ? job.special
        : (Array.isArray(raw?.special) ? raw.special : []);
    const specialSet = new Set<string>([
        ...specialSource.map((value: any) => String(value || '').trim().toLowerCase())
    ]);
    if (job.is_for_students === true || specialSet.has('students')) {
        specialFlags.push(lang === 'uz' ? 'Talabalar ham mos kelishi mumkin' : 'Могут подойти студенты');
    }
    if (job.is_for_disabled === true || specialSet.has('disabled')) {
        specialFlags.push(lang === 'uz' ? "Nogironligi bo'lgan shaxslar ham mos kelishi mumkin" : 'Могут подойти люди с инвалидностью');
    }
    if (job.is_for_graduates === true || specialSet.has('graduates')) {
        specialFlags.push(lang === 'uz' ? 'Bitiruvchilar ham mos kelishi mumkin' : 'Могут подойти выпускники');
    }
    if (specialFlags.length > 0) {
        lines.push(`🔹 | ${lang === 'uz' ? "Qo'shimcha mezonlar" : 'Дополнительные критерии'}: ${specialFlags.join(', ')}`);
    }

    // Description parsing
    const parseSections = (text?: string | null) => {
        if (!text) return { tasks: [] as string[], reqs: [] as string[], perks: [] as string[] };
        const markers = [
            { key: 'tasks', regex: /(vazifalar|обязанности)/i },
            { key: 'reqs', regex: /(talablar|требования)/i },
            { key: 'perks', regex: /(imkoniyatlar|qulayliklar|условия)/i }
        ];
        const found = markers.map(m => {
            const match = text.match(m.regex);
            if (!match || match.index == null) return null;
            return { key: m.key, index: match.index, length: match[0].length };
        }).filter(Boolean) as Array<{ key: string; index: number; length: number }>;
        if (!found.length) {
            const bulletItems = text
                .replace(/\r/g, '')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('-') || line.startsWith('•'))
                .map(line => line.replace(/^[-•]\s*/, '').trim())
                .filter(Boolean);
            if (bulletItems.length) return { tasks: bulletItems, reqs: [], perks: [] };
            return { tasks: [], reqs: [], perks: [] };
        }
        const sorted = found.sort((a, b) => a.index - b.index);
        const extract = (start: number, end: number) => {
            const chunk = text.slice(start, end).replace(/^[:\s-]+/, '').trim();
            if (!chunk) return [];
            const normalized = chunk
                .replace(/\r/g, '')
                .replace(/[•·]/g, '\n- ')
                .replace(/\s*-\s*/g, '\n- ')
                .replace(/\n{2,}/g, '\n');
            return normalized
                .split('\n')
                .map(line => line.replace(/^\s*-\s*/g, '').trim())
                .filter(Boolean);
        };
        const result = { tasks: [] as string[], reqs: [] as string[], perks: [] as string[] };
        for (let i = 0; i < sorted.length; i += 1) {
            const current = sorted[i];
            const next = sorted[i + 1];
            const start = current.index + current.length;
            const end = next ? next.index : text.length;
            const items = extract(start, end);
            if (current.key === 'tasks') result.tasks = items;
            if (current.key === 'reqs') result.reqs = items;
            if (current.key === 'perks') result.perks = items;
        }
        return result;
    };

    const sections = parseSections(description || '');
    const rawTasks = Array.isArray(raw?.ish_vazifalari) ? raw.ish_vazifalari : [];
    const rawReqs = Array.isArray(raw?.talablar) ? raw.talablar : [];
    const rawPerks = Array.isArray(raw?.qulayliklar) ? raw.qulayliklar : [];
    const tasks = Array.from(new Set([...rawTasks, ...rawReqs, ...sections.tasks, ...sections.reqs].map(s => String(s).trim()).filter(Boolean)));
    const perks = Array.from(new Set([...rawPerks, ...sections.perks].map(s => String(s).trim()).filter(Boolean)));

    if (tasks.length > 0) {
        lines.push('');
        lines.push(`📌 | ${lang === 'uz' ? 'Vazifalar va talablar' : 'Обязанности и требования'}`);
        lines.push(...tasks.map(item => `- ${item}`));
    } else if (description) {
        lines.push('');
        lines.push(`📌 | ${lang === 'uz' ? 'Tavsif' : 'Описание'}`);
        lines.push(description);
    }

    if (perks.length > 0) {
        lines.push('');
        lines.push(`🛎️ | ${lang === 'uz' ? 'Qulayliklar' : 'Условия'}`);
        lines.push(...perks.map(item => `- ${item}`));
    } else if (benefits) {
        const benefitItems = String(benefits)
            .split(/[,\n;]+/g)
            .map(item => item.trim())
            .filter(Boolean);
        lines.push(`🛎️ | ${lang === 'uz' ? 'Qulayliklar' : 'Условия'}:`);
        if (benefitItems.length > 0) {
            lines.push(...benefitItems.map(item => `- ${item}`));
        } else {
            lines.push(`- ${benefits}`);
        }
    }

    const hasContacts = job.contact_phone || job.contact_telegram || job.phone;
    if (hasContacts) {
        lines.push('');
        if (job.contact_phone || job.phone) lines.push(`📞 | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${job.contact_phone || job.phone}`);
        if (job.contact_telegram) lines.push(`💬 | Telegram: ${job.contact_telegram}`);
    }

    return lines.join('\n');
}

export const EXPERIENCE_LABELS: Record<string, { uz: string; ru: string }> = {
    no_experience: { uz: 'Tajribasiz', ru: 'Без опыта' },
    '1_year': { uz: '1 yil', ru: '1 год' },
    '1_3_years': { uz: '1-3 yil', ru: '1-3 года' },
    '3_years': { uz: '1-3 yil', ru: '1-3 года' },
    '3_5_years': { uz: '3-5 yil', ru: '3-5 лет' },
    '5_years': { uz: '3-5 yil', ru: '3-5 лет' },
    '5_plus': { uz: '5+ yil', ru: '5+ лет' },
    '10_years': { uz: '5+ yil', ru: '5+ лет' }
};

export {
    formatBenefits,
    formatLanguages,
    getWorkModeLabel,
    getWorkingDaysLabel,
    getExperienceLabel,
    getEducationLabel,
    getGenderLabel
};
