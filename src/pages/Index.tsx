import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTelegramIdentity, haptic } from "@/hooks/useTelegramIdentity";
import { api, getErrorMessage, type Room } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BingoBall } from "@/components/bingo/BingoBall";
import { BingoCard } from "@/components/bingo/BingoCard";
import { generateCardFromCartela, normalizeCartelaIds, saveSessionCartelas } from "@/lib/cartela";
import { ArrowLeft, Clock3, Eye, Languages, Loader2, Lock, Sparkles, Users, Wallet } from "lucide-react";

const STAKE_OPTIONS = [10, 20, 50, 100, 500] as const;
const DEFAULT_MAX_PLAYERS = 20;
const DEFAULT_HOUSE_COMMISSION_PCT = 10;

type LobbyStep = "entry" | "lobby" | "market";

type LobbyRoomCard = {
  stake: number;
  room: Room | null;
  playersJoined: number;
  maxPlayers: number;
  collectedAmount: number;
  prizePool: number;
  statusLabel: string;
  countdownSeconds: number | null;
};

const Index = () => {
  const { player, loading, error } = useTelegramIdentity();
  const { t, lang, toggle } = useLang();
  const navigate = useNavigate();

  const [step, setStep] = useState<LobbyStep>("entry");
  const [selectedStake, setSelectedStake] = useState<number>(20);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [selectedCartelas, setSelectedCartelas] = useState<number[]>([1]);
  const [previewCartela, setPreviewCartela] = useState<number | null>(null);
  const [entryCode, setEntryCode] = useState("");
  const [creatingPrivateRoom, setCreatingPrivateRoom] = useState(false);
  const [busy, setBusy] = useState<"join" | "entryJoin" | null>(null);
  const [lobbyRooms, setLobbyRooms] = useState<Room[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [takenCartelas, setTakenCartelas] = useState<number[]>([]);
  const [lobbyReady, setLobbyReady] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const totalStake = selectedStake * selectedCartelas.length;
  const canAfford = (player?.wallet_balance ?? 0) >= totalStake;

  const cartelaPreviewCard = useMemo(
    () => (previewCartela ? generateCardFromCartela(previewCartela) : []),
    [previewCartela],
  );

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLobbyRooms() {
      const { data: roomsData, error: roomsError } = await (supabase as any)
        .from("rooms")
        .select("*")
        .eq("status", "lobby")
        .order("stake_amount", { ascending: true })
        .order("created_at", { ascending: true });

      if (roomsError) {
        if (!cancelled) {
          toast.error(roomsError.message);
          setLobbyReady(true);
        }
        return;
      }

      const rooms = ((roomsData ?? []) as Room[]).filter((room) =>
        STAKE_OPTIONS.includes(room.stake_amount as (typeof STAKE_OPTIONS)[number]),
      );

       const roomIds = rooms.map((room) => room.id);
       let counts: Record<string, number> = {};

       if (roomIds.length > 0) {
         const { data: roomPlayersData, error: roomPlayersError } = await (supabase as any)
           .from("room_players")
           .select("room_id, role")
           .in("room_id", roomIds);

         if (roomPlayersError) {
           if (!cancelled) {
             toast.error(roomPlayersError.message);
             setLobbyReady(true);
           }
           return;
         }

         counts = (roomPlayersData ?? []).reduce((acc: Record<string, number>, row: { room_id: string; role: string }) => {
           if (row.role === "player") acc[row.room_id] = (acc[row.room_id] ?? 0) + 1;
           return acc;
         }, {});
       }

       if (!cancelled) {
         // Only show rooms with at least 1 player in lobby
         const activeRooms = rooms.filter((room) => (counts[room.id] ?? 0) > 0);
         setLobbyRooms(activeRooms);
         setPlayerCounts(counts);
         setLobbyReady(true);
       }
    }

    loadLobbyRooms();
    const pollId = window.setInterval(() => {
      loadLobbyRooms();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, []);

  const lobbyCards = useMemo<LobbyRoomCard[]>(() => {
    return STAKE_OPTIONS.map((stake) => {
      const roomsForStake = lobbyRooms.filter((room) => room.stake_amount === stake);
      const openLobbyRooms = roomsForStake.filter((room) => room.status === "lobby" && (playerCounts[room.id] ?? 0) > 0);
      const availableRoom = openLobbyRooms.find((room) => {
        const maxPlayers = room.max_players ?? DEFAULT_MAX_PLAYERS;
        return (playerCounts[room.id] ?? 0) < maxPlayers;
      });
      const fallbackRoom = openLobbyRooms[0] ?? null;
      const room = availableRoom ?? fallbackRoom;
      const playersJoined = room ? playerCounts[room.id] ?? 0 : 0;
      const maxPlayers = room?.max_players ?? DEFAULT_MAX_PLAYERS;
      const collectedAmount = playersJoined * stake;
      const houseCommission = room?.house_commission_pct ?? DEFAULT_HOUSE_COMMISSION_PCT;
      const prizePool = Math.max(0, Math.floor((collectedAmount * (100 - houseCommission)) / 100));
      const countdownSeconds =
        room?.status === "lobby" && room.lobby_ends_at
          ? Math.max(0, Math.ceil((new Date(room.lobby_ends_at).getTime() - tick) / 1000))
          : null;

      let statusLabel = "Waiting for players";
      if (room?.status === "live") statusLabel = "Live";
      else if (room?.status === "paused") statusLabel = "Bingo under review";
      else if (room?.status === "lobby") {
        if (countdownSeconds === 0) statusLabel = "Now";
        else if (countdownSeconds && countdownSeconds <= 5) statusLabel = `${countdownSeconds}s`;
        else statusLabel = "Lobby open";
      }

      return {
        stake,
        room,
        playersJoined,
        maxPlayers,
        collectedAmount,
        prizePool,
        statusLabel,
        countdownSeconds,
      };
    });
  }, [lobbyRooms, playerCounts, tick]);

  function toggleCartela(cardNo: number) {
    setSelectedCartelas((prev) => {
      if (prev.includes(cardNo)) return prev.filter((n) => n !== cardNo);
      if (prev.length >= 3) return prev;
      return [...prev, cardNo].sort((a, b) => a - b);
    });
  }

  function handleSelectGame(card: LobbyRoomCard) {
    setSelectedStake(card.stake);
    setSelectedRoomCode(card.room?.code ?? null);
    setCreatingPrivateRoom(false);
    setStep("market");
    haptic("medium");
  }

  async function handleJoinByCode() {
    if (!player || !entryCode.trim()) return;

    setBusy("entryJoin");
    haptic("medium");

    try {
      const normalizedCode = entryCode.trim().toUpperCase();
      const { data, error } = await (supabase as any)
        .from("rooms")
        .select("*")
        .eq("code", normalizedCode)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Room not found");

      setSelectedStake(Number(data.stake_amount ?? 20));
      setSelectedRoomCode(normalizedCode);
      setCreatingPrivateRoom(false);
      setStep("market");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  function handleCreatePrivateRoomStart() {
    setSelectedRoomCode(null);
    setSelectedCartelas([1]);
    setCreatingPrivateRoom(true);
    setStep("market");
    haptic("medium");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTakenCartelas() {
      if (step !== "market" || !selectedRoomCode) {
        setTakenCartelas([]);
        return;
      }

      const room = lobbyRooms.find((entry) => entry.code === selectedRoomCode);
      if (!room) {
        setTakenCartelas([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("room_players")
        .select("player_id, card")
        .eq("room_id", room.id)
        .eq("role", "player");

      if (error) {
        if (!cancelled) toast.error(error.message);
        return;
      }

      const cartelaLookup = new Map<string, number>(
        Array.from({ length: 200 }, (_, i) => i + 1).map((cartelaNo) => [
          JSON.stringify(generateCardFromCartela(cartelaNo)),
          cartelaNo,
        ]),
      );

      const taken: number[] = [
        ...new Set<number>(
          (data ?? []).flatMap((row: { player_id: string; card: number[] | null }) => {
            if (row.player_id === player?.id || !Array.isArray(row.card)) return [];

            const matchedCartelas: number[] = [];
            for (let i = 0; i < row.card.length; i += 25) {
              const singleCard = row.card.slice(i, i + 25);
              if (singleCard.length !== 25) continue;
              const match = cartelaLookup.get(JSON.stringify(singleCard));
              if (match) matchedCartelas.push(match);
            }

            return matchedCartelas;
          }),
        ),
      ];

      if (!cancelled) setTakenCartelas(taken);
    }

    loadTakenCartelas();
    const pollId = window.setInterval(loadTakenCartelas, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [step, selectedRoomCode, lobbyRooms, player?.id]);

  async function handleJoinSelectedGame() {
    if (!player) return;
    if (!selectedCartelas.length) {
      toast.error(t("chooseUpToThree"));
      return;
    }
    if (!canAfford) {
      toast.error(t("insufficientBalance"));
      haptic("error");
      return;
    }

    setBusy("join");
    haptic("medium");

    try {
      const result = selectedRoomCode
        ? await api.joinRoom(selectedRoomCode, player.id, selectedCartelas)
        : await api.createRoom(player.id, selectedStake, selectedCartelas, creatingPrivateRoom);

      saveSessionCartelas(result.room.code, selectedCartelas);
      navigate(`/room/${result.room.code}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !lobbyReady) {
    return (
      <main className="min-h-screen relative overflow-hidden flex items-center justify-center px-5 bg-background">
        <div className="absolute inset-0">
          <div className="absolute -top-20 -left-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-1/3 -right-20 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute bottom-10 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-warning/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm text-center">
          <div className="relative mx-auto h-28 w-28 mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <BingoBall number={7} size="md" className="absolute left-0 top-2 rotate-[-14deg] animate-bounce" showLetter={false} />
            <BingoBall number={42} size="lg" className="absolute right-0 top-7 z-10" showLetter={false} />
            <BingoBall number={68} size="sm" className="absolute bottom-1 left-8 rotate-12" showLetter={false} />
          </div>

          <h1 className="text-3xl font-black tracking-tight">{t("appName")}</h1>
        </div>
      </main>
    );
  }

  if (error || !player) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="glass rounded-2xl p-5 max-w-md w-full text-center shadow-card space-y-3">
          <h1 className="text-xl font-bold">Unable to load the game</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? "Your player profile could not be loaded."}
          </p>
          <Button onClick={() => window.location.reload()} className="w-full">
            Retry
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen safe-top safe-bottom px-4 py-5 max-w-md mx-auto overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 -left-20 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute top-36 -right-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute bottom-10 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-warning/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate("/wallet")}
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold shadow-card"
        >
          <Wallet className="h-3.5 w-3.5 text-warning" />
          <span>{player.wallet_balance} ETB</span>
        </button>
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-xs glass px-3 py-2 rounded-full font-semibold uppercase tracking-wider shadow-card"
        >
          <Languages className="h-3.5 w-3.5" /> {lang === "en" ? "EN" : "አማ"}
        </button>
      </div>

      <header className="relative glass rounded-[1.25rem] p-3 mb-2.5 shadow-elegant overflow-hidden">
        <div className="absolute -right-8 -top-8 h-16 w-16 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-primary-glow mb-1.5">
              <Sparkles className="h-3 w-3" /> Live Bingo
            </div>
            <h1 className="text-[1.65rem] font-black tracking-tight leading-none">{t("appName")}</h1>
          </div>
          <div className="relative h-14 w-14 shrink-0">
            <BingoBall number={7} size="sm" className="absolute left-0 top-1 rotate-[-14deg] scale-90" showLetter={false} />
            <BingoBall number={42} size="sm" className="absolute right-0 top-4 z-10" showLetter={false} />
            <BingoBall number={68} size="sm" className="absolute bottom-0 left-3 rotate-12 scale-90" showLetter={false} />
          </div>
        </div>

        <div className={`relative grid gap-1.5 mt-2 ${step === "market" ? "grid-cols-3" : "grid-cols-2"}`}>
          <div className="rounded-xl bg-secondary/70 p-1.5 border border-border/60">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("playingAs")}</p>
            <p className="font-black truncate mt-0.5 text-[13px]">{player.username}</p>
          </div>
          <div className="rounded-xl bg-secondary/70 p-1.5 border border-border/60">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Step</p>
            <p className="font-black mt-0.5 text-[13px]">
              {step === "entry" ? t("gameEntry") : step === "lobby" ? "Lobby" : t("cartelaMarket")}
            </p>
          </div>
          {step === "market" && (
            <div className="rounded-xl bg-warning/10 px-1.5 py-1.5 border border-warning/20">
              <p className="text-[9px] uppercase tracking-wide text-warning">Stake</p>
              <p className="font-black mt-0.5 text-[13px] leading-none text-warning">{selectedStake} ETB</p>
            </div>
          )}
        </div>
      </header>

      {step === "entry" ? (
        <section className="space-y-3">
          <div className="glass rounded-2xl p-3.5 shadow-card space-y-3">
            <div>
              <h2 className="text-base font-black">{t("gameEntry")}</h2>
              <p className="text-[11px] text-muted-foreground mt-1">{t("gameEntryHint")}</p>
            </div>

            <div className="grid gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreatingPrivateRoom(false);
                  setStep("lobby");
                }}
                className="h-14 rounded-2xl font-black text-base justify-start px-4"
              >
                <Users className="h-5 w-5 mr-3" /> {t("enterPublicLobby")}
              </Button>

              <Button
                type="button"
                onClick={handleCreatePrivateRoomStart}
                className="h-10 rounded-xl gradient-primary text-primary-foreground font-black text-sm"
              >
                <Lock className="h-4 w-4 mr-2" /> {t("createPrivateRoom")}
              </Button>

              <div className="rounded-xl border border-border bg-card/40 p-2.5 space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{t("joinWithRoomCode")}</label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("roomCodePlaceholder")}
                    value={entryCode}
                    onChange={(e) => setEntryCode(e.target.value.toUpperCase().slice(0, 8))}
                    className="h-9 rounded-xl text-center text-sm font-black tracking-[0.2em]"
                  />
                  <Button
                    type="button"
                    onClick={handleJoinByCode}
                    disabled={!entryCode.trim() || busy !== null}
                    className="h-9 rounded-xl px-3 text-xs font-black"
                  >
                    {busy === "entryJoin" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("join")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : step === "lobby" ? (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setStep("entry")}
              className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
            </button>
            <Button variant="secondary" size="sm" className="h-8 px-3 text-[11px]" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>
          <div>
            <h2 className="text-base font-black">Bingo Lobby</h2>
            <p className="text-[11px] text-muted-foreground">Real-time games grouped by stake amount.</p>
          </div>

          {lobbyCards.map((card) => (
            <article key={card.stake} className="glass rounded-2xl p-2.5 shadow-card">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 rounded-xl bg-primary/10 border border-primary/20 px-2.5 py-2 text-center min-w-[72px]">
                  <p className="text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Stake</p>
                  <h3 className="text-base font-black leading-none mt-1">{card.stake}</h3>
                  <p className="text-[9px] font-bold text-muted-foreground mt-1">Birr</p>
                </div>

                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold text-muted-foreground truncate">
                        Players {card.playersJoined}/{card.maxPlayers}
                      </p>
                      <p className="text-[9px] font-semibold text-muted-foreground truncate">
                        Collected {card.collectedAmount} ETB
                      </p>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wide border border-primary/20 bg-primary/10 text-primary whitespace-nowrap">
                      {card.statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[9px]">
                    <div className="min-w-0 flex items-center gap-1 text-muted-foreground">
                      <Wallet className="h-3 w-3 shrink-0" />
                      <span className="truncate">Prize {card.prizePool} ETB</span>
                    </div>
                    <div className="min-w-0 flex items-center justify-center gap-1 text-muted-foreground text-center">
                      <Clock3 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{card.countdownSeconds !== null ? (card.countdownSeconds === 0 ? "Now" : `${card.countdownSeconds}s`) : "—"}</span>
                    </div>
                    <Button
                      onClick={() => handleSelectGame(card)}
                      className="h-5 rounded-md gradient-primary text-primary-foreground font-black shadow-elegant text-[8px] px-2 min-w-0"
                    >
                      Join
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="glass rounded-2xl p-3.5 shadow-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <button
                type="button"
                onClick={() => setStep(creatingPrivateRoom ? "entry" : "lobby")}
                className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
              </button>
              <h2 className="text-base font-black leading-none">{t("cartelaMarket")}</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                {creatingPrivateRoom ? t("privateRoomSetup") : `${t("selectedStakeHint")}: ${selectedStake} ETB`}
              </p>
            </div>
            <div className="rounded-xl gradient-primary text-primary-foreground p-2 shadow-elegant">
              <Users className="h-4 w-4" />
            </div>
          </div>

          {creatingPrivateRoom && (
            <div className="rounded-2xl border border-border p-2.5 bg-card/40 space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{t("privateRoomStake")}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {STAKE_OPTIONS.map((stake) => (
                  <button
                    key={stake}
                    type="button"
                    onClick={() => setSelectedStake(stake)}
                    className={`h-9 rounded-xl border text-[11px] font-black transition-smooth ${
                      selectedStake === stake
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-foreground"
                    }`}
                  >
                    {stake}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border p-2.5 bg-card/40">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-[13px]">{t("cartelaMarket")}</h3>
              <span className="text-[11px] text-muted-foreground rounded-full bg-secondary px-2 py-0.5">
                {t("selected")}: <span className="font-bold text-foreground">{selectedCartelas.length}/3</span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">{t("chooseUpToThree")}</p>

            <div className="grid grid-cols-10 gap-1 max-h-64 overflow-y-auto pr-1 rounded-xl">
              {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => {
                const selected = selectedCartelas.includes(n);
                const takenByOtherUser = takenCartelas.includes(n);
                const blocked = (!selected && selectedCartelas.length >= 3) || takenByOtherUser;
                return (
                  <button
                    key={n}
                    onClick={() => !blocked && toggleCartela(n)}
                    className={`h-7 rounded-md text-[10px] font-bold border transition-smooth ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : blocked
                          ? "border-border bg-secondary/40 text-muted-foreground opacity-50 cursor-not-allowed"
                          : "border-border bg-secondary text-foreground hover:border-primary/50"
                    }`}
                    disabled={blocked}
                    title={takenByOtherUser ? "Already selected by another player" : undefined}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            {selectedCartelas.length > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-secondary/60 p-2">
                <div className="text-[11px] text-muted-foreground">
                  {t("totalStake")}: <span className="font-bold text-foreground">{totalStake}</span>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {selectedCartelas.map((n) => (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      key={n}
                      className="h-6 px-1.5 text-[9px]"
                      onClick={() => setPreviewCartela(n)}
                    >
                      <Eye className="h-3 w-3 mr-1" /> #{n}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!canAfford && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 flex items-center justify-between gap-2">
              <p className="text-[11px] text-destructive font-semibold">{t("insufficientBalance")}</p>
              <Button type="button" variant="destructive" size="sm" onClick={() => navigate("/wallet")}>
                {t("topUp")}
              </Button>
            </div>
          )}

          <Button
            onClick={handleJoinSelectedGame}
            disabled={busy !== null || !selectedCartelas.length || !canAfford}
            size="lg"
            className="w-full h-10 rounded-xl gradient-primary text-primary-foreground font-black shadow-elegant text-sm"
          >
            {busy === "join" ? <Loader2 className="h-5 w-5 animate-spin" /> : `Join Room · ${totalStake}`}
          </Button>
        </section>
      )}

      <Dialog open={previewCartela !== null} onOpenChange={(open) => !open && setPreviewCartela(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("preview")} #{previewCartela}
            </DialogTitle>
            <DialogDescription>{t("cartelaMarket")}</DialogDescription>
          </DialogHeader>
          <BingoCard numbers={cartelaPreviewCard} marked={[0]} current={null} disabled />
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default Index;
