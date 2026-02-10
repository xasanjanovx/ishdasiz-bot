/**
 * Telegram Bot Texts
 */

import {
    formatBenefits,
    formatLanguages,
    getEducationLabel,
    getExperienceLabel,
    getGenderLabel,
    getWorkingDaysLabel,
    getWorkModeLabel
} from '../mappings';

export type BotLang = 'uz' | 'ru';

export const botTexts = {
    // Language
    selectLanguage: {
        uz: 'Tilni tanlang:',
        ru: 'Выберите язык:'
    },
    languageChanged: {
        uz: '✅ Til o‘zgartirildi.',
        ru: '✅ Язык изменён.'
    },

    // Start / help
    startWelcome: {
        uz: "Assalomu alaykum | <b>ISHDASIZ</b> botiga xush kelibsiz!\n\nBu yerda siz:\n| 🎯 Ish yoki xodimni ortiqcha vaqt sarflamasdan topishingiz\n| 🧾 Rezyume va vakansiyalarni bir joyda boshqarishingiz\n| ⚡ Tanlov jarayonini tez va qulay amalga oshirishingiz\n| 🤖 Sun’iy intellekt yordamidan foydalanishingiz mumkin\n\nFoydali buyruqlar:\n| ▶️ /start — ishni boshlash\n| 🔄 /role — rolni almashtirish (ish qidiruvchi / ish beruvchi)\n| 🚪 /logout — hisobdan chiqish\n| ❓ /help — foydalanish bo‘yicha yordam",
        ru: "Здравствуйте | Добро пожаловать в <b>ISHDASIZ</b>!\n\nЗдесь вы можете:\n| 🎯 Быстро найти работу или сотрудника\n| 🧾 Управлять резюме и вакансиями в одном месте\n| ⚡ Упростить процесс подбора\n| 🤖 Использовать помощь ИИ\n\nПолезные команды:\n| ▶️ /start — начать\n| 🔄 /role — сменить роль (соискатель / работодатель)\n| 🚪 /logout — выйти из аккаунта\n| ❓ /help — помощь по использованию"
    },
    helpText: {
        uz: "❓ <b>Yordam</b>\n\nBot imkoniyatlari:\n| 🔎 Vakansiyalarni rezyume bo‘yicha qidirish\n| ⭐ Saqlab qo‘yish va keyin ko‘rish\n| 🧾 Rezyume yaratish va tahrirlash\n| 📢 Vakansiya joylash va arizalarni boshqarish\n\nBuyruqlar:\n| ▶️ /start — boshlash\n| 🔄 /role — rolni almashtirish\n| 🚪 /logout — chiqish\n| ❓ /help — yordam\n\nAdmin: @ishdasiz_admin",
        ru: "❓ <b>Помощь</b>\n\nВозможности бота:\n| 🔎 Поиск вакансий по резюме\n| ⭐ Сохранение вакансий\n| 🧾 Создание и редактирование резюме\n| 📢 Размещение вакансий и управление откликами\n\nКоманды:\n| ▶️ /start — начать\n| 🔄 /role — сменить роль\n| 🚪 /logout — выйти\n| ❓ /help — помощь\n\nАдмин: @ishdasiz_admin"
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
        uz: 'Sizda hisob mavjud. Kirish usulini tanlang:',
        ru: 'Аккаунт найден. Выберите способ входа:'
    },
    enterPassword: {
        uz: '<b>🔐 Parolni kiriting:</b>',
        ru: '<b>🔐 Введите пароль:</b>'
    },
    createPasswordPrompt: {
        uz: '<b>🔐 Yangi parol yarating</b>\n<i>(kamida 6 ta belgi)</i>',
        ru: '<b>🔐 Создайте новый пароль</b>\n<i>(минимум 6 символов)</i>'
    },
    passwordInvalid: {
        uz: '❌ Parol noto‘g‘ri.',
        ru: '❌ Неверный пароль.'
    },
    passwordTooShort: {
        uz: "❌ Parol kamida 6 ta belgidan iborat bo'lishi kerak.",
        ru: '❌ Пароль должен содержать минимум 6 символов.'
    },
    passwordCreated: {
        uz: '✅ Parol saqlandi.',
        ru: '✅ Пароль сохранён.'
    },
    passwordNotSet: {
        uz: "Parol hali yaratilmagan. SMS orqali kiring va parol yarating.",
        ru: 'Пароль ещё не создан. Войдите через SMS и создайте пароль.'
    },
    accountLocked: {
        uz: '❌ Akkaunt vaqtincha bloklandi.',
        ru: '❌ Аккаунт временно заблокирован.'
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
        uz: '<b>🎂 | Tug‘ilgan sanangizni kiriting</b>\n<i>kk.oo.yyyy</i>',
        ru: '<b>🎂 | Введите дату рождения</b>\n<i>дд.мм.гггг</i>'
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
        uz: '🔔 | Xabarnoma chastotasi:',
        ru: '🔔 | Частота уведомлений:'
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
        uz: '<b>📝 | O‘zingiz haqingizda qo‘shimcha ma’lumot (qisqacha) — ixtiyoriy.</b>\n<i>Eslatma: Qancha ko‘p ma’lumot yozsangiz, ish beruvchilar sizni shuncha tez topadi.</i>',
        ru: '<b>📝 | Дополнительная информация о себе (кратко) — необязательно.</b>\n<i>Совет: Чем больше информации, тем быстрее работодатель вас найдёт.</i>'
    },
    askSkills: {
        uz: '<b>🧠 | Asosiy ko‘nikmalaringizni kiriting:</b>\n<i>Masalan: Word, Excel, Telegram, Mijozlar bilan muloqot, Savdo, Jamoada ishlash</i>\n<i>Har birini alohida xabar yoki vergul orqali yozishingiz mumkin.</i>\n\n<i>Ko‘nikma yuborgach “Tayyor” tugmasi paydo bo‘ladi.</i>\n<i>Agar ko‘nikma bo‘lmasa, “O‘tkazib yuborish”ni bosing.</i>',
        ru: '<b>🧠 | Введите основные навыки:</b>\n<i>Например: Excel, 1C, CRM, Продажи, Photoshop, Teamwork</i>\n<i>Можно отправлять по одному или через запятую.</i>\n\n<i>Кнопка “Готово” появится после первого навыка.</i>\n<i>Если навыков нет — нажмите “Пропустить”.</i>'
    },
    askWorkplace: {
        uz: '<b>🏢 | Ishlagan joyingiz.</b>\n<i>Masalan: “24-maktab — Ingliz tili o‘qituvchisi”</i>',
        ru: '<b>🏢 | Где вы работали.</b>\n<i>Например: “Школа №24 — учитель английского”</i>'
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
        uz: '✅ Joylashuv qabul qilindi.',
        ru: '✅ Локация принята.'
    },
    locationSkipped: {
        uz: '✅ Joylashuv o‘tkazib yuborildi.',
        ru: '✅ Локация пропущена.'
    },

    // Main menu
    mainMenu: {
        uz: '🏠 | Asosiy bo‘limlar\n| Kerakli bo‘limni tanlang.',
        ru: '🏠 | Основные разделы\n| Выберите нужный раздел.'
    },

    // Jobs
    searchingJobs: {
        uz: '🔎 Mos vakansiyalar qidirilmoqda...',
        ru: '🔎 Идёт поиск подходящих вакансий...'
    },
    noJobsFound: {
        uz: '❌ Afsuski, hozircha mos vakansiyalar yo‘q.',
        ru: '❌ Подходящих вакансий пока нет.'
    },
    noJobsByProfession: {
        uz: "ℹ️ Tanlangan kasb bo'yicha aniq vakansiya topilmadi. Sizga mos kelishi mumkin bo'lgan vakansiyalarni ko'rishingiz mumkin.",
        ru: 'ℹ️ Точных вакансий по выбранной профессии не найдено. Можно посмотреть вакансии, которые могут вам подойти.'
    },
    noDistrictJobs: {
        uz: 'ℹ️ Bu tumanda mos vakansiyalar topilmadi. Viloyatingizdagi boshqa tuman/shaharlarda vakansiyalar mavjud:',
        ru: 'ℹ️ В этом районе подходящих вакансий нет. Вот районы/города вашей области с вакансиями:'
    },
    noRegionJobs: {
        uz: 'ℹ️ Bu viloyatda mos vakansiyalar topilmadi. Boshqa viloyatlarda vakansiyalar mavjud:',
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
    noResumeWarning: {
        uz: '⚠️ Avval rezyume yarating.',
        ru: '⚠️ Сначала создайте резюме.'
    },
    jobsFound: {
        uz: (count: number) => `✅ ${count} ta vakansiya topildi`,
        ru: (count: number) => `✅ Найдено ${count} вакансий`
    },
    searchModePrompt: {
        uz: '🔎 | Rezyume bo‘yicha qidiruv:',
        ru: '🔎 | Поиск по резюме:'
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
        uz: '✅ Ariza muvaffaqiyatli yuborildi.',
        ru: '✅ Заявка успешно отправлена.'
    },
    applicationExists: {
        uz: '№️⃣ Siz ushbu vakansiyaga avval ariza yuborgansiz.',
        ru: '№️⃣ Вы уже отправляли отклик на эту вакансию.'
    },

    // Profile / settings
    settings: {
        uz: '⚙️ Sozlamalar',
        ru: '⚙️ Настройки'
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
        uz: '🧾 | Rezyume\n\nRezyumeni ko‘rish yoki tahrirlash:',
        ru: '🧾 | Резюме\n\nПросмотр или редактирование:'
    },

    // Roles / employer
    selectRole: {
        uz: '👥 Rolni tanlang:\n\n🧾 Ish qidiruvchi — rezyume yaratish va ish topish\n🏢 Ish beruvchi — vakansiya joylash va nomzod topish',
        ru: '👥 Выберите роль:\n\n🧾 Соискатель — создать резюме и найти работу\n🏢 Работодатель — разместить вакансию и найти кандидатов'
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
        uz: '🏢 Ish beruvchi kabinetiga xush kelibsiz.\n\n📢 «Vakansiya joylash» orqali yangi vakansiya yarating.\n📋 «Mening vakansiyalarim» bo‘limida e’lonlarni boshqaring.\n🧑‍💼 «Ishchi qidirish» orqali mos nomzodlarni toping.',
        ru: '🏢 Добро пожаловать в кабинет работодателя.\n\n📢 Через «Разместить вакансию» создайте новую вакансию.\n📋 В «Мои вакансии» управляйте опубликованными вакансиями.\n🧑‍💼 Через «Найти сотрудника» подберите подходящих кандидатов.'
    },
    employerMainMenu: {
        uz: 'Ish beruvchi menyusi:',
        ru: 'Меню работодателя:'
    },
    employerProfileIntro: {
        uz: '🏢 | Ish beruvchi profili',
        ru: '🏢 | Профиль работодателя'
    },
    companyNamePrompt: {
        uz: '<b>🏢 Kompaniya nomini kiriting</b>\n<i>Masalan: “Andijon Textile MCHJ”</i>',
        ru: '<b>🏢 Введите название компании</b>\n<i>Например: “Andijon Textile LLC”</i>'
    },
    employerDirectorPrompt: {
        uz: '<b>👤 Mas’ul shaxs (HR menejeri)</b>\n<i>Masalan: Azizbek Mamadiyev</i>',
        ru: '<b>👤 Ответственное лицо (HR менеджер)</b>\n<i>Например: Азизбек Мамадиев</i>'
    },
    employerIndustryPrompt: {
        uz: '<b>🏭 Faoliyat sohasi</b>',
        ru: '<b>🏭 Сфера деятельности</b>'
    },
    employerSizePrompt: {
        uz: '<b>👥 Kompaniya hajmi</b>',
        ru: '<b>👥 Размер компании</b>'
    },
    employerRegionPrompt: {
        uz: '<b>📍 Kompaniya joylashuvi (viloyat)</b>\n<i>Masalan: Andijon viloyati</i>',
        ru: '<b>📍 Регион компании</b>\n<i>Например: Андижанская область</i>'
    },
    employerDistrictPrompt: {
        uz: '<b>🏙️ Tuman/Shaharni tanlang</b>\n<i>Masalan: Andijon shahri yoki Asaka tumani</i>',
        ru: '<b>🏙️ Выберите район/город</b>\n<i>Например: г. Андижан или Асакинский район</i>'
    },
    employerAddressPrompt: {
        uz: '<b>📌 Ish joy manzili</b>\n<i>Masalan: Andijon sh., Bobur ko‘chasi 12</i>',
        ru: '<b>📌 Адрес работы</b>\n<i>Например: г. Андижан, ул. Бобур, 12</i>'
    },
    employerDescriptionPrompt: {
        uz: '<b>📝 Kompaniya haqida qisqacha</b>\n<i>Masalan: “To‘qimachilik korxonasi, 120+ xodim”</i>',
        ru: '<b>📝 Коротко о компании</b>\n<i>Например: “Текстильная компания, 120+ сотрудников”</i>'
    },
    jobCreateMode: {
        uz: '📢 Vakansiya yaratish usulini tanlang:',
        ru: '📢 Выберите способ создания вакансии:'
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
        uz: '<b>🏷️ Ish usuli</b>\n<i>Masalan: Ofis / Masofaviy / Gibrid</i>',
        ru: '<b>🏷️ Формат работы</b>\n<i>Например: Офис / Удалённо / Гибрид</i>'
    },
    jobEmploymentPrompt: {
        uz: '<b>💼 Bandlik turi</b>\n<i>Masalan: To‘liq stavka yoki Qisman</i>',
        ru: '<b>💼 Тип занятости</b>\n<i>Например: Полная ставка или Неполная</i>'
    },
    jobWorkingDaysPrompt: {
        uz: '<b>📅 Ish kunlari</b>\n<i>Masalan: 5 kunlik yoki 6 kunlik</i>',
        ru: '<b>📅 График</b>\n<i>Например: 5-дневка или 6-дневка</i>'
    },
    jobWorkingHoursPrompt: {
        uz: '<b>⏰ Ish vaqti</b>\n<i>Masalan: 09:00-18:00</i>',
        ru: '<b>⏰ Время работы</b>\n<i>Например: 09:00-18:00</i>'
    },
    jobExperiencePrompt: {
        uz: '<b>🧠 Tajriba talabi</b>\n<i>Masalan: 1-3 yil yoki 3+ yil</i>',
        ru: '<b>🧠 Требуемый опыт</b>\n<i>Например: 1-3 года или 3+ лет</i>'
    },
    jobEducationPrompt: {
        uz: "<b>🎓 Ma'lumot talabi</b>\n<i>Masalan: O'rta maxsus yoki Oliy</i>",
        ru: '<b>🎓 Требуемое образование</b>\n<i>Например: Среднее специальное или Высшее</i>'
    },
    jobGenderPrompt: {
        uz: '<b>🚻 Jins talabi</b>\n<i>Ahamiyatsiz bo‘lsa “Ahamiyatsiz”ni tanlang</i>',
        ru: '<b>🚻 Требование по полу</b>\n<i>Если не важно, выберите “Не важно”</i>'
    },
    jobAgePrompt: {
        uz: '<b>🎂 Yosh oralig‘i</b>\n<i>Masalan: 18-35 yoki 18+</i>',
        ru: '<b>🎂 Возраст</b>\n<i>Например: 18-35 или 18+</i>'
    },
    jobAgeInvalid: {
        uz: '❗ Yoshni to‘g‘ri kiriting. Masalan: 18-35 yoki 18+',
        ru: '❗ Введите возраст корректно. Например: 18-35 или 18+'
    },
    jobLanguagesPrompt: {
        uz: '<b>🗣️ Tillar (ixtiyoriy)</b>\n<i>Vergul bilan ajrating. Masalan: O‘zbek, Rus, Ingliz</i>',
        ru: '<b>🗣️ Языки (необязательно)</b>\n<i>Разделите запятыми. Например: узбекский, русский, английский</i>'
    },
    jobBenefitsPrompt: {
        uz: '<b>🎁 Sharoitlar (ixtiyoriy)</b>\n<i>Masalan: bepul tushlik, xizmat transporti, yo‘l kira, tibbiy sug‘urta, bonus va mukofotlar</i>',
        ru: '<b>🎁 Условия (необязательно)</b>\n<i>Например: бесплатный обед, служебный транспорт, проезд, медстраховка, бонусы</i>'
    },
    jobHrPrompt: {
        uz: '<b>👤 HR menejer (F.I.O)</b>\n<i>Masalan: Azizbek Mamadiyev</i>',
        ru: '<b>👤 HR менеджер (Ф.И.О.)</b>\n<i>Например: Азизбек Мамадиев</i>'
    },
    jobContactPrompt: {
        uz: '<b>📞 Aloqa telefoni</b>\n<i>Masalan: +998901234567</i>',
        ru: '<b>📞 Контактный телефон</b>\n<i>Например: +998901234567</i>'
    },

    // Employer posting
    postJobTitle: {
        uz: "<b>📝 Qanday ishchi qidiryapsiz? (lavozim)</b>\n<i>Kamida 3 ta harf kiriting.</i>\n<i>Masalan: Boshqaruvchi, Bosh buxgalter, HR menejer, SMM menejer, Dasturchi</i>",
        ru: '<b>📝 Какого сотрудника вы ищете? (должность)</b>\n<i>Введите минимум 3 буквы.</i>\n<i>Например: Руководитель, Главный бухгалтер, HR-менеджер, SMM-менеджер, Разработчик</i>'
    },
    postJobCategory: {
        uz: '🧭 Vakansiya sohasini tanlang:',
        ru: '🧭 Выберите сферу вакансии:'
    },
    postJobSalary: {
        uz: '<b>💰 Maosh qancha taklif qilasiz?</b>\n<i>Masalan: 3 000 000 yoki “Kelishiladi”.</i>\n<i>“Kelishiladi” tugmasini ham bosishingiz mumkin.</i>',
        ru: '<b>💰 Какую зарплату предлагаете?</b>\n<i>Например: 3 000 000 или “Договорная”.</i>\n<i>Можно нажать кнопку “Договорная”.</i>'
    },
    postJobSalaryMax: {
        uz: '<b>💰 Maksimal maosh (ixtiyoriy)</b>\n<i>Masalan: 8 000 000. Maksimum bo‘lmasa, “Davom etish”ni bosing.</i>',
        ru: '<b>💰 Максимальная зарплата (необязательно)</b>\n<i>Например: 8 000 000. Если максимума нет — нажмите “Продолжить”.</i>'
    },
    postJobRegion: {
        uz: '<b>📍 Ish joyi qayerda?</b>\n<i>Masalan: Andijon viloyati</i>\n<i>Viloyatni tanlang</i>',
        ru: '<b>📍 Где находится работа?</b>\n<i>Например: Андижанская область</i>\n<i>Выберите область</i>'
    },
    postJobDescription: {
        uz: '<b>📌 Vakansiya haqida batafsil yozing</b>\n<i>Talablar va vazifalar:</i>\n- ...\n- ...\n- ...',
        ru: '<b>📌 Подробно опишите вакансию</b>\n<i>Требования и обязанности:</i>\n- ...\n- ...\n- ...'
    },
    postJobConfirm: {
        uz: (title: string) => `Vakansiyani tekshiring va tasdiqlang:\n\n"${title}"`,
        ru: (title: string) => `Проверьте и подтвердите вакансию:\n\n"${title}"`
    },
    jobPublished: {
        uz: '🚀 Vakansiya chop etildi!',
        ru: '🚀 Вакансия опубликована!'
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
        uz: "ℹ️ Hali vakansiya yo'q.\n\n📢 «Vakansiya joylash» orqali birinchi vakansiyani yarating.",
        ru: "ℹ️ Пока нет вакансий.\n\n📢 Создайте первую вакансию через «Разместить вакансию»."
    },
    minThreeChars: {
        uz: '❗ Kamida 3 ta harf kiriting.',
        ru: '❗ Введите минимум 3 буквы.'
    },

    // Subscriptions
    subscriptionRequired: {
        uz: 'Davom etish uchun @ishdasiz kanaliga obuna bo‘ling.',
        ru: 'Для продолжения подпишитесь на канал @ishdasiz.'
    },
    subscriptionSettings: {
        uz: '🔔 | Obuna sozlamalari',
        ru: '🔔 | Настройки подписки'
    },
    subscriptionSaved: {
        uz: '✅ Obuna saqlandi.',
        ru: '✅ Подписка сохранена.'
    },
    subscriptionDisabled: {
        uz: "✅ Obuna o'chirildi.",
        ru: '✅ Подписка отключена.'
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
    let card = `💼 | ${titleLabel}: ${title || na}\n🏢 | ${job.company_name || (lang === 'uz' ? 'Kompaniya' : 'Компания')}\n💰 | ${salary}`;
    if (location) card += `\n📍 | ${location}`;
    if (matchScore !== undefined) card += `\n\n${botTexts.matchScore[lang](matchScore)}`;
    return card;
}

export function formatFullJobCard(job: any, lang: BotLang): string {
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
    const lat = Number(job.latitude ?? raw?.latitude);
    const lon = Number(job.longitude ?? raw?.longitude);
    const hrName = job.hr_name || raw?.hr?.name || raw?.hr?.fio || null;

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

    const ageMin = job.age_min ?? raw?.age_min ?? raw?.age_from ?? null;
    const ageMax = job.age_max ?? raw?.age_max ?? raw?.age_to ?? null;
    let ageLabel: string | null = null;
    if (ageMin || ageMax) {
        if (ageMin && ageMax) ageLabel = `${ageMin}-${ageMax} ${lang === 'uz' ? 'yosh' : 'лет'}`;
        else if (ageMin) ageLabel = `${ageMin}+ ${lang === 'uz' ? 'yosh' : 'лет'}`;
        else if (ageMax) ageLabel = lang === 'uz' ? `${ageMax} yoshgacha` : `до ${ageMax} лет`;
    }

    let languagesSource: any = job.languages ?? raw?.languages ?? raw?.language_ids ?? raw?.language;
    if (typeof languagesSource === 'string') {
        try { languagesSource = JSON.parse(languagesSource); } catch { /* ignore */ }
    }
    let languagesLabel = formatLanguages(languagesSource, lang);
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
    lines.push(`💼 | ${lang === 'uz' ? 'Lavozim' : 'Должность'}: ${title || na}`);
    lines.push('— — — — — — — — — — — — — — — —');
    lines.push(`🏢 | ${lang === 'uz' ? 'Kompaniya' : 'Компания'}: ${job.company_name || (lang === 'uz' ? 'Kompaniya' : 'Компания')}`);
    const locationLabel = normalize(location || null);
    if (locationLabel) lines.push(`📍 | ${lang === 'uz' ? 'Joylashuv' : 'Локация'}: ${locationLabel}`);
    if (address) lines.push(`📌 | ${lang === 'uz' ? 'Ish joy manzili' : 'Адрес'}: ${address}`);
    lines.push(`💰 | ${lang === 'uz' ? 'Maosh' : 'Зарплата'}: ${salary}`);

    const exp = normalize(experienceLabel || null);
    if (exp) lines.push(`🧠 | ${lang === 'uz' ? 'Tajriba' : 'Опыт'}: ${exp}`);

    const edu = normalize(educationLabel || null);
    if (edu) lines.push(`🎓 | ${lang === 'uz' ? "Ma'lumot" : 'Образование'}: ${edu}`);


    if (ageLabel) lines.push(`🧓 | ${lang === 'uz' ? 'Yosh' : 'Возраст'}: ${ageLabel}`);

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
    if (benefits) lines.push(`🎁 | ${lang === 'uz' ? 'Qulayliklar' : 'Условия'}: ${benefits}`);

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
        lines.push(`🎁 | ${lang === 'uz' ? 'Qulayliklar' : 'Условия'}`);
        lines.push(...perks.map(item => `- ${item}`));
    }

    const hasContacts = job.contact_phone || job.contact_email || job.contact_telegram || hrName || job.phone || job.email;
    if (hasContacts) {
        lines.push('');
        lines.push(`☎️ | ${lang === 'uz' ? 'Aloqa' : 'Контакты'}`);
        if (hrName) lines.push(`👤 | ${lang === 'uz' ? 'Vakansiya HR menejeri' : 'HR менеджер'}: ${hrName}`);
        if (job.contact_phone || job.phone) lines.push(`📞 | ${lang === 'uz' ? 'Telefon' : 'Телефон'}: ${job.contact_phone || job.phone}`);
        if (job.contact_email || job.email) lines.push(`📧 | Email: ${job.contact_email || job.email}`);
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
