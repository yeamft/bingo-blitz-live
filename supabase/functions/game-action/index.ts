// Authoritative game engine for 75-ball Bingo with stake/derash wallet
// All mutations go through this edge function. Clients never write game state directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FREE = 0; // sentinel for the free center

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(values: number[], seed: number): number[] {
  const rng = mulberry32(seed);
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeCartelas(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [1];
  const selected = raw
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n))
    .filter((n) => n >= 1 && n <= 200);
  const unique = [...new Set(selected)].slice(0, 3);
  return unique.length ? unique : [1];
}

function shuffled1to75(): number[] {
  const arr = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate a 5x5 card flattened to length 25.
// Columns: B=1-15, I=16-30, N=31-45 (with FREE center), G=46-60, O=61-75.
function generateCard(): number[] {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  const cols: number[][] = ranges.map(([lo, hi]) => {
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 5);
  });
  // Flatten row-by-row: idx = row*5 + col
  const flat: number[] = new Array(25).fill(0);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      flat[row * 5 + col] = cols[col][row];
    }
  }
  flat[12] = FREE; // center FREE
  return flat;
}

function generateCardFromCartela(cartelaNumber: number): number[] {
  const normalized = Math.max(1, Math.min(200, Math.trunc(cartelaNumber) || 1));
  const ranges: Array<[number, number]> = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  const cols = ranges.map(([lo, hi], colIndex) => {
    const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return seededShuffle(pool, normalized * 100 + colIndex + 1).slice(0, 5);
  });

  const flat: number[] = new Array(25).fill(0);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      flat[row * 5 + col] = cols[col][row];
    }
  }
  flat[12] = FREE;
  return flat;
}

function combineCards(cartelas: number[]): number[] {
  return cartelas.flatMap((cartela) => generateCardFromCartela(cartela));
}

async function upgradeCartelasInLobby(
  room: {
    id: string;
    stake_amount: number;
    derash: number;
    status: string;
    lobby_ends_at: string | null;
  },
  existing: {
    id: string;
    role: string;
    player_id: string;
    selected_cartelas?: number[] | null;
  },
  requestedCartelas: number[],
): Promise<void> {
  const lobbyOpen =
    room.status === "lobby" &&
    room.lobby_ends_at &&
    new Date(room.lobby_ends_at).getTime() > Date.now();
  if (!lobbyOpen || existing.role !== "player") return;

  const current = normalizeCartelas(existing.selected_cartelas ?? []);
  const requested = normalizeCartelas(requestedCartelas);
  if (requested.length <= current.length) return;

  const merged = [...new Set(requested)].slice(0, 3);
  if (merged.length <= current.length) return;

  const added = merged.length - current.length;
  const additionalStake = room.stake_amount * added;
  const playerWallet = normalizePlayerWallets(await getPlayerOrThrow(existing.player_id));
  if (playerWallet.play_wallet_balance < additionalStake) return;

  const newBal = playerWallet.play_wallet_balance - additionalStake;
  await updatePlayerWallets(existing.player_id, { play_wallet_balance: newBal });
  await recordTx(existing.player_id, room.id, "stake", -additionalStake, newBal);
  await supabase
    .from("rooms")
    .update({ derash: room.derash + additionalStake })
    .eq("id", room.id);
  await supabase
    .from("room_players")
    .update({ selected_cartelas: merged, card: combineCards(merged) })
    .eq("id", existing.id);
  await audit(room.id, existing.player_id, "upgrade_cartelas", {
    from: current,
    to: merged,
    additionalStake,
  });
}

function splitCards(combined: number[]): number[][] {
  const cards: number[][] = [];
  for (let i = 0; i < combined.length; i += 25) {
    const chunk = combined.slice(i, i + 25);
    if (chunk.length === 25) cards.push(chunk);
  }
  return cards;
}

function genRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function genGameId(): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate(),
  ).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(
    now.getUTCMinutes(),
  ).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BB-${stamp}-${suffix}`;
}

// Single-line patterns: 5 rows + 5 cols + 2 diagonals
function getLines(): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
}
const LINES = getLines();
const LINE_NAMES = [
  "Row 1","Row 2","Row 3","Row 4","Row 5",
  "Col B","Col I","Col N","Col G","Col O",
  "Diagonal ↘","Diagonal ↙",
];

function detectWinningLine(card: number[], marked: number[]): { idx: number; name: string } | null {
  const m = new Set(marked);
  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i];
    if (
      line.every((pos) => {
        const n = card[pos];
        return n === FREE || m.has(n);
      })
    ) {
      return { idx: i, name: LINE_NAMES[i] };
    }
  }
  return null;
}

function hasAnyWinningLine(cards: number[], marked: number[]): { idx: number; name: string } | null {
  const split = splitCards(cards);
  for (let i = 0; i < split.length; i++) {
    const win = detectWinningLine(split[i], marked);
    if (win) {
      return { idx: win.idx, name: `Card ${i + 1} · ${win.name}` };
    }
  }
  return null;
}

async function audit(
  room_id: string | null,
  player_id: string | null,
  action: string,
  payload: unknown,
) {
  await supabase
    .from("audit_log")
    .insert({ room_id, player_id, action, payload });
}

async function recordTx(
  player_id: string,
  room_id: string | null,
  kind: "stake" | "payout" | "refund" | "seed" | "deposit" | "withdrawal" | "transfer_to_play",
  amount: number,
  balance_after: number,
) {
  await supabase
    .from("transactions")
    .insert({ player_id, room_id, kind, amount, balance_after });
}

async function getPlayerOrThrow(player_id: string) {
  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", player_id)
    .maybeSingle();

  if (!player) throw new Error("Player not found");
  return player;
}

function normalizePlayerWallets<T extends { wallet_balance?: number | null; main_wallet_balance?: number | null; play_wallet_balance?: number | null }>(player: T) {
  const play = Number(player.play_wallet_balance ?? player.wallet_balance ?? 0);
  const main = Number(player.main_wallet_balance ?? player.wallet_balance ?? 0);
  return {
    ...player,
    main_wallet_balance: main,
    play_wallet_balance: play,
    wallet_balance: play,
  };
}

async function updatePlayerWallets(
  player_id: string,
  next: { main_wallet_balance?: number; play_wallet_balance?: number },
) {
  const payload: Record<string, number> = {};
  if (typeof next.main_wallet_balance === "number") payload.main_wallet_balance = next.main_wallet_balance;
  if (typeof next.play_wallet_balance === "number") {
    payload.play_wallet_balance = next.play_wallet_balance;
    payload.wallet_balance = next.play_wallet_balance;
  }
  if (!Object.keys(payload).length) return;

  await supabase.from("players").update(payload).eq("id", player_id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeRoomName(value: unknown, isPrivate: boolean) {
  const fallback = isPrivate ? "Private Room" : "Beteseb Room";
  const normalized = typeof value === "string" ? value.trim().slice(0, 60) : "";
  return normalized || fallback;
}

function normalizeStake(isPrivate: boolean, stakeAmount: unknown) {
  const stake = Math.max(1, Math.min(500, Number(stakeAmount) || 20));
  const allowed = isPrivate ? [10, 20, 50, 100] : [10, 20];
  if (!allowed.includes(stake)) throw new Error(`Invalid ${isPrivate ? "private" : "public"} stake`);
  return stake;
}

function normalizeMaxPlayers(raw: unknown, isPrivate: boolean) {
  if (!isPrivate) return 500;
  const value = Math.trunc(Number(raw) || 10);
  return Math.max(2, Math.min(200, value));
}

async function joinExistingPublicRoom(
  room: {
    id: string;
    code: string;
    stake_amount: number;
    derash: number;
    max_players?: number | null;
  },
  player_id: string,
  cartelas: number[],
) {
  const { data: existing } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", room.id)
    .eq("player_id", player_id)
    .maybeSingle();

  if (existing) {
    await upgradeCartelasInLobby(room, existing, cartelas);
    const { data: refreshed } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", room.id)
      .maybeSingle();
    return refreshed ?? room;
  }

  const totalStake = room.stake_amount * cartelas.length;
  const { count: activePlayers } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", room.id)
    .eq("role", "player");

  if ((activePlayers ?? 0) >= Number(room.max_players ?? 500)) {
    throw new Error("Room is full");
  }

  const playerWallet = normalizePlayerWallets(await getPlayerOrThrow(player_id));
  if (playerWallet.play_wallet_balance < totalStake) {
    throw new Error("Insufficient balance");
  }

  const newBal = playerWallet.play_wallet_balance - totalStake;
  await updatePlayerWallets(player_id, { play_wallet_balance: newBal });
  await recordTx(player_id, room.id, "stake", -totalStake, newBal);
  await supabase
    .from("rooms")
    .update({ derash: room.derash + totalStake })
    .eq("id", room.id);

  await supabase.from("room_players").insert({
    room_id: room.id,
    player_id,
    role: "player",
    stake_paid: true,
    selected_cartelas: cartelas,
    auto_fill: true,
    false_claims: 0,
    card: combineCards(cartelas),
    marked: [FREE],
  });

  await audit(room.id, player_id, "join_public_room_via_create", {
    stakePerCard: room.stake_amount,
    totalStake,
    cartelas,
  });

  const { data: refreshed } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", room.id)
    .maybeSingle();

  return refreshed ?? room;
}

async function requireAdmin(player_id: string) {
  const player = normalizePlayerWallets(await getPlayerOrThrow(player_id));
  if (!(player as { is_admin?: boolean }).is_admin) throw new Error("Admin access required");
  return player;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { action, ...args } = await req.json();

    switch (action) {
      case "upsert_player": {
        const { telegram_id, username } = args;
        if (!telegram_id || !username)
          return json({ error: "missing identity" }, 400);
        const tid = String(telegram_id).slice(0, 64);
        const uname = String(username).slice(0, 32);
        const { data: existing } = await supabase
          .from("players")
          .select("*")
          .eq("telegram_id", tid)
          .maybeSingle();
        if (existing) {
          if (existing.username !== uname) {
            await supabase
              .from("players")
              .update({ username: uname })
              .eq("id", existing.id);
            existing.username = uname;
          }
          return json({ player: normalizePlayerWallets(existing) });
        }
        const { data, error } = await supabase
          .from("players")
          .insert({ telegram_id: tid, username: uname })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        const seeded = normalizePlayerWallets(data);
        await updatePlayerWallets(data.id, {
          main_wallet_balance: seeded.main_wallet_balance,
          play_wallet_balance: seeded.play_wallet_balance,
        });
        await recordTx(data.id, null, "seed", seeded.play_wallet_balance, seeded.play_wallet_balance);
        return json({ player: seeded });
      }

      case "create_room": {
        const { player_id, stake_amount, selected_cartelas, is_private, room_name, max_players, password } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);
        const privateRoom = Boolean(is_private);
        const stakePerCard = normalizeStake(privateRoom, stake_amount);
        const roomName = sanitizeRoomName(room_name, privateRoom);
        const maxPlayers = normalizeMaxPlayers(max_players, privateRoom);
        const roomPassword = privateRoom && typeof password === "string" && password.trim()
          ? password.trim().slice(0, 40)
          : null;
        const cartelas = normalizeCartelas(selected_cartelas);
        const totalStake = stakePerCard * cartelas.length;

        if (!privateRoom) {
          const { data: existingPublicRoom } = await supabase
            .from("rooms")
            .select("*")
            .eq("is_private", false)
            .eq("stake_amount", stakePerCard)
            .in("status", ["lobby", "live", "paused"])
            .eq("closed_by_admin", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingPublicRoom) {
            try {
              const joinedRoom = await joinExistingPublicRoom(existingPublicRoom, String(player_id), cartelas);
              return json({ room: joinedRoom });
            } catch (error) {
              return json({ error: error instanceof Error ? error.message : "Unable to join public room" }, 400);
            }
          }
        }

        // Check wallet
        const { data: p } = await supabase
          .from("players")
          .select("*")
          .eq("id", player_id)
          .maybeSingle();
        if (!p) return json({ error: "Player not found" }, 404);
        const playerWallet = normalizePlayerWallets(p);
        if (playerWallet.play_wallet_balance < totalStake)
          return json({ error: "Insufficient balance" }, 400);

        let code = "";
        for (let i = 0; i < 5; i++) {
          code = genRoomCode();
          const { data: dup } = await supabase
            .from("rooms")
            .select("id")
            .eq("code", code)
            .maybeSingle();
          if (!dup) break;
        }
        const lobby_seconds = 30;
        const lobby_ends_at = new Date(
          Date.now() + lobby_seconds * 1000,
        ).toISOString();

        const { data: room, error } = await supabase
          .from("rooms")
          .insert({
            code,
            game_id: genGameId(),
            is_private: privateRoom,
            room_name: roomName,
            max_players: maxPlayers,
            room_password: roomPassword,
            host_id: player_id,
            stake_amount: stakePerCard,
            lobby_seconds,
            lobby_ends_at,
            call_sequence: shuffled1to75(),
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);

        // Host stakes immediately
        const newBal = playerWallet.play_wallet_balance - totalStake;
        await updatePlayerWallets(player_id, { play_wallet_balance: newBal });
        await recordTx(player_id, room.id, "stake", -totalStake, newBal);
        await supabase
          .from("rooms")
          .update({ derash: totalStake })
          .eq("id", room.id);
        await supabase.from("room_players").insert({
          room_id: room.id,
          player_id,
          role: "player",
          stake_paid: true,
          selected_cartelas: cartelas,
          auto_fill: true,
          false_claims: 0,
          card: combineCards(cartelas),
          marked: [FREE],
        });
        await audit(room.id, player_id, "create_room", {
          code,
          stakePerCard,
          totalStake,
          cartelas,
          isPrivate: privateRoom,
          roomName,
          maxPlayers,
        });
        const { data: refreshed } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room.id)
          .maybeSingle();
        return json({ room: refreshed });
      }

      case "join_room": {
        const { code, player_id, selected_cartelas, password } = args;
        if (!code || !player_id)
          return json({ error: "missing fields" }, 400);
        const safeCode = String(code).toUpperCase().slice(0, 10);
        const cartelas = normalizeCartelas(selected_cartelas);
        const joinStake = (room: { stake_amount: number }) => room.stake_amount * cartelas.length;
        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", safeCode)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        if (room.status === "finished")
          return json({ error: "Game already finished" }, 400);
        if ((room as { closed_by_admin?: boolean }).closed_by_admin) {
          return json({ error: "Room closed by admin" }, 400);
        }
        if (
          (room as { is_private?: boolean; room_password?: string | null }).is_private &&
          (room as { room_password?: string | null }).room_password &&
          (room as { room_password?: string | null }).room_password !== String(password ?? "")
        ) {
          return json({ error: "Invalid room password" }, 403);
        }

        const { data: existing } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room.id)
          .eq("player_id", player_id)
          .maybeSingle();
        if (existing) {
          await upgradeCartelasInLobby(room, existing, cartelas);
          const { data: refreshed } = await supabase
            .from("rooms")
            .select("*")
            .eq("id", room.id)
            .maybeSingle();
          return json({ room: refreshed ?? room });
        }

        // If lobby still open AND time remaining, attempt to stake & play.
        // Otherwise enter as watcher.
        const lobbyOpen =
          room.status === "lobby" &&
          room.lobby_ends_at &&
          new Date(room.lobby_ends_at).getTime() > Date.now();

        if (lobbyOpen) {
          const { count: activePlayers } = await supabase
            .from("room_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", room.id)
            .eq("role", "player");
          if ((activePlayers ?? 0) >= Number((room as { max_players?: number }).max_players ?? 500)) {
            return json({ error: "Room is full" }, 400);
          }
          const { data: p } = await supabase
            .from("players")
            .select("*")
            .eq("id", player_id)
            .maybeSingle();
          if (!p) return json({ error: "Player not found" }, 404);
          const totalStake = joinStake(room);
          const playerWallet = normalizePlayerWallets(p);
          if (playerWallet.play_wallet_balance < totalStake) {
            await supabase.from("room_players").insert({
              room_id: room.id,
              player_id,
              role: "watcher",
              stake_paid: false,
              selected_cartelas: [],
              auto_fill: true,
              false_claims: 0,
              card: [],
            });
            await audit(room.id, player_id, "join_watcher_no_funds", {
              required: totalStake,
            });
            return json({ room });
          }
          const newBal = playerWallet.play_wallet_balance - totalStake;
          await updatePlayerWallets(player_id, { play_wallet_balance: newBal });
          await recordTx(
            player_id,
            room.id,
            "stake",
            -totalStake,
            newBal,
          );
          await supabase
            .from("rooms")
            .update({ derash: room.derash + totalStake })
            .eq("id", room.id);
          await supabase.from("room_players").insert({
            room_id: room.id,
            player_id,
            role: "player",
            stake_paid: true,
            selected_cartelas: cartelas,
            auto_fill: true,
            false_claims: 0,
            card: combineCards(cartelas),
            marked: [FREE],
          });
          await audit(room.id, player_id, "join_player", {
            stakePerCard: room.stake_amount,
            totalStake,
            cartelas,
          });
        } else {
          await supabase.from("room_players").insert({
            room_id: room.id,
            player_id,
            role: "watcher",
            stake_paid: false,
            selected_cartelas: [],
            auto_fill: true,
            false_claims: 0,
            card: [],
          });
          await audit(room.id, player_id, "join_watcher", {});
        }

        const { data: refreshed } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room.id)
          .maybeSingle();
        return json({ room: refreshed });
      }

      case "leave_room": {
        const { room_id, player_id } = args;
        if (!room_id || !player_id)
          return json({ error: "missing fields" }, 400);
        // No refund once joined; that's the rule.
        await supabase
          .from("room_players")
          .delete()
          .eq("room_id", room_id)
          .eq("player_id", player_id);
        await audit(room_id, player_id, "leave_room", {});
        return json({ ok: true });
      }

      case "tick_lobby": {
        // Idempotent: if lobby expired, transition to live.
        const { room_id } = args;
        if (!room_id) return json({ error: "missing room_id" }, 400);
        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room_id)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        if (room.status !== "lobby") return json({ ok: true });
        if (
          !room.lobby_ends_at ||
          new Date(room.lobby_ends_at).getTime() > Date.now()
        )
          return json({ ok: true });

        // Count actual paid players
        const { count } = await supabase
          .from("room_players")
          .select("*", { count: "exact", head: true })
          .eq("room_id", room_id)
          .eq("role", "player");

        if (!count || count < 1) {
          // No one to play; finish the room
          await supabase
            .from("rooms")
            .update({
              status: "finished",
              finished_at: new Date().toISOString(),
            })
            .eq("id", room_id);
          return json({ ok: true, finished: true });
        }

        await supabase
          .from("rooms")
          .update({
            status: "live",
            started_at: new Date().toISOString(),
            current_index: -1,
          })
          .eq("id", room_id);
        await audit(room_id, null, "lobby_to_live", { players: count });
        return json({ ok: true, started: true });
      }

      case "call_next": {
        const { room_id } = args;
        if (!room_id) return json({ error: "missing room_id" }, 400);
        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room_id)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        if (room.status !== "live") return json({ ok: true, skipped: true });

        const next = room.current_index + 1;
        if (next >= room.call_sequence.length) {
          // House keeps the pot if no one bingo'd by all 75 calls
          await supabase
            .from("rooms")
            .update({
              status: "finished",
              finished_at: new Date().toISOString(),
            })
            .eq("id", room_id);
          return json({ ok: true, finished: true });
        }
        const newNumber = room.call_sequence[next];
        await supabase
          .from("rooms")
          .update({ current_index: next })
          .eq("id", room_id);

        // Auto-daub for all players in this room
        const { data: rps } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room_id)
          .eq("role", "player");

        if (rps) {
          for (const rp of rps) {
            if (!rp.auto_fill) continue;
            if (rp.card.includes(newNumber) && !rp.marked.includes(newNumber)) {
              const marked = [...rp.marked, newNumber];
              await supabase
                .from("room_players")
                .update({ marked })
                .eq("id", rp.id);
            }
          }
        }
        return json({ ok: true, index: next, number: newNumber });
      }

      case "claim_bingo": {
        const { room_id, player_id } = args;
        if (!room_id || !player_id)
          return json({ error: "missing fields" }, 400);
        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room_id)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        if (room.status !== "live")
          return json({ error: "Game not live" }, 400);
        if (room.winner_id || room.pending_winner_id) return json({ error: "Already won" }, 400);

        const { data: rp } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room_id)
          .eq("player_id", player_id)
          .maybeSingle();
        if (!rp || rp.role !== "player")
          return json({ error: "Not a player" }, 403);

        const win = hasAnyWinningLine(rp.card, rp.marked);
        if (!win) {
          const penalty = Math.max(1, Math.floor(room.stake_amount * 0.2));
          const { data: claimer } = await supabase
            .from("players")
            .select("*")
            .eq("id", player_id)
            .maybeSingle();
          if (claimer) {
            const playerWallet = normalizePlayerWallets(claimer);
            const penalizedBalance = Math.max(0, playerWallet.play_wallet_balance - penalty);
            await updatePlayerWallets(player_id, { play_wallet_balance: penalizedBalance });
            await recordTx(player_id, room_id, "stake", -penalty, penalizedBalance);
          }
          await supabase
            .from("room_players")
            .update({ false_claims: (rp.false_claims || 0) + 1 })
            .eq("id", rp.id);
          await audit(room_id, player_id, "claim_invalid", { penalty });
          return json({ ok: false, error: "No completed line", penalty });
        }

        // Pause for host/community verification first.
        const payout = Math.floor(
          (room.derash * (100 - room.house_commission_pct)) / 100,
        );
        await supabase
          .from("rooms")
          .update({
            status: "paused",
            pending_winner_id: player_id,
            pending_winning_line: win.name,
            pending_payout: payout,
          })
          .eq("id", room_id);
        await audit(room_id, player_id, "claim_pending_verification", {
          line: win.name,
          payout,
        });
        return json({ ok: true, winner: false, pending: true, payout, line: win.name });
      }

      case "verify_bingo": {
        const { room_id, host_player_id, approve } = args;
        if (!room_id || !host_player_id)
          return json({ error: "missing fields" }, 400);

        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room_id)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        if (room.host_id !== host_player_id) return json({ error: "Only host can verify" }, 403);
        if (room.status !== "paused" || !room.pending_winner_id) {
          return json({ error: "No pending bingo to verify" }, 400);
        }

        if (approve !== false) {
          const payout = Number(room.pending_payout || 0);
          const winnerId = room.pending_winner_id;
          const { data: winner } = await supabase
            .from("players")
            .select("*")
            .eq("id", winnerId)
            .maybeSingle();
          if (!winner) return json({ error: "Player vanished" }, 500);
          const winnerWallet = normalizePlayerWallets(winner);
          const newBal = winnerWallet.play_wallet_balance + payout;
          await updatePlayerWallets(winnerId, { play_wallet_balance: newBal });
          await recordTx(winnerId, room_id, "payout", payout, newBal);

          await supabase
            .from("rooms")
            .update({
              status: "finished",
              winner_id: winnerId,
              winning_line: room.pending_winning_line,
              pending_winner_id: null,
              pending_winning_line: null,
              pending_payout: null,
              finished_at: new Date().toISOString(),
            })
            .eq("id", room_id);
          await audit(room_id, host_player_id, "claim_verified", { winnerId, payout });
          return json({ ok: true, approved: true });
        }

        const penalty = Math.max(1, Math.floor(room.stake_amount * 0.2));
        const { data: claimer } = await supabase
          .from("players")
          .select("*")
          .eq("id", room.pending_winner_id)
          .maybeSingle();
        if (claimer) {
          const playerWallet = normalizePlayerWallets(claimer);
          const penalizedBalance = Math.max(0, playerWallet.play_wallet_balance - penalty);
          await updatePlayerWallets(claimer.id, { play_wallet_balance: penalizedBalance });
          await recordTx(claimer.id, room_id, "stake", -penalty, penalizedBalance);
        }
        await supabase
          .from("room_players")
          .update({ false_claims: 1 })
          .eq("room_id", room_id)
          .eq("player_id", room.pending_winner_id);

        await supabase
          .from("rooms")
          .update({
            status: "live",
            pending_winner_id: null,
            pending_winning_line: null,
            pending_payout: null,
          })
          .eq("id", room_id);
        await audit(room_id, host_player_id, "claim_rejected", { penalty });
        return json({ ok: true, approved: false, penalty });
      }

      case "set_auto_fill": {
        const { room_id, player_id, auto_fill } = args;
        if (!room_id || !player_id)
          return json({ error: "missing fields" }, 400);
        await supabase
          .from("room_players")
          .update({ auto_fill: Boolean(auto_fill) })
          .eq("room_id", room_id)
          .eq("player_id", player_id);
        await audit(room_id, player_id, "toggle_auto_fill", { auto_fill: Boolean(auto_fill) });
        return json({ ok: true });
      }

      case "mark_number": {
        const { room_id, player_id, number } = args;
        if (!room_id || !player_id || !number)
          return json({ error: "missing fields" }, 400);
        const numeric = Number(number);
        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room_id)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        const called = room.call_sequence.slice(0, room.current_index + 1);
        if (!called.includes(numeric)) return json({ error: "Number not called yet" }, 400);

        const { data: rp } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room_id)
          .eq("player_id", player_id)
          .maybeSingle();
        if (!rp || rp.role !== "player") return json({ error: "Not a player" }, 403);
        if (!rp.card.includes(numeric)) return json({ error: "Number not on your card" }, 400);
        if (rp.marked.includes(numeric)) return json({ ok: true, already: true });

        const marked = [...rp.marked, numeric];
        await supabase.from("room_players").update({ marked }).eq("id", rp.id);
        return json({ ok: true });
      }

      case "get_wallet_summary": {
        const { player_id } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);

        const player = normalizePlayerWallets(await getPlayerOrThrow(String(player_id)));
        const [{ data: transactions }, { data: requests }] = await Promise.all([
          supabase
            .from("transactions")
            .select("*")
            .eq("player_id", player.id)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("wallet_requests")
            .select("*")
            .eq("player_id", player.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        return json({
          player,
          summary: {
            total_balance: player.main_wallet_balance + player.play_wallet_balance,
            main_wallet_balance: player.main_wallet_balance,
            play_wallet_balance: player.play_wallet_balance,
          },
          transactions: transactions ?? [],
          requests: requests ?? [],
        });
      }

      case "transfer_to_play_wallet": {
        const { player_id, amount } = args;
        const numericAmount = Math.trunc(Number(amount) || 0);
        if (!player_id || numericAmount <= 0) return json({ error: "invalid transfer" }, 400);

        const player = normalizePlayerWallets(await getPlayerOrThrow(String(player_id)));
        if (player.main_wallet_balance < numericAmount) {
          return json({ error: "Insufficient main wallet balance" }, 400);
        }

        const nextMain = player.main_wallet_balance - numericAmount;
        const nextPlay = player.play_wallet_balance + numericAmount;
        await updatePlayerWallets(player.id, {
          main_wallet_balance: nextMain,
          play_wallet_balance: nextPlay,
        });
        await recordTx(player.id, null, "transfer_to_play", numericAmount, nextPlay);
        await audit(null, player.id, "transfer_to_play_wallet", { amount: numericAmount });

        return json({
          ok: true,
          player: {
            ...player,
            main_wallet_balance: nextMain,
            play_wallet_balance: nextPlay,
            wallet_balance: nextPlay,
          },
        });
      }

      case "request_deposit": {
        const { player_id, amount, note } = args;
        const numericAmount = Math.trunc(Number(amount) || 0);
        if (!player_id || numericAmount <= 0) return json({ error: "invalid deposit request" }, 400);

        await getPlayerOrThrow(String(player_id));
        const { data: request, error } = await supabase
          .from("wallet_requests")
          .insert({
            player_id,
            kind: "deposit",
            amount: numericAmount,
            note: typeof note === "string" ? note.slice(0, 240) : null,
          })
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);

        await audit(null, String(player_id), "request_deposit", { amount: numericAmount, note });
        return json({ ok: true, request });
      }

      case "request_withdrawal": {
        const { player_id, amount, note } = args;
        const numericAmount = Math.trunc(Number(amount) || 0);
        if (!player_id || numericAmount <= 0) return json({ error: "invalid withdrawal request" }, 400);

        const player = normalizePlayerWallets(await getPlayerOrThrow(String(player_id)));
        if (player.main_wallet_balance < numericAmount) {
          return json({ error: "Insufficient main wallet balance" }, 400);
        }

        const { data: request, error } = await supabase
          .from("wallet_requests")
          .insert({
            player_id,
            kind: "withdrawal",
            amount: numericAmount,
            note: typeof note === "string" ? note.slice(0, 240) : null,
          })
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);

        await audit(null, String(player_id), "request_withdrawal", { amount: numericAmount, note });
        return json({ ok: true, request });
      }

      case "list_transactions": {
        const { player_id } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);

        const [{ data: transactions }, { data: requests }] = await Promise.all([
          supabase.from("transactions").select("*").eq("player_id", player_id).order("created_at", { ascending: false }),
          supabase.from("wallet_requests").select("*").eq("player_id", player_id).order("created_at", { ascending: false }),
        ]);

        return json({ transactions: transactions ?? [], requests: requests ?? [] });
      }

      case "get_admin_summary": {
        const { player_id } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);
        await requireAdmin(String(player_id));

        const [
          { count: totalUsers },
          { count: activeRooms },
          { count: liveRooms },
          { count: pendingWalletRequests },
          { data: rooms },
          { data: transactions },
          { data: requests },
          { data: users },
          { data: auditLogs },
        ] = await Promise.all([
          supabase.from("players").select("*", { count: "exact", head: true }),
          supabase.from("rooms").select("*", { count: "exact", head: true }).in("status", ["lobby", "live", "paused"]),
          supabase.from("rooms").select("*", { count: "exact", head: true }).eq("status", "live"),
          supabase.from("wallet_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("rooms").select("*").order("created_at", { ascending: false }).limit(8),
          supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(12),
          supabase.from("wallet_requests").select("*").order("created_at", { ascending: false }).limit(12),
          supabase.from("players").select("*").order("created_at", { ascending: false }).limit(20),
          supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20),
        ]);

        const totalRevenue = (transactions ?? [])
          .filter((tx: { kind: string }) => tx.kind === "stake")
          .reduce((sum: number, tx: { amount?: number }) => sum + Math.abs(Number(tx.amount || 0)), 0);
        const totalPayouts = (transactions ?? [])
          .filter((tx: { kind: string }) => tx.kind === "payout")
          .reduce((sum: number, tx: { amount?: number }) => sum + Number(tx.amount || 0), 0);
        const totalDeposits = (transactions ?? [])
          .filter((tx: { kind: string }) => tx.kind === "deposit")
          .reduce((sum: number, tx: { amount?: number }) => sum + Number(tx.amount || 0), 0);
        const totalWithdrawals = (transactions ?? [])
          .filter((tx: { kind: string }) => tx.kind === "withdrawal")
          .reduce((sum: number, tx: { amount?: number }) => sum + Math.abs(Number(tx.amount || 0)), 0);

        return json({
          totals: {
            total_users: totalUsers ?? 0,
            active_rooms: activeRooms ?? 0,
            live_rooms: liveRooms ?? 0,
            pending_wallet_requests: pendingWalletRequests ?? 0,
            total_revenue: totalRevenue,
            total_payouts: totalPayouts,
            total_deposits: totalDeposits,
            total_withdrawals: totalWithdrawals,
            net_profit: totalRevenue - totalPayouts,
          },
          rooms: rooms ?? [],
          transactions: transactions ?? [],
          requests: requests ?? [],
          users: users ?? [],
          audit_logs: auditLogs ?? [],
        });
      }

      case "admin_set_user_admin": {
        const { player_id, target_player_id, is_admin } = args;
        if (!player_id || !target_player_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));
        const { data: updated, error } = await supabase
          .from("players")
          .update({ is_admin: Boolean(is_admin) })
          .eq("id", target_player_id)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);
        await audit(null, admin.id, "admin_set_user_admin", { target_player_id, is_admin: Boolean(is_admin) });
        return json({ ok: true, player: normalizePlayerWallets(updated) });
      }

      case "admin_adjust_wallet": {
        const { player_id, target_player_id, wallet, amount, reason } = args;
        const numericAmount = Math.trunc(Number(amount) || 0);
        if (!player_id || !target_player_id || !wallet || numericAmount === 0) {
          return json({ error: "invalid wallet adjustment" }, 400);
        }
        const admin = await requireAdmin(String(player_id));
        const target = normalizePlayerWallets(await getPlayerOrThrow(String(target_player_id)));
        if (wallet === "main") {
          await updatePlayerWallets(target.id, { main_wallet_balance: Math.max(0, target.main_wallet_balance + numericAmount) });
        } else if (wallet === "play") {
          await updatePlayerWallets(target.id, { play_wallet_balance: Math.max(0, target.play_wallet_balance + numericAmount) });
        } else {
          return json({ error: "invalid wallet" }, 400);
        }
        const refreshed = normalizePlayerWallets(await getPlayerOrThrow(target.id));
        await recordTx(target.id, null, numericAmount >= 0 ? "deposit" : "withdrawal", numericAmount, wallet === "main" ? refreshed.main_wallet_balance : refreshed.play_wallet_balance);
        await audit(null, admin.id, "admin_adjust_wallet", { target_player_id, wallet, amount: numericAmount, reason });
        return json({ ok: true, player: refreshed });
      }

      case "process_wallet_request": {
        const { player_id, request_id, approve } = args;
        if (!player_id || !request_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));

        const { data: request } = await supabase
          .from("wallet_requests")
          .select("*")
          .eq("id", request_id)
          .maybeSingle();
        if (!request) return json({ error: "Wallet request not found" }, 404);
        if (request.status !== "pending") return json({ error: "Request already processed" }, 400);

        const target = normalizePlayerWallets(await getPlayerOrThrow(String(request.player_id)));
        const approved = approve !== false;

        if (approved) {
          if (request.kind === "deposit") {
            const nextMain = target.main_wallet_balance + Number(request.amount);
            await updatePlayerWallets(target.id, { main_wallet_balance: nextMain });
            await recordTx(target.id, null, "deposit", Number(request.amount), nextMain);
          } else {
            if (target.main_wallet_balance < Number(request.amount)) {
              return json({ error: "Insufficient main wallet balance" }, 400);
            }
            const nextMain = target.main_wallet_balance - Number(request.amount);
            await updatePlayerWallets(target.id, { main_wallet_balance: nextMain });
            await recordTx(target.id, null, "withdrawal", -Number(request.amount), nextMain);
          }
        }

        const { data: updated, error } = await supabase
          .from("wallet_requests")
          .update({
            status: approved ? "approved" : "rejected",
            processed_by: admin.id,
            processed_at: new Date().toISOString(),
          })
          .eq("id", request.id)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);

        await audit(null, admin.id, approved ? "wallet_request_approved" : "wallet_request_rejected", {
          request_id: request.id,
          target_player_id: request.player_id,
          kind: request.kind,
          amount: request.amount,
        });
        return json({ ok: true, request: updated });
      }

      case "admin_close_room": {
        const { player_id, room_id } = args;
        if (!player_id || !room_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));

        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room_id)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);

        await supabase
          .from("rooms")
          .update({
            closed_by_admin: true,
            status: "finished",
            finished_at: new Date().toISOString(),
          })
          .eq("id", room_id);
        await audit(room_id, admin.id, "admin_close_room", { code: room.code, previous_status: room.status });
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
