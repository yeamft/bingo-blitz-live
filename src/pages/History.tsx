import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History as HistoryIcon, Loader2, RefreshCw, Trophy } from "lucide-react";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { Button } from "@/components/ui/button";
import { loadPlayerGameHistory } from "@/lib/player-data";
import { getErrorMessage, type GameHistoryEntry } from "@/lib/api";
import { toast } from "sonner";

export default function HistoryPage() {
  const { player, loading } = useTelegramIdentity();
  const navigate = useNavigate();
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async (showRefresh = false) => {
    if (!player) return;
    if (showRefresh) setRefreshing(true);
    else setPageLoading(true);
    try {
      setHistory(await loadPlayerGameHistory(player.id));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      setHistory([]);
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }, [player]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const finishedGames = useMemo(
    () => history.filter((entry) => entry.status === "finished"),
    [history],
  );

  if (loading || !player) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-6 safe-top">
      <section className="glass rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-primary" /> Game History
          </h1>
          <Button type="button" variant="secondary" size="sm" onClick={() => loadHistory(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="bg-secondary/60 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Finished Games</p>
          <p className="text-3xl font-black tabular-nums mt-1">
            {pageLoading ? "—" : finishedGames.length}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold">Recent Games</h2>
          {pageLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-1">
              No games yet for <span className="font-semibold text-foreground">{player.username}</span>.
              Join a lobby to play your first round.
            </p>
          ) : (
            <div className="space-y-2 mt-3">
              {history.map((entry) => (
                <article
                  key={`${entry.room_id}-${entry.joined_at}`}
                  className="rounded-xl border border-border bg-card/40 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{entry.room_name ?? `Room ${entry.room_code}`}</p>
                      <p className="text-xs text-muted-foreground font-mono">{entry.room_code}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold rounded-full px-2 py-1 bg-secondary text-muted-foreground">
                      {entry.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p><span className="text-muted-foreground">Stake:</span> {entry.stake_amount} ETB</p>
                    <p><span className="text-muted-foreground">Role:</span> {entry.role}</p>
                    <p><span className="text-muted-foreground">Pot:</span> {entry.derash} ETB</p>
                    <p>
                      <span className="text-muted-foreground">Joined:</span>{" "}
                      {new Date(entry.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                  {entry.won ? (
                    <p className="text-sm font-bold text-warning flex items-center gap-1">
                      <Trophy className="h-4 w-4" /> Won +{entry.payout} ETB
                    </p>
                  ) : entry.status === "finished" ? (
                    <p className="text-xs text-muted-foreground">
                      Winner line: {entry.winning_line ?? "No winner recorded"}
                    </p>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => navigate(`/room/${entry.room_code}`)}
                    >
                      Open room
                    </Button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
