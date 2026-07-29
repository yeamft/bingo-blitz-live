-- Production foundation: settings, ledger fields, room worker, events, integrity
-- Safe additive migration — does not drop existing data.

-- ---------------------------------------------------------------------------
-- 1) App environment / system settings (authoritative config)
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.players(id) on delete set null
);

insert into public.system_settings (key, value) values
  ('public_stakes', '[10,20,50,100,500]'::jsonb),
  ('private_stakes', '[10,20,50,100]'::jsonb),
  ('house_commission_pct', '20'::jsonb),
  ('lobby_duration_seconds', '30'::jsonb),
  ('call_interval_ms', '3000'::jsonb),
  ('false_claim_penalty_pct', '20'::jsonb),
  ('false_claim_min_penalty', '1'::jsonb),
  ('max_cartelas', '3'::jsonb),
  ('min_cartelas', '1'::jsonb),
  ('app_env', '"production"'::jsonb),
  ('deposits_enabled', 'true'::jsonb),
  ('withdrawals_enabled', 'true'::jsonb),
  ('new_games_enabled', 'true'::jsonb),
  ('no_winner_rule', '"auto_award_earliest_line"'::jsonb),
  ('disconnect_rule', '"keep_registered"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Wallet integrity columns on players
-- ---------------------------------------------------------------------------
alter table public.players
  add column if not exists locked_main_balance int not null default 0,
  add column if not exists locked_play_balance int not null default 0,
  add column if not exists lifetime_deposits int not null default 0,
  add column if not exists lifetime_withdrawals int not null default 0,
  add column if not exists lifetime_stakes int not null default 0,
  add column if not exists lifetime_winnings int not null default 0,
  add column if not exists last_seen_at timestamptz,
  add column if not exists connected boolean not null default false,
  add column if not exists language text default 'en';

-- ---------------------------------------------------------------------------
-- 3) Expand transaction kinds + ledger metadata
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'play_to_main'
  ) then
    alter type tx_kind add value 'play_to_main';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'false_claim_penalty'
  ) then
    alter type tx_kind add value 'false_claim_penalty';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'admin_credit'
  ) then
    alter type tx_kind add value 'admin_credit';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tx_kind' and e.enumlabel = 'admin_debit'
  ) then
    alter type tx_kind add value 'admin_debit';
  end if;
end
$$;

alter table public.transactions
  add column if not exists wallet_type text,
  add column if not exists balance_before int,
  add column if not exists idempotency_key text,
  add column if not exists status text not null default 'completed',
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.players(id) on delete set null;

create unique index if not exists transactions_idempotency_key_uidx
  on public.transactions (idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- 4) Deposit / withdrawal request enrichment
-- ---------------------------------------------------------------------------
alter table public.wallet_requests
  add column if not exists provider text,
  add column if not exists provider_reference text,
  add column if not exists account_suffix text,
  add column if not exists phone_number text,
  add column if not exists verified_amount int,
  add column if not exists verification_payload jsonb,
  add column if not exists rejection_reason text,
  add column if not exists destination_account text,
  add column if not exists provider_payment_reference text,
  add column if not exists locked_amount int not null default 0,
  add column if not exists lifecycle_status text not null default 'pending';

create unique index if not exists wallet_requests_provider_reference_uidx
  on public.wallet_requests (provider, provider_reference)
  where provider is not null
    and provider_reference is not null
    and status in ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- 5) Room worker + lifecycle fields
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column if not exists last_call_at timestamptz,
  add column if not exists next_call_at timestamptz,
  add column if not exists worker_lock_id text,
  add column if not exists worker_lock_expires_at timestamptz,
  add column if not exists minimum_players int not null default 1,
  add column if not exists lifecycle_status text;

create table if not exists public.called_numbers (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  number int not null check (number between 1 and 75),
  sequence_index int not null check (sequence_index >= 0),
  called_at timestamptz not null default now(),
  created_by text not null default 'worker',
  unique (room_id, number),
  unique (room_id, sequence_index)
);

create index if not exists called_numbers_room_id_idx on public.called_numbers (room_id);

create table if not exists public.room_events (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  user_id uuid references public.players(id) on delete set null,
  admin_id uuid references public.players(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_events_room_id_created_at_idx
  on public.room_events (room_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6) Admin roles foundation (additive; keeps is_admin for compatibility)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type admin_role as enum (
      'super_admin',
      'finance_admin',
      'game_admin',
      'support_admin',
      'auditor',
      'player'
    );
  end if;
end
$$;

alter table public.players
  add column if not exists admin_role admin_role not null default 'player';

update public.players
set admin_role = 'super_admin'
where coalesce(is_admin, false) = true
  and admin_role = 'player';

-- ---------------------------------------------------------------------------
-- 7) Cartela uniqueness helper (sold cartelas per room)
-- ---------------------------------------------------------------------------
create table if not exists public.room_cartela_ownership (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  cartela_number int not null check (cartela_number between 1 and 200),
  purchased_at timestamptz not null default now(),
  unique (room_id, cartela_number)
);

create index if not exists room_cartela_ownership_player_idx
  on public.room_cartela_ownership (room_id, player_id);

-- ---------------------------------------------------------------------------
-- 8) Idempotency registry for sensitive actions
-- ---------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id bigserial primary key,
  scope text not null,
  user_id uuid references public.players(id) on delete cascade,
  key text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (scope, user_id, key)
);

-- ---------------------------------------------------------------------------
-- 9) Align default house commission documentation via settings already seeded
-- ---------------------------------------------------------------------------
update public.rooms
set house_commission_pct = coalesce(house_commission_pct, 20)
where house_commission_pct is null;

-- ---------------------------------------------------------------------------
-- 10) Realtime publication for worker-driven tables
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.called_numbers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.room_events;
  exception when duplicate_object then null;
  end;
end
$$;

alter table public.called_numbers replica identity full;
alter table public.room_events replica identity full;
