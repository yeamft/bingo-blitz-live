# Telegram Bot Production Setup

Production bot transport is the Supabase Edge Function webhook at
`supabase/functions/telegram-bot`. Do **not** run the Node polling worker
(`bot/telegram-bot.js`) against the same bot token once the webhook is live.

## Registration flow

1. User sends `/start`
2. If they already have a player row with a phone number → welcome + Play button
3. Otherwise → reply keyboard asks them to share **their own** phone contact
4. Bot calls `game-action` `upsert_player` with `x-bot-internal-secret`
5. User taps **Play** (`web_app`) to open the Mini App HTTPS URL
6. Mini App sends Telegram `initData`; `game-action` verifies HMAC and resolves the same player
7. If phone is still missing, the Mini App `PhoneGate` blocks play until it is saved

## Required secrets

Set these on the Supabase project (Edge Function secrets):

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC...
npx supabase secrets set TELEGRAM_WEBHOOK_SECRET=long-random-string
npx supabase secrets set BOT_INTERNAL_SECRET=long-random-string
npx supabase secrets set TELEGRAM_MINI_APP_URL=https://your-frontend.example.com
```

Notes:

- `TELEGRAM_MINI_APP_URL` must be the **HTTPS frontend origin** configured in BotFather as the Mini App URL (not `https://t.me/...`).
- `BOT_INTERNAL_SECRET` is shared by `telegram-bot` → `game-action` only. Never put it in `VITE_` env vars.
- `TELEGRAM_BOT_TOKEN` is also required by `game-action` to verify Mini App `initData`.

## Deploy functions

```bash
npx supabase functions deploy game-action --project-ref gdyyngrhazvnszqawdog --use-api
npx supabase functions deploy telegram-bot --project-ref gdyyngrhazvnszqawdog --use-api
```

## Point Telegram at the webhook

Replace `YOUR_BOT_TOKEN` and `YOUR_WEBHOOK_SECRET`:

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" ^
  -d "url=https://gdyyngrhazvnszqawdog.supabase.co/functions/v1/telegram-bot" ^
  -d "secret_token=YOUR_WEBHOOK_SECRET" ^
  -d "allowed_updates=[\"message\",\"callback_query\"]"
```

Register commands:

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/setMyCommands" ^
  -H "Content-Type: application/json" ^
  -d "{\"commands\":[{\"command\":\"start\",\"description\":\"Register / open menu\"},{\"command\":\"play\",\"description\":\"Open Bingo\"},{\"command\":\"balance\",\"description\":\"Wallet balances\"},{\"command\":\"instructions\",\"description\":\"How to play\"},{\"command\":\"support\",\"description\":\"Contact support\"}]}"
```

Verify:

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

## Frontend

1. Set `VITE_SUPABASE_*` for the production project
2. Set BotFather Mini App URL to your deployed HTTPS frontend
3. `npm run build` and deploy `dist`
4. Smoke test: `/start` → share phone → Play → lobby loads as the same user

## Local DEV polling (optional)

Only when no webhook is set on the bot:

```bash
BOT_POLLING=1 npm run bot
```

If a webhook is already configured, delete it before polling:

```bash
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook"
```
