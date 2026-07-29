-- Ensure a working admin account exists for Yegara Bingo.
-- Run this in Supabase SQL Editor, then redeploy game-action.

alter table public.players
  add column if not exists admin_email text,
  add column if not exists admin_password text,
  add column if not exists admin_password_hash text,
  add column if not exists is_admin boolean not null default false;

-- Prefer promoting an existing player; otherwise insert a dedicated admin row.
do $$
declare
  target_id uuid;
begin
  select id into target_id
  from public.players
  where admin_email = 'admin@yegarabingo.com'
     or telegram_id in ('+251969064548', '251969064548')
  order by case when admin_email = 'admin@yegarabingo.com' then 0 else 1 end
  limit 1;

  if target_id is null then
    select id into target_id
    from public.players
    order by created_at asc
    limit 1;
  end if;

  if target_id is null then
    insert into public.players (telegram_id, username, is_admin, admin_email, admin_password, admin_password_hash)
    values ('admin_seed', 'Admin', true, 'admin@yegarabingo.com', 'admin12345', null)
    returning id into target_id;
  else
    update public.players
    set
      is_admin = true,
      admin_email = 'admin@yegarabingo.com',
      admin_password = 'admin12345',
      admin_password_hash = null
    where id = target_id;
  end if;
end $$;

select id, telegram_id, username, is_admin, admin_email,
       admin_password is not null as has_plaintext,
       admin_password_hash is not null as has_hash
from public.players
where admin_email = 'admin@yegarabingo.com';
