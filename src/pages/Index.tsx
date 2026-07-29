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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BingoBall } from "@/components/bingo/BingoBall";
import { BingoCard } from "@/components/bingo/BingoCard";
import { generateCardFromCartela, normalizeCartelaIds, saveSessionCartelas } from "@/lib/cartela";
import { ArrowLeft, Clock3, Eye, Languages, Loader2, Lock, Sparkles, Users, Wallet } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const STAKE_OPTIONS = [10, 20, 50, 100, 500] as const;
const DEFAULT_MAX_PLAYERS = 20;
/** Must match rooms.house_commission_pct / system_settings default (20). */
const DEFAULT_HOUSE_COMMISSION_PCT = 20;

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
  joinableAsPlayer: boolean;
};

const Index = () => {
  const { player, loading, error, offline, isRegistered } = useTelegramIdentity();
  const { t, lang, toggle } = useLang();
  const navigate = useNavigate();

  const [step, setStep] = useState<LobbyStep>("entry");
  const [selectedStake, setSelectedStake] = useState<number>(20);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [selectedRoomStatus, setSelectedRoomStatus] = useState<string | null>(null);
  const [selectedCartelas, setSelectedCartelas] = useState<number[]>([1]);
  const [previewCartela, setPreviewCartela] = useState<number | null>(null);
  const [entryCode, setEntryCode] = useState("");
  const [roomCodeOpen, setRoomCodeOpen] = useState(false);
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
    const id = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLobbyRooms() {
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .eq("status", "lobby")
        .order("stake_amount", { ascending: true })
        .order("created_at", { ascending: true });

      if (roomsError) {
        if (!cancelled) {
          // Suppress noisy toasts when offline / Supabase unreachable
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
         const { data: roomPlayersData, error: roomPlayersError } = await supabase
           .from("room_players")
           .select("room_id, role")
           .in("room_id", roomIds);

         if (roomPlayersError) {
           if (!cancelled) {
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
         // If any lobby expired (showing "Now"), trigger backend transition once.
         const expired = rooms.filter(
           (r) => r.status === "lobby" && r.lobby_ends_at && new Date(r.lobby_ends_at).getTime() <= Date.now(),
         );
         if (expired.length) {
           for (const er of expired) {
             try {
               await api.tickLobby(er.id);
             } catch (e) {
               // ignore; we'll re-query below
             }
           }
           // Re-query rooms to pick up status changes immediately
           const { data: roomsData2, error: roomsError2 } = await supabase
             .from("rooms")
             .select("*")
             .eq("status", "lobby")
             .order("stake_amount", { ascending: true })
             .order("created_at", { ascending: true });

           if (!roomsError2 && Array.isArray(roomsData2)) {
             // narrow to allowed stakes
             const refreshed = (roomsData2 as Room[]).filter((room) =>
               STAKE_OPTIONS.includes(room.stake_amount as (typeof STAKE_OPTIONS)[number]),
             );
             // recompute counts for refreshed rooms
             const refreshedIds = refreshed.map((r) => r.id);
             let refreshedCounts: Record<string, number> = {};
             if (refreshedIds.length > 0) {
               const { data: rpData, error: rpError } = await supabase
                 .from("room_players")
                 .select("room_id, role")
                 .in("room_id", refreshedIds);
               if (!rpError) {
                 refreshedCounts = (rpData ?? []).reduce((acc: Record<string, number>, row: { room_id: string; role: string }) => {
                   if (row.role === "player") acc[row.room_id] = (acc[row.room_id] ?? 0) + 1;
                   return acc;
                 }, {});
               }
             }
              setLobbyRooms(refreshed);
             setPlayerCounts(refreshedCounts);
             setLobbyReady(true);
             return;
           }
         }

          // Keep empty lobby rooms visible so the first player can still join them.
          setLobbyRooms(rooms);
         setPlayerCounts(counts);
         setLobbyReady(true);
       }
    }

    loadLobbyRooms();
    const pollId = window.setInterval(() => {
      loadLobbyRooms();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, []);

  const lobbyCards = useMemo<LobbyRoomCard[]>(() => {
    return STAKE_OPTIONS.map((stake) => {
      const roomsForStake = lobbyRooms.filter((room) => room.stake_amount === stake);
      const openLobbyRooms = roomsForStake.filter((room) => room.status === "lobby");
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
          ? Math.max(0, Math.floor((new Date(room.lobby_ends_at).getTime() - tick) / 1000))
          : null;
      const joinableAsPlayer =
        !!room &&
        room.status === "lobby" &&
        !!room.lobby_ends_at &&
        new Date(room.lobby_ends_at).getTime() > tick &&
        playersJoined < maxPlayers;

      let statusLabel = "Waiting for players";
      if (room?.status === "live") statusLabel = "Live";
      else if (room?.status === "paused") statusLabel = "Bingo under review";
      else if (room?.status === "lobby") {
        if (playersJoined === 0) statusLabel = "Waiting for players";
        else if (!joinableAsPlayer) statusLabel = "Starting";
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
        joinableAsPlayer,
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

  function requireRegistration(): boolean {
    if (isRegistered) return true;
    toast.error("Register in the bot first", {
      description: "Send /start and share your phone number, then reopen the app.",
    });
    haptic("warning");
    return false;
  }

  function handleSelectGame(card: LobbyRoomCard) {
    if (!requireRegistration()) return;
    if (card.room && !card.joinableAsPlayer) {
      navigate(`/room/${card.room.code}`);
      haptic("warning");
      return;
    }

    setSelectedStake(card.stake);
    setSelectedRoomCode(card.room?.code ?? null);
    setSelectedRoomStatus("lobby");
    setCreatingPrivateRoom(false);
    setStep("market");
    haptic("medium");
  }

  async function handleJoinByCode() {
    if (!requireRegistration()) return;
    if (!player || !entryCode.trim()) return;

    setBusy("entryJoin");
    haptic("medium");

    try {
      const normalizedCode = entryCode.trim().toUpperCase();
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", normalizedCode)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Room not found");

      if (data.status && data.status !== "lobby") {
        navigate(`/room/${normalizedCode}`);
        return;
      }

      setSelectedStake(Number(data.stake_amount ?? 20));
      setSelectedRoomCode(normalizedCode);
      setSelectedRoomStatus(data.status ?? null);
      setCreatingPrivateRoom(false);
      setStep("market");
      setRoomCodeOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  function handleCreatePrivateRoomStart() {
    if (!requireRegistration()) return;
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

      const { data, error } = await supabase
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

  // Keep selectedRoomStatus in sync with latest lobbyRooms data
  useEffect(() => {
    if (!selectedRoomCode) {
      setSelectedRoomStatus(null);
      return;
    }
    const r = lobbyRooms.find((x) => x.code === selectedRoomCode);
    setSelectedRoomStatus(r?.status ?? null);
  }, [selectedRoomCode, lobbyRooms]);

  async function handleJoinSelectedGame() {
    if (!requireRegistration()) return;
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
        <div className="flex items-center gap-1.5">
          <ThemeToggle className="h-8 w-8 rounded-full glass shadow-card" />
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 text-xs glass px-3 py-2 rounded-full font-semibold uppercase tracking-wider shadow-card"
          >
            <Languages className="h-3.5 w-3.5" /> {lang === "en" ? "EN" : "አማ"}
          </button>
        </div>
      </div>

      {offline && import.meta.env.DEV && (
        <div className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning font-semibold">
          Development offline mode: Supabase is unreachable. Local wallet data only — live gameplay requires a connected project.
        </div>
      )}

      <header className="relative mb-3 overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-elegant">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Games are open
            </div>
            <p className="text-sm font-semibold text-muted-foreground">{player.username}</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight">{t("appName")}</h1>
          </div>
          <div className="relative h-20 w-20 shrink-0">
            <BingoBall number={7} size="sm" className="absolute left-0 top-1 rotate-[-14deg]" showLetter={false} />
            <BingoBall number={42} size="md" className="absolute right-0 top-5 z-10" showLetter={false} />
            <BingoBall number={68} size="sm" className="absolute bottom-0 left-4 rotate-12" showLetter={false} />
          </div>
        </div>
      </header>

      {step === "entry" ? (
        <section className="space-y-3">
          {!isRegistered ? (
            <div className="rounded-3xl border border-warning/40 bg-warning/10 p-5 text-left shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-warning">Registration required</p>
              <h2 className="mt-2 text-2xl font-black">Register in the bot first</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Send /start in the Telegram bot and share your phone number. Play Bingo unlocks after that.
              </p>
            </div>
          ) : (
            <>
          <button
            type="button"
            onClick={() => {
              setCreatingPrivateRoom(false);
              setStep("lobby");
            }}
            className="group relative w-full overflow-hidden rounded-3xl gradient-primary p-5 text-left text-primary-foreground shadow-elegant transition-transform active:scale-[0.98]"
          >
            <Sparkles className="absolute -right-3 -top-3 h-24 w-24 opacity-15" />
            <span className="relative block text-xs font-bold uppercase tracking-[0.16em] opacity-80">Quick play</span>
            <span className="relative mt-1 block text-2xl font-black">Play Bingo</span>
            <span className="relative mt-5 inline-flex items-center rounded-full bg-white/20 px-4 py-2 text-sm font-bold">
              Find a game <Users className="ml-2 h-4 w-4" />
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRoomCodeOpen(true)}
              className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Lock className="h-5 w-5 text-primary" />
              <span>
                <span className="block text-sm font-bold">{t("joinWithRoomCode")}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleCreatePrivateRoomStart}
              className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Users className="h-5 w-5 text-accent" />
              <span>
                <span className="block text-sm font-bold">{t("createPrivateRoom")}</span>
              </span>
            </button>
          </div>
            </>
          )}

        </section>
      ) : step === "lobby" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("entry")}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("back")}
            </button>
            <span className="text-xs text-muted-foreground">
              Balance <span className="font-bold text-foreground">{player.wallet_balance} ETB</span>
            </span>
          </div>

          <div>
            <h2 className="text-xl font-black">Choose your stake</h2>
          </div>

          {lobbyCards.map((card) => {
            const isOpen = card.joinableAsPlayer;
            const isWatchable = Boolean(card.room && !isOpen);
            const canStartRoom = isRegistered && !card.room;
            const canSelect = isRegistered && (isOpen || isWatchable || canStartRoom);
            const fillPct = Math.min(100, Math.round((card.playersJoined / card.maxPlayers) * 100));
            const startingSoon = isOpen && card.countdownSeconds !== null && card.countdownSeconds <= 10;

            return (
              <article
                key={card.stake}
                className={`overflow-hidden rounded-2xl border bg-card shadow-card transition-colors ${
                  startingSoon ? "border-warning/50" : isOpen ? "border-border hover:border-primary/40" : "border-border/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectGame(card)}
                  disabled={!canSelect}
                  className="w-full p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entry</p>
                      <p className="text-2xl font-black leading-tight">{card.stake} ETB</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Win up to</p>
                      <p className="text-2xl font-black leading-tight text-warning">{card.prizePool}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {card.playersJoined} of {card.maxPlayers} players
                      </span>
                      <span
                        className={`flex items-center gap-1.5 font-semibold ${
                          startingSoon ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        <Clock3 className="h-3.5 w-3.5" />
                        {isOpen && card.countdownSeconds !== null
                          ? `Starts in ${card.countdownSeconds}s`
                          : card.statusLabel}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={`h-full rounded-full transition-all ${startingSoon ? "bg-warning" : "bg-primary"}`}
                        style={{ width: `${Math.max(fillPct, 3)}%` }}
                      />
                    </div>
                  </div>

                  <div
                    className={`mt-4 flex h-11 items-center justify-center rounded-xl text-sm font-bold ${
                      isOpen || canStartRoom
                        ? "gradient-primary text-primary-foreground shadow-elegant"
                        : isWatchable
                          ? "border border-border bg-secondary text-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isOpen ? (
                      <>Join for {card.stake} ETB</>
                    ) : canStartRoom ? (
                      <>Start a {card.stake} ETB game</>
                    ) : isWatchable ? (
                      <>
                        <Eye className="mr-2 h-4 w-4" /> Watch this game
                      </>
                    ) : (
                      "Waiting for players"
                    )}
                  </div>
                </button>
              </article>
            );
          })}
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
              <p className="mt-1 text-xs font-bold text-warning">{selectedStake} ETB</p>
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

            <div className="grid grid-cols-10 gap-1 max-h-64 overflow-y-auto pr-1 rounded-xl">
              {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => {
                const selected = selectedCartelas.includes(n);
                const takenByOtherUser = takenCartelas.includes(n);
                const blocked = (!selected && selectedCartelas.length >= 3) || takenByOtherUser;
                return (
                  <div key={n} className="relative">
                    <button
                      onClick={() => !blocked && toggleCartela(n)}
                      className={`h-7 w-full rounded-md text-[10px] font-bold border transition-smooth ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : takenByOtherUser
                            ? "border-warning/50 bg-warning/15 text-warning cursor-not-allowed"
                            : blocked
                              ? "border-border bg-secondary/40 text-muted-foreground opacity-50 cursor-not-allowed"
                              : "border-border bg-secondary text-foreground hover:border-primary/50"
                      }`}
                      disabled={blocked || (selectedRoomStatus && selectedRoomStatus !== "lobby" && !creatingPrivateRoom)}
                      title={takenByOtherUser ? "Reserved" : undefined}
                    >
                      {n}
                    </button>
                    {takenByOtherUser && !selected && (
                      <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-warning px-1 py-[1px] text-[7px] font-black uppercase text-warning-foreground shadow-sm">
                        Reserved
                      </span>
                    )}
                  </div>
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

          {selectedRoomStatus && selectedRoomStatus !== "lobby" && !creatingPrivateRoom && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-2.5 mb-2 text-warning font-semibold text-center space-y-2">
              <p>Game already started — purchasing cards disabled</p>
              {selectedRoomCode && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => navigate(`/room/${selectedRoomCode}`)}
                >
                  Join as watcher
                </Button>
              )}
            </div>
          )}

          <Button
            onClick={handleJoinSelectedGame}
            disabled={busy !== null || !selectedCartelas.length || !canAfford || (selectedRoomStatus && selectedRoomStatus !== "lobby" && !creatingPrivateRoom)}
            size="lg"
            className="w-full h-10 rounded-xl gradient-primary text-primary-foreground font-black shadow-elegant text-sm"
          >
            {busy === "join" ? <Loader2 className="h-5 w-5 animate-spin" /> : `Join Room · ${totalStake}`}
          </Button>
        </section>
      )}

      <Dialog open={roomCodeOpen} onOpenChange={setRoomCodeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("joinWithRoomCode")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t("roomCodePlaceholder")}
            value={entryCode}
            onChange={(event) => setEntryCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && entryCode.trim() && busy === null) void handleJoinByCode();
            }}
            className="h-12 rounded-xl text-center text-lg font-black tracking-[0.25em]"
          />
          <Button
            type="button"
            onClick={handleJoinByCode}
            disabled={!entryCode.trim() || busy !== null}
            className="h-11 w-full rounded-xl font-bold"
          >
            {busy === "entryJoin" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("join")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={previewCartela !== null} onOpenChange={(open) => !open && setPreviewCartela(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("preview")} #{previewCartela}
            </DialogTitle>
          </DialogHeader>
          <BingoCard numbers={cartelaPreviewCard} marked={[0]} current={null} disabled />
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default Index;
