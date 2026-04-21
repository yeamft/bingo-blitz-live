import { supabase } from "@/integrations/supabase/client";

export type Player = {
  id: string;
  telegram_id: string;
  username: string;
  wallet_balance: number;
  created_at: string;
};

export type RoomStatus = "lobby" | "live" | "finished";

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  stake_amount: number;
  house_commission_pct: number;
  derash: number;
  call_interval_ms: number;
  lobby_seconds: number;
  lobby_ends_at: string | null;
  current_index: number;
  call_sequence: number[];
  winner_id: string | null;
  winning_line: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RoomPlayerRole = "player" | "watcher";

export type RoomPlayer = {
  id: string;
  room_id: string;
  player_id: string;
  role: RoomPlayerRole;
  stake_paid: boolean;
  card: number[];
  marked: number[];
  joined_at: string;
};

async function call<T = any>(
  action: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("game-action", {
    body: { action, ...args },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const api = {
  upsertPlayer: (telegram_id: string, username: string) =>
    call<{ player: Player }>("upsert_player", { telegram_id, username }),
  createRoom: (player_id: string, stake_amount = 20) =>
    call<{ room: Room }>("create_room", { player_id, stake_amount }),
  joinRoom: (code: string, player_id: string) =>
    call<{ room: Room }>("join_room", { code, player_id }),
  leaveRoom: (room_id: string, player_id: string) =>
    call("leave_room", { room_id, player_id }),
  tickLobby: (room_id: string) => call("tick_lobby", { room_id }),
  callNext: (room_id: string) => call("call_next", { room_id }),
  claimBingo: (room_id: string, player_id: string) =>
    call<{ winner: boolean; payout: number; line: string }>("claim_bingo", {
      room_id,
      player_id,
    }),
};

// 75-ball helpers
export function letterFor(n: number): "B" | "I" | "N" | "G" | "O" {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}
