-- Production security hardening: admin sessions, rate limits, RLS lockdown, password hashing support.

-- ── Admin sessions ──────────────────────────────────────────────────────────
create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_sessions_player_idx on public.admin_sessions(player_id);
create index if not exists admin_sessions_expires_idx on public.admin_sessions(expires_at);

alter table public.admin_sessions enable row level security;

-- ── Rate limiting ───────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  id bigserial primary key,
  scope text not null,
  identifier text not null,
  window_start timestamptz not null default now(),
  request_count int not null default 1,
  unique (scope, identifier, window_start)
);

create index if not exists rate_limits_lookup_idx on public.rate_limits(scope, identifier, window_start desc);

alter table public.rate_limits enable row level security;

-- ── Password hash column (replaces plaintext admin_password over time) ───────
alter table public.players
  add column if not exists admin_password_hash text;

comment on column public.players.admin_password_hash is
  'PBKDF2 hash in format pbkdf2:iterations:salt:hash. Plaintext admin_password is deprecated.';

-- ── RLS lockdown: drop permissive read-all policies ─────────────────────────
drop policy if exists "players readable" on public.players;
drop policy if exists "rooms readable" on public.rooms;
drop policy if exists "room_players readable" on public.room_players;
drop policy if exists "tx readable" on public.transactions;
drop policy if exists "audit readable" on public.audit_log;
drop policy if exists "wallet requests readable" on public.wallet_requests;
drop policy if exists "wallet requests insertable" on public.wallet_requests;
drop policy if exists "room cartela reservations readable" on public.room_cartela_reservations;

-- Public read for lobby (rooms + room_players only — no financial data)
drop policy if exists "rooms_public_read" on public.rooms;
create policy "rooms_public_read" on public.rooms
  for select using (true);

drop policy if exists "room_players_public_read" on public.room_players;
create policy "room_players_public_read" on public.room_players
  for select using (true);

drop policy if exists "cartela_reservations_public_read" on public.room_cartela_reservations;
create policy "cartela_reservations_public_read" on public.room_cartela_reservations
  for select using (true);

-- Service role bypasses RLS; anon/authenticated clients cannot read sensitive tables.
-- All wallet, player, transaction, and audit access goes through the game-action edge function.

-- ── Enable RLS on tables that were missing it ───────────────────────────────
alter table if exists public.system_settings enable row level security;
alter table if exists public.called_numbers enable row level security;
alter table if exists public.room_events enable row level security;
alter table if exists public.room_cartela_ownership enable row level security;
alter table if exists public.idempotency_keys enable row level security;

-- ── Seed default system settings if missing (value is jsonb) ────────────────
insert into public.system_settings (key, value) values
  ('public_stakes', '[10,20,50,100,500]'::jsonb),
  ('private_stakes', '[10,20,50,100]'::jsonb),
  ('house_commission_pct', '20'::jsonb),
  ('lobby_duration_seconds', '30'::jsonb),
  ('call_interval_ms', '3000'::jsonb),
  ('false_claim_penalty_pct', '20'::jsonb),
  ('deposits_enabled', 'true'::jsonb),
  ('withdrawals_enabled', 'true'::jsonb),
  ('new_games_enabled', 'true'::jsonb),
  ('min_deposit_amount', '10'::jsonb),
  ('min_withdrawal_amount', '50'::jsonb),
  ('max_withdrawal_amount', '50000'::jsonb)
on conflict (key) do nothing;

-- ── Migrate existing plaintext admin passwords to hashes ──────────────────────
-- Hashes are applied by the edge function on next successful login.
-- This comment documents the migration path; no automatic hash here because
-- PBKDF2 must run in the edge runtime.
