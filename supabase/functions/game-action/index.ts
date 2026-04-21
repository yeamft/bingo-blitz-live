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

function genRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
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
    if (line.every((pos) => m.has(card[pos]))) {
      return { idx: i, name: LINE_NAMES[i] };
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
  kind: "stake" | "payout" | "refund" | "seed",
  amount: number,
  balance_after: number,
) {
  await supabase
    .from("transactions")
    .insert({ player_id, room_id, kind, amount, balance_after });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
          return json({ player: existing });
        }
        const { data, error } = await supabase
          .from("players")
          .insert({ telegram_id: tid, username: uname })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        await recordTx(data.id, null, "seed", 1000, 1000);
        return json({ player: data });
      }

      case "create_room": {
        const { player_id, stake_amount } = args;
        if (!player_id) return json({ error: "missing player_id" }, 400);
        const stake = Math.max(1, Math.min(500, Number(stake_amount) || 20));

        // Check wallet
        const { data: p } = await supabase
          .from("players")
          .select("*")
          .eq("id", player_id)
          .maybeSingle();
        if (!p) return json({ error: "Player not found" }, 404);
        if (p.wallet_balance < stake)
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
            host_id: player_id,
            stake_amount: stake,
            lobby_seconds,
            lobby_ends_at,
            call_sequence: shuffled1to75(),
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);

        // Host stakes immediately
        const newBal = p.wallet_balance - stake;
        await supabase
          .from("players")
          .update({ wallet_balance: newBal })
          .eq("id", player_id);
        await recordTx(player_id, room.id, "stake", -stake, newBal);
        await supabase
          .from("rooms")
          .update({ derash: stake })
          .eq("id", room.id);
        await supabase.from("room_players").insert({
          room_id: room.id,
          player_id,
          role: "player",
          stake_paid: true,
          card: generateCard(),
        });
        await audit(room.id, player_id, "create_room", { code, stake });
        const { data: refreshed } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", room.id)
          .maybeSingle();
        return json({ room: refreshed });
      }

      case "join_room": {
        const { code, player_id } = args;
        if (!code || !player_id)
          return json({ error: "missing fields" }, 400);
        const safeCode = String(code).toUpperCase().slice(0, 10);
        const { data: room } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", safeCode)
          .maybeSingle();
        if (!room) return json({ error: "Room not found" }, 404);
        if (room.status === "finished")
          return json({ error: "Game already finished" }, 400);

        const { data: existing } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room.id)
          .eq("player_id", player_id)
          .maybeSingle();
        if (existing) return json({ room });

        // If lobby still open AND time remaining, attempt to stake & play.
        // Otherwise enter as watcher.
        const lobbyOpen =
          room.status === "lobby" &&
          room.lobby_ends_at &&
          new Date(room.lobby_ends_at).getTime() > Date.now();

        if (lobbyOpen) {
          const { data: p } = await supabase
            .from("players")
            .select("*")
            .eq("id", player_id)
            .maybeSingle();
          if (!p) return json({ error: "Player not found" }, 404);
          if (p.wallet_balance < room.stake_amount) {
            // Auto-fall through to watcher mode if they can't afford
            await supabase.from("room_players").insert({
              room_id: room.id,
              player_id,
              role: "watcher",
              stake_paid: false,
              card: [],
            });
            await audit(room.id, player_id, "join_watcher_no_funds", {});
            return json({ room });
          }
          const newBal = p.wallet_balance - room.stake_amount;
          await supabase
            .from("players")
            .update({ wallet_balance: newBal })
            .eq("id", player_id);
          await recordTx(
            player_id,
            room.id,
            "stake",
            -room.stake_amount,
            newBal,
          );
          await supabase
            .from("rooms")
            .update({ derash: room.derash + room.stake_amount })
            .eq("id", room.id);
          await supabase.from("room_players").insert({
            room_id: room.id,
            player_id,
            role: "player",
            stake_paid: true,
            card: generateCard(),
          });
          await audit(room.id, player_id, "join_player", {
            stake: room.stake_amount,
          });
        } else {
          await supabase.from("room_players").insert({
            room_id: room.id,
            player_id,
            role: "watcher",
            stake_paid: false,
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
        if (room.winner_id) return json({ error: "Already won" }, 400);

        const { data: rp } = await supabase
          .from("room_players")
          .select("*")
          .eq("room_id", room_id)
          .eq("player_id", player_id)
          .maybeSingle();
        if (!rp || rp.role !== "player")
          return json({ error: "Not a player" }, 403);

        const win = detectWinningLine(rp.card, rp.marked);
        if (!win) {
          await audit(room_id, player_id, "claim_invalid", {});
          return json({ error: "No completed line" }, 400);
        }

        // Award derash (full pot - house cut already excluded? We compute payout = derash * (1 - commission))
        const payout = Math.floor(
          (room.derash * (100 - room.house_commission_pct)) / 100,
        );

        const { data: winner } = await supabase
          .from("players")
          .select("*")
          .eq("id", player_id)
          .maybeSingle();
        if (!winner) return json({ error: "Player vanished" }, 500);
        const newBal = winner.wallet_balance + payout;
        await supabase
          .from("players")
          .update({ wallet_balance: newBal })
          .eq("id", player_id);
        await recordTx(player_id, room_id, "payout", payout, newBal);

        await supabase
          .from("rooms")
          .update({
            status: "finished",
            winner_id: player_id,
            winning_line: win.name,
            finished_at: new Date().toISOString(),
          })
          .eq("id", room_id);
        await audit(room_id, player_id, "claim_valid", {
          line: win.name,
          payout,
        });
        return json({ ok: true, winner: true, payout, line: win.name });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
