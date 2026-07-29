# Production completion — change log & roadmap

## Spec source

Full requirements live in the user production-completion prompt (RBAC, ledger, worker, admin modules, RLS, tests).

## Audit

See [`docs/AUDIT.md`](./AUDIT.md) for feature-by-feature status.

---

## Completed in production-readiness pass (2026-07-29)

### Telegram bot + registration
- Production webhook Edge Function: `supabase/functions/telegram-bot`
- Phone-first `/start`: own shared contact required before account creation
- Mini App `initData` HMAC verification in `game-action` `upsert_player`
- Bot → game-action auth via `x-bot-internal-secret`
- Shared `TelegramIdentityProvider` + blocking `PhoneGate` until phone is set
- Ops guide: `docs/TELEGRAM_BOT.md`

### Theme system
- Light theme as CSS `:root` default; dark via `.dark` class
- `ThemeProvider` (next-themes) with localStorage persistence
- `ThemeToggle` on player layout header, profile settings, and admin header

### Admin dashboard
- Full rewrite: light-first professional layout, sidebar navigation, hash routing
- Financial charts (bar, pie, line) via Recharts
- `AdminDataTable` with search, sort, pagination, CSV export
- System settings loaded/saved via `get_system_settings` / `update_system_settings`
- All demo/mock admin code removed

### Security (edge function + migration)
- PBKDF2 password hashing with plaintext migration on login
- Admin session tokens (`admin_sessions` table)
- Rate limiting (`rate_limits` table, 120 req/min per IP per action)
- Worker endpoint protected by `WORKER_SECRET` env
- RLS lockdown: removed permissive read-all policies on financial tables
- Migration: `20260729120000_production_security.sql`

### App resilience
- `ErrorBoundary` wrapper, structured `logger`, code-split routes
- React Query defaults tuned for production
- Accessibility: skip link, focus rings, reduced-motion support

### Tests & build
- Admin utility unit tests (`src/test/admin.test.ts`)
- Production build passes with zero ESLint errors

---

## Completed in this increment (Phase 1 + foundations + admin expansion)

### Preserved
- Existing gameplay, cartelas, claim/payout formulas, dual wallets, Verify.ET deposit path, admin live controls, EN/AM i18n.

### Modified
| Change | Location |
| --- | --- |
| Public stakes aligned to `10,20,50,100,500` | `game-action` `normalizeStake` |
| Lobby prize preview commission default → **20%** | `Index.tsx` |
| **Play → main** transfer | `transfer_to_main_wallet` + Wallet UI |
| Demo admin in **DEV** or `VITE_APP_ENV=demo` | `Admin.tsx` |
| Offline local player when Supabase down | `useTelegramIdentity.ts` |
| Admin sections: Live Ops, Deposits, Withdrawals, Settings | `Admin.tsx` |
| Withdrawal fund locking | `request_withdrawal` / `process_wallet_request` |
| Server worker action `worker_tick_rooms` | game-action |
| Production foundation migration | `20260729090000_production_foundation.sql` |

### Removed from production mode
- Always-on demo credentials UI / login path (gated).
- Hardcoded display of seeded admin password in prod UI.

### Migration adds
- `system_settings`
- Player locked/lifetime columns
- Transaction idempotency + metadata
- Wallet request provider uniqueness
- `called_numbers`, `room_events`
- `admin_role` enum
- `room_cartela_ownership`
- `idempotency_keys`

---

## Remaining (must continue)

### Phase 2 — Financial
- [ ] Withdrawal lock → paid lifecycle
- [ ] Deposit status machine + reuse protection end-to-end
- [ ] Full immutable ledger usage on every money move
- [ ] Idempotency on join/claim/deposit/withdraw

### Phase 3 — Game reliability
- [ ] Schedule `worker_tick_rooms` (cron) and stop relying on host browser
- [ ] Reconnect without deleting paid seats
- [ ] Simultaneous claim row locks
- [ ] Configurable no-winner / disconnect rules from settings

### Phase 4 — Admin
- [ ] Full sidebar modules (queues, reports, settings, live ops)
- [ ] Role-gated UI + backend permission checks

### Phase 5 — Security
- [ ] Bind actions to verified Telegram/session actor (no free `player_id`)
- [ ] Supabase Auth for admins; hash/remove plaintext passwords
- [ ] Tighten RLS (remove `using (true)` on sensitive tables)

### Phase 6 — Tests & deploy
- [ ] Unit + financial + load tests
- [ ] Working Supabase project + `db push` + function deploy + secrets

---

## How to apply this increment

1. Restore/create a **working** Supabase project; update `.env`.
2. `npx supabase db push`
3. Set secrets + deploy:

```bash
npx supabase secrets set VERIFY_ET_API_KEY=...
npx supabase secrets set VERIFY_ET_BASE_URL=https://verify.et
npx supabase functions deploy game-action
```

4. Schedule worker (example cron every 2s–3s invoking `worker_tick_rooms`).
5. Production frontend: `VITE_APP_ENV=production` (default). Demo: `VITE_APP_ENV=demo`.

---

## Release checklist (abbreviated)

- [ ] Supabase DNS reachable
- [ ] Migrations applied
- [ ] game-action deployed
- [ ] Verify.ET secrets set
- [ ] Worker scheduled
- [ ] Demo admin disabled in prod
- [ ] Play↔main transfers verified
- [ ] Stake/commission UI matches backend
- [ ] Auth binding + RLS (Phase 5) complete before public money
