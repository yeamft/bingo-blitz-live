-- Replace the legacy 1000 ETB demo seed with a small starting balance.
-- New players get 20 ETB on the play wallet and 0 on main.

alter table public.players
  alter column wallet_balance set default 20,
  alter column main_wallet_balance set default 0,
  alter column play_wallet_balance set default 20;

-- Trim unused demo balances that still match the old 1000/1000 seed
-- (players who have already deposited or played are left unchanged).
with seeded as (
  select p.id
  from public.players p
  where coalesce(p.main_wallet_balance, 0) = 1000
    and coalesce(p.play_wallet_balance, p.wallet_balance, 0) = 1000
    and not exists (
      select 1
      from public.transactions t
      where t.player_id = p.id
        and t.kind not in ('seed')
    )
)
update public.players p
set
  main_wallet_balance = 0,
  play_wallet_balance = 20,
  wallet_balance = 20
from seeded
where p.id = seeded.id;
