# ISHDASIZ Bot (Polling)

Standalone Telegram bot package extracted from the main ISHDASIZ repository.

## Run locally

1. Use Node.js 20.9 or newer (verified locally with Node.js 24.18.0). Install dependencies:
   - `npm install`
2. Create `.env.local` (or `.env`) from `.env.example`.
3. Start bot in polling mode:
   - `npm run start:polling`

## Environment variables (names only)

Required:
- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional (feature dependent):
- `ADMIN_IDS`
- `DEEPSEEK_API_KEY`
- `TELEGRAM_CHANNEL_USERNAME`
- `TELEGRAM_PREMIUM_MODE`
- `TELEGRAM_DRY_RUN`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_CLOUD_API_KEY` (or the existing `gemini_cloud_api` alias)
- `OSONISH_API_BASE`
- `OSONISH_BEARER_TOKEN`
- `OSONISH_API_TOKEN`
- `OSONISH_COOKIE`
- `OSONISH_USER_ID`
- `OSONISH_CURRENT_USER_ID`
- `ESKIZ_EMAIL`
- `ESKIZ_PASSWORD`
- `ESKIZ_FROM`
- `ESKIZ_SMS_TEXT`

## Start mode

This package is configured as a polling worker (no webhook required).
The runner is `scripts/run-bot-local.ts`.

## Application workflow

Employers can view the exact submitted resume, accept or reject an application, schedule an interview in Uzbekistan time (UTC+5), and confirm hiring. Seekers can open **My applications** to see saved decisions and interview details. The employer menu also includes company statistics.

Decisions use the protected `ishdasiz_application_action` RPC with the original status and response timestamp. A conflicting update preserves the draft and does not report success or send a candidate notification. These features require the ordered database release in the adjacent site's `supabase/releases/2026-10-repair.json`; copying only this worker to an older database is insufficient. The release has not been applied to the live service during local repair work.

Opening a decided application acknowledges only the response version actually delivered. The `ishdasiz_application_seen` RPC rechecks the seeker, account epoch and exact response timestamp atomically. Failed message delivery does not clear unread notifications; a newer response asks the seeker to reopen the application. Pending applications are not acknowledged before an employer response exists.

`npm run typecheck` and `npm test` check the worker and the website's bot copy using synthetic requests. They do not start polling or send real SMS/Telegram messages.

## Safe startup and delivery mode

The runner checks getMe and getWebhookInfo before polling. An active webhook causes startup to stop. It does not delete pending updates, change the bot profile or log incoming message payloads. Stop the previous webhook host before deliberately switching with:

```sh
npm run start:polling -- --switch-from-webhook
```

Use one poller only. A 409 conflict stops the process; it never repeatedly removes a competing webhook. Failed updates retain their offset for retry. Ctrl+C/SIGTERM cancels network waits and allows the current handler to finish. Receiving real updates with TELEGRAM_DRY_RUN=1 is refused. Tests import the pure polling helper and replace the network; they do not execute this startup script.


### Незавершённые формы и авторизация

После `BOT_FLOW_IDLE_TIMEOUT_MINUTES` (по умолчанию 20 минут) бот возвращает пользователя из незавершённой формы в меню и очищает её черновик. Сохраняются выбранная роль и `account_session_version`. Отозванные сеансы и закрытые аккаунты проверяются до сброса формы и требуют повторного входа; таймер не продлевает их авторизацию. Локальная регрессия: `tests/flow-timeout-auth.test.ts`, запускается общей командой `npm test`.


### Актуальность карточки вакансии

При каждом открытии результата бот читает актуальную вакансию и проверяет её доступность и аккаунт канонического работодателя. Старые контакты и текст из `job_list` не используются при ошибке загрузки. После изменения данных объявления прежняя оценка соответствия скрывается до повторного поиска. Регрессии обеих версий: `tests/current-job-card.test.ts`.


### Полный поиск вакансий

Подбор по резюме, местоположению и региону читает все доступные объявления страницами по 200 до пустой страницы, с общим таймером 30 секунд. Фиксированных лимитов 900/1400/1800 больше нет. При незавершённом чтении бот сообщает об ошибке и не выдаёт частичный результат за полный. Сеанс сохраняет только индекс вакансий, географию и оценку; тексты, контакты и тела импорта в сеансе не сохраняются. Отображаемая карточка всегда загружается заново при открытии. AI-переранжирование сохраняет прежний лимит 40 кандидатов. Регрессии обеих версий: `tests/complete-job-search.test.ts`.


### Полный подбор кандидатов

Подбор публичных резюме для вакансии больше не обрезается до 400/1000 результатов. Страницы по 200 читаются до пустой с общим таймером 30 секунд и проверками владельца вакансии/сеанса на каждом запросе. Сеанс хранит только индекс, географию, оценки и флаги приглашений; карточки и получатель приглашения проверяются заново. Старые кнопки связанных кандидатов используют тот же просмотр. Дополнительные рекомендации записываются порциями по 200 с общим таймером 15 секунд и не блокируют ручной подбор при ошибке. AI сохраняет прежний лимит 40 кандидатов на запрос. Регрессии: `tests/complete-candidate-search.test.ts`, `tests/recommendation-batches.test.ts`.

## Production installation

The start command uses tsx, which is a runtime dependency. The Supabase SDK in the lockfile requires Node.js 20 or newer; the package minimum is 20.9 to match the website.

```sh
npm ci --omit=dev
npm start
```

Set the required environment variables in the worker host before starting. Keep only one poller running; do not start a second instance to test deployment. A worker installation does not apply the database release or update the website. Copying only this package to the old database cannot enable the repaired application, resume and chat flows. No hosting service was activated during local repairs.

Production packaging was verified in a fresh temporary directory without .env files or development dependencies. The bot module imported with synthetic configuration and network disabled. The exact npm start command reached the intentional TELEGRAM_DRY_RUN guard before any Telegram request. Dependency versions were unchanged. This proves installation/startup packaging, not delivery of real updates.


## Employer posts in @ishdasiz and Vertex AI

Employers can fill a vacancy manually or send its text/forwarded caption for an AI draft, review it, select a region and explicitly confirm publication. Local employer vacancies target @ishdasiz through the website's durable channel worker. Imported jobs and consented resumes retain regional destinations. This standalone polling package does not run that website queue worker.

All Gemini model calls now use Vertex AI express mode with `GOOGLE_CLOUD_API_KEY` (or `gemini_cloud_api`). Configure `VERTEX_MODEL=gemini-2.5-flash`, optionally `VERTEX_VACANCY_MODEL` and `VERTEX_FALLBACK_MODEL`. The old Developer API key is not used. Keep secrets in the host environment or ignored .env files.

Deploy the matching website change and its `20261027090000_main_employer_channel.sql` migration before enabling main-channel delivery. Pause channel scheduling during the coordinated switch. The migration does not bulk-publish historical jobs. GitHub changes alone do not configure host secrets or apply database migrations.

`npx tsx scripts/check-bot-channel.ts` checks Telegram permissions, webhook state and database routing without posting or changing delivery mode. The existing bot already uses the website webhook; do not start a second poller while it is active.

The regression suite also checks the adjacent website checkout at `../ISHDASIZ NEW`. `tests/tsconfig.json` supplies its @/ import mapping. Runtime installation and production code do not require that checkout.
