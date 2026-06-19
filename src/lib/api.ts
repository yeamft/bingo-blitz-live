import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type Player = {
  id: string;
  telegram_id: string;
  username: string;
  phone_number?: string | null;
  wallet_balance: number;
  main_wallet_balance?: number;
  play_wallet_balance?: number;
  is_admin?: boolean;
  is_blocked?: boolean;
  created_at: string;
};

export type Transaction = {
  id: number;
  player_id: string;
  room_id: string | null;
  kind:
    | "stake"
    | "payout"
    | "refund"
    | "seed"
    | "deposit"
    | "withdrawal"
    | "transfer_to_play";
  amount: number;
  balance_after: number;
  created_at: string;
};

export type WalletRequest = {
  id: number;
  player_id: string;
  kind: "deposit" | "withdrawal";
  amount: number;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  created_at: string;
};

export type AdminSummary = {
  totals: {
    total_users: number;
    active_rooms: number;
    live_rooms: number;
    pending_wallet_requests: number;
    total_revenue: number;
    total_payouts: number;
    total_deposits?: number;
    total_withdrawals?: number;
    net_profit?: number;
  };
  rooms: Room[];
  transactions: Transaction[];
  requests: WalletRequest[];
  users?: Player[];
  audit_logs?: Array<{
    id: number;
    room_id: string | null;
    player_id: string | null;
    action: string;
    payload: unknown;
    created_at: string;
  }>;
};

export type AdminAuthSession = {
  player: Player;
};

export type RoomStatus = "lobby" | "live" | "paused" | "finished";

export type Room = {
  id: string;
  code: string;
  game_id?: string | null;
  is_private?: boolean;
  room_name?: string | null;
  max_players?: number;
  room_password?: string | null;
  closed_by_admin?: boolean;
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
  pending_winner_id?: string | null;
  pending_winning_line?: string | null;
  pending_payout?: number | null;
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
  selected_cartelas?: number[];
  auto_fill?: boolean;
  false_claims?: number;
  card: number[];
  marked: number[];
  joined_at: string;
};

async function call<T = unknown>(
  action: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("game-action", {
    body: { action, ...args },
  });

  if (data?.error) {
    const penalty = typeof data?.penalty === "number" ? ` (${data.penalty})` : "";
    throw new Error(`${data.error}${penalty}`);
  }

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body?.error) {
          const penalty = typeof body?.penalty === "number" ? ` (${body.penalty})` : "";
          throw new Error(`${body.error}${penalty}`);
        }
      } catch (nested) {
        if (nested instanceof Error && nested.message && !nested.message.includes("non-2xx")) {
          throw nested;
        }
      }
    }
    throw new Error(error.message);
  }

  return data as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Something went wrong";
}

function isMissingWalletRequestsTable(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("wallet_requests") && message.includes("schema cache");
}

async function getWalletSummaryWithFallback(player_id: string) {
  try {
    return await call<{
      player: Player;
      summary: {
        total_balance: number;
        main_wallet_balance: number;
        play_wallet_balance: number;
      };
      transactions: Transaction[];
      requests: WalletRequest[];
    }>("get_wallet_summary", { player_id });
  } catch (error: unknown) {
    if (!getErrorMessage(error).toLowerCase().includes("unknown action")) {
      throw error;
    }

    const db = supabase as any;
    const [{ data: player, error: playerError }, { data: transactions, error: txError }, { data: requests, error: requestsError }] =
      await Promise.all([
        db.from("players").select("*").eq("id", player_id).maybeSingle(),
        db
          .from("transactions")
          .select("*")
          .eq("player_id", player_id)
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("wallet_requests")
          .select("*")
          .eq("player_id", player_id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    if (playerError) throw new Error(playerError.message);
    if (txError) throw new Error(txError.message);
    if (requestsError && !isMissingWalletRequestsTable(requestsError.message)) {
      throw new Error(requestsError.message);
    }
    if (!player) throw new Error("Player not found");

    const rawPlayer = player as Player;
    const play_wallet_balance = Number(rawPlayer.play_wallet_balance ?? rawPlayer.wallet_balance ?? 0);
    const main_wallet_balance = Number(rawPlayer.main_wallet_balance ?? rawPlayer.wallet_balance ?? 0);

    return {
      player: {
        ...rawPlayer,
        wallet_balance: play_wallet_balance,
        play_wallet_balance,
        main_wallet_balance,
      } as Player,
      summary: {
        total_balance: main_wallet_balance + play_wallet_balance,
        main_wallet_balance,
        play_wallet_balance,
      },
      transactions: (transactions ?? []) as unknown as Transaction[],
      requests: requestsError ? [] : ((requests ?? []) as unknown as WalletRequest[]),
    };
  }
}

async function getAdminSummaryWithFallback(player_id: string): Promise<AdminSummary> {
  try {
    return await call<AdminSummary>("get_admin_summary", { player_id });
  } catch (error: unknown) {
    if (!getErrorMessage(error).toLowerCase().includes("unknown action")) {
      throw error;
    }

    const db = supabase as any;
    const { data: admin, error: adminError } = await db.from("players").select("*").eq("id", player_id).maybeSingle();
    if (adminError) throw new Error(adminError.message);
    if (!admin?.is_admin) throw new Error("Admin access required");

    const [
      { count: totalUsers },
      { count: activeRooms },
      { count: liveRooms },
      { data: rooms },
      { data: transactions },
      { data: users },
      { data: auditLogs },
      requestsResult,
    ] = await Promise.all([
      db.from("players").select("*", { count: "exact", head: true }),
      db.from("rooms").select("*", { count: "exact", head: true }).in("status", ["lobby", "live", "paused"]),
      db.from("rooms").select("*", { count: "exact", head: true }).eq("status", "live"),
      db.from("rooms").select("*").order("created_at", { ascending: false }).limit(8),
      db.from("transactions").select("*").order("created_at", { ascending: false }).limit(12),
      db.from("players").select("*").order("created_at", { ascending: false }).limit(20),
      db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20),
      db.from("wallet_requests").select("*").order("created_at", { ascending: false }).limit(12),
    ]);

    const requestsError = requestsResult.error;
    if (requestsError && !isMissingWalletRequestsTable(requestsError.message)) {
      throw new Error(requestsError.message);
    }

    const txs = (transactions ?? []) as unknown as Transaction[];
    const totalRevenue = txs
      .filter((tx) => tx.kind === "stake")
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    const totalPayouts = txs
      .filter((tx) => tx.kind === "payout")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const totalDeposits = txs
      .filter((tx) => tx.kind === "deposit")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const totalWithdrawals = txs
      .filter((tx) => tx.kind === "withdrawal")
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    const requests = requestsError ? [] : ((requestsResult.data ?? []) as unknown as WalletRequest[]);

    return {
      totals: {
        total_users: totalUsers ?? 0,
        active_rooms: activeRooms ?? 0,
        live_rooms: liveRooms ?? 0,
        pending_wallet_requests: requests.filter((request) => request.status === "pending").length,
        total_revenue: totalRevenue,
        total_payouts: totalPayouts,
        total_deposits: totalDeposits,
        total_withdrawals: totalWithdrawals,
        net_profit: totalRevenue - totalPayouts,
      },
      rooms: (rooms ?? []) as unknown as Room[],
      transactions: txs,
      requests,
      users: (users ?? []) as unknown as Player[],
      audit_logs: (auditLogs ?? []) as AdminSummary["audit_logs"],
    };
  }
}

export const api = {
  upsertPlayer: (telegram_id: string, username: string) =>
    call<{ player: Player }>("upsert_player", { telegram_id, username }),
  createRoom: (
    player_id: string,
    stake_amount = 20,
    selected_cartelas: number[] = [1],
    is_private = false,
    options?: { room_name?: string; max_players?: number; password?: string },
  ) =>
    call<{ room: Room }>("create_room", {
      player_id,
      stake_amount,
      selected_cartelas,
      is_private,
      room_name: options?.room_name,
      max_players: options?.max_players,
      password: options?.password,
    }),
  joinRoom: (code: string, player_id: string, selected_cartelas: number[] = [1], password?: string) =>
    call<{ room: Room }>("join_room", { code, player_id, selected_cartelas, password }),
  leaveRoom: (room_id: string, player_id: string) =>
    call("leave_room", { room_id, player_id }),
  tickLobby: (room_id: string) => call("tick_lobby", { room_id }),
  callNext: (room_id: string) => call("call_next", { room_id }),
  setAutoFill: (room_id: string, player_id: string, auto_fill: boolean) =>
    call("set_auto_fill", { room_id, player_id, auto_fill }),
  markNumber: (room_id: string, player_id: string, number: number) =>
    call("mark_number", { room_id, player_id, number }),
  verifyBingo: (room_id: string, host_player_id: string, approve = true) =>
    call("verify_bingo", { room_id, host_player_id, approve }),
  claimBingo: (room_id: string, player_id: string) =>
    call<{ winner: boolean; pending?: boolean; payout: number; line: string }>("claim_bingo", {
      room_id,
      player_id,
    }),
  getWalletSummary: getWalletSummaryWithFallback,
  transferToPlayWallet: (player_id: string, amount: number) =>
    call<{ ok: true; player: Player }>("transfer_to_play_wallet", { player_id, amount }),
  requestDeposit: (player_id: string, amount: number, note?: string) =>
    call<{ ok: true; request: WalletRequest }>("request_deposit", { player_id, amount, note }),
  requestWithdrawal: (player_id: string, amount: number, note?: string) =>
    call<{ ok: true; request: WalletRequest }>("request_withdrawal", { player_id, amount, note }),
  listTransactions: (player_id: string) =>
    call<{ transactions: Transaction[]; requests: WalletRequest[] }>("list_transactions", { player_id }),
  getAdminSummary: getAdminSummaryWithFallback,
  processWalletRequest: (player_id: string, request_id: number, approve: boolean) =>
    call<{ ok: true; request: WalletRequest }>("process_wallet_request", {
      player_id,
      request_id,
      approve,
    }),
  closeRoomAsAdmin: (player_id: string, room_id: string) =>
    call<{ ok: true }>("admin_close_room", { player_id, room_id }),
  adminSetUserAdmin: (player_id: string, target_player_id: string, is_admin: boolean) =>
    call<{ ok: true; player: Player }>("admin_set_user_admin", { player_id, target_player_id, is_admin }),
  adminSetUserBlocked: (player_id: string, target_player_id: string, is_blocked: boolean) =>
    call<{ ok: true; player: Player }>("admin_set_user_blocked", { player_id, target_player_id, is_blocked }),
  adminLogin: (email: string, password: string) =>
    call<AdminAuthSession>("admin_login", { email, password }),
  adminForceFinishRoom: (player_id: string, room_id: string) =>
    call<{ ok: true }>("admin_force_finish_room", { player_id, room_id }),
  adminResetRoomState: (player_id: string, room_id: string) =>
    call<{ ok: true; room: Room }>("admin_reset_room_state", { player_id, room_id }),
  adminAdvanceRoomRound: (player_id: string, room_id: string) =>
    call<{ ok: true; room: Room }>("admin_advance_room_round", { player_id, room_id }),
  adminAdjustWallet: (
    player_id: string,
    target_player_id: string,
    wallet: "main" | "play",
    amount: number,
    reason?: string,
  ) => call<{ ok: true; player: Player }>("admin_adjust_wallet", { player_id, target_player_id, wallet, amount, reason }),
};

// 75-ball helpers
export function letterFor(n: number): "B" | "I" | "N" | "G" | "O" {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}
