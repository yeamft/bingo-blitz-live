import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Shield, UserCircle2 } from "lucide-react";
import { useTelegramIdentity } from "@/hooks/useTelegramIdentity";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loadPlayerProfileStats, type PlayerProfileStats } from "@/lib/player-data";
import { getErrorMessage } from "@/lib/api";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { toast } from "sonner";

export default function ProfilePage() {
  const { player, loading } = useTelegramIdentity();
  const [stats, setStats] = useState<PlayerProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!player) return;
    setStatsLoading(true);
    try {
      setStats(await loadPlayerProfileStats(player.id));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [player]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

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
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-accent" /> Profile
          </h1>
          {player.is_admin && (
            <Button asChild size="sm" variant="secondary" className="h-8">
              <Link to="/admin">
                <Shield className="h-3.5 w-3.5 mr-1" /> Admin
              </Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/60 rounded-xl p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Main Wallet</p>
            <p className="text-2xl font-black tabular-nums mt-1">
              {statsLoading ? "—" : stats?.main_wallet_balance ?? 0}
            </p>
          </div>
          <div className="bg-secondary/60 rounded-xl p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Play Wallet</p>
            <p className="text-2xl font-black tabular-nums mt-1">
              {statsLoading ? "—" : stats?.play_wallet_balance ?? player.wallet_balance}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-secondary/60 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Games Won</p>
            <p className="text-lg font-black tabular-nums mt-1">{statsLoading ? "—" : stats?.games_won ?? 0}</p>
          </div>
          <div className="bg-secondary/60 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Games Played</p>
            <p className="text-lg font-black tabular-nums mt-1">{statsLoading ? "—" : stats?.games_played ?? 0}</p>
          </div>
          <div className="bg-secondary/60 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Earning</p>
            <p className="text-lg font-black tabular-nums mt-1 text-warning">
              {statsLoading ? "—" : stats?.total_earnings ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Username:</span>{" "}
            <span className="font-semibold">{player.username}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Telegram ID:</span>{" "}
            <span className="font-mono text-xs">{player.telegram_id}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Phone:</span>{" "}
            <span className="font-semibold">{player.phone_number ?? "Not set"}</span>
          </p>
          {player.is_blocked && (
            <p className="text-destructive font-semibold">This account is currently blocked.</p>
          )}
        </div>

        <div className="bg-secondary/60 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold">Settings</h2>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Appearance</Label>
            <ThemeToggle variant="menu" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sound-toggle" className="text-sm">
              Sound
            </Label>
            <Switch id="sound-toggle" defaultChecked />
          </div>
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={() => loadStats()} disabled={statsLoading}>
          {statsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Refresh profile
        </Button>
      </section>
    </main>
  );
}
