// Authoritative game engine for 75-ball Bingo with stake/derash wallet
// All mutations go through this edge function. Clients never write game state directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const VERIFIER_API_BASE_URL = Deno.env.get("VERIFIER_API_BASE_URL") || "https://verifyapi.leulzenebe.pro";
const VERIFIER_API_KEY = Deno.env.get("VERIFIER_API_KEY") || "";

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

function parseMoneyValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

async function verifyHostedDeposit(details: {
  provider: string;
  reference: string;
  account_suffix?: string;
  phone_number?: string;
}) {
  if (!VERIFIER_API_KEY) throw new Error("Verifier API key not configured");

  const provider = details.provider.toLowerCase();
  let endpoint = "/verify";
  let body: Record<string, unknown> = { reference: details.reference };

  switch (provider) {
    case "telebirr":
      endpoint = "/verify-telebirr";
      break;
    case "cbe":
      endpoint = "/verify-cbe";
      body = { reference: details.reference, accountSuffix: details.account_suffix };
      break;
    case "dashen":
      endpoint = "/verify-dashen";
      break;
    case "abyssinia":
      endpoint = "/verify-abyssinia";
      body = { reference: details.reference, suffix: details.account_suffix };
      break;
    case "cbebirr":
      endpoint = "/verify-cbebirr";
      body = { receiptNumber: details.reference, phoneNumber: details.phone_number };
      break;
    default:
      body = {
        reference: details.reference,
        suffix: details.account_suffix,
        phoneNumber: details.phone_number,
      };
      break;
  }

  const response = await fetch(`${VERIFIER_API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": VERIFIER_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Verifier request failed (${response.status})`);
  }

  const data = payload?.data ?? payload;
  const amount =
    parseMoneyValue(data?.amount) ??
    parseMoneyValue(data?.transactionAmount) ??
    parseMoneyValue(data?.settledAmount) ??
    parseMoneyValue(data?.totalPaidAmount) ??
    parseMoneyValue(data?.total);

  if (amount === null) {
    throw new Error("Verifier response did not include a readable amount");
  }

  return { payload, amount };
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
    status: string;
    lobby_ends_at: string | null;
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

async function ensurePlayerNotBlocked(player_id: string) {
  const player = await getPlayerOrThrow(player_id);
  if ((player as { is_blocked?: boolean }).is_blocked) {
    throw new Error("Your account has been blocked");
  }
  return player;
}

async function getRoomOrThrow(room_id: string) {
  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", room_id)
    .maybeSingle();

  if (!room) throw new Error("Room not found");
  return room;
}

async function cleanupExpiredCartelaReservations(room_id: string) {
  await supabase
    .from("room_cartela_reservations")
    .delete()
    .eq("room_id", room_id)
    .lt("expires_at", new Date().toISOString());
}

async function getSoldCartelasForRoom(room_id: string): Promise<number[]> {
  const { data } = await supabase
    .from("room_players")
    .select("selected_cartelas, role")
    .eq("room_id", room_id)
    .eq("role", "player");

  return [...new Set(
    (data ?? [])
      .flatMap((entry: { selected_cartelas?: number[] | null }) => normalizeCartelas(entry.selected_cartelas ?? [])),
  )];
}

async function getActiveCartelaReservations(room_id: string) {
  const { data } = await supabase
    .from("room_cartela_reservations")
    .select("*")
    .eq("room_id", room_id)
    .gte("expires_at", new Date().toISOString());

  return data ?? [];
}

async function buildRoomCartelaMarket(room_id: string, player_id?: string) {
  await cleanupExpiredCartelaReservations(room_id);
  const sold = await getSoldCartelasForRoom(room_id);
  const reservations = await getActiveCartelaReservations(room_id);
  const soldSet = new Set(sold);
  const reservedByCartela = new Map<number, { player_id: string; expires_at: string }>();
  for (const reservation of reservations) {
    reservedByCartela.set(Number((reservation as { cartela_number: number }).cartela_number), {
      player_id: String((reservation as { player_id: string }).player_id),
      expires_at: String((reservation as { expires_at: string }).expires_at),
    });
  }

  const cartelas = Array.from({ length: 200 }, (_, i) => i + 1).map((cartelaNumber) => {
    if (soldSet.has(cartelaNumber)) {
      return { cartela_number: cartelaNumber, status: "sold" as const };
    }
    const reservation = reservedByCartela.get(cartelaNumber);
    if (reservation) {
      return {
        cartela_number: cartelaNumber,
        status: reservation.player_id === player_id ? "selected" as const : "reserved" as const,
        reserved_by: reservation.player_id,
        expires_at: reservation.expires_at,
      };
    }
    return { cartela_number: cartelaNumber, status: "available" as const };
  });

  return {
    sold_cartelas: sold,
    reserved_cartelas: reservations,
    cartelas,
  };
}

async function reserveCartelasForPlayer(room_id: string, player_id: string, requestedCartelas: number[]) {
  const room = await getRoomOrThrow(room_id);
  if (room.status !== "lobby") throw new Error("Cartela market is closed");
  if (room.lobby_ends_at && new Date(room.lobby_ends_at).getTime() <= Date.now()) {
    throw new Error("Lobby already closed");
  }

  await cleanupExpiredCartelaReservations(room_id);
  const cartelas = normalizeCartelas(requestedCartelas);
  const soldSet = new Set(await getSoldCartelasForRoom(room_id));
  const reservations = await getActiveCartelaReservations(room_id);
  const reservedByOthers = new Set(
    reservations
      .filter((entry: { player_id: string }) => entry.player_id !== player_id)
      .map((entry: { cartela_number: number }) => Number(entry.cartela_number)),
  );

  const unavailable = cartelas.filter((cartela) => soldSet.has(cartela) || reservedByOthers.has(cartela));
  if (unavailable.length) {
    throw new Error(`Cartelas unavailable: ${unavailable.join(", ")}`);
  }

  await supabase.from("room_cartela_reservations").delete().eq("room_id", room_id).eq("player_id", player_id);
  const expires_at = new Date(Date.now() + 60_000).toISOString();
  if (cartelas.length) {
    const payload = cartelas.map((cartela_number) => ({ room_id, player_id, cartela_number, expires_at }));
    const { error } = await supabase.from("room_cartela_reservations").insert(payload);
    if (error) throw new Error(error.message);
  }

  await audit(room_id, player_id, "reserve_cartelas", { cartelas, expires_at });
  return { expires_at, cartelas };
}

async function confirmCartelaPurchase(room_id: string, player_id: string) {
  const room = await getRoomOrThrow(room_id);
  if (room.status !== "lobby") throw new Error("Cartela market is closed");
  if (room.lobby_ends_at && new Date(room.lobby_ends_at).getTime() <= Date.now()) {
    throw new Error("Lobby already closed");
  }

  await cleanupExpiredCartelaReservations(room_id);
  const { data: reservations } = await supabase
    .from("room_cartela_reservations")
    .select("*")
    .eq("room_id", room_id)
    .eq("player_id", player_id)
    .gte("expires_at", new Date().toISOString());

  const cartelas = normalizeCartelas((reservations ?? []).map((entry: { cartela_number: number }) => entry.cartela_number));
  if (!cartelas.length) throw new Error("No active cartela reservation found");

  const soldSet = new Set(await getSoldCartelasForRoom(room_id));
  const alreadySold = cartelas.filter((cartela) => soldSet.has(cartela));
  if (alreadySold.length) throw new Error(`Cartelas already sold: ${alreadySold.join(", ")}`);

  const { data: existing } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", room_id)
    .eq("player_id", player_id)
    .maybeSingle();

  if (existing) {
    await upgradeCartelasInLobby(room, existing, cartelas);
  } else {
    const totalStake = room.stake_amount * cartelas.length;
    const playerWallet = normalizePlayerWallets(await getPlayerOrThrow(player_id));
    if (playerWallet.play_wallet_balance < totalStake) throw new Error("Insufficient balance");

    const newBal = playerWallet.play_wallet_balance - totalStake;
    await updatePlayerWallets(player_id, { play_wallet_balance: newBal });
    await recordTx(player_id, room.id, "stake", -totalStake, newBal);
    await supabase.from("rooms").update({ derash: room.derash + totalStake }).eq("id", room.id);
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
    await audit(room.id, player_id, "purchase_cartelas", { cartelas, totalStake });
  }

  await supabase.from("room_cartela_reservations").delete().eq("room_id", room_id).eq("player_id", player_id);
  const refreshedRoom = await getRoomOrThrow(room_id);
  return { room: refreshedRoom, cartelas };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { action, ...args } = await req.json();

    switch (action) {
      case "upsert_player": {
        const { telegram_id, username, phone_number } = args;
        if (!telegram_id || !username)
          return json({ error: "missing identity" }, 400);
        const tid = String(telegram_id).slice(0, 64);
        const uname = String(username).slice(0, 32);
        const phone = typeof phone_number === "string" && phone_number.trim()
          ? phone_number.trim().slice(0, 32)
          : null;
        const { data: existing } = await supabase
          .from("players")
          .select("*")
          .eq("telegram_id", tid)
          .maybeSingle();
        if (existing) {
          const updates: Record<string, string> = {};
          if (existing.username !== uname) {
            updates.username = uname;
          }
          if (phone && (existing as { phone_number?: string | null }).phone_number !== phone) {
            updates.phone_number = phone;
          }
          if (Object.keys(updates).length > 0) {
            await supabase
              .from("players")
              .update(updates)
              .eq("id", existing.id);
            existing.username = updates.username ?? existing.username;
            (existing as { phone_number?: string | null }).phone_number = updates.phone_number ?? (existing as { phone_number?: string | null }).phone_number;
          }
          return json({ player: normalizePlayerWallets(existing) });
        }
        const { data, error } = await supabase
          .from("players")
          .insert({ telegram_id: tid, username: uname, phone_number: phone })
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

      case "get_player_by_telegram": {
        const { telegram_id } = args;
        if (!telegram_id) return json({ error: "missing telegram_id" }, 400);
        const tid = String(telegram_id).slice(0, 64);
        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("telegram_id", tid)
          .maybeSingle();
        return json({ player: player ? normalizePlayerWallets(player) : null });
      }

      case "create_room": {
        const { player_id, stake_amount, selected_cartelas, is_private, room_name, max_players, password } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);
        await ensurePlayerNotBlocked(String(player_id));
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
        await ensurePlayerNotBlocked(String(player_id));
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
          // Lobby closed: disallow buying cards. If the caller attempted to join as a player (requested cartelas),
          // reject with an error instead of silently creating a watcher entry.
          if (Array.isArray(cartelas) && cartelas.length > 0) {
            return json({ error: "Game already started" }, 400);
          }
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
        const room = await getRoomOrThrow(String(room_id));

        await supabase
          .from("room_cartela_reservations")
          .delete()
          .eq("room_id", room_id)
          .eq("player_id", player_id);

        await supabase
          .from("room_players")
          .delete()
          .eq("room_id", room_id)
          .eq("player_id", player_id);

        if (room.pending_winner_id === player_id) {
          await supabase
            .from("rooms")
            .update({
              status: "live",
              pending_winner_id: null,
              pending_winning_line: null,
              pending_payout: null,
            })
            .eq("id", room_id);
        }

        const { count: remainingPlayers } = await supabase
          .from("room_players")
          .select("*", { count: "exact", head: true })
          .eq("room_id", room_id)
          .eq("role", "player");

        if ((remainingPlayers ?? 0) < 1) {
          await supabase
            .from("rooms")
            .update({
              status: "finished",
              pending_winner_id: null,
              pending_winning_line: null,
              pending_payout: null,
              finished_at: new Date().toISOString(),
            })
            .eq("id", room_id);
        }

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
          // No paid players joined before the countdown ended; finish the room.
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

        const payout = Math.floor(
          (room.derash * (100 - room.house_commission_pct)) / 100,
        );
        const winnerId = player_id;
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
            winning_line: win.name,
            pending_winner_id: null,
            pending_winning_line: null,
            pending_payout: null,
            finished_at: new Date().toISOString(),
          })
          .eq("id", room_id);
        await audit(room_id, player_id, "claim_verified_immediate", {
          line: win.name,
          payout,
        });
        return json({ ok: true, winner: true, payout, line: win.name });
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
        const { player_id, amount, note, provider, reference, account_suffix, phone_number } = args;
        const numericAmount = Math.trunc(Number(amount) || 0);
        if (!player_id || numericAmount <= 0) return json({ error: "invalid deposit request" }, 400);

        await ensurePlayerNotBlocked(String(player_id));
        const player = normalizePlayerWallets(await getPlayerOrThrow(String(player_id)));

        if (!provider || !reference) {
          return json({ error: "provider and reference are required for deposit verification" }, 400);
        }

        const verification = await verifyHostedDeposit({
          provider: String(provider),
          reference: String(reference).trim(),
          account_suffix: typeof account_suffix === "string" ? account_suffix.trim() : undefined,
          phone_number: typeof phone_number === "string" ? phone_number.trim() : undefined,
        });

        const verifiedAmount = Math.trunc(Number(verification.amount) || 0);
        if (verifiedAmount <= 0) {
          return json({ error: "verified amount is invalid" }, 400);
        }
        if (verifiedAmount !== numericAmount) {
          return json({ error: `verified amount ${verifiedAmount} does not match requested amount ${numericAmount}` }, 400);
        }

        const requestNote = [
          `provider=${String(provider)}`,
          `reference=${String(reference).trim()}`,
          account_suffix ? `suffix=${String(account_suffix).trim()}` : null,
          phone_number ? `phone=${String(phone_number).trim()}` : null,
          note ? `note=${String(note).slice(0, 120)}` : null,
        ].filter(Boolean).join(" | ");

        const { data: request, error } = await supabase
          .from("wallet_requests")
          .insert({
            player_id,
            kind: "deposit",
            amount: numericAmount,
            status: "approved",
            note: requestNote.slice(0, 240),
            processed_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);

        const nextMain = player.main_wallet_balance + numericAmount;
        await updatePlayerWallets(player.id, { main_wallet_balance: nextMain });
        await recordTx(player.id, null, "deposit", numericAmount, nextMain);

        await audit(null, String(player_id), "request_deposit_verified", {
          amount: numericAmount,
          provider,
          reference,
          verification: verification.payload,
        });
        return json({ ok: true, request, verified: true, summary: { credited_amount: numericAmount } });
      }

      case "request_withdrawal": {
        const { player_id, amount, note } = args;
        const numericAmount = Math.trunc(Number(amount) || 0);
        if (!player_id || numericAmount <= 0) return json({ error: "invalid withdrawal request" }, 400);

        await ensurePlayerNotBlocked(String(player_id));
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

      case "get_room_cartela_market": {
        const { room_id, player_id } = args;
        if (!room_id) return json({ error: "missing room_id" }, 400);
        const room = await getRoomOrThrow(String(room_id));
        const market = await buildRoomCartelaMarket(String(room_id), player_id ? String(player_id) : undefined);
        return json({ room, market });
      }

      case "reserve_cartelas": {
        const { room_id, player_id, selected_cartelas } = args;
        if (!room_id || !player_id) return json({ error: "missing fields" }, 400);
        await ensurePlayerNotBlocked(String(player_id));
        const reservation = await reserveCartelasForPlayer(String(room_id), String(player_id), selected_cartelas);
        const market = await buildRoomCartelaMarket(String(room_id), String(player_id));
        return json({ ok: true, reservation, market });
      }

      case "confirm_cartela_purchase": {
        const { room_id, player_id } = args;
        if (!room_id || !player_id) return json({ error: "missing fields" }, 400);
        await ensurePlayerNotBlocked(String(player_id));
        const result = await confirmCartelaPurchase(String(room_id), String(player_id));
        const market = await buildRoomCartelaMarket(String(room_id), String(player_id));
        return json({ ok: true, ...result, market });
      }

      case "release_cartela_reservation": {
        const { room_id, player_id } = args;
        if (!room_id || !player_id) return json({ error: "missing fields" }, 400);
        await supabase.from("room_cartela_reservations").delete().eq("room_id", room_id).eq("player_id", player_id);
        await audit(String(room_id), String(player_id), "release_cartela_reservation", {});
        const market = await buildRoomCartelaMarket(String(room_id), String(player_id));
        return json({ ok: true, market });
      }

      case "admin_release_room_reservations": {
        const { player_id, room_id } = args;
        if (!player_id || !room_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));
        await supabase.from("room_cartela_reservations").delete().eq("room_id", room_id);
        await audit(String(room_id), admin.id, "admin_release_room_reservations", {});
        const market = await buildRoomCartelaMarket(String(room_id));
        return json({ ok: true, market });
      }

      case "get_admin_summary": {
        const { player_id } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);
        await requireAdmin(String(player_id));

        const [
          { count: totalUsers },
          { count: totalRooms },
          { count: activeRooms },
          { count: liveRooms },
          { count: pausedRooms },
          { count: closedRooms },
          { count: pendingWalletRequests },
          { data: rooms },
          { data: transactions },
          { data: requests },
          { data: users },
          { data: auditLogs },
          { data: roomPlayers },
        ] = await Promise.all([
          supabase.from("players").select("*", { count: "exact", head: true }),
          supabase.from("rooms").select("*", { count: "exact", head: true }),
          supabase.from("rooms").select("*", { count: "exact", head: true }).in("status", ["lobby", "live", "paused"]),
          supabase.from("rooms").select("*", { count: "exact", head: true }).eq("status", "live"),
          supabase.from("rooms").select("*", { count: "exact", head: true }).eq("status", "paused"),
          supabase.from("rooms").select("*", { count: "exact", head: true }).eq("closed_by_admin", true),
          supabase.from("wallet_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("rooms").select("*").order("created_at", { ascending: false }).limit(12),
          supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(12),
          supabase.from("wallet_requests").select("*").order("created_at", { ascending: false }).limit(12),
          supabase.from("players").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20),
          supabase.from("room_players").select("*").order("joined_at", { ascending: false }).limit(500),
        ]);

        const activePlayers = new Set(
          (roomPlayers ?? [])
            .filter((entry: { role?: string; stake_paid?: boolean }) => entry.role === "player" && entry.stake_paid)
            .map((entry: { player_id: string }) => entry.player_id),
        ).size;

        const usersById = new Map((users ?? []).map((user: { id: string }) => [user.id, user]));
        const roomPlayersByRoomId = new Map<string, Array<Record<string, unknown>>>();
        for (const entry of roomPlayers ?? []) {
          const roomId = String((entry as { room_id: string }).room_id);
          const existing = roomPlayersByRoomId.get(roomId) ?? [];
          existing.push(entry as unknown as Record<string, unknown>);
          roomPlayersByRoomId.set(roomId, existing);
        }

        const enrichedRooms = (rooms ?? []).map((room: Record<string, unknown>) => {
          const participants = roomPlayersByRoomId.get(String(room.id)) ?? [];
          const joinedPlayers = participants.map((entry) => {
            const linkedUser = usersById.get(String(entry.player_id)) as Record<string, unknown> | undefined;
            const marked = Array.isArray(entry.marked) ? entry.marked : [];
            return {
              player_id: String(entry.player_id),
              username: linkedUser?.username ? String(linkedUser.username) : null,
              telegram_id: linkedUser?.telegram_id ? String(linkedUser.telegram_id) : null,
              phone_number: linkedUser?.phone_number ? String(linkedUser.phone_number) : null,
              role: String(entry.role ?? "player"),
              selected_cartelas: Array.isArray(entry.selected_cartelas) ? entry.selected_cartelas : [],
              false_claims: Number(entry.false_claims ?? 0),
              marked_count: marked.length,
            };
          });
          const playersOnly = joinedPlayers.filter((entry) => entry.role === "player");
          const calledNumbers = Array.isArray(room.call_sequence)
            ? room.call_sequence.slice(0, Number(room.current_index ?? -1) + 1)
            : [];
          const winnerUser = room.winner_id ? usersById.get(String(room.winner_id)) as Record<string, unknown> | undefined : undefined;
          return {
            ...room,
            joined_players_count: joinedPlayers.length,
            active_players_count: playersOnly.length,
            watcher_count: joinedPlayers.filter((entry) => entry.role === "watcher").length,
            called_numbers: calledNumbers,
            last_called_number: calledNumbers.length ? calledNumbers[calledNumbers.length - 1] : null,
            winner_name: winnerUser?.username ? String(winnerUser.username) : null,
            joined_players: joinedPlayers,
          };
        });

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
            total_rooms: totalRooms ?? 0,
            active_players: activePlayers,
            active_rooms: activeRooms ?? 0,
            live_rooms: liveRooms ?? 0,
            paused_rooms: pausedRooms ?? 0,
            closed_rooms: closedRooms ?? 0,
            pending_wallet_requests: pendingWalletRequests ?? 0,
            total_revenue: totalRevenue,
            total_payouts: totalPayouts,
            total_deposits: totalDeposits,
            total_withdrawals: totalWithdrawals,
            net_profit: totalRevenue - totalPayouts,
          },
          rooms: enrichedRooms,
          transactions: transactions ?? [],
          requests: requests ?? [],
          users: users ?? [],
          audit_logs: auditLogs ?? [],
        });
      }

      case "admin_login": {
        const { email, password } = args;
        const safeEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        const safePassword = typeof password === "string" ? password : "";
        if (!safeEmail || !safePassword) return json({ error: "missing credentials" }, 400);

        const { data: player } = await supabase
          .from("players")
          .select("*")
          .eq("admin_email", safeEmail)
          .maybeSingle();
        if (!player || !(player as { is_admin?: boolean }).is_admin) {
          return json({ error: "Invalid credentials" }, 403);
        }
        if ((player as { admin_password?: string | null }).admin_password !== safePassword) {
          return json({ error: "Invalid credentials" }, 403);
        }
        await audit(null, player.id, "admin_login", { email: safeEmail });
        return json({ player: normalizePlayerWallets(player) });
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

      case "admin_set_user_blocked": {
        const { player_id, target_player_id, is_blocked } = args;
        if (!player_id || !target_player_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));
        const { data: updated, error } = await supabase
          .from("players")
          .update({ is_blocked: Boolean(is_blocked) })
          .eq("id", target_player_id)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);
        await audit(null, admin.id, "admin_set_user_blocked", { target_player_id, is_blocked: Boolean(is_blocked) });
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

      case "admin_force_finish_room": {
        const { player_id, room_id } = args;
        if (!player_id || !room_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));
        const room = await getRoomOrThrow(String(room_id));
        await supabase
          .from("rooms")
          .update({
            status: "finished",
            pending_winner_id: null,
            pending_winning_line: null,
            pending_payout: null,
            finished_at: new Date().toISOString(),
          })
          .eq("id", room_id);
        await audit(room_id, admin.id, "admin_force_finish_room", { previous_status: room.status });
        return json({ ok: true });
      }

      case "admin_reset_room_state": {
        const { player_id, room_id } = args;
        if (!player_id || !room_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));
        const room = await getRoomOrThrow(String(room_id));
        const lobbyEndsAt = new Date(Date.now() + Number(room.lobby_seconds || 30) * 1000).toISOString();
        await supabase
          .from("room_players")
          .update({ marked: [FREE], false_claims: 0 })
          .eq("room_id", room_id)
          .eq("role", "player");
        await supabase
          .from("rooms")
          .update({
            status: "lobby",
            current_index: -1,
            winner_id: null,
            winning_line: null,
            pending_winner_id: null,
            pending_winning_line: null,
            pending_payout: null,
            started_at: null,
            finished_at: null,
            lobby_ends_at: lobbyEndsAt,
            call_sequence: shuffled1to75(),
            closed_by_admin: false,
          })
          .eq("id", room_id);
        const refreshed = await getRoomOrThrow(String(room_id));
        await audit(room_id, admin.id, "admin_reset_room_state", { previous_status: room.status });
        return json({ ok: true, room: refreshed });
      }

      case "admin_advance_room_round": {
        const { player_id, room_id } = args;
        if (!player_id || !room_id) return json({ error: "missing fields" }, 400);
        const admin = await requireAdmin(String(player_id));
        const room = await getRoomOrThrow(String(room_id));
        const lobbyEndsAt = new Date(Date.now() + Number(room.lobby_seconds || 30) * 1000).toISOString();
        await supabase
          .from("room_players")
          .update({ marked: [FREE], false_claims: 0 })
          .eq("room_id", room_id)
          .eq("role", "player");
        await supabase
          .from("rooms")
          .update({
            status: "lobby",
            current_index: -1,
            winner_id: null,
            winning_line: null,
            pending_winner_id: null,
            pending_winning_line: null,
            pending_payout: null,
            started_at: null,
            finished_at: null,
            lobby_ends_at: lobbyEndsAt,
            call_sequence: shuffled1to75(),
          })
          .eq("id", room_id);
        const refreshed = await getRoomOrThrow(String(room_id));
        await audit(room_id, admin.id, "admin_advance_room_round", { previous_status: room.status });
        return json({ ok: true, room: refreshed });
      }

      case "admin_clear_room_players": {
        // Destructive admin action: delete all room_players rows.
        const { player_id } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);
        const admin = await requireAdmin(String(player_id));

        await supabase
          .from("room_players")
          .delete();

        await audit(null, admin.id, "admin_clear_room_players", {});
        return json({ ok: true, cleared: true });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
