-- Area 2 + 3: admin support and richer room configuration

alter table public.players
  add column if not exists is_admin boolean not null default false;

alter table public.rooms
  add column if not exists room_name text,
  add column if not exists max_players int not null default 100,
  add column if not exists room_password text,
  add column if not exists closed_by_admin boolean not null default false;

update public.rooms
set room_name = coalesce(room_name, case when is_private then 'Private Room' else 'Beteseb Room' end)
where room_name is null;
