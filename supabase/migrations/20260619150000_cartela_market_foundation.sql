-- Cartela Market foundation: temporary cartela reservations during lobby

create table if not exists public.room_cartela_reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  cartela_number int not null check (cartela_number between 1 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists room_cartela_reservations_room_cartela_uidx
  on public.room_cartela_reservations (room_id, cartela_number);

create index if not exists room_cartela_reservations_room_id_idx
  on public.room_cartela_reservations (room_id);

create index if not exists room_cartela_reservations_player_id_idx
  on public.room_cartela_reservations (player_id);

alter table public.room_cartela_reservations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'room_cartela_reservations'
      and policyname = 'room cartela reservations readable'
  ) then
    create policy "room cartela reservations readable"
      on public.room_cartela_reservations for select using (true);
  end if;
end $$;

grant select on public.room_cartela_reservations to anon, authenticated, service_role;
grant insert, update, delete on public.room_cartela_reservations to service_role;

alter publication supabase_realtime add table public.room_cartela_reservations;
alter table public.room_cartela_reservations replica identity full;