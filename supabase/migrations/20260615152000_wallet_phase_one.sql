-- Wallet phase 1: dual balances + wallet requests + richer transactions

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'deposit'
  ) then
    alter type tx_kind add value 'deposit';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'withdrawal'
  ) then
    alter type tx_kind add value 'withdrawal';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'transfer_to_play'
  ) then
    alter type tx_kind add value 'transfer_to_play';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'wallet_request_kind'
  ) then
    create type wallet_request_kind as enum ('deposit','withdrawal');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'wallet_request_status'
  ) then
    create type wallet_request_status as enum ('pending','approved','rejected');
  end if;
end
$$;

alter table public.players
  add column if not exists main_wallet_balance int not null default 1000,
  add column if not exists play_wallet_balance int not null default 1000;

update public.players
set
  main_wallet_balance = coalesce(main_wallet_balance, wallet_balance, 1000),
  play_wallet_balance = coalesce(play_wallet_balance, wallet_balance, 1000),
  wallet_balance = coalesce(play_wallet_balance, wallet_balance, 1000);

create table if not exists public.wallet_requests (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  kind wallet_request_kind not null,
  amount int not null check (amount > 0),
  status wallet_request_status not null default 'pending',
  note text,
  processed_by uuid references public.players(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.wallet_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_requests' and policyname = 'wallet requests readable'
  ) then
    create policy "wallet requests readable" on public.wallet_requests for select using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wallet_requests' and policyname = 'wallet requests insertable'
  ) then
    create policy "wallet requests insertable" on public.wallet_requests for insert with check (true);
  end if;
end
$$;

alter publication supabase_realtime add table public.wallet_requests;
alter table public.wallet_requests replica identity full;
