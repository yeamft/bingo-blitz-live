-- Fix winner/player username display after RLS removed public players reads.
-- Clients may read only non-sensitive profile fields via player_public.
-- Also denormalize username onto room_players / rooms for resilient winner UI.

create or replace view public.player_public
with (security_invoker = false)
as
select
  id,
  username,
  telegram_id,
  created_at
from public.players;

grant select on public.player_public to anon, authenticated, service_role;

alter table public.room_players
  add column if not exists username text;

alter table public.rooms
  add column if not exists winner_username text;

-- Backfill denormalized usernames for active/recent rooms.
update public.room_players rp
set username = p.username
from public.players p
where rp.player_id = p.id
  and (rp.username is null or rp.username = '');

update public.rooms r
set winner_username = p.username
from public.players p
where r.winner_id = p.id
  and r.winner_id is not null
  and (r.winner_username is null or r.winner_username = '');
