import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { useRoomState } from "@/hooks/useRoomState";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BingoBall } from "@/components/bingo/BingoBall";
import { BingoCard } from "@/components/bingo/BingoCard";
import { MasterBoard } from "@/components/bingo/MasterBoard";
import { CallLog } from "@/components/bingo/CallLog";
import { Confetti } from "@/components/bingo/Confetti";
import { toast } from "sonner";
import {
  Loader2,
  Copy,
  LogOut,
  Trophy,
  Wallet,
  Users,
  Eye,
  RefreshCw,
  Languages,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { player, loading: idLoading } = useTelegramIdentity();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  // Resolve code → room id, ensure membership (player or watcher per server logic)
  useEffect(() => {
    if (!player || !code) return;
    let cancelled = false;
    (async () => {
      try {
        const { room } = await api.joinRoom(code, player.id);
        if (!cancelled) setRoomId(room.id);
      } catch (e: any) {
        if (!cancelled) setResolveErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player, code]);

  const { room, players, me, loading } = useRoomState(roomId, player?.id ?? null);

  if (idLoading || (!resolveErr && (loading || !room || !player))) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (resolveErr) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive">{resolveErr}</p>
        <Button onClick={() => navigate("/")}>Back home</Button>
      </main>
    );
  }

  return (
    <RoomInner
      room={room!}
      players={players}
      me={me}
      myPlayerId={player!.id}
      myWallet={player!.wallet_balance}
      onLeave={() => navigate("/")}
    />
  );
}

function RoomInner({
  room,
  players,
  me,
  myPlayerId,
  myWallet,
  onLeave,
}: {
  room: NonNullable<ReturnType<typeof useRoomState>["room"]>;
  players: ReturnType<typeof useRoomState>["players"];
  me: ReturnType<typeof useRoomState>["me"];
  myPlayerId: string;
  myWallet: number;
  onLeave: () => void;
}) {
  const { t, lang, toggle } = useLang();
  const isHost = room.host_id === myPlayerId;
  const called = useMemo(
    () => room.call_sequence.slice(0, room.current_index + 1),
    [room.call_sequence, room.current_index],
  );
  const current = room.current_index >= 0 ? room.call_sequence[room.current_index] : null;
  const winner = players.find((p) => p.player_id === room.winner_id);
  const iWon = room.winner_id === myPlayerId;
  const playerCount = players.filter((p) => p.role === "player").length;
  const watcherCount = players.filter((p) => p.role === "watcher").length;
  const isWatcher = me?.role === "watcher";

  // Lobby countdown
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  useEffect(() => {
    if (room.status !== "lobby" || !room.lobby_ends_at) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const ms = new Date(room.lobby_ends_at!).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [room.status, room.lobby_ends_at]);

  // Host triggers transition when lobby ends
  useEffect(() => {
    if (!isHost) return;
    if (room.status !== "lobby") return;
    if (secondsLeft > 0) return;
    api.tickLobby(room.id).catch(() => {});
  }, [isHost, room.status, secondsLeft, room.id]);

  // Host drives the call ticker during live phase
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHost || room.status !== "live") {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => {
      api.callNext(room.id).catch(() => {});
    }, room.call_interval_ms);
    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isHost, room.status, room.id, room.call_interval_ms]);

  // Pop animation key + haptic on each new ball
  const [popKey, setPopKey] = useState(0);
  useEffect(() => {
    if (current) {
      setPopKey((k) => k + 1);
      haptic("light");
    }
  }, [current]);

  // Auto-detect a complete line on my card and auto-claim once
  const autoClaimedRef = useRef(false);
  useEffect(() => {
    if (autoClaimedRef.current) return;
    if (!me || isWatcher || room.status !== "live" || room.winner_id) return;
    if (hasCompletedLine(me.card, me.marked)) {
      autoClaimedRef.current = true;
      api
        .claimBingo(room.id, myPlayerId)
        .then((r) => {
          if (r?.winner) {
            toast.success(`${t("bingo")} +${r.payout}`);
            haptic("success");
          }
        })
        .catch(() => {
          autoClaimedRef.current = false;
        });
    }
  }, [me?.marked, room.status, room.winner_id]);

  // Winner haptic (when someone else won)
  useEffect(() => {
    if (room.status === "finished" && room.winner_id && !iWon) {
      haptic("warning");
    }
  }, [room.status, room.winner_id, iWon]);

  async function copyInvite() {
    const url = `${window.location.origin}/room/${room.code}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
    haptic("light");
  }

  async function handleLeave() {
    await api.leaveRoom(room.id, myPlayerId).catch(() => {});
    onLeave();
  }

  async function manualClaim() {
    try {
      const r = await api.claimBingo(room.id, myPlayerId);
      if (r?.winner) {
        toast.success(`${t("bingo")} +${r.payout}`);
        haptic("success");
      }
    } catch (e: any) {
      toast.error(e.message);
      haptic("error");
    }
  }

  return (
    <main className="min-h-screen flex flex-col safe-top safe-bottom max-w-md mx-auto px-3 pb-3">
      {iWon && room.status === "finished" && <Confetti />}

      {/* Dashboard header */}
      <header className="glass rounded-2xl p-3 mt-2 mb-3 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={copyInvite}
            className="flex items-center gap-1 text-[11px] font-mono font-bold tracking-[0.25em] bg-secondary px-2 py-1 rounded-md"
          >
            {room.code} <Copy className="h-3 w-3" />
          </button>
          <span
            className={cn(
              "text-[10px] font-black uppercase px-2 py-1 rounded-full tracking-wider",
              room.status === "lobby" && "bg-warning/20 text-warning",
              room.status === "live" && "bg-success/20 text-success animate-pulse",
              room.status === "finished" && "bg-primary/20 text-primary",
            )}
          >
            {room.status === "lobby" && t("lobbyPhase")}
            {room.status === "live" && t("livePhase")}
            {room.status === "finished" && t("finished")}
          </span>
          <button
            onClick={toggle}
            className="flex items-center gap-1 text-[10px] bg-secondary px-2 py-1 rounded-md font-bold uppercase"
          >
            <Languages className="h-3 w-3" /> {lang === "en" ? "EN" : "አማ"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat
            icon={<Users className="h-3 w-3" />}
            label={t("players")}
            value={`${playerCount}${watcherCount > 0 ? ` +${watcherCount}` : ""}`}
          />
          <Stat
            icon={<Wallet className="h-3 w-3" />}
            label={t("wallet")}
            value={String(myWallet)}
          />
          <Stat
            icon={<Coins className="h-3 w-3 text-warning" />}
            label={t("derash")}
            value={String(room.derash)}
            highlight
          />
        </div>
      </header>

      {/* Status overlay */}
      {room.status === "lobby" && (
        <div className="glass rounded-2xl p-4 mb-3 text-center shadow-card">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("startsIn")}
          </p>
          <p className="text-5xl font-black gradient-primary bg-clip-text text-transparent tabular-nums">
            {secondsLeft}s
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("stake")}: <span className="font-bold text-foreground">{room.stake_amount}</span>
            {" · "}
            {t("derash")}: <span className="font-bold text-warning">{room.derash}</span>
          </p>
        </div>
      )}

      {isWatcher && room.status !== "finished" && (
        <div className="bg-warning/15 border border-warning/40 text-warning text-xs rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" />
          <span>{t("watchingMode")}</span>
        </div>
      )}

      {/* LIVE: hero ball */}
      {room.status === "live" && (
        <section className="flex flex-col items-center mb-3">
          {current ? (
            <div key={popKey} className="animate-ball-pop">
              <BingoBall number={current} size="hero" />
            </div>
          ) : (
            <div className="h-40 w-40 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground text-sm text-center px-4">
              {t("waiting")}
            </div>
          )}
          <div className="mt-2 w-full">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {t("callLog")}
            </p>
            <CallLog called={called} />
          </div>
        </section>
      )}

      {/* CARD */}
      {room.status !== "finished" && me && (
        <section className="mb-3">
          <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center justify-between">
            <span>{t("yourCard")}</span>
            {!isWatcher && me.card.length > 0 && (
              <span className="text-accent font-bold">
                {me.marked.filter((n) => n !== 0).length} / 24
              </span>
            )}
          </h2>
          <BingoCard
            numbers={me.card}
            marked={me.marked}
            current={current}
            disabled={room.status !== "live"}
          />
        </section>
      )}

      {/* MASTER BOARD */}
      {room.status !== "finished" && (
        <section className="glass rounded-2xl p-3 mb-3">
          <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {t("masterBoard")}
          </h2>
          <MasterBoard called={called} current={current} />
        </section>
      )}

      {/* FINISHED */}
      {room.status === "finished" && (
        <section className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-4">
          <div className="gradient-win h-20 w-20 rounded-full flex items-center justify-center shadow-elegant">
            <Trophy className="h-10 w-10 text-accent-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("winner")}
            </p>
            <h2 className="text-2xl font-extrabold mt-0.5">
              {winner ? winner.player.username : t("noWinner")}
            </h2>
            {iWon && <p className="text-accent font-bold mt-1">🎉 {t("youWon")}</p>}
            {room.winning_line && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("pattern")}: <span className="font-bold text-foreground">{room.winning_line}</span>
              </p>
            )}
            {winner && (
              <p className="text-warning font-extrabold text-xl mt-2">
                {t("payout")}: {Math.floor((room.derash * (100 - room.house_commission_pct)) / 100)}
              </p>
            )}
          </div>
          <div className="glass rounded-xl p-3 w-full">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {called.length} numbers called
            </p>
            <CallLog called={called} limit={10} />
          </div>
        </section>
      )}

      {/* Bottom action bar */}
      <div className="mt-auto sticky bottom-1 grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          size="lg"
          className="h-12 font-bold"
          onClick={handleLeave}
        >
          <LogOut className="h-4 w-4 mr-1" /> {t("leave")}
        </Button>
        {room.status === "live" && !isWatcher ? (
          <Button
            onClick={manualClaim}
            size="lg"
            className="col-span-2 h-12 gradient-win text-accent-foreground font-extrabold shadow-elegant"
          >
            <Trophy className="h-5 w-5 mr-1" /> {t("bingo")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="col-span-2 h-12 font-bold"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> {t("refresh")}
          </Button>
        )}
      </div>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-secondary/60 rounded-lg py-1.5 px-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-center">
        {icon} {label}
      </div>
      <div
        className={cn(
          "font-extrabold text-base tabular-nums leading-tight",
          highlight && "text-warning text-lg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// Mirror of server-side line detection (for client-side auto-claim trigger).
// Server still validates definitively.
const LINES = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

function hasCompletedLine(card: number[], marked: number[]): boolean {
  if (!card?.length) return false;
  const m = new Set(marked);
  return LINES.some((line) => line.every((pos) => m.has(card[pos])));
}
