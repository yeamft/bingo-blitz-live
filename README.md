# Bingo Blitz Live

Bingo Blitz Live is a mobile-first bingo web app designed for Telegram users. It combines a React/Vite frontend, Supabase-backed game and wallet logic, a Telegram bot, and an admin dashboard to run real-time 75-ball bingo rooms with public and private play modes.

## Overview

This project includes:

- **Telegram-friendly bingo mini app** with mock identity fallback for local development
- **Real-time room flow** with lobby, live, paused verification, and finished states
- **Wallet system** with play wallet, main wallet, deposit/withdrawal requests, and transfers
- **Admin dashboard** for users, wallets, rooms, reports, transactions, and audit logs
- **Supabase Edge Function game engine** as the authoritative source of gameplay mutations
- **Telegram bot** for registration, balance checks, deposit requests, and opening the mini app

## Core Features

### Player experience

- Enter public bingo lobbies grouped by stake amount
- Create private rooms
- Join rooms using a room code
- Select up to 3 cartelas per round
- View live master board and called numbers
- Use manual daubing or auto-fill
- Claim bingo during live play
- Watch paused verification before payout is confirmed
- Replay into the next round after a game finishes

### Wallets and transactions

- Player registration/upsert through Telegram identity
- Play wallet and main wallet support
- Deposit and withdrawal request flow
- Transfer funds from main wallet to play wallet
- Transaction history and wallet summary views

### Admin capabilities

- Test admin login flow in the web dashboard
- Overview metrics for users, rooms, revenue, and payouts
- User search and admin role toggling
- Manual wallet adjustments
- Room closure controls
- Wallet request approval/rejection
- Audit log visibility

## Tech Stack

### Frontend

- **React 18**
- **TypeScript**
- **Vite**
- **React Router**
- **TanStack Query**
- **Tailwind CSS**
- **shadcn/ui + Radix UI**
- **Sonner** for notifications

### Backend / Platform

- **Supabase**
  - Postgres database
  - Edge Functions
  - Realtime/data access
- **Telegram Bot API**
- **Vercel** SPA rewrite config for deployment

### Testing / Tooling

- **Vitest**
- **ESLint**

## Project Structure

```text
.
├─ src/                         # React application
│  ├─ components/              # UI and bingo-specific components
│  ├─ hooks/                   # Client hooks such as Telegram identity / room state
│  ├─ lib/                     # API helpers, i18n, bingo utilities
│  └─ pages/                   # Game, room, wallet, profile, history, admin pages
├─ supabase/
│  ├─ functions/game-action/   # Authoritative bingo engine edge function
│  └─ migrations/              # Database schema and logic migrations
├─ bot/                        # Telegram bot script
├─ public/                     # Static assets
└─ README.md
```

## Main Routes

- `/game` - main game entry and lobby flow
- `/room/:code` - active room experience
- `/wallet` - wallet balances and requests
- `/history` - game/transaction history area
- `/profile` - player profile
- `/admin` - admin dashboard

## Architecture Notes

### 1. Frontend app

The frontend is a single-page application defined from `src/App.tsx` and optimized for mobile play. It uses a mock identity when Telegram WebApp context is unavailable, which makes local browser testing easier.

### 2. Supabase Edge Function game engine

Most game mutations are centralized in:

- `supabase/functions/game-action/index.ts`

This edge function handles actions such as:

- player registration
- room creation and joining
- lobby transitions
- calling bingo numbers
- marking numbers and auto-fill
- bingo claims and host verification
- wallet requests and admin actions

This keeps game state authoritative on the backend instead of trusting direct client writes.

### 3. Telegram integration

The app reads identity from `window.Telegram.WebApp` when running inside Telegram. Outside Telegram, it falls back to a locally generated mock identity stored in localStorage.

The companion bot in `bot/telegram-bot.js` can:

- register a player
- show balances
- create deposit requests
- send a button that opens the mini app

## Local Development

### Prerequisites

Make sure you have:

- **Node.js** installed
- **npm** installed
- A **Supabase project**
- Optional: a **Telegram bot token** for bot testing

### Install dependencies

```bash
npm install
```

### Start the frontend

```bash
npm run dev
```

### Run the Telegram bot (local DEV only)

```bash
BOT_POLLING=1 npm run bot
```

Production uses the `telegram-bot` Edge Function webhook — see `docs/TELEGRAM_BOT.md`.

### Run tests

```bash
npm run test
```

### Lint the codebase

```bash
npm run lint
```

## Environment Variables

This project uses environment variables for Supabase and Telegram integration. Based on the codebase, you will likely need values similar to the following in your local environment:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_MINI_APP_URL=...
APP_URL=...

# Verify.ET deposit verification (server-side in game-action edge function)
VERIFY_ET_BASE_URL=https://verify.et
VERIFY_ET_API_KEY=VERIFY_BANK_ET_your_key_here
# Optional: only accept payments sent to this wallet/account
# VERIFY_ET_SETTLEMENT_ACCOUNT=0939080897
# VERIFY_ET_WAIT_MS=8000
```

### Notes

- Production Telegram bot is `supabase/functions/telegram-bot` (webhook), not the Render worker.
- Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `BOT_INTERNAL_SECRET`, and `TELEGRAM_MINI_APP_URL` as **Supabase Edge Function secrets**.
- `TELEGRAM_MINI_APP_URL` must be the HTTPS frontend URL configured in BotFather (not a `t.me` link).
- Local polling bot may read `TELEGRAM_BOT_TOKEN` / `BOT_INTERNAL_SECRET` from `.env` when `BOT_POLLING=1`.
- Deposit verification uses [Verify.ET](https://verify.et/docs). Set `VERIFY_ET_API_KEY` as a Supabase Edge Function secret (not in the frontend bundle):

```bash
supabase secrets set VERIFY_ET_API_KEY=VERIFY_BANK_ET_your_key_here
supabase secrets set VERIFY_ET_BASE_URL=https://verify.et
supabase functions deploy game-action
supabase functions deploy telegram-bot
```

## Supabase Setup

The repository contains:

- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/functions/game-action/`

To work with Supabase locally or against your hosted project:

1. Create/link your Supabase project.
2. Apply the SQL migrations in `supabase/migrations`.
3. Deploy the `game-action` edge function.
4. Ensure your frontend environment variables point to the correct Supabase project.

If you use the Supabase CLI, typical commands are along the lines of:

```bash
supabase db push
supabase functions deploy game-action
```

Adjust these commands to match your local Supabase workflow.

## Telegram Bot Commands

Production bot is the Supabase Edge Function webhook (`supabase/functions/telegram-bot`).
See [docs/TELEGRAM_BOT.md](docs/TELEGRAM_BOT.md) for secrets, `setWebhook`, and deploy steps.

Supported commands:

- `/start` - phone-first registration / main menu
- `/play` - open the Mini App
- `/balance` - wallet balances
- `/instructions` - how to play
- `/support` - support contact

Deposit and withdraw happen in the Mini App Wallet tab.

### Run the local DEV polling bot (optional)

```bash
BOT_POLLING=1 npm run bot
```

Do not poll the same bot token that already has a production webhook.

## Admin Access

The admin page includes a test login flow for local/demo usage.

Current test credentials in the code:

- **Email:** `admin@test.com`
- **Password:** `admin123`

The admin UI can also be enabled through test session logic used in `src/pages/Admin.tsx`.

## Deployment

### Frontend

The project includes a `vercel.json` rewrite so direct route visits resolve to `index.html` in production.

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This makes the SPA work correctly when deployed to Vercel.

### Recommended deployment pieces

- Deploy the frontend to **Vercel** or another static host
- Deploy Supabase database migrations and the **game-action** + **telegram-bot** edge functions
- Configure Telegram `setWebhook` as documented in `docs/TELEGRAM_BOT.md`
- Do **not** host the Node polling worker in production once the webhook is live

## Important Implementation Details

- Public rooms may automatically reuse an existing open room for the same stake.
- Players can join as watchers if they cannot stake in time or lack sufficient balance.
- Bingo claims are verified through a paused review phase before payout is finalized.
- Auto-fill can mark called numbers automatically for player cards.
- The app supports multilingual behavior, including Amharic speech playback for called numbers in room play.

## Scripts

Available npm scripts:

```bash
npm run dev
npm run build
npm run build:dev
npm run preview
npm run lint
npm run test
npm run test:watch
npm run bot
```

## Known Development Notes

- The repository still contains a generic starter package name (`vite_react_shadcn_ts`) in `package.json`.
- The current `README.md` was originally a placeholder and has now been replaced with project-specific documentation.
- For full production readiness, make sure your actual environment variables, Supabase schema, and bot hosting setup are documented further for your team.

## Suggested Next Improvements

If you want to extend this README later, good additions would be:

- screenshots of the lobby, room, wallet, and admin pages
- a database schema overview
- a full environment variable reference
- deployment instructions for Supabase CLI and Telegram bot hosting
- contributor guidelines

## License

Add your project license here if you want to make distribution terms explicit.
