# Yegara Bingo — Game Business Logic

**Product:** Yegara Bingo (የጋራ ቢንጎ)  
**Type:** Real-time 75-ball multiplayer bingo with stake / prize-pool (derash) play  
**Authority:** All money and game mutations run through `supabase/functions/game-action`

> **Production work:** See [`docs/AUDIT.md`](./docs/AUDIT.md) and [`docs/PRODUCTION_CHANGELOG.md`](./docs/PRODUCTION_CHANGELOG.md).  
> This file documents **business rules**. Implementation is incremental on the existing codebase.

---

## 1. Core idea

Players buy **cartelas** by staking into a shared room pot (**derash / ደራሽ**). Numbers are called from a shuffled 1–75 sequence. The first valid completed line wins a payout equal to the pot minus the house commission. If nobody wins after all 75 numbers, the house keeps the pot (configurable later).

```text
Deposit → Main wallet → Transfer → Play wallet → Stake into derash → Winner payout (minus house %)
Play winnings → Main wallet → Withdrawal request
```

---

## 2. Money model

| Wallet | Purpose |
| --- | --- |
| **Main** | Verified deposits; withdrawals; receives play→main transfers |
| **Play** | Stakes, cartelas, false-claim penalties, bingo payouts |

```text
total_stake = stake_amount × cartela_count
winner_payout = floor(derash × (100 − house_commission_pct) / 100)
false_penalty = max(1, floor(stake_amount × penalty_pct / 100))
```

Default house commission: **20%**.  
Default false-claim penalty: **20%** of stake per card (min 1).

---

## 3. Cartelas

- 1–3 cartelas from numbers **1–200**
- Deterministic 75-ball cards; center FREE
- Stake charged immediately into derash
- Lobby upgrade: pay for additional cards only

---

## 4. Rooms

**Public:** match/reuse by stake; stakes **10 / 20 / 50 / 100 / 500**  
**Private:** create with code; stakes **10 / 20 / 50 / 100**

Lifecycle (current): `lobby` → `live` → `finished` (+ optional `paused`)

Production target adds worker-driven calling (`worker_tick_rooms`) so the host browser is not required.

---

## 5. Roles (target)

`player` · `support_admin` · `game_admin` · `finance_admin` · `auditor` · `super_admin`

Demo admin credentials work **only** when `VITE_APP_ENV=demo`.

---

## 6. Related docs

| Doc | Purpose |
| --- | --- |
| `docs/AUDIT.md` | Feature status matrix |
| `docs/PRODUCTION_CHANGELOG.md` | What changed / remaining phases |
| `README.md` | Setup & scripts |
| `.env.example` | Environment template |
