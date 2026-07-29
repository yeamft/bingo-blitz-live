import { supabase } from "@/integrations/supabase/client";
import { api, type GameHistoryEntry, type Player, type Transaction } from "@/lib/api";

export type PlayerProfileStats = {
  main_wallet_balance: number;
  play_wallet_balance: number;
  total_balance: number;
  games_played: number;
  games_won: number;
  total_earnings: number;
};

export async function loadPlayerProfileStats(playerId: string): Promise<PlayerProfileStats> {
  const [walletData, gamesPlayedResult, winsResult] = await Promise.all([
    api.getWalletSummary(playerId),
    supabase
      .from("room_players")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId),
    supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("winner_id", playerId),
  ]);

  const totalEarnings = walletData.transactions
    .filter((tx: Transaction) => tx.kind === "payout")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  return {
    main_wallet_balance: walletData.summary.main_wallet_balance,
    play_wallet_balance: walletData.summary.play_wallet_balance,
    total_balance: walletData.summary.total_balance,
    games_played: gamesPlayedResult.count ?? 0,
    games_won: winsResult.count ?? 0,
    total_earnings: totalEarnings,
  };
}

export async function loadPlayerGameHistory(playerId: string, limit = 20): Promise<GameHistoryEntry[]> {
  const { data, error } = await supabase
    .from("room_players")
    .select(`
      role,
      joined_at,
      room:rooms (
        id,
        code,
        room_name,
        stake_amount,
        status,
        winner_id,
        winning_line,
        derash,
        house_commission_pct,
        finished_at
      )
    `)
    .eq("player_id", playerId)
    .order("joined_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const payoutTxByRoom = new Map<string, number>();
  const { data: payoutRows } = await supabase
    .from("transactions")
    .select("room_id, amount")
    .eq("player_id", playerId)
    .eq("kind", "payout")
    .order("created_at", { ascending: false })
    .limit(100);

  for (const row of payoutRows ?? []) {
    if (row.room_id && !payoutTxByRoom.has(row.room_id)) {
      payoutTxByRoom.set(row.room_id, Number(row.amount || 0));
    }
  }

  return (data ?? [])
    .map((entry) => {
      const room = entry.room as {
        id: string;
        code: string;
        room_name: string | null;
        stake_amount: number;
        status: GameHistoryEntry["status"];
        winner_id: string | null;
        winning_line: string | null;
        derash: number;
        house_commission_pct: number;
        finished_at: string | null;
      } | null;
      if (!room) return null;

      const won = room.winner_id === playerId;
      const payout = won
        ? payoutTxByRoom.get(room.id) ?? Math.max(0, Math.floor((room.derash * (100 - (room.house_commission_pct ?? 10))) / 100))
        : 0;

      return {
        room_id: room.id,
        room_code: room.code,
        room_name: room.room_name,
        stake_amount: room.stake_amount,
        status: room.status,
        role: entry.role as GameHistoryEntry["role"],
        winner_id: room.winner_id,
        winning_line: room.winning_line,
        derash: room.derash,
        joined_at: entry.joined_at,
        finished_at: room.finished_at,
        won,
        payout,
      } satisfies GameHistoryEntry;
    })
    .filter((entry): entry is GameHistoryEntry => Boolean(entry));
}

export function isAdminPlayer(player: Player | null | undefined): boolean {
  return Boolean(player?.is_admin);
}
