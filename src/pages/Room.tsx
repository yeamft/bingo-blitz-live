import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { useRoomState } from "@/hooks/useRoomState";
import { api, getErrorMessage } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BingoCard } from "@/components/bingo/BingoCard";
import { CompactBingoCard } from "@/components/bingo/CompactBingoCard";
import { MasterBoard } from "@/components/bingo/MasterBoard";
import { CallLog } from "@/components/bingo/CallLog";
import { Confetti } from "@/components/bingo/Confetti";
import { hasAnyCompletedLine } from "@/lib/bingo-lines";
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
  Coins,
  Radio,
  Lock,
  ShoppingCart,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolvePlayerCards, splitCards, readSessionCartelas } from "@/lib/cartela";

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { player, loading: idLoading } = useTelegramIdentity();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  // Resolve code → room id; pass saved cartelas so lobby re-join can upgrade stake/cards
  useEffect(() => {
    if (!player || !code) return;
    let cancelled = false;
    (async () => {
      try {
        const sessionCartelas = readSessionCartelas(code);
        const { room } = await api.joinRoom(
          code,
          player.id,
          sessionCartelas ?? undefined,
        );
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
      onJoinNextRound={() => navigate("/game")}
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
  onJoinNextRound,
}: {
  room: NonNullable<ReturnType<typeof useRoomState>["room"]>;
  players: ReturnType<typeof useRoomState>["players"];
  me: ReturnType<typeof useRoomState>["me"];
  myPlayerId: string;
  myWallet: number;
  onLeave: () => void;
  onJoinNextRound: () => void;
}) {
  const { t, lang, toggle } = useLang();
  const isHost = room.host_id === myPlayerId;
  const [localAutoFill, setLocalAutoFill] = useState<boolean>(Boolean(me?.auto_fill ?? true));
  const [verifying, setVerifying] = useState(false);
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
  const sessionCartelas = useMemo(() => readSessionCartelas(room.code), [room.code]);
  const myCards = useMemo(
    () => resolvePlayerCards(me?.card, me?.selected_cartelas, sessionCartelas),
    [me?.card, me?.selected_cartelas, sessionCartelas],
  );
  const totalMarkable = myCards.length > 0 ? myCards.length * 24 : 0;
  const totalMarked = me?.marked.filter((n) => n !== 0).length ?? 0;
  const winnerRoomPlayer = players.find((p) => p.player_id === room.winner_id) ?? null;
  const winnerCards = winnerRoomPlayer ? splitCards(winnerRoomPlayer.card) : [];
  const winningCardIndexMatch = room.winning_line?.match(/Card\s+(\d+)/i)?.[1];
  const winningCardIndex = winningCardIndexMatch ? Math.max(0, Number(winningCardIndexMatch) - 1) : 0;
  const winnerCard = winnerCards[winningCardIndex] ?? winnerCards[0] ?? [];

  useEffect(() => {
    setLocalAutoFill(Boolean(me?.auto_fill ?? true));
  }, [me?.auto_fill]);

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

  // Haptic on each new ball
  const lastAudioNumberRef = useRef<number | null>(null);
  useEffect(() => {
    if (current) {
      haptic("light");

      if (lang === "am" && lastAudioNumberRef.current !== current && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(`ቁጥር ${current}`);
        utterance.lang = "am-ET";
        utterance.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        lastAudioNumberRef.current = current;
      }
    }
  }, [current, lang]);

  // Auto-detect a complete line on my card and auto-claim once
  const autoClaimedRef = useRef(false);
  useEffect(() => {
    if (autoClaimedRef.current) return;
    if (!me || isWatcher || room.status !== "live" || room.winner_id || !localAutoFill) return;
    if (hasAnyCompletedLine(myCards, me.marked)) {
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
  }, [me?.marked, myCards, room.status, room.winner_id, localAutoFill]);

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
      if (r?.pending) {
        toast.success(t("bingoUnderReview"));
        haptic("success");
      } else if (r?.winner) {
        toast.success(`${t("bingo")} +${r.payout}`);
        haptic("success");
      }
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      toast.error(msg);
      if (msg.includes("No completed line")) {
        toast.warning(t("falseClaimPenalty"));
      }
      haptic("error");
    }
  }

  async function handleAutoFillToggle(checked: boolean) {
    try {
      setLocalAutoFill(checked);
      const result = await api.setAutoFill(room.id, myPlayerId, checked);
      console.log("Auto fill toggled:", result);
      toast.success(checked ? `${t("globalAutoFill")} On` : `${t("globalAutoFill")} Off`);
    } catch (error) {
      console.error("Auto fill toggle error:", error);
      setLocalAutoFill((prev) => !prev);
      toast.error(getErrorMessage(error));
    }
  }

  async function handleMarkNumber(n: number) {
    await api.markNumber(room.id, myPlayerId, n).catch((e: any) => {
      toast.error(e.message);
    });
  }

  return (
    <main className="min-h-screen flex flex-col safe-top safe-bottom max-w-md mx-auto px-3 pb-3">
      {iWon && room.status === "finished" && <Confetti />}

      {/* Header */}
      <header className="glass rounded-2xl p-3 mt-2 mb-2 shadow-card">
        <div className="flex items-center justify-between mb-2.5">
          <button
            onClick={copyInvite}
            className="flex items-center gap-1 text-[11px] font-mono font-bold tracking-[0.2em] bg-secondary/80 px-2.5 py-1 rounded-lg"
          >
            {room.code} <Copy className="h-3 w-3 opacity-70" />
          </button>
          <span
            className={cn(
              "text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider border-2",
              room.status === "lobby" && "border-warning/70 text-warning bg-warning/10",
              room.status === "live" && "border-success/70 text-success bg-success/10 animate-pulse",
              room.status === "paused" && "border-accent/70 text-accent bg-accent/10",
              room.status === "finished" && "border-primary/70 text-primary bg-primary/10",
            )}
          >
            {room.status === "lobby" && t("lobbyPhase")}
            {room.status === "live" && t("livePhase")}
            {room.status === "paused" && t("pausedPhase")}
            {room.status === "finished" && t("finished")}
          </span>
          <button
            onClick={toggle}
            className="flex items-center gap-1 text-[10px] bg-secondary/80 px-2.5 py-1 rounded-lg font-bold uppercase"
          >
            <Globe className="h-3 w-3" /> {lang === "en" ? "EN" : "አማ"}
          </button>
        </div>
        {room.is_private && (
          <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
            <Lock className="h-3 w-3" /> {t("privateRoom")}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat icon={<Users className="h-3 w-3" />} label={t("players")} value={`${playerCount}${watcherCount > 0 ? ` +${watcherCount}` : ""}`} />
          <Stat icon={<Wallet className="h-3 w-3" />} label={t("wallet")} value={String(myWallet)} />
          <Stat icon={<Coins className="h-3 w-3 text-warning" />} label={t("derash")} value={String(room.derash)} highlight />
        </div>
      </header>

      {/* Lobby countdown */}
      {room.status === "lobby" && (
        <div className="glass rounded-2xl p-3 mb-2 text-center shadow-card">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("startsIn")}</p>
          <p className="text-4xl font-black tabular-nums">
            <span className="inline-block gradient-primary text-primary-foreground px-4 py-0.5 rounded-xl">{secondsLeft}s</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {t("stake")}: <span className="font-bold text-foreground">{room.stake_amount}</span>
            {" · "}
            {t("derash")}: <span className="font-bold text-warning">{room.derash}</span>
          </p>
        </div>
      )}

      {room.status === "paused" && (
        <div className="glass rounded-2xl p-4 mb-2 text-center shadow-card">
          <p className="text-sm font-bold mb-1">{t("bingoUnderReview")}</p>
          <p className="text-xs text-muted-foreground">
            {winnerRoomPlayer?.player?.username ?? "Player"} · {room.pending_winning_line}
          </p>
          {isHost && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button disabled={verifying} onClick={async () => { setVerifying(true); try { await api.verifyBingo(room.id, myPlayerId, true); toast.success(t("approve")); } catch (e: any) { toast.error(e.message); } finally { setVerifying(false); } }}>{t("approve")}</Button>
              <Button variant="destructive" disabled={verifying} onClick={async () => { setVerifying(true); try { await api.verifyBingo(room.id, myPlayerId, false); toast.warning(t("falseClaimPenalty")); } catch (e: any) { toast.error(e.message); } finally { setVerifying(false); } }}>{t("reject")}</Button>
            </div>
          )}
        </div>
      )}

      {isWatcher && room.status !== "finished" && (
        <div className="bg-warning/15 border border-warning/40 text-warning text-xs rounded-xl px-3 py-2 mb-2 flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" />
          <span>{t("watchingMode")}</span>
        </div>
      )}

      {/* Master board — above cards, call pills on right */}
      {room.status !== "finished" && (
        <section className="mb-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground mb-1.5">
            {t("masterBoard")}
          </h2>
          <div className="glass rounded-2xl p-2.5 shadow-card">
            <MasterBoard called={called} current={current} />
          </div>
        </section>
      )}

      {/* Cartelas */}
      {room.status !== "finished" && me && (
        <section className="mb-2 flex-1">
          {/* Controls row */}
          <div className="flex items-center justify-between gap-1 mb-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider">
              {t("cardsActive")}{" "}
              <span className="text-muted-foreground font-bold">({myCards.length} {t("active")})</span>
            </span>
            {room.status === "lobby" && !isWatcher && (
              <Button variant="outline" size="sm" className="h-6 text-[9px] font-bold px-2 border-border" onClick={onJoinNextRound}>
                <ShoppingCart className="h-3 w-3 mr-0.5" /> {t("buyCard")}
              </Button>
            )}
            {!isWatcher && myCards.length > 0 && (
              <span className="text-[9px] text-muted-foreground ml-auto">
                {t("globalDaubProgress")}:{" "}
                <span className="font-bold text-success tabular-nums">{totalMarked} / {totalMarkable}</span>
              </span>
            )}
          </div>
          {!isWatcher && myCards.length > 0 && (
            <div className="flex items-center justify-between mb-2 rounded-lg bg-secondary/40 px-2.5 py-1.5">
              <div className="text-[10px] font-semibold flex items-center gap-1.5">
                <Radio className="h-3 w-3" /> {t("globalAutoFill")}
              </div>
              <Switch checked={localAutoFill} onCheckedChange={handleAutoFillToggle} />
            </div>
          )}
          {myCards.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {myCards.map((card, idx) => (
                <CompactBingoCard
                  key={idx}
                  index={idx}
                  numbers={card}
                  marked={me.marked}
                  current={current}
                  called={called}
                  onSelectNumber={handleMarkNumber}
                  disabled={room.status !== "live" || isWatcher || localAutoFill}
                />
              ))}
            </div>
          ) : (
            <BingoCard numbers={[]} marked={me.marked} current={current} called={called} disabled />
          )}
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
          {winnerCard.length > 0 && (
            <div className="w-full">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("winningCard")}</p>
              <BingoCard numbers={winnerCard} marked={winnerRoomPlayer?.marked ?? []} current={null} disabled />
            </div>
          )}
          <div className="glass rounded-xl p-3 w-full">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {called.length} numbers called
            </p>
            <CallLog called={called} limit={10} />
          </div>
          <Button onClick={onJoinNextRound} className="w-full h-11 font-bold">
            {t("joinNextRound")}
          </Button>
        </section>
      )}

      {/* Bottom action bar */}
      <div className="mt-auto sticky bottom-0 pt-2 pb-1 grid grid-cols-3 gap-2 bg-gradient-to-t from-background via-background/95 to-transparent">
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
