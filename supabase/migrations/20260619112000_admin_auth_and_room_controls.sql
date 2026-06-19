alter table public.players
  add column if not exists admin_email text,
  add column if not exists admin_password text;

create unique index if not exists players_admin_email_key
  on public.players (admin_email)
  where admin_email is not null;

update public.players
set
  is_admin = true,
  admin_email = coalesce(admin_email, 'admin@yegarabingo.com'),
  admin_password = coalesce(admin_password, 'admin12345')
where telegram_id in ('+251969064548', '251969064548');