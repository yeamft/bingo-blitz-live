-- Promote the requested Telegram identity to admin.
-- This assumes the player's telegram_id is stored as the phone number string.

update public.players
set is_admin = true
where telegram_id in ('+251969064548', '251969064548');