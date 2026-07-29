# Yegara Bingo — Production Audit

**Date:** 2026-07-29  
**Scope:** Existing codebase modification (not a rewrite)  
**Verdict:** Feature-rich prototype, **not production-safe** until financial auth, RLS, server-side calling, and admin security are completed.

---

## 1. Executive summary

| Area | Verdict |
| --- | --- |
| Player gameplay UI | Mostly working |
| Edge game engine | Working core, unsafe auth binding |
| Wallets / deposits | Partially working |
| Withdrawals | Partial (request only, weak locks) |
| Admin dashboard | Partial + demo-mocked |
| Realtime | Partial |
| Security / RLS | **Unsafe** |
| Server-side game clock | **Missing** (host browser) |

### Critical blockers

1. `game-action` trusts client-supplied `player_id` (no verified session binding).
2. Admin passwords stored/compared in plaintext; demo credentials work always.
3. RLS policies are effectively `SELECT/INSERT/UPDATE using (true)` on sensitive tables.
4. Number calling and lobby start depend on the **host browser**.
5. No play→main transfer (withdrawal path incomplete).
6. Current Supabase project in `.env` may be unreachable (ops issue).

---

## 2. Feature classification

| Feature | Status | Evidence |
| --- | --- | --- |
| Authentication | Unsafe | `game-action` has no actor binding; client sends `player_id` |
| Telegram Mini App identity | Unsafe | `useTelegramIdentity.ts` trusts `initDataUnsafe` client-side |
| Player registration | Working | `upsert_player` |
| User profile | Working | `Profile.tsx` + `player-data.ts` |
| Main wallet | Working | Wallet page + edge function |
| Play wallet | Working | Stake source + payouts |
| Main → play transfer | Working | `transfer_to_play_wallet` |
| Play → main transfer | Missing | Spec §6; not in API |
| Deposits (Verify.ET) | Needs testing | Integrated; needs unique-ref + status machine |
| Withdrawals | Partially working | Request only; no lock/paid lifecycle |
| Public rooms | Working | Reuse-by-stake exists |
| Private rooms | Partially working | Password plaintext; UI incomplete |
| Cartela selection | Working | 1–3 cards, 1–200 |
| Cartela generation | Working | Deterministic in edge + `cartela.ts` |
| Lobby countdown | Working | Client `tick_lobby` |
| Number calling | Partially working | Host-driven `call_next` |
| Auto-fill | Working | Server marks on call |
| Manual marking | Working | `mark_number` |
| Bingo claims | Working | Immediate payout path |
| Winner validation | Partially working | Server validates; paused path incomplete |
| Winner payout | Working | Play wallet credit |
| House commission | Partially working | DB default 20%; UI preview often 10% |
| False-claim penalties | Working | 20% of stake_amount |
| Real-time updates | Partially working | Room channel; lobby polls |
| Player disconnection | Missing | Leave removes row; no reconnect model |
| Game recovery | Partially working | Admin reset/advance only |
| Admin authentication | Unsafe | Plaintext + always-on demo |
| Admin permissions / RBAC | Missing | Single `is_admin` flag |
| Admin dashboard | Partially working | Ops UI + demo mutations |
| Financial reports | Unsafe | Aggregates limited recent rows |
| Audit logs | Unsafe | Exists but readable by all; actor not verified |
| System settings | Missing | Hardcoded stakes/commission |
| Error handling | Partially working | Better network messages; no error codes |
| Responsive design | Partially working | Mobile-first player; admin desktop-ish |

---

## 3. Business rules currently enforced

```text
total_stake = stake_amount × cartela_count
winner_payout = floor(derash × (100 − house_commission_pct) / 100)
false_penalty = max(1, floor(stake_amount × 0.2))
```

- Stakes deducted immediately into **derash**.
- No mid-game refund on leave.
- No winner after 75 calls → house keeps pot.
- FREE center always marked.

### Mismatches to fix

| Topic | Frontend | Backend / DB |
| --- | --- | --- |
| Public stakes | 10,20,50,100,500 | 10,20 only |
| Private stakes | via UI options | 10,20,50,100 |
| House commission preview | ~10% | default 20% |

---

## 4. Security findings

| Issue | Severity |
| --- | --- |
| Unauthenticated impersonation via `player_id` | Critical |
| Plaintext `admin_password` | Critical |
| Demo admin always enabled | High |
| Broad RLS read/write | Critical |
| Telegram identity not server-validated | High |
| Service role in edge + open invoke | High |
| Private room password returned/stored plaintext | Medium |
| Verify.ET key must stay server-only | Medium (currently OK if secrets set) |

---

## 5. Preserved working functionality (do not rip out)

- Cartela generation and line detection
- Lobby → live → finished flow
- Stake into derash + payout formula
- Auto-fill / manual mark
- Claim bingo + false claim penalty
- Dual wallets + main→play
- Verify.ET deposit verification scaffold
- Admin summary + room/user controls (live path)
- Telegram bot registration/balance/play links
- EN/AM i18n

---

## 6. Mock / demo to remove from production

- `admin@test.com` / `admin123` session (`Admin.tsx`, `admin-demo.ts`) — allow only when `APP_ENV=demo` / `VITE_APP_ENV=demo`
- Seeded credentials displayed in admin login UI
- Client-side demo summary mutations as “real” ops

---

## 7. Missing for production (spec map)

| Spec area | Status |
| --- | --- |
| RBAC roles (super/finance/game/support/auditor) | Missing |
| Immutable wallet ledger fields + locked balance | Partial / needs migration |
| Play → main transfer | Missing |
| Deposit status machine + unique provider refs | Partial |
| Withdrawal lock → paid lifecycle | Missing |
| Config-driven stakes/commission | Missing |
| Cartela UNIQUE(room, number) + reservation TTL | Partial foundation exists |
| Room state machine + room_events | Partial statuses |
| Server worker for calls | Missing |
| called_numbers table | Missing |
| Reconnect without leave | Missing |
| Full admin modules (reports, settings, queues) | Partial |
| Structured `{success,code,message,data}` API | Missing |
| Idempotency keys | Missing |
| Automated financial tests | Missing |

---

## 8. Phased implementation plan

### Phase 1 — Audit & stabilization *(this document + immediate fixes)*
- Align stakes & commission defaults
- Gate demo admin to demo env
- Clear error contracts scaffolding
- Migrations for settings + integrity columns

### Phase 2 — Financial integrity
- Play→main transfer
- Ledger/idempotency/locked balances
- Deposit unique refs + statuses
- Withdrawal lock/release/paid

### Phase 3 — Game reliability
- Server worker tick (lobby + call_next)
- called_numbers + room_events
- Reconnect; leave ≠ abandon stake seat
- Simultaneous claim locking

### Phase 4 — Admin dashboard
- Role-gated modules, live ops, queues, reports, settings

### Phase 5 — Security
- Actor binding, Telegram initData verify, RLS tighten, Supabase Auth for admins

### Phase 6 — Testing & deploy
- Unit/integration/financial tests, load tests, release checklist

---

## 9. Release readiness (current)

| Gate | Pass? |
| --- | --- |
| Working Supabase project | No (env host previously ENOTFOUND) |
| Migrations applied | Unknown / blocked |
| game-action deployed | Blocked without project |
| Verify.ET secrets set | Local `.env` only; needs edge secrets |
| No demo admin in prod | Fail |
| Auth binding | Fail |
| RLS least privilege | Fail |
| Server-side caller | Fail |
| Play→main | Fail |
| Financial tests | Fail |

**Go-live recommendation:** Do not launch until Phases 1–3 critical items and Phase 5 auth/RLS pass.
