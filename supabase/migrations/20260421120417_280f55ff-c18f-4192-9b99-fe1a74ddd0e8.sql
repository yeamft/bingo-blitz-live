
-- Drop all overly permissive write policies. SELECT policies stay (realtime needs them).
drop policy if exists "players insertable by all" on public.players;
drop policy if exists "players self update" on public.players;

drop policy if exists "rooms insertable by all" on public.rooms;
drop policy if exists "rooms updatable by all" on public.rooms;

drop policy if exists "room_players insertable by all" on public.room_players;
drop policy if exists "room_players updatable by all" on public.room_players;
drop policy if exists "room_players deletable by all" on public.room_players;

drop policy if exists "audit insertable" on public.audit_log;

-- No client-side writes. Service role bypasses RLS, so the edge function still works.
-- (Absence of an INSERT/UPDATE/DELETE policy denies that operation for non-service roles.)
