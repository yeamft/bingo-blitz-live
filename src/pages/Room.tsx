import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { useRoomState } from "@/hooks/useRoomState";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BingoBall } from "@/components/bingo/BingoBall";
import { BingoCard } from "@/components/bingo/BingoCard";
import { CalledGrid } from "@/components/bingo/CalledGrid";
import { Confetti } from "@/components/bingo/Confetti";
import { toast } from "sonner";
import {
  Loader2,
  Copy,
  LogOut,
  Play,
  Pause,
  Trophy,
  Shuffle,
  Check,
  CircleDot,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { player, loading: idLoading } = useTelegramIdentity();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  // Resolve code -> room id, ensure membership
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
      onLeave={() => navigate("/")}
    />
  );
}

function RoomInner({
  room,
  players,
  me,
  myPlayerId,
  onLeave,
}: {
  room: NonNullable<ReturnType<typeof useRoomState>["room"]>;
  players: ReturnType<typeof useRoomState>["players"];
  me: ReturnType<typeof useRoomState>["me"];
  myPlayerId: string;
  onLeave: () => void;
}) {
  const isHost = room.host_id === myPlayerId;
  const called = useMemo(
    () => room.call_sequence.slice(0, room.current_index + 1),
    [room.call_sequence, room.current_index],
  );
  const current = room.current_index >= 0 ? room.call_sequence[room.current_index] : null;
  const winner = players.find((p) => p.player_id === room.winner_id);
  const iWon = room.winner_id === myPlayerId;

  // Auto-call ticker (host only) — keeps the room moving without external infra
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHost) return;
    if (room.status !== "live") {
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

  // Animation key for current ball
  const [popKey, setPopKey] = useState(0);
  useEffect(() => {
    if (current) {
      setPopKey((k) => k + 1);
      haptic("light");
    }
  }, [current]);

  // Winner haptic
  useEffect(() => {
    if (room.status === "finished" && room.winner_id) {
      haptic(iWon ? "success" : "warning");
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

  async function handleStart() {
    try {
      await api.startGame(room.id, myPlayerId);
      haptic("success");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleReady() {
    if (!me) return;
    await api.setReady(room.id, myPlayerId, !me.ready);
    haptic("light");
  }

  async function handleRegen() {
    try {
      await api.regenerateCard(room.id, myPlayerId);
      haptic("medium");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleMark(n: number) {
    try {
      await api.markNumber(room.id, myPlayerId, n);
    } catch (e: any) {
      toast.error(e.message);
      haptic("error");
    }
  }

  async function handleClaim() {
    try {
      const r: any = await api.claimBingo(room.id, myPlayerId);
      if (r?.winner) haptic("success");
    } catch (e: any) {
      toast.error(e.message);
      haptic("error");
    }
  }

  async function handlePauseResume() {
    try {
      await api.pauseResume(room.id, myPlayerId);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleNextRound() {
    try {
      await api.nextRound(room.id, myPlayerId);
      haptic("medium");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <main className="min-h-screen flex flex-col safe-top safe-bottom max-w-md mx-auto px-4 pb-6">
      {iWon && room.status === "finished" && <Confetti />}

      {/* Header */}
      <header className="flex items-center justify-between py-3">
        <button
          onClick={handleLeave}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-smooth"
        >
          <LogOut className="h-4 w-4" /> Leave
        </button>
        <button
          onClick={copyInvite}
          className="flex items-center gap-1.5 text-sm font-mono font-bold tracking-[0.3em] glass px-3 py-1.5 rounded-full"
        >
          {room.code} <Copy className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(
            "text-xs font-bold uppercase px-2 py-1 rounded-full",
            room.status === "lobby" && "bg-secondary text-muted-foreground",
            room.status === "live" && "bg-accent/20 text-accent",
            room.status === "paused" && "bg-warning/20 text-warning",
            room.status === "finished" && "bg-primary/20 text-primary",
          )}
        >
          {room.status}
        </span>
      </header>

      {/* LOBBY */}
      {room.status === "lobby" && (
        <div className="flex-1 flex flex-col gap-4 mt-2">
          <section className="glass rounded-3xl p-5 shadow-card">
            <h2 className="font-bold mb-3 text-sm uppercase text-muted-foreground tracking-wider">
              Players ({players.length})
            </h2>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between bg-secondary/60 rounded-xl px-3 py-2"
                >
                  <span className="font-medium">
                    {p.player.username}
                    {p.player_id === room.host_id && (
                      <span className="ml-2 text-xs text-primary font-bold">HOST</span>
                    )}
                    {p.player_id === myPlayerId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  {p.ready ? (
                    <span className="flex items-center gap-1 text-xs text-success font-bold">
                      <Check className="h-3.5 w-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Waiting</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {me && (
            <section className="glass rounded-3xl p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm uppercase text-muted-foreground tracking-wider">
                  Your card
                </h2>
                <Button size="sm" variant="ghost" onClick={handleRegen}>
                  <Shuffle className="h-4 w-4 mr-1" /> Reshuffle
                </Button>
              </div>
              <BingoCard
                numbers={me.card}
                marked={[]}
                called={[]}
                onMark={() => {}}
                disabled
              />
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 mt-auto">
            <Button
              onClick={handleReady}
              variant={me?.ready ? "secondary" : "default"}
              size="lg"
              className="h-14 font-bold"
            >
              {me?.ready ? "Unready" : "Ready"}
            </Button>
            <Button
              onClick={handleStart}
              disabled={!isHost}
              size="lg"
              className="h-14 font-bold gradient-primary text-primary-foreground shadow-elegant disabled:opacity-50"
            >
              <Play className="h-4 w-4 mr-2" /> Start
            </Button>
          </div>
          {!isHost && (
            <p className="text-center text-xs text-muted-foreground">
              Waiting for host to start the game
            </p>
          )}
        </div>
      )}

      {/* LIVE / PAUSED */}
      {(room.status === "live" || room.status === "paused") && (
        <div className="flex-1 flex flex-col gap-4 mt-2">
          {/* Current ball */}
          <section className="flex flex-col items-center py-4">
            {current ? (
              <div key={popKey} className="animate-ball-pop">
                <BingoBall number={current} size="hero" highlight />
              </div>
            ) : (
              <div className="h-44 w-44 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                Get ready…
              </div>
            )}
            <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
              {called.length} / 100 called
              {room.status === "paused" && " · paused"}
            </p>
          </section>

          {/* Card */}
          {me && (
            <section>
              <h2 className="font-bold text-sm uppercase text-muted-foreground tracking-wider mb-2 flex items-center justify-between">
                <span>Your card</span>
                <span className="text-accent">
                  {me.marked.length} / {me.card.length} marked
                </span>
              </h2>
              <BingoCard
                numbers={me.card}
                marked={me.marked}
                called={called}
                onMark={handleMark}
                disabled={room.status !== "live"}
              />
            </section>
          )}

          {/* Called grid */}
          <section className="glass rounded-2xl p-3">
            <h2 className="font-bold text-xs uppercase text-muted-foreground tracking-wider mb-2">
              Board
            </h2>
            <CalledGrid called={called} current={current} />
          </section>

          {/* Action bar */}
          <div className="sticky bottom-2 mt-auto flex gap-2">
            <Button
              onClick={handleClaim}
              size="lg"
              className="flex-1 h-14 gradient-win text-accent-foreground font-extrabold text-base shadow-elegant"
            >
              <Trophy className="h-5 w-5 mr-2" /> BINGO!
            </Button>
            {isHost && (
              <Button
                onClick={handlePauseResume}
                size="lg"
                variant="secondary"
                className="h-14"
              >
                {room.status === "live" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* FINISHED */}
      {room.status === "finished" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <div className="gradient-win h-24 w-24 rounded-full flex items-center justify-center shadow-elegant">
            <Trophy className="h-12 w-12 text-accent-foreground" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">Winner</p>
            <h2 className="text-3xl font-extrabold mt-1">
              {winner ? winner.player.username : "No winner"}
            </h2>
            {iWon && <p className="text-accent font-bold mt-2">That's you! 🎉</p>}
          </div>
          <div className="glass rounded-2xl p-4 w-full">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Numbers called: {called.length}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center max-h-32 overflow-auto">
              {called.map((n) => (
                <span
                  key={n}
                  className="text-xs font-bold bg-secondary px-2 py-1 rounded-full text-muted-foreground"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
          <div className="w-full flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1 h-14"
              onClick={onLeave}
            >
              <LogOut className="h-4 w-4 mr-2" /> Leave
            </Button>
            {isHost && (
              <Button
                onClick={handleNextRound}
                size="lg"
                className="flex-1 h-14 gradient-primary text-primary-foreground font-bold shadow-elegant"
              >
                <RotateCcw className="h-4 w-4 mr-2" /> Next round
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
