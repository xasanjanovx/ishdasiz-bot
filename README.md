# ISHDASIZ Bot (Polling)

Standalone Telegram bot package extracted from the main ISHDASIZ repository.

## Run locally

1. Install dependencies:
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
- `GEMINI_API_KEY`
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